// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8;

import "./interfaces/IERC20.sol";
import "./interfaces/Compound.sol";

contract CompoundErc20 {
    IERC20 public token;
    CErc20 public cToken;

    constructor(address _token, address _cToken) {
        token = IERC20(_token);
        cToken = CErc20(_cToken);
    }

    ////////// supply and redeem //////////

    function supply(uint _amount) external {
        token.transferFrom(msg.sender, address(this), _amount);
        token.approve(address(cToken), _amount);
        require(cToken.mint(_amount) == 0, "mint failed");
    }

    function getCTokenBalance() external view returns (uint) {
        return cToken.balanceOf(address(this));
    }

    function getInfo() external returns (uint exchangeRate, uint supplyRate) {
        exchangeRate = cToken.exchangeRateCurrent();
        supplyRate = cToken.supplyRatePerBlock();
    }

    function estimateBalanceOfUnderlying() external returns (uint) {
        uint cTokenBal = cToken.balanceOf(address(this));
        uint exchangeRate = cToken.exchangeRateCurrent();
        uint decimals = 8; // WBTC = 8 decimals
        uint cTokenDecimals = 8;

        return
            (exchangeRate * cTokenBal) / 10**(18 + decimals - cTokenDecimals);
    }

    function balanceOfUnderlying() external returns (uint) {
        return cToken.balanceOfUnderlying(address(this));
    }

    function redeem(uint _cTokenAmount) external {
        require(cToken.redeem(_cTokenAmount) == 0, "redeem failed");
    }

    ////////// borrow and repay //////////

    Comptroller public comptroller =
        Comptroller(0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B);

    PriceFeed public priceFeed =
        PriceFeed(0x922018674c12a7F0D394ebEEf9B58F186CdE13c1);

    function getCollateralFactor() external view returns (uint) {
        (bool isListed, uint colFactor, bool isComped) = comptroller.markets(
            address(cToken)
        );

        return colFactor;
    }

    function getAccountLiquidity()
        external
        view
        returns (uint liquidity, uint shortfall)
    {
        (uint error, uint _liquidity, uint _shortfall) = comptroller
            .getAccountLiquidity(address(this));

        require(error == 0, "error");

        return (_liquidity, _shortfall);
    }

    function getPriceFeed(address _cToken) external view returns (uint) {
        return priceFeed.getUnderlyingPrice(_cToken);
    }

    function borrow(address _cTokenToBorrow, uint _decimals) external {
        address[] memory cTokens = new address[](1);

        cTokens[0] = address(cToken);

        uint[] memory errors = comptroller.enterMarkets(cTokens);
        require(errors[0] == 0, "error");

        (uint error, uint shortfall, uint liquidity) = comptroller
            .getAccountLiquidity(address(this));
        require(error == 0, "error");
        require(shortfall == 0, "shortfall > 0");
        require(liquidity > 0, "liquidity = 0");

        uint price = priceFeed.getUnderlyingPrice(_cTokenToBorrow);

        uint maxBorrow = (liquidity * (10**_decimals)) / price;
        require(maxBorrow > 0, "max borrow = 0");

        uint amount = (maxBorrow * 50) / 100;

        require(CErc20(_cTokenToBorrow).borrow(amount) == 0, "borrow failed");
    }

    function getBorrowedBalance(address _cTokenBorrowed) public returns (uint) {
        return CErc20(_cTokenBorrowed).borrowBalanceCurrent(address(this));
    }

    function getBorrowRatePerBlock(address _cTokenBorrowed)
        external
        view
        returns (uint)
    {
        return CErc20(_cTokenBorrowed).borrowRatePerBlock();
    }

    function repay(
        address _tokenBorrorowed,
        address _cTokenBorrowed,
        uint _amount
    ) external {
        IERC20(_tokenBorrorowed).approve(_cTokenBorrowed, _amount);
        require(
            CErc20(_cTokenBorrowed).repayBorrow(_amount) == 0,
            "repay failed"
        );
    }
}
