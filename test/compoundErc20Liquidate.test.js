const { ethers, network } = require("hardhat");
const { expect } = require("chai");
require("dotenv").config();
const { BigNumber } = require("ethers");
const { WBTC, CWBTC, DAI, CDAI } = require("./config.js");

const BORROW_DECIMALS = 18;
const SUPPLY_DECIMALS = 8;

describe("Compound finance", function () {
  describe("borrow and repay", function () {
    const TOKEN = WBTC;
    const C_TOKEN = CWBTC;
    const TOKEN_TO_BORROW = DAI;
    const C_TOKEN_TO_BORROW = CDAI;
    const SUPPLY_AMOUNT = 1n * 10n ** 8n;
    const FUND_AMOUNT = 2n * 10n ** 8n;
    const BORROW_INTEREST = 1000n * 10n ** 18n;

    let accounts,
      token,
      cToken,
      tokenToBorrow,
      cTokenToBorrow,
      testCompound,
      liquidator,
      wbtcWhale,
      repayWhale,
      snapshot;

    beforeEach(async function () {
      accounts = await ethers.getSigners();

      token = await ethers.getContractAt("IERC20", TOKEN);
      cToken = await ethers.getContractAt("CErc20", C_TOKEN);
      tokenToBorrow = await ethers.getContractAt("IERC20", TOKEN_TO_BORROW);
      cTokenToBorrow = await ethers.getContractAt("CErc20", C_TOKEN_TO_BORROW);

      const TestCompound = await ethers.getContractFactory("CompoundLiquidate");
      const Liquidator = await ethers.getContractFactory("CompoundLiquidator");

      testCompound = await TestCompound.deploy(
        TOKEN,
        C_TOKEN,
        TOKEN_TO_BORROW,
        C_TOKEN_TO_BORROW
      );
      await testCompound.deployed();

      liquidator = await Liquidator.deploy(TOKEN_TO_BORROW, C_TOKEN_TO_BORROW);
      await liquidator.deployed();

      await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [process.env.WBTC_WHALE0],
      });

      await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [process.env.DAI_WHALE],
      });

      wbtcWhale = await ethers.getSigner(process.env.WBTC_WHALE0);
      repayWhale = await ethers.getSigner(process.env.DAI_WHALE);

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

      snapshot = async (testCompound, liquidator) => {
        const supplied = await testCompound.callStatic.getSupplyBalance();
        const borrowed = await testCompound.callStatic.getBorrowBalance();
        const colFactor = await testCompound.getCollateralFactor();
        const liquidity = await testCompound.getAccountLiquidity();
        const price = await testCompound.getPriceFeed(C_TOKEN_TO_BORROW);
        const closeFactor = await liquidator.getCloseFactor();
        const incentive = await liquidator.getLiquidationIncentive();
        const liquidated = await liquidator.callStatic.getSupplyBalance(
          C_TOKEN
        );

        return {
          colFactor: colFactor / 10 ** (18 - 2),
          supplied: supplied / 10 ** (SUPPLY_DECIMALS - 2) / 100,
          borrowed: borrowed / 10 ** (BORROW_DECIMALS - 2) / 100,
          price: price / 10 ** (18 - 2) / 100,
          liquidity: liquidity[0],
          shortfall: liquidity[1],
          closeFactor: closeFactor / 10 ** (18 - 2),
          incentive: incentive,
          liquidated: liquidated,
        };
      };
    });

    it("should  liquidate", async function () {
      let after;

      // supply
      await token
        .connect(accounts[1])
        .approve(testCompound.address, SUPPLY_AMOUNT);

      await testCompound.connect(accounts[1]).supply(SUPPLY_AMOUNT);

      after = await snapshot(testCompound, liquidator);

      console.log(`--- supplied ---`);
      console.log(`col factor: ${after.colFactor} %`);
      console.log(`supplied: ${after.supplied}`);

      // enter market
      await testCompound.connect(accounts[1]).enterMarket();

      //  borrow
      const liquidity = await testCompound.getAccountLiquidity();
      let price = await testCompound.getPriceFeed(C_TOKEN_TO_BORROW);
      const multiplier = BigNumber.from(10).pow(18);

      const maxBorrow = BigNumber.from(liquidity[0]).mul(multiplier).div(price);

      // NOTE: tweak borrow amount for testing
      const borrowAmount = BigNumber.from(maxBorrow).mul(9999).div(10000);

      console.log(`--- entered market ---`);
      console.log("Liquidity in Dollar: $", (liquidity[0] / 1e18).toFixed(4));
      console.log(`price: $ ${price / 10 ** 18}`);
      console.log("MaxBorrow in Dollar: $", (maxBorrow / 1e18).toFixed(4));
      console.log(`borrow amount: ${borrowAmount / 10 ** 18}`);

      await testCompound.connect(accounts[1]).borrow(liquidity[0]);

      after = await snapshot(testCompound, liquidator);
      console.log(`--- borrowed ---`);
      console.log(`liquidity: $ ${after.liquidity / 1e18}`);
      console.log(`borrowed: ${after.borrowed.toFixed(4)}`);

      // accrue interest on borrow
      for (let i = 0; i < 10000; i++) {
        await ethers.provider.send("evm_increaseTime", [86400]); // 1 day in seconds
        await ethers.provider.send("evm_mine", []);
      }

      // send any tx to Compound to update liquidity and shortfall
      await testCompound.getBorrowBalance();

      after = await snapshot(testCompound, liquidator);
      console.log(`--- after some blocks... ---`);
      console.log(`liquidity: $ ${after.liquidity / 1e18}`);

      console.log(`shortfall: $ ${after.shortfall / 1e18}`);
      console.log(`borrowed: ${after.borrowed}`);

      // liquidate
      const closeFactor = await liquidator.getCloseFactor();
      const borrowBalance = await testCompound.callStatic.getBorrowBalance();

      const amt = BigNumber.from(borrowBalance).mul(closeFactor);
      const repayAmount = BigNumber.from(amt).div(1000000000000000000n);

      const liqBal =
        (await tokenToBorrow.balanceOf(repayWhale.address)) /
        10 ** BORROW_DECIMALS;

      console.log(`close factor: ${closeFactor / 10 ** (18 - 2)}%`);

      console.log(`repay amount: ${repayAmount / 1e18}`);

      console.log(`liquidator balance: $ ${liqBal}`);

      // TO FIX : Error: underflow
      const amountToBeLiquidated = await liquidator.getAmountToBeLiquidated(
        C_TOKEN_TO_BORROW,
        C_TOKEN,
        repayAmount
      );
      console.log(
        `amount to be liquidated (cToken collateral):  ${
          amountToBeLiquidated.div(10 ** SUPPLY_DECIMALS - 2) / 100
        }`
      );

      await tokenToBorrow
        .connect(repayWhale)
        .approve(liquidator.address, repayAmount);

      await liquidator
        .connect(repayWhale)
        .liquidate(testCompound.address, repayAmount, C_TOKEN);

      after = await snapshot(testCompound, liquidator);

      console.log(`--- liquidated ---`);
      console.log(`close factor: ${after.closeFactor} %`);
      console.log(`liquidation incentive: ${after.incentive / 1e18}`);
      console.log(`supplied: ${after.supplied}`);
      console.log(`liquidity: $ ${after.liquidity / 1e18}`);
      console.log(`shortfall: $ ${after.shortfall}`);
      console.log(`borrowed: ${after.borrowed}`);
      console.log(`liquidated: ${after.liquidated / 10 ** SUPPLY_DECIMALS}`);
    });
  });
});
