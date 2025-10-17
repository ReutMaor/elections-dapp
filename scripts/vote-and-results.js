// scripts/vote-and-results.js (CJS) — הצבעה לפי שאלון
require("@nomicfoundation/hardhat-ethers");
const hre = require("hardhat");
const fs = require("node:fs");

async function ensureDeployed(address, name) {
  const code = await hre.ethers.provider.getCode(address);
  if (code === "0x") {
    throw new Error(
      `${name} at ${address} has no code. Run on the same node:\n` +
      `1) npx hardhat node\n2) npx hardhat run --network localhost scripts/deploy.js`
    );
  }
}

async function main() {
  const data = JSON.parse(fs.readFileSync("scripts/merkle.json", "utf8"));
  const { contracts, voters, sampleProofs, window } = data;

  await ensureDeployed(contracts.voting, "Voting");
  await ensureDeployed(contracts.bal, "BALToken");

  const voting = await hre.ethers.getContractAt("Voting", contracts.voting);
  const bal    = await hre.ethers.getContractAt("BALToken", contracts.bal);

  const signers = await hre.ethers.getSigners();
  const voter1  = signers[1];

  // נשתמש ב-proof שנשמר בדיפלוי
  const proof = sampleProofs[voters[0]] || sampleProofs[voter1.address];

  // ניישר זמן לתוך חלון ההצבעה
  const latest = await hre.ethers.provider.getBlock("latest");
  if (latest.timestamp < window.startTime) {
    const delta = window.startTime - latest.timestamp + 1;
    await hre.network.provider.send("evm_increaseTime", [delta]);
    await hre.network.provider.send("evm_mine");
  } else if (latest.timestamp > window.endTime) {
    throw new Error(`Voting window closed; redeploy with a fresh window.`);
  }

  // 👇 הצבעה לפי שאלון (3 תשובות uint8; חייב באורך 3)
  const answers = [1, 0, 2]; // דוגמה; יתאים לאליס בקונפיג שנתת
  console.log("Voting-by-questionnaire as:", voter1.address, "answers=", answers);
  const tx = await voting.connect(voter1).voteByQuestionnaire(answers, proof);
  await tx.wait();
  console.log("Voted via questionnaire");

  // תוצאות
  const count = Number(await voting.candidatesCount());
  const results = [];
  for (let i = 0; i < count; i++) {
    const [name, votes] = await voting.getCandidate(i);
    results.push({ id: i, name, votes: Number(votes) });
  }
  console.log("Results:", results);

  // בדיקת תגמול BAL
  const balRaw = await bal.balanceOf(voter1.address);
  console.log(`BAL of voter1: ${hre.ethers.formatUnits(balRaw, 18)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
