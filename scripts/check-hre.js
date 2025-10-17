// scripts/check-hre.js (CommonJS)
require("@nomicfoundation/hardhat-ethers"); // טוען את ה-plugin
const hre = require("hardhat");

async function main() {
  console.log("Has hre?", !!hre);
  console.log("Has hre.ethers?", !!hre.ethers);
  console.log("Network name:", hre.network.name);

  const signers = await hre.ethers.getSigners();
  console.log("Signers:", signers.map((s) => s.address));
}

main().catch((e) => { console.error(e); process.exit(1); });
