// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import "./interfaces/IERC20.sol";
import "./interfaces/Compound.sol";

contract CompoundEth {
    CEth public cToken;

    constructor(address _cToken) {
        cToken = CEth(_cToken);
    }

    receive() external payable {}

    function supply() external payable {
        cToken.mint{value: msg.value}();
    }

    function getCTokenBalance() external view returns (uint) {
        return cToken.balanceOf(address(this));
    }

    // not view function
    function getInfo() external returns (uint exchangeRate, uint supplyRate) {
        // Amount of current exchange rate from cToken to underlying
        exchangeRate = cToken.exchangeRateCurrent();
        // Amount added to you supply balance this block
        supplyRate = cToken.supplyRatePerBlock();
    }

    function estimateBalanceOfUnderlying() external returns (uint) {
        uint cTokenBal = cToken.balanceOf(address(this));
        uint exchangeRate = cToken.exchangeRateCurrent();
        uint decimals = 18; // DAI = 18 decimals
        uint cTokenDecimals = 8;

        return
            (cTokenBal * exchangeRate) / 10**(18 + decimals - cTokenDecimals);
    }

    function balanceOfUnderlying() external returns (uint) {
        return cToken.balanceOfUnderlying(address(this));
    }

    function redeem(uint _cTokenAmount) external {
        require(cToken.redeem(_cTokenAmount) == 0, "redeem failed");
        // cToken.redeemUnderlying(underlying amount);
    }
}
