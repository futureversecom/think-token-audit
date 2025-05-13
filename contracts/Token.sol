// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "./ERC20Peg.sol";

import "./Roles.sol";

uint256 constant DECIMALS = 18;
uint256 constant TOTAL_SUPPLY = 1_000_000_000 ether; // 1B tokens (18 decimals)
string constant NAME = "THINK Token";
string constant SYMBOL = "THINK";

/**
 * @dev Futureverse ERC20 token
 */
contract Token is
    AccessControl,
    ReentrancyGuard,
    ERC20Capped,
    ERC20Burnable,
    Pausable
{
    using SafeERC20 for IERC20;

    bool private _initialized;
    address public peg;

    error InvalidAddress();
    error AlreadyInitialized();
    error UseDepositInsteadOfTransfer();

    event PegChanged(address peg);

    constructor(
        address rolesManager,
        address tokenManager,
        address multisig
    ) ERC20Capped(TOTAL_SUPPLY) ERC20(NAME, SYMBOL) {
        if (
            rolesManager == address(0) ||
            tokenManager == address(0) ||
            multisig == address(0)
        ) {
            revert InvalidAddress();
        }
        _grantRole(DEFAULT_ADMIN_ROLE, rolesManager);
        _grantRole(MANAGER_ROLE, tokenManager);
        _grantRole(MULTISIG_ROLE, multisig);
    }

    receive() external payable {
        revert();
    }

    function init(address _peg) external onlyRole(MANAGER_ROLE) {
        if (_initialized) {
            revert AlreadyInitialized();
        }
        if (_peg == address(0)) {
            revert InvalidAddress();
        }

        _mint(_peg, TOTAL_SUPPLY);
        peg = _peg;
        _initialized = true;
    }

    function decimals() public view virtual override returns (uint8) {
        return uint8(DECIMALS);
    }

    function mint(
        address to,
        uint256 _amount
    ) external onlyRole(MULTISIG_ROLE) {
        _mint(to, _amount);
    }

    function _mint(
        address to,
        uint256 amount
    ) internal override(ERC20, ERC20Capped) {
        super._mint(to, amount);
    }

    function _beforeTokenTransfer(
        address,
        address to,
        uint256
    ) internal view override whenNotPaused {
        if (to == address(this)) revert InvalidAddress();
        if (to == address(peg) && msg.sender != peg)
            revert UseDepositInsteadOfTransfer();
    }

    function setPeg(address _peg) external onlyRole(MULTISIG_ROLE) {
        if (_peg == address(0)) {
            revert InvalidAddress();
        }
        peg = address(_peg);
        emit PegChanged(_peg);
    }

    function pause() external onlyRole(MANAGER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(MULTISIG_ROLE) {
        _unpause();
    }

    function burn(uint256 amount) public override onlyRole(MULTISIG_ROLE) {
        _burn(msg.sender, amount);
    }
}
