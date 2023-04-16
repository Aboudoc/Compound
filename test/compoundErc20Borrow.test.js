const { ethers } = require("hardhat");
const { expect } = require("chai");
require("dotenv").config();

const WBTC = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
const CWBTC = "0xccF4429DB6322D5C611ee964527D42E5d685DD6a";
const DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const CDAI = "0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643";
const BORROW_DECIMALS = 18;
const SUPPLY_DECIMALS = 8;

describe("Compound finance", function () {
  describe("borrow and repay", function () {
    const TOKEN = WBTC;
    const C_TOKEN = CWBTC;
    const TOKEN_TO_BORROW = DAI;
    const C_TOKEN_TO_BORROW = CDAI;
    const SUPPLY_AMOUNT = 2n * 10n ** 8n;
    const FUND_AMOUNT = 2n * 10n ** 8n;

    let accounts,
      token,
      cToken,
      tokenToBorrow,
      cTokenToBorrow,
      testCompound,
      wbtcWhale,
      snapshot;

    beforeEach(async function () {
      accounts = await ethers.getSigners();

      token = await ethers.getContractAt("IERC20", TOKEN);
      cToken = await ethers.getContractAt("CErc20", C_TOKEN);
      tokenToBorrow = await ethers.getContractAt("IERC20", TOKEN_TO_BORROW);
      cTokenToBorrow = await ethers.getContractAt("CErc20", C_TOKEN_TO_BORROW);

      const TestCompound = await ethers.getContractFactory("CompoundErc20");

      testCompound = await TestCompound.deploy(TOKEN, C_TOKEN);
      await testCompound.deployed();

      await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [process.env.WBTC_WHALE0],
      });

      wbtcWhale = await ethers.getSigner(process.env.WBTC_WHALE0);

      await token.connect(wbtcWhale).transfer(accounts[1].address, FUND_AMOUNT);
      await token
        .connect(wbtcWhale)
        .transfer(testCompound.address, FUND_AMOUNT);

      wbtcBalance = await token.balanceOf(testCompound.address);

      console.log(`------  balances before...  ------`);

      console.log("WBTC balance for contract", wbtcBalance.toNumber());
      console.log(
        "WBTC balance for msg.sender",
        (await token.balanceOf(accounts[1].address)).toNumber()
      );

      snapshot = async (testCompound, tokenToBorrow) => {
        const { liquidity } = await testCompound.getAccountLiquidity();
        const colFactor = await testCompound.getCollateralFactor();
        const supplied = await testCompound.callStatic.balanceOfUnderlying();
        const price = await testCompound.getPriceFeed(C_TOKEN_TO_BORROW);
        const maxBorrow = liquidity / price;
        const borrowedBalance =
          await testCompound.callStatic.getBorrowedBalance(C_TOKEN_TO_BORROW);
        const tokenToBorrowBal = await tokenToBorrow.balanceOf(
          testCompound.address
        );
        const borrowRate = await testCompound.callStatic.getBorrowRatePerBlock(
          C_TOKEN_TO_BORROW
        );

        return {
          colFactor: colFactor / 10 ** 18,
          supplied: supplied / 10 ** (SUPPLY_DECIMALS - 2) / 100,
          price: price / 10 ** (18 - 2) / 100,
          liquidity: liquidity / 10 ** 18,
          maxBorrow,
          borrowedBalance: borrowedBalance / 10 ** (BORROW_DECIMALS - 2) / 100,
          tokenToBorrowBal:
            tokenToBorrowBal / 10 ** (BORROW_DECIMALS - 2) / 100,
          borrowRate,
        };
      };
    });

    it("should supply, borrow and repay", async function () {
      let after;

      // supply
      await token
        .connect(accounts[1])
        .approve(testCompound.address, SUPPLY_AMOUNT);

      await testCompound.connect(accounts[1]).supply(SUPPLY_AMOUNT);

      after = await snapshot(testCompound, tokenToBorrow);
      console.log(`--- borrow (before) ---`);
      console.log(`col factor: ${after.colFactor} %`);
      console.log(`supplied: ${after.supplied}`);
      console.log(`liquidity: $ ${after.liquidity}`);
      console.log(`price: $ ${after.price}`);
      console.log(`max borrow: ${after.maxBorrow}`);
      console.log(`borrowed balance (compound): ${after.borrowedBalance}`);
      console.log(`borrowed balance (erc20): ${after.tokenToBorrowBal}`);
      console.log(`borrow rate: ${after.borrowRate}`);

      // borrow
      await testCompound
        .connect(accounts[1])
        .borrow(C_TOKEN_TO_BORROW, BORROW_DECIMALS);

      after = await snapshot(testCompound, tokenToBorrow);
      console.log(`--- borrow (after) ---`);
      console.log(`liquidity: $ ${after.liquidity}`);
      console.log(`max borrow: ${after.maxBorrow}`);
      console.log(`borrowed balance (compound): ${after.borrowedBalance}`);
      console.log(`borrowed balance (erc20): ${after.tokenToBorrowBal}`);

      // accrue interest on borrow
      for (let i = 0; i < 365; i++) {
        await ethers.provider.send("evm_increaseTime", [86400]); // 1 day in seconds
        await ethers.provider.send("evm_mine", []);
      }

      after = await snapshot(testCompound, tokenToBorrow);
      console.log(`--- after some blocks... ---`);
      console.log(`liquidity: $ ${after.liquidity}`);
      console.log(`max borrow: ${after.maxBorrow}`);
      console.log(`borrowed balance (compound): ${after.borrowedBalance}`);
      console.log(`borrowed balance (erc20): ${after.tokenToBorrowBal}`);

      // repay
    });
  });
});
