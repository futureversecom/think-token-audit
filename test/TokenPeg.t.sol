// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../contracts/ERC20Peg.sol";
import "../contracts/Token.sol";
import "../contracts/Bridge.sol";
import {UserFactory} from "./utils/UserFactory.sol";
import "forge-std/Test.sol";

contract ERC20PegTest is Test {
    ERC20Peg peg;
    Token token;
    Bridge bridge;
    address[] users;
    address owner;
    address user;

    uint128 constant TEST_AMOUNT = 1000 ether;
    uint256 constant BRIDGE_FEE = 0.01 ether;

    event Deposit(
        address indexed _address,
        address indexed tokenAddress,
        uint128 indexed amount,
        address destination
    );
    event Withdraw(
        address indexed _address,
        address indexed tokenAddress,
        uint128 indexed amount
    );
    event DepositActiveStatus(bool indexed active);
    event WithdrawalActiveStatus(bool indexed active);
    event BridgeAddressUpdated(address indexed bridge);
    event PalletAddressUpdated(address indexed palletAddress);

    function setUp() public {
        users = new UserFactory().create(2);
        owner = users[0];
        user = users[1];

        // Deploy bridge with owner
        vm.prank(owner);
        bridge = new Bridge();

        // Set bridge active using owner
        vm.prank(owner);
        bridge.setActive(true);

        // Set the bridge's message fee
        vm.mockCall(
            address(bridge),
            abi.encodeWithSelector(IBridge.sendMessageFee.selector),
            abi.encode(BRIDGE_FEE)
        );

        // Deploy peg with owner
        vm.prank(owner);
        peg = new ERC20Peg(IBridge(address(bridge)));

        // Setup initial state
        vm.startPrank(owner);
        peg.setDepositsActive(true);
        peg.setWithdrawalsActive(true);
        vm.stopPrank();

        // Deploy token for testing
        token = new Token(owner, owner, owner);
        vm.prank(owner);
        token.init(address(peg));

        // Fund user with tokens
        vm.startPrank(address(peg));
        token.transfer(user, TEST_AMOUNT * 2);
        vm.stopPrank();
    }

    function test_initial_state() public {
        assertTrue(peg.depositsActive());
        assertTrue(peg.withdrawalsActive());
        assertEq(address(peg.bridge()), address(bridge));
        assertEq(peg.owner(), owner);
    }

    function test_deposit() public {
        address destination = makeAddr("destination");
        uint128 amount = TEST_AMOUNT;

        uint256 initialUserBalance = token.balanceOf(user);
        uint256 initialPegBalance = token.balanceOf(address(peg));

        vm.startPrank(user);
        token.approve(address(peg), amount);

        vm.expectEmit(true, true, true, true);
        emit Deposit(user, address(token), amount, destination);

        peg.deposit{value: BRIDGE_FEE}(address(token), amount, destination);
        vm.stopPrank();

        assertEq(token.balanceOf(user), initialUserBalance - amount);
        assertEq(token.balanceOf(address(peg)), initialPegBalance + amount);
    }

    function test_deposit_when_paused() public {
        vm.prank(owner);
        peg.setDepositsActive(false);

        vm.startPrank(user);
        token.approve(address(peg), TEST_AMOUNT);

        vm.expectRevert("ERC20Peg: deposits paused");
        peg.deposit{value: BRIDGE_FEE}(
            address(token),
            TEST_AMOUNT,
            makeAddr("destination")
        );
        vm.stopPrank();
    }

    function test_unauthorized_admin_functions() public {
        vm.startPrank(user);

        vm.expectRevert("Ownable: caller is not the owner");
        peg.setDepositsActive(false);

        vm.expectRevert("Ownable: caller is not the owner");
        peg.setWithdrawalsActive(false);

        vm.expectRevert("Ownable: caller is not the owner");
        peg.setBridgeAddress(IBridge(address(0)));

        vm.expectRevert("Ownable: caller is not the owner");
        peg.setPalletAddress(address(0));

        vm.stopPrank();
    }

    // Add other tests...
}
