import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {BigNumber, utils} from "ethers";

describe('Erc20Peg', () => {
  async function setup() {
    const [owner, user] = await ethers.getSigners();

    // deploy bridge contract (required by EERC20Peg)
    const BridgeFactory = await ethers.getContractFactory('Bridge');
    const bridge = await BridgeFactory.connect(owner).deploy();
    await bridge.deployed();
    await bridge.setActive(true); // activate bridge

    // deploy erc20Peg contract
    const ERC20PegFactory = await ethers.getContractFactory('ERC20Peg');
    const erc20Peg = await ERC20PegFactory.connect(owner).deploy(bridge.address);
    await erc20Peg.deployed();

    // deploy mock erc20 token
    const MockERC20Factory = await ethers.getContractFactory('MockERC20');
    const mockERC20 = await MockERC20Factory.connect(owner).deploy('Test Token', 'TEST', 1_000_000); // mint 1m tokens to owner
    await mockERC20.deployed();

    return { owner, user, bridge, erc20Peg, mockERC20 };
  }

  /**
   * Sets up the deployed bridge contract so that it successfully calls the `ERC20Peg` `onMessageReceived` function
   * - sets up the validators
   * - signs a message in non-eip712 compliant format (to be ecrecovered in contract)
   * - always successfully verifies message and signatures - before calling `onMessageReceived`
   */
  async function bridgeCall({
    owner,
    bridge,
    erc20Peg,
    appMessage,
    palletAddress,
  }: { owner: any; bridge: any; erc20Peg: any; appMessage: any; palletAddress: any; }) {
    // SETUP: bridge contract validators
    const validatorPrivateKey = '0xcb6df9de1efca7a3998a8ead4e02159d5fa99c3e0d4fd6432667390bb4726854'; // alice private key
    const validatorSigner = new ethers.Wallet(validatorPrivateKey); // address: 0xE04CC55ebEE1cBCE552f250e85c57B70B2E2625b
    const validatorSetId = 0;
    const eventId = 1;
    const verificationFee = await bridge.bridgeFee();

    await bridge.setActive(true);
    await bridge.forceActiveValidatorSet(
        [validatorSigner.address], // 'Alice' default root ECDSA public key converted to Eth address
        validatorSetId,
    );

    const { ethTokenAddress, depositAmount, recipient } =
      ethers.utils.defaultAbiCoder.decode(['address', 'uint256', 'address'], appMessage);
    // Bridge message required for verification - abi encoded
    const bridgeMessage = ethers.utils.defaultAbiCoder.encode(
      ['address', 'address', 'bytes', 'uint32', 'uint256'],
      [palletAddress, erc20Peg.address, appMessage, validatorSetId, eventId],
    );
    const bridgeMessageHash = ethers.utils.keccak256(bridgeMessage); // keccak256 hash of bridge message
    const bridgeMessageBytes = ethers.utils.arrayify(bridgeMessageHash); // convert to bytes

    // sign raw message - without EIP-712 prefix
    const flatSignature = validatorSigner._signingKey().signDigest(bridgeMessageBytes);

    const expandedSignature = ethers.utils.splitSignature(flatSignature);
    const withdrawProof = {
      eventId,
      validatorSetId,
      v: [expandedSignature.v],
      r: [expandedSignature.r],
      s: [expandedSignature.s],
      validators: [validatorSigner.address],
    };

    // TEST
    expect(recipient).not.equals(owner.address);

    // checks eip-712 compliant message (not applicable since we are using raw message)
    // expect(ethers.utils.verifyMessage(bridgeMessageBytes, flatSignature)).to.equal(validatorSigner.address);

    const estimatedGas = await bridge.estimateGas.receiveMessage(
      palletAddress,
      erc20Peg.address,
      appMessage,
      withdrawProof,
      { gasLimit: 500_000, value: verificationFee },
    );

    expect(
      await bridge.connect(owner).receiveMessage(palletAddress, erc20Peg.address, appMessage, withdrawProof,
      { gasLimit: estimatedGas, value: verificationFee },
    )).to
      .emit(erc20Peg, 'Withdrawal') // TODO - bug here - always passes (maybe due to cross-contract interaction)
      .withArgs(recipient, ethTokenAddress, depositAmount);
  }

  // ======================================================================================================= //
  // ============================================= OWNER TESTS ============================================= //
  // ======================================================================================================= //

  it('deposits/withdrawals disabled on init', async () => {
    const { erc20Peg } = await loadFixture(setup);

    expect(await erc20Peg.depositsActive()).to.be.false;
    expect(await erc20Peg.withdrawalsActive()).to.be.false;
  });

  it('only owner can update deposits/withdrawals', async () => {
    const { owner, user, erc20Peg } = await loadFixture(setup);

    await expect(erc20Peg.connect(user).setDepositsActive(true)).to.be.revertedWith('Ownable: caller is not the owner');
    await expect(erc20Peg.connect(user).setWithdrawalsActive(true)).to.be.revertedWith('Ownable: caller is not the owner');

    await expect(erc20Peg.connect(owner).setDepositsActive(true))
      .to.emit(erc20Peg, 'DepositActiveStatus').withArgs(true);
    expect(await erc20Peg.depositsActive()).to.be.true;

    await expect(erc20Peg.connect(owner).setWithdrawalsActive(true))
      .to.emit(erc20Peg, 'WithdrawalActiveStatus').withArgs(true);
    expect(await erc20Peg.withdrawalsActive()).to.be.true;
  });

  it('only owner can set bridge address', async () => {
    const { owner, user, bridge, erc20Peg } = await loadFixture(setup);

    await expect(erc20Peg.connect(user).setBridgeAddress(bridge.address)).to.be.revertedWith('Ownable: caller is not the owner');
    await expect(erc20Peg.connect(owner).setBridgeAddress(bridge.address))
      .to.emit(erc20Peg, 'BridgeAddressUpdated').withArgs(bridge.address);
    expect(await erc20Peg.bridge()).to.equal(bridge.address);
  });

  it('only owner can set pallet address', async () => {
    const { owner, user, erc20Peg } = await loadFixture(setup);

    await expect(erc20Peg.connect(user).setPalletAddress(user.address)).to.be.revertedWith('Ownable: caller is not the owner');
    await expect(erc20Peg.connect(owner).setPalletAddress(user.address))
      .to.emit(erc20Peg, 'PalletAddressUpdated').withArgs(user.address);
    expect(await erc20Peg.palletAddress()).to.equal(user.address);
  });

  it('only owner can endow bridge contract', async () => {
    const { owner, user, erc20Peg } = await loadFixture(setup);

    const endowment = 123_456_789;

    await expect(erc20Peg.connect(user).endow({ value: endowment })).to.be.revertedWith('Ownable: caller is not the owner');

    await expect(erc20Peg.connect(owner).endow({ value: endowment })).to.emit(erc20Peg, 'Endowed').withArgs(endowment);
    expect(await erc20Peg.provider.getBalance(erc20Peg.address)).to.equal(endowment);
  });

  it('adminEmergencyWithdraw - erc20 token', async () => {
    const { owner, erc20Peg, mockERC20, bridge } = await loadFixture(setup);

    const depositAmount = ethers.BigNumber.from(2).pow(128).sub(1);
    const destinationAddress = '0x1234567890123456789012345678901234567890';

    await erc20Peg.connect(owner).setDepositsActive(true); // activate peg contract
    await erc20Peg.connect(owner).setWithdrawalsActive(true); // activate peg contract
    await mockERC20.connect(owner).mint(owner.address, depositAmount); // mint user some tokens
    await mockERC20.connect(owner).approve(erc20Peg.address, depositAmount); // approve user tokens to be transferred by peg contract

    const bridgeMsgFee = await bridge.sendMessageFee();
    // deposit user tokens to peg contract
    await expect(
      erc20Peg.connect(owner).deposit(mockERC20.address, depositAmount, destinationAddress, { value: bridgeMsgFee })
    ).to
      .emit(erc20Peg, 'Deposit')
      .withArgs(owner.address, mockERC20.address, depositAmount, destinationAddress);

    // Check peg contract has user depositted funds
    expect(await mockERC20.balanceOf(erc20Peg.address)).to.equal(depositAmount);

    // emergency withdraw tokens
    await expect(
      erc20Peg.connect(owner).adminEmergencyWithdraw(mockERC20.address, depositAmount, owner.address)
    ).to
      .emit(erc20Peg, 'AdminWithdraw')
      .withArgs(owner.address, mockERC20.address, depositAmount);

    // Check peg contract has no user depositted funds
    expect(await mockERC20.balanceOf(erc20Peg.address)).to.equal(0);
  });

  it('adminEmergencyWithdraw - ether', async () => {
    const { owner, erc20Peg, mockERC20, bridge } = await loadFixture(setup);

    const depositAmount = 12345;
    const ethTokenAddress = '0x0000000000000000000000000000000000000000';
    const destinationAddress = '0x1234567890123456789012345678901234567890';
    const bridgeMsgFee = await bridge.sendMessageFee();

    await erc20Peg.connect(owner).setDepositsActive(true); // activate peg contract
    await erc20Peg.connect(owner).setWithdrawalsActive(true); // activate peg contract
    await mockERC20.connect(owner).mint(owner.address, depositAmount); // mint user some tokens
    await mockERC20.connect(owner).approve(erc20Peg.address, depositAmount); // approve user tokens to be transferred by peg contract

    // deposit ether to peg contract
    await expect(
      erc20Peg.connect(owner).deposit(ethTokenAddress, depositAmount, destinationAddress, { value: depositAmount + bridgeMsgFee.toNumber() })
    ).to
      .emit(erc20Peg, 'Deposit')
      .withArgs(owner.address, ethTokenAddress, depositAmount, destinationAddress);

    // check peg contract has ether
    expect(await erc20Peg.provider.getBalance(erc20Peg.address)).to.equal(depositAmount);

    // emergency withdraw ether
    await expect(
      erc20Peg.connect(owner).adminEmergencyWithdraw(ethTokenAddress, depositAmount, owner.address)
    ).to
      .emit(erc20Peg, 'AdminWithdraw')
      .withArgs(owner.address, ethTokenAddress, depositAmount);

    // Check peg contract has no ether
    expect(await erc20Peg.provider.getBalance(erc20Peg.address)).to.equal(0);
  });

  // ==================================================================================================== //
  // ============================================= PUBLIC TESTS ========================================= //
  // ==================================================================================================== //

  it('deposit, peg inactive', async () => {
    const { erc20Peg, mockERC20 } = await loadFixture(setup);

    await expect(
      erc20Peg.deposit(mockERC20.address, 7, '0x1234567890123456789012345678901234567890')
    ).to.be.revertedWith('ERC20Peg: deposits paused');
  });

  it('erc20 deposit - no approval', async () => {
    const { owner, erc20Peg, mockERC20, bridge } = await loadFixture(setup);

    // activate peg contract
    await erc20Peg.connect(owner).setDepositsActive(true);

    const bridgeMsgFee = await bridge.sendMessageFee();

    await expect(
      erc20Peg.deposit(mockERC20.address, 7, '0x1234567890123456789012345678901234567890', { value: bridgeMsgFee })
    ).to.be.revertedWith('ERC20: insufficient allowance');
  });

  it('erc20 deposit', async () => {
    const { owner, user, erc20Peg, bridge, mockERC20 } = await loadFixture(setup);

    const depositAmount = ethers.BigNumber.from(2).pow(128).sub(1);
    const destinationAddress = '0x1234567890123456789012345678901234567890';

    // activate peg contract
    await erc20Peg.connect(owner).setDepositsActive(true);

    const bridgeMsgFee = await bridge.sendMessageFee();

    // mint user some tokens
    await mockERC20.connect(owner).mint(user.address, depositAmount);

    // approve user tokens to be transferred by peg contract
    await mockERC20.connect(user).approve(erc20Peg.address, depositAmount);
    const userBalanceStart = await mockERC20.balanceOf(user.address);

    // deposit user tokens to peg contract
    await expect(
      erc20Peg.connect(user).deposit(mockERC20.address, depositAmount, destinationAddress, { value: bridgeMsgFee })
    ).to
      .emit(erc20Peg, 'Deposit')
      .withArgs(user.address, mockERC20.address, depositAmount, destinationAddress);

    // Check peg contract has user depositted funds
    expect(await mockERC20.balanceOf(erc20Peg.address)).to.equal(depositAmount);

    // Check user has less tokens
    const userBalanceEnd = await mockERC20.balanceOf(user.address);
    expect(userBalanceEnd).to.equal(userBalanceStart.sub(depositAmount));

    // Check fee address has recieved fee
    expect(await ethers.provider.getBalance(bridge.address)).to.equal(bridgeMsgFee);
  });

  it('erc20 deposit - fails if insufficient bridge fee provided', async () => {
    const { owner, erc20Peg, bridge, mockERC20 } = await loadFixture(setup);

    const depositAmount = 7;
    const destinationAddress = '0x1234567890123456789012345678901234567890';

    // activate peg contract
    await erc20Peg.connect(owner).setDepositsActive(true);
    await mockERC20.connect(owner).approve(erc20Peg.address, depositAmount);
    await bridge.setSendMessageFee(utils.parseEther('0.1'));

    // deposit user tokens to peg contract
    await expect(
      erc20Peg.deposit(mockERC20.address, depositAmount, destinationAddress, { value: utils.parseEther('0.01') })
    ).to.be.revertedWith('ERC20Peg: incorrect token address (requires deposit fee)');
  });

  it('native eth deposit', async () => {
    const { owner, user, bridge, erc20Peg } = await loadFixture(setup);

    const depositAmount = 12345;
    const ethTokenAddress = '0x0000000000000000000000000000000000000000';
    const destinationAddress = '0x1234567890123456789012345678901234567890';

    // activate peg contract
    await erc20Peg.connect(owner).setDepositsActive(true);

    const bridgeMsgFee = await bridge.sendMessageFee();

    // ensure ETH_RESERVED_TOKEN_ADDRESS is `0` address
    expect(await erc20Peg.ETH_RESERVED_TOKEN_ADDRESS()).to.equal(ethTokenAddress);

    const userEthStart = await erc20Peg.provider.getBalance(user.address);

    // deposit ether to peg contract
    await expect(
      erc20Peg.connect(user).deposit(ethTokenAddress, depositAmount, destinationAddress, { value: depositAmount + bridgeMsgFee.toNumber() })
    ).to
      .emit(erc20Peg, 'Deposit')
      .withArgs(user.address, ethTokenAddress, depositAmount, destinationAddress);

    // check peg contract has eth
    const pegEthBalance = await erc20Peg.provider.getBalance(erc20Peg.address);
    expect(pegEthBalance).to.equal(depositAmount);

    // check user has less eth -> final balance is start - deposit amount - gas fees
    const userEthEnd = await erc20Peg.provider.getBalance(user.address);
    expect(userEthEnd.lt(userEthStart.sub(depositAmount)));

    // check fee address has recieved fee
    expect(await ethers.provider.getBalance(bridge.address)).to.equal(bridgeMsgFee);
  });

  it('native eth deposit - bridge recives fee', async () => {
    const { owner, user, bridge, erc20Peg } = await loadFixture(setup);

    const depositAmount = BigNumber.from(12345);
    const ethTokenAddress = '0x0000000000000000000000000000000000000000';
    const destinationAddress = '0x1234567890123456789012345678901234567890';

    // activate peg contract
    await erc20Peg.connect(owner).setDepositsActive(true);

    // setup bridge to retrieve fees
    await bridge.setActive(true);
    const sendMessageFee = utils.parseEther('0.1');
    await bridge.setSendMessageFee(sendMessageFee);

    // ensure ETH_RESERVED_TOKEN_ADDRESS is `0` address
    expect(await erc20Peg.ETH_RESERVED_TOKEN_ADDRESS()).to.equal(ethTokenAddress);

    const userEthStart = await erc20Peg.provider.getBalance(user.address);

    // deposit ether to peg contract
    await expect(
      erc20Peg.connect(user).deposit(ethTokenAddress, depositAmount, destinationAddress, { value: depositAmount.add(sendMessageFee) })
    ).to
      .emit(erc20Peg, 'Deposit')
      .withArgs(user.address, ethTokenAddress, depositAmount, destinationAddress);

    // check peg contract has depositted eth
    const pegEthBalance = await erc20Peg.provider.getBalance(erc20Peg.address);
    expect(pegEthBalance).to.equal(depositAmount);

    // check user has less eth -> final balance is start - deposit amount - gas fees
    const userEthEnd = await erc20Peg.provider.getBalance(user.address);
    expect(userEthEnd.lt(userEthStart.sub(depositAmount)));

    // check bridge has recieved fee
    expect(await ethers.provider.getBalance(bridge.address)).to.equal(sendMessageFee);

    // ensure bridge accumulated fees updated
    expect(await bridge.accumulatedMessageFees()).to.equal(sendMessageFee);
  });

  it('native eth deposit - missing bridge fee', async () => {
    const { owner, bridge, erc20Peg } = await loadFixture(setup);

    const depositAmount = 12345;
    const ethTokenAddress = '0x0000000000000000000000000000000000000000';
    const destinationAddress = '0x1234567890123456789012345678901234567890';

    // activate peg contract
    await erc20Peg.connect(owner).setDepositsActive(true);
    await bridge.setActive(true);
    const sendMessageFee = utils.parseEther('0.1');
    await bridge.setSendMessageFee(sendMessageFee);

    // deposit ether to peg contract
    await expect(
      erc20Peg.deposit(ethTokenAddress, depositAmount, destinationAddress, { value: depositAmount })
    ).to.be.revertedWith('ERC20Peg: incorrect deposit amount (requires deposit fee)');
  });

  it('onMessageReceived, incorrect sender', async () => {
    const { erc20Peg } = await loadFixture(setup);

    const msg = ethers.utils.defaultAbiCoder.encode(['uint8'], [1]);
    const msgBytes = ethers.utils.arrayify(ethers.utils.keccak256(msg)); // convert to bytes

    await expect(
      erc20Peg.onMessageReceived('0x1234567890123456789012345678901234567890', msgBytes)
    ).to.be.revertedWith('ERC20Peg: only bridge can call');
  });

  it('onMessageReceived, incorrect pallet address', async () => {
    const { owner, bridge, erc20Peg } = await loadFixture(setup);

    // SETUP: Eth liquidity
    const depositAmount = 5644;
    const destinationAddress = '0x1234567890123456789012345678901234567890';
    const palletAddress = '0x0987654321098765432109876543210987654321';
    const recipient = '0xa86e122EdbDcBA4bF24a2Abf89F5C230b37DF49d'; // hardcoded recipient address with 0 ether balance

    // activate peg contract
    await erc20Peg.connect(owner).setDepositsActive(true);
    await erc20Peg.connect(owner).setWithdrawalsActive(true);
    // await erc20Peg.connect(owner).setPalletAddress(palletAddress);

    const bridgeMsgFee = await bridge.sendMessageFee();

    // deposit ether to peg contract (for withdrawal)
    const ethTokenAddress = await erc20Peg.ETH_RESERVED_TOKEN_ADDRESS();
    await erc20Peg.connect(owner).deposit(ethTokenAddress, depositAmount, destinationAddress, { value: depositAmount + bridgeMsgFee.toNumber() });

    // Message passed onto erc20 peg
    const appMessage = ethers.utils.defaultAbiCoder.encode(
      ['address', 'uint256', 'address'], [ethTokenAddress, depositAmount, recipient]
    );

    // perform bridge call (always succeeds) - which calls onMessageReceived
    await expect(
      bridgeCall({
      owner,
      bridge,
      erc20Peg,
      appMessage,
      palletAddress,
    })).to.be.revertedWith('ERC20Peg: source must be peg pallet address');
  });

  it('native eth withdraw, inactive withdrawals', async () => {
    const { owner, bridge, erc20Peg } = await loadFixture(setup);

    // SETUP: Eth liquidity
    const depositAmount = 5644;
    const destinationAddress = '0x1234567890123456789012345678901234567890';
    const palletAddress = '0x0987654321098765432109876543210987654321';
    const recipient = '0xa86e122EdbDcBA4bF24a2Abf89F5C230b37DF49d'; // hardcoded recipient address with 0 ether balance

    // activate peg contract
    await erc20Peg.connect(owner).setDepositsActive(true);
    await erc20Peg.connect(owner).setPalletAddress(palletAddress);
    // await erc20Peg.connect(owner).setWithdrawalsActive(true);

    const bridgeMsgFee = await bridge.sendMessageFee();

    // deposit ether to peg contract (for withdrawal)
    const ethTokenAddress = await erc20Peg.ETH_RESERVED_TOKEN_ADDRESS();
    await erc20Peg.connect(owner).deposit(ethTokenAddress, depositAmount, destinationAddress, { value: depositAmount + bridgeMsgFee.toNumber() });

    // Message passed onto erc20 peg
    const appMessage = ethers.utils.defaultAbiCoder.encode(
      ['address', 'uint256', 'address'], [ethTokenAddress, depositAmount, recipient]
    );

    // perform bridge call (always succeeds) - which calls onMessageReceived
    await expect(
      bridgeCall({
      owner,
      bridge,
      erc20Peg,
      appMessage,
      palletAddress,
    })).to.be.revertedWith('ERC20Peg: withdrawals paused');
  });

  it('native eth withdraw, different sender', async () => {
    const { owner, bridge, erc20Peg } = await loadFixture(setup);

    // SETUP: Eth liquidity
    const depositAmount = 5644;
    const destinationAddress = '0x1234567890123456789012345678901234567890';
    const palletAddress = '0x0987654321098765432109876543210987654321';
    const recipient = '0xa86e122EdbDcBA4bF24a2Abf89F5C230b37DF49d'; // hardcoded recipient address with 0 ether balance

    // activate peg contract
    await erc20Peg.connect(owner).setDepositsActive(true);
    await erc20Peg.connect(owner).setWithdrawalsActive(true);
    await erc20Peg.connect(owner).setPalletAddress(palletAddress);

    const bridgeMsgFee = await bridge.sendMessageFee();

    // deposit ether to peg contract (for withdrawal)
    const ethTokenAddress = await erc20Peg.ETH_RESERVED_TOKEN_ADDRESS();
    await erc20Peg.connect(owner).deposit(ethTokenAddress, depositAmount, destinationAddress, { value: depositAmount + bridgeMsgFee.toNumber() });

    // Message passed onto erc20 peg
    const appMessage = ethers.utils.defaultAbiCoder.encode(
      ['address', 'uint256', 'address'], [ethTokenAddress, depositAmount, recipient]
    );

    // TEST
    // perform bridge call (always succeeds) - which will call onMessageReceived -> withdraw
    await bridgeCall({
      owner,
      bridge,
      erc20Peg,
      appMessage,
      palletAddress,
    });

    // recipient should recieve depositted amount
    expect(await erc20Peg.provider.getBalance(recipient)).to.equal(depositAmount);
  });

  it('token withdraw, different sender', async () => {
    const { owner, bridge, erc20Peg, mockERC20 } = await loadFixture(setup);

    // SETUP: Eth liquidity
    const depositAmount = 5644;
    const destinationAddress = '0x1234567890123456789012345678901234567890';
    const palletAddress = '0x0987654321098765432109876543210987654321';
    const recipient = '0xa86e122EdbDcBA4bF24a2Abf89F5C230b37DF49d'; // hardcoded recipient address with 0 ether balance

    // activate peg contract
    await erc20Peg.connect(owner).setDepositsActive(true);
    await erc20Peg.connect(owner).setWithdrawalsActive(true);
    await erc20Peg.connect(owner).setPalletAddress(palletAddress);

    const bridgeMsgFee = await bridge.sendMessageFee();

    // deposit some erc20 tokens to peg contract (for withdrawal)
    await mockERC20.connect(owner).mint(owner.address, depositAmount); // mint owner some tokens
    await mockERC20.connect(owner).approve(erc20Peg.address, depositAmount); // approve user tokens to be transferred by peg contract
    erc20Peg.connect(owner).deposit(mockERC20.address, depositAmount, destinationAddress, { value: bridgeMsgFee.toNumber() })

    // Message passed onto erc20 peg
    const appMessage = ethers.utils.defaultAbiCoder.encode(
      ['address', 'uint256', 'address'], [mockERC20.address, depositAmount, recipient]
    );

    // TEST
    // perform bridge call (always succeeds) - which will call onMessageReceived -> withdraw
    await bridgeCall({
      owner,
      bridge,
      erc20Peg,
      appMessage,
      palletAddress,
    });

    // recipient should recieve depositted amount
    expect(await mockERC20.balanceOf(recipient)).to.equal(depositAmount);
  });
});
