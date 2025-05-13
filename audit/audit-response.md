# Think Token - Audit Response

## Executive Summary

This document addresses the security findings from Red4Sec's audit report dated March 27, 2025. We've categorized each finding by severity, provided our response, and indicated the current status.

## Response Categories

- ✅ **Fixed**: Issue has been fully resolved
- 🔄 **Improved**: Partially addressed with mitigations
- 📝 **Acknowledged**: Recognized but deferred to future updates
- ⚠️ **Won't Fix**: Issue analyzed but determined not to require changes

## Findings and Responses

### FTT-01: Lack of Input Validation | LOW RISK

**Finding:** The `deposit` method in `ERC20Peg.sol` lacks validation for `_destination` and `_amount` parameters (no checks for zero addresses or zero amounts).

**Response:** 📝 **Acknowledged, but deferring**

- This issue affects `ERC20Peg.sol`, which has been in production with minimal risk
- Due to resource constraints, we've scheduled a comprehensive redesign rather than implementing partial fixes
- The redesign will address this along with other architectural improvements

### FTT-02: Governance Risks | LOW RISK

**Finding:** Token.sol and ERC20Peg.sol have architectural patterns that could impact security:

- Unrestricted Token Acceptance Risk
- Centralized Owner Risk

**Response:** 🔄 **Improved**

- We've mitigated the token acceptance risk by only supporting explicitly whitelisted tokens
- To address the centralized control concern, we've implemented the following changes:
  - Modified the `setPeg()` function's access control from `onlyRole(MANAGER_ROLE)` to `onlyRole(MULTISIG_ROLE)`
  - Added a `PegChanged()` event for transparency and monitoring

### FTT-03: Design Weaknesses | INFORMATIVE

**Finding:** `ERC20Peg.sol` uses OpenZeppelin's Ownable pattern with direct transfer mechanism, risking permanent control loss if the new owner address is specified incorrectly.

**Response:** 📝 **Acknowledged, but deferring**

- This will be addressed in the planned redesign of `ERC20Peg.sol`
- We intend to switch from the Ownable pattern to OpenZeppelin's AccessControl pattern
- This change will completely eliminate the centralized ownership risk

### FTT-04: Auditing and Logging | INFORMATIVE

**Finding:** Error handling could be optimized using newer Solidity features for more efficient error reporting and lower gas consumption.

**Response:** 🔄 **Partially fixed**

- `Token.sol` has been updated to use custom errors
- Full implementation of newer error handling is constrained by Root Network's current Solidity version support
- Remaining improvements will be part of the future `ERC20Peg.sol` redesign

### FTT-05: Outdated Software | INFORMATIVE

**Finding:** `ERC20Peg.sol` uses an outdated compiler version (0.8.17) with known issues that have been fixed in newer versions.

**Response:** 📝 **Acknowledged, but deferring**

- This will be addressed in the planned comprehensive redesign of `ERC20Peg.sol`

### FTT-06: Codebase Quality | INFORMATIVE

**Finding:** Unnecessary use of the `indexed` keyword for the `Endowed` event's `amount` parameter (uint256) is gas inefficient and provides limited filtering benefit.

**Response:** 📝 **Acknowledged, but deferring**

- This optimization will be included in the future `ERC20Peg.sol` redesign

### FTT-07: Project Information Leak | MEDIUM RISK

**Finding:** The `.env.example` file contains sensitive information (Etherscan API key and a test wallet private keys) committed to the GitHub repository.

**Response:** ✅ **Fixed**

- All sensitive information has been removed from the repository
- While we don't currently plan to make the repository public, we've addressed this as a precautionary measure

### FTT-08: Access Controls | LOW RISK

**Finding:** By inheriting directly from OpenZeppelin's `ERC20Burnable`, the implementation allows any user to burn their own tokens without restrictions.

**Response:** ✅ **Fixed**

- Although the unrestricted burning was initially intentional, we've reverted to `onlyRole(MULTISIG_ROLE)` restriction
- This change was made due to time constraints in implementing TRN's tracking mechanics

### FTT-09: Direct Token Transfers | LOW RISK

**Finding:** User accounts (EOAs) receive the `UseDepositInsteadOfTransfer` error when sending tokens directly to the PEG contract, but contracts can transfer tokens without restrictions.

**Response:** ✅ **Fixed**

- We've implemented prevention mechanisms to block all direct transfers to the PEG contract

### FTT-10: Event Emission | INFORMATIVE

**Finding:** The `setPeg` function should emit events for monitoring blockchain activity.

**Response:** ✅ **Fixed**

- Added appropriate event emission for enhanced transparency

### FTT-11: Codebase Quality | INFORMATIVE

**Finding:** Unused import of `SafeERC20` increases contract bytecode size and deployment gas costs. Also noted inconsistent validation patterns between constructor and initialization methods.

**Response:** ✅ **Fixed**

- Removed the unused `SafeERC20` import
- Added consistent zero-address checks across all initialization paths

## Next Steps

1. **Short-term** (Q2 2025):

   - [x]Deploy the token contract on Sepolia [THINK](https://sepolia.etherscan.io/address/0x6e0b07E7A1B550D83E2f11C98Cf1E15fe2b8d47B#code)
   - [ ]Deploy the token contract on Ethereum []()

2. **Medium-term** (Q3 2025):

   - Begin development of the redesigned `ERC20Peg.sol` contract
   - Implement comprehensive test coverage for the new design
   - Commission follow-up security audit
