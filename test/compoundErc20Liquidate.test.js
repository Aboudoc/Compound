const { ethers, network } = require("hardhat");
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
        const { liquidity, shortfall } =
          await testCompound.getAccountLiquidity();
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
          liquidity: liquidity / 10 ** 14 / 10000,
          shortfall: shortfall / 10 ** 14 / 10000,
          closeFactor: closeFactor / 10 ** (18 - 2),
          incentive: incentive / 10 ** (18 - 2) / 100,
          liquidated: liquidated / 10 ** (SUPPLY_DECIMALS - 4) / 10000,
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
      const { liquidity } = await testCompound.getAccountLiquidity();
      const price = await testCompound.getPriceFeed(C_TOKEN_TO_BORROW);
      const maxBorrow = (liquidity * 10 ** BORROW_DECIMALS) / price;

      // Play with it until there is no more error
      //   const borrowAmount = (maxBorrow * 95) / 100;
      const borrowAmount = (maxBorrow * 9995) / 10000;
      //   const borrowAmount = (maxBorrow * 80000) / 10000;

      console.log(`--- entered market ---`);
      console.log(`liquidity: $ ${liquidity / 10 ** 18}`);
      console.log(`price: $ ${price / 10 ** 18}`);
      console.log(`max borrow: ${maxBorrow / 10 ** 18}`);
      console.log(`borrow amount: ${borrowAmount / 10 ** 18}`);

      await testCompound.connect(accounts[1]).borrow(21306n * 10n ** 18n);

      after = await snapshot(testCompound, liquidator);
      console.log(`--- borrowed ---`);
      console.log(`liquidity: $ ${after.liquidity}`);
      console.log(`borrowed: ${after.borrowed}`);

      // accrue interest on borrow
      for (let i = 0; i < 500; i++) {
        await ethers.provider.send("evm_increaseTime", [86400]); // 1 day in seconds
        await ethers.provider.send("evm_mine", []);
      }

      // send any tx to Compound to update liquidity and shortfall
      await testCompound.getBorrowBalance();

      after = await snapshot(testCompound, liquidator);
      console.log(`--- after some blocks... ---`);
      console.log(`liquidity: $ ${after.liquidity}`);

      //TO FIX : shortfall: $ 0
      console.log(`shortfall: $ ${after.shortfall}`);
      console.log(`borrowed: ${after.borrowed}`);

      // liquidate
      const closeFactor = await liquidator.getCloseFactor();
      const repayAmount =
        ((await testCompound.callStatic.getBorrowBalance()) * closeFactor) /
        10 ** 18 /
        10 ** 18;

      const liqBal =
        (await tokenToBorrow.balanceOf(repayWhale.address)) /
        10 ** BORROW_DECIMALS;

      console.log(`close factor: ${closeFactor / 10 ** (18 - 2)}%`);

      console.log(`repay amount: ${repayAmount}`);

      console.log(`liquidator balance: ${liqBal}`);

      // TO FIX : Error: underflow
      // const amountToBeLiquidated = await liquidator.getAmountToBeLiquidated(
      //   C_TOKEN_TO_BORROW,
      //   C_TOKEN,
      //   repayAmount
      // );
      // console.log(
      //   `amount to be liquidated (cToken collateral):  ${amountToBeLiquidated}`
      // );
    });
  });
});
