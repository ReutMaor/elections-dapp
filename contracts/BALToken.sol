// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title BAL ERC20 token (mintable by owner)
contract BALToken is ERC20, Ownable {
    constructor(string memory name_, string memory symbol_)
        ERC20(name_, symbol_)
        Ownable(msg.sender) // OZ v5: חייבים לקבוע owner בבנאי
    {}

    /// @notice mint new tokens to an address (only owner)
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
