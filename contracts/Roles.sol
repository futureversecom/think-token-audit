// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

bytes32 constant DEFAULT_ADMIN_ROLE = 0x00; // OpenZeppelin's DEFAULT_ADMIN_ROLE is 0x00
bytes32 constant TOKEN_ROLE = keccak256("TOKEN_ROLE");
bytes32 constant TOKEN_RECOVERY_ROLE = keccak256("TOKEN_RECOVERY_ROLE");
bytes32 constant PEG_MANAGER_ROLE = keccak256("PEG_MANAGER_ROLE");
bytes32 constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
bytes32 constant MULTISIG_ROLE = keccak256("MULTISIG_ROLE");
