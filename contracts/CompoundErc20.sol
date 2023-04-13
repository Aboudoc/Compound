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

    function supply(uint _amount) external {
        token.transferFrom(msg.sender, address(this), _amount);
        token.approve(address(cToken), _amount);
        cToken.mint(_amount);
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
}
