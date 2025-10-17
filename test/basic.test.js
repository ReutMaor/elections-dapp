import { expect } from "chai";
import { ethers } from "hardhat";

describe("Lock (smoke)", function () {
  it("compiles and deploys", async function () {
    const Lock = await ethers.getContractFactory("Lock");
    const lock = await Lock.deploy();
    await lock.waitForDeployment();
    // בדיקה קטנה
    expect(await lock.x()).to.equal(1n);
  });
});
