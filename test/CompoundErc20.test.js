const { ethers } = require("hardhat");
const { expect } = require("chai");
require("dotenv").config();

const WBTC = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
const CWBTC = "0xccF4429DB6322D5C611ee964527D42E5d685DD6a";

describe("Compound", function () {
  describe("Compound finance", function () {
    let accounts,
      token,
      cToken,
      testCompound,
      fundAmountWbtc,
      wbtcWhale,
      snapShot;

    beforeEach(async function () {
      accounts = await ethers.getSigners();
      fundAmountWbtc = 1n * 10n ** 8n;

      token = await ethers.getContractAt("IERC20", WBTC);
      cToken = await ethers.getContractAt("CErc20", CWBTC);

      const TestCompound = await ethers.getContractFactory("CompoundErc20");

      testCompound = await TestCompound.deploy(WBTC, CWBTC);
      await testCompound.deployed();

      await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [process.env.WBTC_WHALE0],
      });

      wbtcWhale = await ethers.getSigner(process.env.WBTC_WHALE0);

      await token
        .connect(wbtcWhale)
        .transfer(accounts[1].address, fundAmountWbtc);

      wbtcBalance = await token.balanceOf(testCompound.address);

      console.log("WBTC balance for contract", wbtcBalance);
      console.log(
        "WBTC balance for msg.sender",
        await token.balanceOf(accounts[1].address)
      );

      snapShot = async (testCompound, token, cToken) => {
        const { exchangeRate, supplyRate } =
          await testCompound.callStatic.getInfo();

        return {
          exchangeRate,
          supplyRate,
          estimateBalance:
            await testCompound.callStatic.estimateBalanceOfUnderlying(),
          balanceOfUnderlying:
            await testCompound.callStatic.balanceOfUnderlying(),
          token: await token.balanceOf(testCompound.address),
          cToken: await cToken.balanceOf(testCompound.address),
        };
      };
    });

    it("should supply and redeem", async function () {
      await token
        .connect(accounts[1])
        .approve(testCompound.address, fundAmountWbtc);

      await testCompound.connect(accounts[1]).supply(fundAmountWbtc);

      let after = await snapShot(testCompound, token, cToken);

      console.log("--- supply ---");

      console.log(`exchange rate ${after.exchangeRate}`);
      console.log(`supply rate ${after.supplyRate}`);
      console.log(`estimate balance ${after.estimateBalance}`);
      console.log(`balance of underlying ${after.balanceOfUnderlying}`);
      console.log(`token balance ${after.token}`);
      console.log(`c token balance ${after.cToken}`);
      const exchangeRate1 = await cToken.exchangeRateCurrent();
      console.log(`exchange rate: ${exchangeRate1}`);

      // for (let i = 0; i < 100; i++) {
      //   await ethers.provider.send("evm_increaseTime", [86400]); // 1 day in seconds
      //   await ethers.provider.send("evm_mine", []);
      // }
    });
  });
});
