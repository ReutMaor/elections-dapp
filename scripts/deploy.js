require("@nomicfoundation/hardhat-ethers");
const hre = require("hardhat");
const keccak256 = require("keccak256");
const { MerkleTree } = require("merkletreejs");
const fs = require("node:fs");

function addrToBytes(address) {
  return Buffer.from(hre.ethers.getBytes(address)); // 20-byte address
}
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
  // ניקח 1 admin + שלושה מצביעים
  const [admin, voter1, voter2, voter3] = await hre.ethers.getSigners();
  const voterAddresses = [voter1.address, voter2.address, voter3.address];

  // בונים מרקל ומייצרים proofs לכולם
  const { tree, root } = buildVoterMerkle(voterAddresses);
  const proofs = {};
  for (const addr of voterAddresses) {
    const leaf = leafOf(addr);
    proofs[addr] = tree.getHexProof(leaf);
  }

  console.log("Voters:", voterAddresses);
  console.log("Merkle Root:", root);

  // חלון זמן יוגדר מה-GUI (0,0 בדיפלוי)
  const startTime = 0;
  const endTime = 0;

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

  // קישור טוקן BAL והעברת בעלות ל-Voting כדי שיוכל למנט
  await (await voting.setRewardToken(bal.target)).wait();
  console.log("Reward token set on Voting.");
  await (await bal.transferOwnership(voting.target)).wait();
  console.log("Transferred BAL ownership to Voting.");

  // מועמדים לדוגמה (מותר לפני תחילת ההצבעה)
  await (await voting.addCandidateWithQuiz("Alice", [1, 0, 2])).wait();
  await (await voting.addCandidateWithQuiz("Bob",   [0, 1, 2])).wait();
  console.log("Candidates added: Alice, Bob (with quiz)");

  // כותבים קובץ עזר עם כל הפרטים + proofs ל-3 מצביעים
  fs.writeFileSync(
    "scripts/merkle.json",
    JSON.stringify(
      {
        contracts: { voting: voting.target, bal: bal.target },
        voters: voterAddresses,
        root,
        window: { startTime, endTime }, // יישאר 0,0 עד שהאדמין יקבע ב-GUI
        proofs // { "0x7099...": ["0x..","0x.."], "0x3C44...": [...], "0x90F7...": [...] }
      },
      null,
      2
    )
  );
  console.log("Wrote scripts/merkle.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
