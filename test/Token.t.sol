// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../contracts/Token.sol";
import {UserFactory} from "./utils/UserFactory.sol";
import "forge-std/Test.sol";
import "@openzeppelin/lib/forge-std/src/Test.sol";
import "../contracts/Roles.sol";

contract TokenTest is Test {
    Token token;
    address[] users;
    address rolesManager;
    address tokenManager;
    address recoveryManager;
    address multisig;
    address user;
    address peg;

    uint256 constant INITIAL_SUPPLY = 1_000_000_000 ether;
    uint256 constant TEST_AMOUNT = 100 ether;

    event Deposited(address indexed addr, uint256 amount);
    event WithdrawnForFee(address indexed addr, uint256 amount, uint256 fee);
    event AdminWithdrawal(address indexed recipient, uint256 amount);

    function _getAccessControlRevertMessage(
        address account,
        bytes32 role
    ) internal pure returns (bytes memory) {
        return
            abi.encodePacked(
                "AccessControl: account ",
                Strings.toHexString(uint160(account), 20),
                " is missing role ",
                Strings.toHexString(uint256(role), 32)
            );
    }

    function setUp() public {
        users = new UserFactory().create(5);
        rolesManager = users[0];
        tokenManager = users[1];
        recoveryManager = users[2]; // Using same address for testing
        multisig = users[3];
        user = users[4];
        peg = address(0x123);
        vm.label(peg, "peg");

        token = new Token(rolesManager, tokenManager, multisig);

        // Initialize the token
        vm.prank(tokenManager);
        token.init(peg);

        // Transfer some tokens from peg to multisig for testing
        vm.startPrank(peg);
        token.transfer(user, TEST_AMOUNT);
        token.transfer(multisig, TEST_AMOUNT * 10);
        vm.stopPrank();
    }

    function test_initial_state() public {
        assertEq(token.totalSupply(), INITIAL_SUPPLY);
        assertEq(token.balanceOf(peg), INITIAL_SUPPLY - (TEST_AMOUNT * 11)); // 10 multisig + 1 user
        assertTrue(token.hasRole(MANAGER_ROLE, tokenManager));
        assertTrue(token.hasRole(MULTISIG_ROLE, multisig));
    }

    function test_burn_functionality() public {
        uint256 burnAmount = TEST_AMOUNT / 2;

        vm.prank(user);
        vm.expectRevert(
            abi.encodePacked(
                "AccessControl: account ",
                Strings.toHexString(uint160(user), 20),
                " is missing role ",
                Strings.toHexString(uint256(MULTISIG_ROLE), 32)
            )
        );
        token.burn(burnAmount);

        uint256 multisigBalance = token.balanceOf(multisig);
        vm.prank(multisig);
        token.burn(burnAmount);
        assertEq(token.balanceOf(multisig), multisigBalance - burnAmount);
    }

    function test_burn_zero_amount() public {
        uint256 initialBalance = token.balanceOf(multisig);
        uint256 initialSupply = token.totalSupply();

        vm.prank(multisig);
        token.burn(0);

        assertEq(
            token.balanceOf(multisig),
            initialBalance,
            "Balance should remain unchanged when burning 0 tokens"
        );
        assertEq(
            token.totalSupply(),
            initialSupply,
            "Total supply should remain unchanged when burning 0 tokens"
        );
    }

    function test_burn_entire_balance() public {
        uint256 initialBalance = token.balanceOf(multisig);
        uint256 initialSupply = token.totalSupply();

        vm.prank(multisig);
        token.burn(initialBalance);

        assertEq(
            token.balanceOf(multisig),
            0,
            "Balance should be zero after burning entire balance"
        );
        assertEq(
            token.totalSupply(),
            initialSupply - initialBalance,
            "Total supply should be reduced by burned amount"
        );
    }

    function test_burn_more_than_balance() public {
        uint256 initialBalance = token.balanceOf(multisig);

        vm.prank(multisig);
        vm.expectRevert("ERC20: burn amount exceeds balance");
        token.burn(initialBalance + 1);

        assertEq(
            token.balanceOf(multisig),
            initialBalance,
            "Balance should remain unchanged after failed burn"
        );
    }

    function test_burn_when_paused() public {
        // Pause the token
        vm.prank(tokenManager);
        token.pause();

        // Try to burn while paused
        vm.prank(multisig);
        vm.expectRevert("Pausable: paused");
        token.burn(TEST_AMOUNT);
    }

    function test_burn_effect_on_total_supply() public {
        uint256 initialSupply = token.totalSupply();
        uint256 burnAmount = TEST_AMOUNT;

        vm.prank(multisig);
        token.burn(burnAmount);

        assertEq(
            token.totalSupply(),
            initialSupply - burnAmount,
            "Total supply should decrease by the burned amount"
        );
    }

    function test_multiple_burns() public {
        uint256 initialBalance = token.balanceOf(multisig);
        uint256 initialSupply = token.totalSupply();
        uint256 firstBurnAmount = TEST_AMOUNT / 4;
        uint256 secondBurnAmount = TEST_AMOUNT / 2;

        vm.startPrank(multisig);

        token.burn(firstBurnAmount);
        assertEq(
            token.balanceOf(multisig),
            initialBalance - firstBurnAmount,
            "Balance should be reduced after first burn"
        );
        assertEq(
            token.totalSupply(),
            initialSupply - firstBurnAmount,
            "Total supply should be reduced after first burn"
        );

        token.burn(secondBurnAmount);
        assertEq(
            token.balanceOf(multisig),
            initialBalance - firstBurnAmount - secondBurnAmount,
            "Balance should be reduced after second burn"
        );
        assertEq(
            token.totalSupply(),
            initialSupply - firstBurnAmount - secondBurnAmount,
            "Total supply should be reduced after second burn"
        );

        vm.stopPrank();
    }

    function test_burnFrom_with_approval() public {
        address burner = makeAddr("burner");
        uint256 initialBalance = token.balanceOf(user);
        uint256 initialSupply = token.totalSupply();
        uint256 burnAmount = TEST_AMOUNT / 2;

        // Grant MULTISIG_ROLE to the burner
        vm.prank(rolesManager);
        token.grantRole(MULTISIG_ROLE, burner);

        // Approve burner to spend user's tokens
        vm.prank(user);
        token.approve(burner, burnAmount);

        // Burn tokens from user's account
        vm.prank(burner);
        token.burnFrom(user, burnAmount);

        assertEq(
            token.balanceOf(user),
            initialBalance - burnAmount,
            "User balance should be reduced after burnFrom"
        );
        assertEq(
            token.totalSupply(),
            initialSupply - burnAmount,
            "Total supply should be reduced after burnFrom"
        );
        assertEq(
            token.allowance(user, burner),
            0,
            "Allowance should be consumed after burnFrom"
        );
    }

    function test_burnFrom_without_approval() public {
        address burner = makeAddr("burner");
        uint256 burnAmount = TEST_AMOUNT / 2;

        // Grant MULTISIG_ROLE to the burner
        vm.prank(rolesManager);
        token.grantRole(MULTISIG_ROLE, burner);

        // Try to burn without approval
        vm.prank(burner);
        vm.expectRevert("ERC20: insufficient allowance");
        token.burnFrom(user, burnAmount);
    }

    function test_burnFrom_partial_approval() public {
        address burner = makeAddr("burner");
        uint256 initialBalance = token.balanceOf(user);
        uint256 approvalAmount = TEST_AMOUNT / 2;
        uint256 burnAmount = TEST_AMOUNT;

        // Grant MULTISIG_ROLE to the burner
        vm.prank(rolesManager);
        token.grantRole(MULTISIG_ROLE, burner);

        // Approve burner to spend user's tokens
        vm.prank(user);
        token.approve(burner, approvalAmount);

        // Try to burn more than approved
        vm.prank(burner);
        vm.expectRevert("ERC20: insufficient allowance");
        token.burnFrom(user, burnAmount);

        // Verify state remains unchanged
        assertEq(
            token.balanceOf(user),
            initialBalance,
            "User balance should remain unchanged after failed burnFrom"
        );
        assertEq(
            token.allowance(user, burner),
            approvalAmount,
            "Allowance should remain unchanged after failed burnFrom"
        );
    }

    function test_burnFrom_when_paused() public {
        address burner = makeAddr("burner");
        uint256 burnAmount = TEST_AMOUNT / 2;

        // Grant MULTISIG_ROLE to the burner
        vm.prank(rolesManager);
        token.grantRole(MULTISIG_ROLE, burner);

        // Approve burner to spend user's tokens
        vm.prank(user);
        token.approve(burner, burnAmount);

        // Pause the token
        vm.prank(tokenManager);
        token.pause();

        // Try to burn while paused
        vm.prank(burner);
        vm.expectRevert("Pausable: paused");
        token.burnFrom(user, burnAmount);
    }

    function test_pause_mechanism() public {
        address recipient = makeAddr("recipient");

        // Test pause by manager
        vm.prank(tokenManager);
        token.pause();
        assertTrue(token.paused());

        // Test transfer while paused
        vm.prank(user);
        vm.expectRevert("Pausable: paused");
        token.transfer(recipient, TEST_AMOUNT / 2);
        assertEq(
            token.balanceOf(user),
            TEST_AMOUNT,
            "Balance should remain unchanged while paused"
        );

        // Test unauthorized unpause
        vm.prank(tokenManager);
        vm.expectRevert(
            abi.encodePacked(
                "AccessControl: account ",
                Strings.toHexString(uint160(tokenManager), 20),
                " is missing role ",
                Strings.toHexString(uint256(MULTISIG_ROLE), 32)
            )
        );
        token.unpause();
        assertTrue(token.paused(), "Token should still be paused");

        // Test authorized unpause
        vm.prank(multisig);
        token.unpause();
        assertFalse(token.paused());

        // Test transfer after unpause
        uint256 transferAmount = TEST_AMOUNT / 2;
        vm.prank(user);
        token.transfer(recipient, transferAmount);
        assertEq(
            token.balanceOf(recipient),
            transferAmount,
            "Recipient should have received tokens"
        );
        assertEq(
            token.balanceOf(user),
            TEST_AMOUNT - transferAmount,
            "Sender balance should be reduced"
        );
    }

    function test_role_management() public {
        address newManager = address(0x456);

        // Test unauthorized manager addition
        vm.prank(user);
        vm.expectRevert(
            _getAccessControlRevertMessage(user, DEFAULT_ADMIN_ROLE)
        );
        token.grantRole(MANAGER_ROLE, newManager);

        // Test authorized manager addition
        vm.prank(rolesManager);
        token.grantRole(MANAGER_ROLE, newManager);
        assertTrue(token.hasRole(MANAGER_ROLE, newManager));

        // Test manager removal
        vm.prank(rolesManager);
        token.revokeRole(MANAGER_ROLE, newManager);
        assertFalse(token.hasRole(MANAGER_ROLE, newManager));
    }

    function test_double_initialization() public {
        vm.startPrank(tokenManager);
        address newPeg = makeAddr("newPeg");
        vm.expectRevert(Token.AlreadyInitialized.selector);
        token.init(newPeg);
        vm.stopPrank();
    }

    function test_initialization_zero_address() public {
        // Create new token without initialization
        token = new Token(rolesManager, tokenManager, multisig);

        vm.prank(tokenManager);
        vm.expectRevert(Token.InvalidAddress.selector);
        token.init(address(0));
    }

    function test_unauthorized_initialization() public {
        vm.prank(user);
        vm.expectRevert(_getAccessControlRevertMessage(user, MANAGER_ROLE));
        token.init(address(0x123));
    }

    function test_unauthorized_pause() public {
        vm.prank(user);
        vm.expectRevert(_getAccessControlRevertMessage(user, MANAGER_ROLE));
        token.pause();
    }

    function test_unauthorized_unpause() public {
        // Setup: pause first
        vm.prank(tokenManager);
        token.pause();

        vm.prank(user);
        vm.expectRevert(_getAccessControlRevertMessage(user, MULTISIG_ROLE));
        token.unpause();
    }

    function test_unpause_when_not_paused() public {
        // First pause
        vm.prank(tokenManager);
        token.pause();

        vm.prank(multisig);
        token.unpause(); // Should not revert
        assertFalse(token.paused());
    }

    function test_transfer_when_paused() public {
        // Setup: Transfer some tokens and pause
        vm.prank(multisig);
        token.transfer(user, TEST_AMOUNT);

        vm.prank(tokenManager);
        token.pause();

        // Try various transfer scenarios while paused
        vm.startPrank(user);
        address recipient = makeAddr("recipient");

        vm.expectRevert("Pausable: paused");
        token.transfer(recipient, TEST_AMOUNT / 2);

        // Approve should work even when paused
        token.approve(recipient, TEST_AMOUNT);

        // Setup allowance for transferFrom
        vm.stopPrank();
        vm.prank(recipient);
        vm.expectRevert("Pausable: paused");
        token.transferFrom(user, recipient, TEST_AMOUNT);
    }

    function test_decimals() public {
        assertEq(token.decimals(), DECIMALS, "Token should have 18 decimals");
    }

    function test_mint_functionality() public {
        // Should only mint up to cap
        uint256 remainingMint = token.cap() - token.totalSupply();
        address recipient = makeAddr("new_holder");

        vm.prank(multisig);
        token.mint(recipient, remainingMint);

        assertEq(token.balanceOf(recipient), remainingMint);
        assertEq(token.totalSupply(), token.cap());

        // Verify cap enforcement
        vm.prank(multisig);
        vm.expectRevert("ERC20Capped: cap exceeded");
        token.mint(recipient, 1);
    }

    function test_receive_ether_reverts() public {
        vm.deal(user, 1 ether);
        vm.prank(user);
        (bool success, ) = address(token).call{value: 1 ether}("");
        assertFalse(success, "Should not accept ETH");
    }

    function test_pause_unauthorized_unpause_attempt() public {
        // Try to unpause when not paused
        vm.prank(multisig);
        vm.expectRevert("Pausable: not paused");
        token.unpause();
    }

    function test_max_supply_enforcement() public {
        uint256 maxMint = token.cap() - token.totalSupply();

        vm.startPrank(multisig);
        token.mint(multisig, maxMint);

        vm.expectRevert("ERC20Capped: cap exceeded");
        token.mint(multisig, 1);
    }

    function test_transfer_zero_amount() public {
        address recipient = makeAddr("recipient");
        vm.prank(user);
        token.transfer(recipient, 0); // Should not revert
        assertEq(token.balanceOf(recipient), 0);
    }

    function test_direct_token_transfer_to_peg() public {
        address to = makeAddr("to");

        vm.prank(user);
        token.transfer(to, TEST_AMOUNT / 2); // Test valid transfer

        vm.prank(user);
        vm.expectRevert(Token.UseDepositInsteadOfTransfer.selector);
        token.transfer(address(peg), TEST_AMOUNT); // Test invalid transfer
    }
}
