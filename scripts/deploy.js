// scripts/deploy.js (CommonJS, Hardhat v2 + ethers v6)
require("@nomicfoundation/hardhat-ethers");
const hre = require("hardhat");
const keccak256 = require("keccak256");
const { MerkleTree } = require("merkletreejs");
const fs = require("node:fs");

function addrToBytes(address) {
  return Buffer.from(hre.ethers.getBytes(address)); // 20-byte address
}

// leaf = keccak256(abi.encodePacked(address))
function leafOf(address) {
  return keccak256(addrToBytes(address));
}

function buildVoterMerkle(addrs) {
  const leaves = addrs.map(leafOf);
  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
  const root = tree.getHexRoot();
  return { tree, root };
}

async function main() {
  const [admin, voter1, voter2, voter3] = await hre.ethers.getSigners();
  const voterAddresses = [voter1.address, voter2.address, voter3.address];

  const { tree, root } = buildVoterMerkle(voterAddresses);
  console.log("Voters:", voterAddresses);
  console.log("Merkle Root:", root);

  // ✅ קובע זמן יחסית לבלוק הנוכחי כדי להיות חסין ל-fast-forward קודם
  const latest = await hre.ethers.provider.getBlock("latest");
  const startOffset = 5 * 60;           // 5 דקות
  const windowSecs = 24 * 60 * 60;      // 24 שעות
  const startTime = latest.timestamp + startOffset;
  const endTime = startTime + windowSecs;
  console.log(`Deploying with window: start=${startTime} end=${endTime} (now=${latest.timestamp})`);

  // 1) BALToken
  const BAL = await hre.ethers.getContractFactory("BALToken");
  const bal = await BAL.deploy("BAL Token", "BAL");
  await bal.waitForDeployment();
  console.log("BAL deployed to:", bal.target);

  // 2) Voting
  const Voting = await hre.ethers.getContractFactory("Voting");
  const voting = await Voting.deploy(root, startTime, endTime);
  await voting.waitForDeployment();
  console.log("Voting deployed to:", voting.target);

  // קישור הטוקן והעברת בעלות לטובת mint דרך Voting
  await (await voting.setRewardToken(bal.target)).wait();
  console.log("Reward token set on Voting.");
  await (await bal.transferOwnership(voting.target)).wait();
  console.log("Transferred BAL ownership to Voting.");

  // הוספת מועמדים (לפני תחילת ההצבעה)
await (await voting.addCandidateWithQuiz("Alice", [1, 0, 2])).wait();
await (await voting.addCandidateWithQuiz("Bob",   [0, 1, 2])).wait();

console.log("Candidates added: Alice, Bob (with quiz)");

  // הוכחת מרקל לדוגמה
  const leaf1 = leafOf(voter1.address);
  const proof1 = tree.getHexProof(leaf1);
  console.log("Sample proof for voter1 (len):", proof1.length);

  fs.writeFileSync(
    "scripts/merkle.json",
    JSON.stringify(
      {
        contracts: { voting: voting.target, bal: bal.target },
        voters: voterAddresses,
        root,
        window: { startTime, endTime },
        sampleProofs: { [voter1.address]: proof1 }
      },
      null,
      2
    )
  );
  console.log("Wrote scripts/merkle.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
