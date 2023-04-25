const { ethers, network } = require("hardhat");
const { expect } = require("chai");
require("dotenv").config();
const { BigNumber } = require("ethers");
const { WETH, CETH, DAI, CDAI, WETH_WHALE, DAI_WHALE } = require("./config.js");

describe("Compound Long", function () {
  let accounts,
    token,
    cToken,
    tokenToBorrow,
    cTokenToBorrow,
    testCompound,
    wbtcWhale,
    snapshot,
    repay_whale,
    ethBalance;

  const TOKEN = WETH;
  const C_TOKEN = CETH;
  const TOKEN_TO_BORROW = DAI;
  const C_TOKEN_TO_BORROW = CDAI;
  const REPAY_WHALE = DAI_WHALE;
  const BORROW_DECIMALS = 18;
  const BORROW_INTEREST = 1000n * 10n ** 18n;
  //   const ETH_AMOUNT = 10 * 1e18;
  //   const ETH_AMOUNT = 10n * 1n ** 18n;

  beforeEach(async function () {
    accounts = await ethers.getSigners();

    token = await ethers.getContractAt("IERC20", TOKEN);
    cToken = await ethers.getContractAt("CErc20", C_TOKEN);
    tokenToBorrow = await ethers.getContractAt("IERC20", TOKEN_TO_BORROW);
    cTokenToBorrow = await ethers.getContractAt("CErc20", C_TOKEN_TO_BORROW);

    const TestCompound = await ethers.getContractFactory("CompoundLong");

    testCompound = await TestCompound.deploy(
      C_TOKEN,
      C_TOKEN_TO_BORROW,
      TOKEN_TO_BORROW,
      BORROW_DECIMALS
    );
    await testCompound.deployed();

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [DAI_WHALE],
    });

    repay_whale = await ethers.getSigner(REPAY_WHALE);

    snapshot = async (testCompound, tokenToBorrow) => {
      const maxBorrow = await testCompound.getMaxBorrow();
      // verify it
      const ethBal = await ethers.provider.getBalance(testCompound.address);
      const tokenBororrowBalance = await tokenToBorrow.balanceOf(
        testCompound.address
      );
      const supplied = await testCompound.callStatic.getSuppliedBalance();
      const borrowed = await testCompound.callStatic.getBorrowBalance();
      // const liquidity = await testCompound.getAccountLiquidity();
      const { liquidity } = await testCompound.getAccountLiquidity();

      return {
        maxBorrow,
        eth: BigNumber.from(ethBal),
        tokenToBorrow: tokenBororrowBalance,
        supplied,
        borrowed,
        liquidity,
        // liquidity: liquidity[0],
      };
    };
  });

  it("should long", async () => {
    let snap;

    // supply
    ethBalance = await ethers.provider.getBalance(accounts[0].address);
    console.log(`ETH Whale balance: ${ethers.utils.formatEther(ethBalance)}`);

    await testCompound
      .connect(accounts[0])
      .supply({ value: ethers.utils.parseEther("10") });

    // long
    snap = await snapshot(testCompound, tokenToBorrow);
    console.log(`--- supplied ---`);
    console.log(`liquidity: ${(snap.liquidity / 1e18).toFixed(4)}`);
    console.log(
      `max borrow: ${(snap.maxBorrow / 10 ** BORROW_DECIMALS).toFixed(4)}`
    );

    const maxBorrow = await testCompound.getMaxBorrow();

    const borrowAmount = BigNumber.from(maxBorrow)
      .mul(500n)
      .div(1000n)
      .div(10n ** 18n);
    console.log(`Borrow amount: ${borrowAmount}`);

    await testCompound.connect(accounts[0]).long(borrowAmount);

    // update borrow balance
    // await testCompound.callStatic.getBorrowBalance();

    snap = await snapshot(testCompound, tokenToBorrow);
    console.log(`--- long ---`);
    // console.log(`liquidity: ${snap.liquidity.div(10n ** 18n)}`);
    // console.log(`borrowed: ${snap.borrowed.div(10n ** 18n)}`); // 10 ** BORROW_DECIMALS
    // console.log(`eth: ${snap.eth.div(10n ** 18n)}`);
    console.log(`liquidity: ${snap.liquidity / 1e18}`);
    console.log(`borrowed: ${snap.borrowed}`); // 10 ** BORROW_DECIMALS
    console.log(`eth: ${snap.eth}`);

    // accrue interest on borrow
    for (let i = 0; i < 10000; i++) {
      await ethers.provider.send("evm_increaseTime", [86400]); // 1 day in seconds
      await ethers.provider.send("evm_mine", []);
    }

    // repay
    await tokenToBorrow
      .connect(repay_whale)
      .transfer(testCompound.address, BORROW_INTEREST);

    await testCompound.connect(accounts[0]).repay();

    snap = await snapshot(testCompound, tokenToBorrow);
    console.log(`--- repay ---`);
    console.log(`liquidity: ${snap.liquidity / 1e7}`);
    console.log(`borrowed: ${snap.borrowed}`);
    console.log(`eth: ${ethers.utils.formatEther(snap.eth)}`);
    console.log(`token borrow: ${snap.tokenToBorrow / 1e18}`);
  });
});

// TO DO
// Fix liquidity, it does not update after getting long position on ETH
