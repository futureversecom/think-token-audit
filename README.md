# Token and TokenPeg Contracts

## Overview

This repository contains smart contracts for a token system with bridging capabilities between Ethereum and The Root Network.

## Key Components

- `Token.sol`: ERC20 token with access control and pausable features
- `ERC20Peg.sol`: Bridge contract for cross-chain token operations
- `Bridge.sol`: Core bridge contract for cross-chain messaging
- `Roles.sol` - Role definitions for access control

### Token Contract

Uses OpenZeppelin's AccessControl with roles:

- `DEFAULT_ADMIN_ROLE`: Can grant/revoke roles
- `MANAGER_ROLE`: Can initialize token and pause
- `MULTISIG_ROLE`: Can mint/burn tokens and unpause

### ERC20Peg Contract

Uses OpenZeppelin's Ownable pattern:

- Owner can:
  - Set deposits active/inactive
  - Set withdrawals active/inactive
  - Update bridge address
  - Set pallet address
  - Perform emergency withdrawals

## Features

- ERC20 token with 18 decimals
- Total supply capped at 1B tokens
- Cross-chain token bridging
- Pausable transfers
- Secure deposit/withdrawal mechanisms
- Bridge integration for cross-chain operations

## Development

### Prerequisites

- Node.js 16+
- Foundry
- Git

### Setup

```bash
git clone <repository-url>
cd <repository-name>
forge install
npm install
cp .env.example .env
```

### Testing

```bash
# Run all tests
forge test

# Run with gas reporting
forge test --gas-report
```

## Deployment

### Environment Setup

1. Copy `.env.example` to `.env`
2. Fill in required variables:
   - RPC URLs
   - Private keys
   - Contract addresses

### Deploy

```bash
# Using Foundry
forge script scripts/Deploy.s.sol:Mainnet --rpc-url $MAIN_RPC_URL --broadcast

# Testnet deployment
forge script scripts/Deploy.s.sol:Testnet --rpc-url $TEST_RPC_URL --broadcast
```

#### Using Hardhat

```bash
# Deploy to mainnet
npx hardhat run scripts/deploy.ts --network mainnet

# Deploy to testnet
npx hardhat run scripts/deploy.ts --network testnet
```

### Contract Verification

After deployment, verify contracts on Etherscan:

```bash
# Verify Token contract
npx hardhat verify --network <network> <token-address> \
  "<roles-manager>" \
  "<token-contract-manager>" \
  "<token-recovery-manager>" \
  "<multisig>"

# Verify TokenPeg contract
npx hardhat verify --network <network> <peg-address> \
  "<bridge>" \
  "<token-address>" \
  "<roles-manager>" \
  "<peg-manager>"
```

## Security Considerations

- Owner privileges in ERC20Peg should be managed via multisig
- Private keys must never be committed to version control
- Regular security audits recommended
- Test coverage should be maintained at 100%

## Deployments

### Sepolia

```
ERC20Peg is at: 0x881339EeFd1DC8D60CEFBfE93294D0eeC24Fb8Cc
Token deployed to: 0x6e0b07E7A1B550D83E2f11C98Cf1E15fe2b8d47B
  The Roles manager is: 0x7D2713d17C88d08daa7fE5f437B4205deA977ade
  The manager of the Token is: 0x1Fb0E85b7Ba55F0384d0E06D81DF915aeb3baca3
  The multisig of the Token is: 0xd0eEdbe42BFB9d3082e4AB16F2925962233e2C36
```
