# Think Token audit

## Scope

- contracts/Token.sol
- contracts/ERC20Peg.sol

## To help understand

- contracts/Bridge.sol
- contracts/IBridge.sol

There are some tests to help to understand the process flow:

- test/\*

## Audit report response

FTT-01 Lacks of input validation.
First, we are discussing ERC20Peg.sol, which we have been using for some time. To save time, we decided not to customize it for now. However, it would be better to redevelop it from scratch to achieve the following goals: - Improve code quality, including suggested validations - Enhance security and reduce errors when working with specific tokens - Optimize gas usage - Potentially add more features, such as batch deposits and withdrawals

- [ ] Acknowledged

FTT-02 Governance.
The first issue they mention has the same resolution as described above. We can work with only the tokens we chose to support.

Then, they claimed that the setPeg() function has an administrative control vulnerability. This is incorrect, as the setPeg() function is designed solely to prevent token transfers to the peg contract and will be utilized in the future ERC20Peg.sol upgrade. It is protected by the onlyRole(MANAGER_ROLE) modifier. In the worst-case scenario, a malicious manager could exploit this function to allow inattentive users to lock their tokens in the contract.

- [ ] Acknowledged

FTT-03 Design weaknesses.
Again, they refer to the ERC20Peg.sol, which we are not going to change for now.
After redesigning the contract we can go even further and switch to OZ's AccessControl for better security.
Still, it's important to keep the mentioned possibility in mind and not to transfer the ownership of the token
without double checking the new owner address. It's better to refrain from transferring the ownership at all.

- [ ] Acknowledged

FTT-04 Auditing and Logging
Great suggestion. It is better to use custom errors and stay in 32 bytes for the error messages.
The only reason we didn't have it in the Token.sol is to keep it consistent with the ERC20Peg.sol and previous audit.

- [x] Fixed in Token.sol

FTT-05 Outdated Software.
ERC20Peg.sol is using the old version of the Solidity compiler.
We'll update the version when upgrading the contract.

- [ ] Acknowledged

FTT-06 Codebase Quality
The same as above for ERC20Peg.sol.
They also mentioned that the Token.sol has an unused fees variable, which was already removed
after the contract was submitted for audit.

- [x] Fixed in Token.sol
