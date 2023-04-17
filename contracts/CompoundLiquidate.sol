// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8;

import "./interfaces/IERC20.sol";
import "./interfaces/Compound.sol";

contract CompoundLiquidate {
    Comptroller public comptroller =
        Comptroller(0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B);

    PriceFeed public priceFeed =
        PriceFeed(0x922018674c12a7F0D394ebEEf9B58F186CdE13c1);

    IERC20 public tokenSupply;
    CErc20 public cTokenSupply;
    IERC20 public tokenBorrow;
    CErc20 public cTokenBorrow;

    event Log(string message, uint val);

    constructor(
        address _tokenSupply,
        address _cTokenSupply,
        address _tokenBorrow,
        address _cTokenBorrow
    ) {
        tokenSupply = IERC20(_tokenSupply);
        cTokenSupply = CErc20(_cTokenSupply);

        tokenBorrow = IERC20(_tokenBorrow);
        cTokenBorrow = CErc20(_cTokenBorrow);
    }

    function supply(uint _amount) external {
        tokenSupply.transferFrom(msg.sender, address(this), _amount);
        tokenSupply.approve(address(cTokenSupply), _amount);
        require(cTokenSupply.mint(_amount) == 0, "mint failed");
    }

    function getSupplyBalance() external returns (uint) {
        return cTokenSupply.balanceOfUnderlying(address(this));
    }

    function getCollateralFactor() external view returns (uint) {
        (, uint colFactor, ) = comptroller.markets(address(cTokenSupply));
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

    function enterMarket() external {
        address[] memory cTokens = new address[](1);
        cTokens[0] = address(cTokenSupply);
        uint[] memory errors = comptroller.enterMarkets(cTokens);
        require(errors[0] == 0, "Comptroller.enterMarkets failed.");
    }

    function borrow(uint _amount) external {
        require(cTokenBorrow.borrow(_amount) == 0, "borrow failed");
    }

    function getBorrowBalance() public returns (uint) {
        return cTokenBorrow.borrowBalanceCurrent(address(this));
    }
}

contract CompoundLiquidator {
    Comptroller public comptroller =
        Comptroller(0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B);

    IERC20 public tokenBorrow;
    CErc20 public cTokenBorrow;

    event Log(string message, uint val);

    constructor(address _tokenBorrow, address _cTokenBorrow) {
        tokenBorrow = IERC20(_tokenBorrow);
        cTokenBorrow = CErc20(_cTokenBorrow);
    }

    function getCloseFactor() external view returns (uint) {
        return comptroller.closeFactorMantissa();
    }

    function getLiquidationIncentive() external view returns (uint) {
        return comptroller.liquidationIncentiveMantissa();
    }

    function getAmountToBeLiquidated(
        address _cTokenBorrowed,
        address _cTokenCollateral,
        uint _actualRepayAmount
    ) external view returns (uint) {
        (uint error, uint cTokenCollateralAmount) = comptroller
            .liquidateCalculateSeizeTokens(
                _cTokenBorrowed,
                _cTokenCollateral,
                _actualRepayAmount
            );

        require(error == 0, "error");

        return cTokenCollateralAmount;
    }

    function liquidate(
        address _borrower,
        uint _repayAmount,
        address _cTokenCollateral
    ) external {
        tokenBorrow.transferFrom(msg.sender, address(this), _repayAmount);
        tokenBorrow.approve(address(cTokenBorrow), _repayAmount);

        require(
            cTokenBorrow.liquidateBorrow(
                _borrower,
                _repayAmount,
                _cTokenCollateral
            ) == 0,
            "liquidation failed"
        );
    }
}
