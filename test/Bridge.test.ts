import { expect } from "chai";
import { ethers } from "hardhat";
import { utils } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

// Receives [publicKey] as 0x-prefixed hex string
// Returns the Eth address as 0x-prefixed hex string
function publicKeyToEthAddress(publicKey: utils.BytesLike) {
  let decompressedPk = utils.computePublicKey(publicKey);
  // https://github.com/ethers-io/ethers.js/issues/670#issuecomment-559596757
  let h = utils.keccak256("0x" + decompressedPk.slice(4));
  // gives: 0x58dad74c38e9c4738bf3471f6aac6124f862faf5
  // wanted: 0xA512963122bC366b0F2c98Baf243E74b9A3f51c0
  return "0x" + h.slice(26);
}

describe("Bridge", () => {
  async function setup() {
    const [owner, user] = await ethers.getSigners();

    // deploy bridge contract (required by EERC20Peg)
    const BridgeFactory = await ethers.getContractFactory("Bridge");
    const bridge = await BridgeFactory.connect(owner).deploy();
    await bridge.deployed();

    const MockBridgeFactory = await ethers.getContractFactory(
      "MockBridgeReceiver"
    );
    const mockBridge = await MockBridgeFactory.connect(owner).deploy();
    await mockBridge.deployed();

    return { owner, user, bridge, mockBridge };
  }

  /**
   * callTransitivelyViaReceiveMessage is a helper function to transitively call onMessageReceived on a destination address
   */
  async function callTransitivelyViaReceiveMessage({
    bridge,
    txExecutor,
    owner,
    source,
    destination,
    appMessage,
    validatorSetId,
    fee
  }: {
    bridge: any;
    txExecutor: any;
    owner: any;
    source: string;
    destination: string;
    appMessage: string;
    validatorSetId: number;
    fee?: number;
  }) {
    const validatorPrivateKey =
      "0xcb6df9de1efca7a3998a8ead4e02159d5fa99c3e0d4fd6432667390bb4726854"; // alice private key
    const validatorSigner = new ethers.Wallet(validatorPrivateKey); // address: 0xE04CC55ebEE1cBCE552f250e85c57B70B2E2625b
    const verificationFee = fee ?? (await bridge.bridgeFee()); // 0.01 ether
    const eventId = 1;

    await bridge.connect(owner).setActive(true); // activate bridge
    await bridge.forceActiveValidatorSet(
      [validatorSigner.address],
      validatorSetId
    ); // set validators

    // Bridge message required for verification - abi encoded
    const bridgeMessage = ethers.utils.defaultAbiCoder.encode(
      ["address", "address", "bytes", "uint32", "uint256"],
      [source, destination, appMessage, validatorSetId, eventId]
    );
    const bridgeMessageHash = ethers.utils.keccak256(bridgeMessage); // keccak256 hash of bridge message
    const bridgeMessageBytes = ethers.utils.arrayify(bridgeMessageHash); // convert to bytes

    const flatSignature = validatorSigner
      ._signingKey()
      .signDigest(bridgeMessageBytes); // sign raw message - without EIP-712 prefix
    const expandedSignature = ethers.utils.splitSignature(flatSignature);
    const proof = {
      eventId,
      validatorSetId,
      v: [expandedSignature.v],
      r: [expandedSignature.r],
      s: [expandedSignature.s],
      validators: [validatorSigner.address]
    };

    return bridge
      .connect(txExecutor)
      .receiveMessage(source, destination, appMessage, proof, {
        value: verificationFee
      });
  }

  // ======================================================================================================= //
  // ============================================= OWNER TESTS ============================================= //
  // ======================================================================================================= //

  it("bridge active status", async () => {
    const { owner, user, bridge } = await loadFixture(setup);

    // verify default status is inactive
    expect(await bridge.active()).to.be.false;

    // verify user cannot set status to active
    await expect(bridge.connect(user).setActive(true)).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );

    // verify owner can set status to active
    await expect(bridge.connect(owner).setActive(true))
      .to.emit(bridge, "BridgeActiveUpdated")
      .withArgs(true);

    // verify status is now active
    expect(await bridge.active()).to.be.true;
  });

  it("bridge pallet address", async () => {
    const { owner, user, bridge } = await loadFixture(setup);

    const defaultPalletAddress = "0x6D6f646C65746879627264670000000000000000"; // 420_69 to address
    const newPalletAddress = "0x0000000000000000000000000000000000001111";

    // verify bridge default pallet address
    expect(await bridge.palletAddress()).to.equal(defaultPalletAddress);

    // verify user cannot set pallet address
    await expect(
      bridge.connect(user).setPalletAddress(newPalletAddress)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    // verify owner can set pallet address
    await expect(bridge.connect(owner).setPalletAddress(newPalletAddress))
      .to.emit(bridge, "PalletAddressUpdated")
      .withArgs(newPalletAddress);

    // verify pallet address is updated
    expect(await bridge.palletAddress()).to.equal(newPalletAddress);
  });

  it("max message length", async () => {
    const { owner, user, bridge } = await loadFixture(setup);

    // bytes in a kb
    const defaultMaxMessageLength = 1024;
    const newMaxMessageLength = 2048;

    // verify bridge default max message length
    expect(await bridge.maxMessageLength()).to.equal(defaultMaxMessageLength);

    // verify user cannot set max message length
    await expect(
      bridge.connect(user).setMaxMessageLength(newMaxMessageLength)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    // verify owner can set max message length
    await expect(bridge.connect(owner).setMaxMessageLength(newMaxMessageLength))
      .to.emit(bridge, "MaxMessageLengthUpdated")
      .withArgs(newMaxMessageLength);

    // verify max message length is updated
    expect(await bridge.maxMessageLength()).to.equal(newMaxMessageLength);
  });

  it("validator threshold", async () => {
    const { owner, user, bridge } = await loadFixture(setup);

    const defaultThreshold = 60;
    const newThreshold = 80;

    // verify default threshold is 60
    expect(await bridge.thresholdPercent()).to.equal(defaultThreshold);

    // verify user cannot set threshold
    await expect(
      bridge.connect(user).setThreshold(newThreshold)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    // verify owner can set threshold
    await expect(bridge.connect(owner).setThreshold(newThreshold))
      .to.emit(bridge, "ThresholdUpdated")
      .withArgs(newThreshold);

    // verify threshold is updated
    expect(await bridge.thresholdPercent()).to.equal(newThreshold);
  });

  it("bridge fee", async () => {
    const { owner, user, bridge } = await loadFixture(setup);

    const defaultFee = utils.parseEther("0.004");
    const newFee = utils.parseEther("0.05");

    // verify default fee is 100
    expect(await bridge.bridgeFee()).to.equal(defaultFee);

    // verify user cannot set fee
    await expect(bridge.connect(user).setBridgeFee(newFee)).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );

    // verify owner can set fee
    await expect(bridge.connect(owner).setBridgeFee(newFee))
      .to.emit(bridge, "BridgeFeeUpdated")
      .withArgs(newFee);

    // verify fee is updated
    expect(await bridge.bridgeFee()).to.equal(newFee);
  });

  it("max reward payout", async () => {
    const { owner, user, bridge } = await loadFixture(setup);

    const defaultMaxRewardPayout = utils.parseEther("1");
    const newMaxRewardPayout = utils.parseEther("2");

    // verify default max reward payout is 100
    expect(await bridge.maxRewardPayout()).to.equal(defaultMaxRewardPayout);

    // verify user cannot set max reward payout
    await expect(
      bridge.connect(user).setMaxRewardPayout(newMaxRewardPayout)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    // verify owner can set max reward payout
    await expect(bridge.connect(owner).setMaxRewardPayout(newMaxRewardPayout))
      .to.emit(bridge, "MaxRewardPayoutUpdated")
      .withArgs(newMaxRewardPayout);

    // verify max reward payout is updated
    expect(await bridge.maxRewardPayout()).to.equal(newMaxRewardPayout);
  });

  it("sent event id", async () => {
    const { owner, user, bridge } = await loadFixture(setup);

    // verify user cannot set sentEventId
    await expect(bridge.connect(user).setSentEventId(5)).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );

    // verify owner can set sentEventId
    await expect(bridge.connect(owner).setSentEventId(5))
      .to.emit(bridge, "SentEventIdUpdated")
      .withArgs(5);

    // verify sentEventId is updated
    expect(await bridge.sentEventId()).to.equal(5);
  });

  it("proof time to live (TTL)", async () => {
    const { owner, user, bridge } = await loadFixture(setup);

    const defaultProofTTL = 7;
    const newProofTTL = 8;

    // verify default proof TTL is 60
    expect(await bridge.proofTTL()).to.equal(defaultProofTTL);

    // verify user cannot set proof TTL
    await expect(
      bridge.connect(user).setProofTTL(newProofTTL)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    // verify owner can set proof TTL
    await expect(bridge.connect(owner).setProofTTL(newProofTTL))
      .to.emit(bridge, "ProofTTLUpdated")
      .withArgs(newProofTTL);

    // verify proof TTL is updated
    expect(await bridge.proofTTL()).to.equal(newProofTTL);
  });

  it("force historical validator set", async () => {
    const { owner, user, bridge } = await loadFixture(setup);

    const oldValidators = [owner.address];
    const validatorSetId = 1;

    // verify user cannot force historical validator set
    await expect(
      bridge
        .connect(user)
        .forceHistoricValidatorSet(oldValidators, validatorSetId)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    // setting historical validators fails if empty list
    await expect(
      bridge.connect(owner).forceHistoricValidatorSet([], validatorSetId)
    ).to.be.revertedWith("Bridge: empty validator set");

    // set proofTTL such that validatorSet validatorSetId + proofTTL <= activeValidatorSetId
    await bridge.connect(owner).setProofTTL(0);

    // setting historical validators fails if validatorSetId + proofTTL <= activeValidatorSetId
    await expect(
      bridge.connect(owner).forceHistoricValidatorSet(oldValidators, 0)
    ).to.be.revertedWith("Bridge: set is inactive");

    // revert proofTTL to default
    await bridge.connect(owner).setProofTTL(7);

    // verify owner can force historical validator set
    const expectedDigest =
      "0xa9404f191a6a84d0d36e618e9552617f03e20ee60e640f27c07db9245d83e495";
    await expect(
      bridge
        .connect(owner)
        .forceHistoricValidatorSet(oldValidators, validatorSetId)
    )
      .to.emit(bridge, "ForceSetHistoricValidators")
      .withArgs(expectedDigest, validatorSetId);
  });

  it("force set active validator set", async () => {
    const { owner, user, bridge } = await loadFixture(setup);

    const newValidators = [owner.address];
    const validatorSetId = 1;

    // verify user cannot force active validator set
    await expect(
      bridge
        .connect(user)
        .forceActiveValidatorSet(newValidators, validatorSetId)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    // setting active validators fails if empty list
    await expect(
      bridge.connect(owner).forceActiveValidatorSet([], validatorSetId)
    ).to.be.revertedWith("Bridge: empty validator set");

    // verify owner can force active validator set
    const expectedDigest =
      "0xa9404f191a6a84d0d36e618e9552617f03e20ee60e640f27c07db9245d83e495";
    await expect(
      bridge
        .connect(owner)
        .forceActiveValidatorSet(newValidators, validatorSetId)
    )
      .to.emit(bridge, "ForceSetActiveValidators")
      .withArgs(expectedDigest, validatorSetId);

    // setting active validators fails if validatorSetId < activeValidatorSetId
    await expect(
      bridge.connect(owner).forceActiveValidatorSet(newValidators, 0)
    ).to.be.revertedWith("Bridge: set is historic");
  });

  it("withdrawAll", async () => {
    const { owner, bridge } = await loadFixture(setup);

    const ownerInitBalance = await ethers.provider.getBalance(owner.address);

    const tx = await bridge.endow({ value: utils.parseEther("1") });
    const receipt1 = await ethers.provider.getTransactionReceipt(tx.hash);
    const tx1GasUsed = receipt1.gasUsed.mul(receipt1.effectiveGasPrice);

    const tx2 = await bridge.withdrawAll(owner.address);
    const receipt2 = await ethers.provider.getTransactionReceipt(tx2.hash);
    const tx2GasUsed = receipt2.gasUsed.mul(receipt2.effectiveGasPrice);

    expect(await ethers.provider.getBalance(bridge.address)).to.equal(0);

    const ownerFinalBalance = await ethers.provider.getBalance(owner.address);

    // owner balance change should only be cost of performed transactions
    expect(ownerInitBalance.sub(ownerFinalBalance)).to.equal(
      tx1GasUsed.add(tx2GasUsed)
    );
  });

  it("sendMessageFee", async () => {
    const { owner, user, bridge } = await loadFixture(setup);

    const sendMessageFee = utils.parseEther("0.1");

    expect(await bridge.sendMessageFee()).to.equal(300000000000000);

    // verify user cannot set send message fee
    await expect(
      bridge.connect(user).setSendMessageFee(sendMessageFee)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    // verify owner can set send message fee
    await expect(bridge.connect(owner).setSendMessageFee(sendMessageFee))
      .to.emit(bridge, "SendMessageFeeUpdated")
      .withArgs(sendMessageFee);

    // verify send message fee is updated
    expect(await bridge.sendMessageFee()).to.equal(sendMessageFee);
  });

  it("withdrawMsgFees", async () => {
    const { owner, user, bridge } = await loadFixture(setup);

    const destination = "0x0000000000000000000000000000000000000001";
    const msg =
      "0x0000000000000000000000000000000000000000000000000000000000000001";
    const msgFee = utils.parseEther("1");

    await bridge.connect(owner).setActive(true); // activate bridge

    // send message with bridge as fee recipient
    await expect(
      bridge.connect(user).sendMessage(destination, msg, { value: msgFee })
    )
      .to.emit(bridge, "SendMessage")
      .withArgs(0, user.address, destination, msg, utils.parseEther("1"));

    // verify sentEventId is incremented
    expect(await bridge.sentEventId()).to.equal(1);

    // verify bridge accumulated fees
    expect(await ethers.provider.getBalance(bridge.address)).to.equal(msgFee);
    expect(await bridge.accumulatedMessageFees()).to.equal(msgFee);

    // verify user (non-owner) cannot withdraw fees
    await expect(
      bridge.connect(user).withdrawMsgFees(destination, msgFee)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    // verify owner cannot withdraw more fees than what is accumulated
    await expect(
      bridge.connect(owner).withdrawMsgFees(destination, msgFee.add(1))
    ).to.be.reverted;

    // successfully withdraw fee as owner - to destination address
    await expect(bridge.connect(owner).withdrawMsgFees(destination, msgFee))
      .to.emit(bridge, "WithdrawnMessageFees")
      .withArgs(destination, msgFee);

    // verify owner destination has received fees (ether)
    expect(await ethers.provider.getBalance(destination)).to.equal(msgFee);

    // verify bridge balance is 0
    expect(await ethers.provider.getBalance(bridge.address)).to.equal(0);
    expect(await bridge.accumulatedMessageFees()).to.equal(0);
  });

  // ==================================================================================================== //
  // ============================================= PUBLIC TESTS ========================================= //
  // ==================================================================================================== //

  it("sendMessage - fails if bridge not active", async () => {
    const { user, bridge } = await loadFixture(setup);

    const destination = "0x0000000000000000000000000000000000000001";
    const msg =
      "0x0000000000000000000000000000000000000000000000000000000000000001";

    await expect(
      bridge.connect(user).sendMessage(destination, msg)
    ).to.be.revertedWith("Bridge: bridge inactive");
  });

  it("sendMessage - fails if msg exceeds max length", async () => {
    const { owner, user, bridge } = await loadFixture(setup);

    const destination = "0x0000000000000000000000000000000000000001";
    const msg = `0x${"00".repeat(2000)}`;

    // activate bridge
    await bridge.connect(owner).setActive(true);

    await expect(
      bridge.connect(user).sendMessage(destination, msg)
    ).to.be.revertedWith("Bridge: msg exceeds max length");
  });

  it("sendMessage - fails if set fee not paid", async () => {
    const { owner, user, bridge } = await loadFixture(setup);

    const destination = "0x0000000000000000000000000000000000000001";
    const msg = `0x0000000000000000000000000000000000000000000000000000000000000001`;

    // activate bridge
    await bridge.connect(owner).setActive(true);
    await bridge.connect(owner).setSendMessageFee(utils.parseEther("0.1"));

    await expect(
      bridge.connect(user).sendMessage(destination, msg)
    ).to.be.revertedWith("Bridge: insufficient message fee");
  });

  it("sendMessage", async () => {
    const { owner, user, bridge } = await loadFixture(setup);

    const destination = "0x0000000000000000000000000000000000000001";
    const msg =
      "0x0000000000000000000000000000000000000000000000000000000000000001";

    // activate bridge
    await bridge.connect(owner).setActive(true);
    await bridge.connect(owner).setSendMessageFee(utils.parseEther("0.1"));

    // verify default sentEventId is 0
    expect(await bridge.sentEventId()).to.equal(0);

    await expect(
      bridge
        .connect(user)
        .sendMessage(destination, msg, { value: utils.parseEther("0.1") })
    )
      .to.emit(bridge, "SendMessage")
      .withArgs(0, user.address, destination, msg, utils.parseEther("0.1"));

    // verify sentEventId is incremented
    expect(await bridge.sentEventId()).to.equal(1);
  });

  it("receiveMessage - fails", async () => {
    const { user, bridge, mockBridge } = await loadFixture(setup);

    const source = "0x0000000000000000000000000000000000000001";
    const destination = mockBridge.address;
    const verificationFee = await bridge.bridgeFee();
    const proof = {
      eventId: 1,
      validatorSetId: 1,
      v: [],
      r: [],
      s: [],
      validators: []
    };

    // fail if user does not pay bridge fee
    await expect(
      bridge.connect(user).receiveMessage(source, destination, [], proof)
    ).to.be.revertedWith("Bridge: must supply bridge fee");

    // fail is app message is empty
    await expect(
      bridge
        .connect(user)
        .receiveMessage(source, destination, [], proof, {
          value: verificationFee
        })
    ).to.be.revertedWith("Bridge: empty message");
  });

  it("receiveMessage - succeeds", async () => {
    const { owner, user, bridge, mockBridge } = await loadFixture(setup);

    /**
     * Setup
     */
    const source = "0x0000000000000000000000000000000000000001";
    const destination = mockBridge.address;
    const validatorPrivateKey =
      "0xcb6df9de1efca7a3998a8ead4e02159d5fa99c3e0d4fd6432667390bb4726854"; // alice private key
    const validatorSigner = new ethers.Wallet(validatorPrivateKey); // address: 0xE04CC55ebEE1cBCE552f250e85c57B70B2E2625b
    const verificationFee = await bridge.bridgeFee();
    const eventId = 1;
    const validatorSetId = 1;
    const validators = [owner.address];

    // encode valitators and validatorSetId into app message
    const appMessage = ethers.utils.defaultAbiCoder.encode(
      ["address[]", "uint256"],
      [validators, validatorSetId]
    );

    // Bridge message required for verification - abi encoded
    const bridgeMessage = ethers.utils.defaultAbiCoder.encode(
      ["address", "address", "bytes", "uint32", "uint256"],
      [source, destination, appMessage, validatorSetId, eventId]
    );
    const bridgeMessageHash = ethers.utils.keccak256(bridgeMessage); // keccak256 hash of bridge message
    const bridgeMessageBytes = ethers.utils.arrayify(bridgeMessageHash); // convert to bytes

    const flatSignature = validatorSigner
      ._signingKey()
      .signDigest(bridgeMessageBytes); // sign raw message - without EIP-712 prefix
    const expandedSignature = ethers.utils.splitSignature(flatSignature);
    const proof = {
      eventId,
      validatorSetId,
      v: [expandedSignature.v],
      r: [expandedSignature.r],
      s: [expandedSignature.s],
      validators: [validatorSigner.address]
    };

    /**
     * Tests
     */

    // fails due to no suplied verification fee
    await expect(
      bridge
        .connect(user)
        .receiveMessage(source, destination, appMessage, proof)
    ).is.revertedWith("Bridge: must supply bridge fee");

    // fails due to inactive bridge
    await expect(
      bridge
        .connect(user)
        .receiveMessage(source, destination, appMessage, proof, {
          value: verificationFee
        })
    ).is.revertedWith("Bridge: bridge inactive");

    // activate bridge
    await bridge.connect(owner).setActive(true);

    // fails due to unset validators
    await expect(
      bridge
        .connect(user)
        .receiveMessage(source, destination, appMessage, proof, {
          value: verificationFee
        })
    ).is.revertedWith("Bridge: future validator set");

    // set validators
    await bridge.forceActiveValidatorSet(
      [validatorSigner.address],
      validatorSetId
    );

    // successfully verifies message
    await expect(
      bridge
        .connect(user)
        .receiveMessage(source, destination, appMessage, proof, {
          value: verificationFee
        })
    )
      .to.emit(bridge, "MessageReceived")
      .withArgs(1, source, destination, appMessage);

    // ensure event id is successfully set
    expect(await bridge.verifiedEventIds(eventId)).is.true;

    // ensure bridge fee is successfully transferred
    expect(await ethers.provider.getBalance(bridge.address)).to.equal(
      verificationFee
    );
  });

  it("_verifyMessage", async () => {
    const { owner, user, bridge, mockBridge } = await loadFixture(setup);

    /**
     * Setup
     */
    const source = "0x0000000000000000000000000000000000000001";
    const destination = mockBridge.address;
    const validatorPrivateKey =
      "0xcb6df9de1efca7a3998a8ead4e02159d5fa99c3e0d4fd6432667390bb4726854"; // alice private key
    const validatorSigner = new ethers.Wallet(validatorPrivateKey); // address: 0xE04CC55ebEE1cBCE552f250e85c57B70B2E2625b
    const verificationFee = await bridge.bridgeFee();
    const eventId = 1;
    const validatorSetId = 1;
    const validators = [owner.address];

    // encode valitators and validatorSetId into app message
    const appMessage = ethers.utils.defaultAbiCoder.encode(
      ["address[]", "uint256"],
      [validators, validatorSetId]
    );

    // Bridge message required for verification - abi encoded
    const bridgeMessage = ethers.utils.defaultAbiCoder.encode(
      ["address", "address", "bytes", "uint32", "uint256"],
      [source, destination, appMessage, validatorSetId, eventId]
    );
    const bridgeMessageHash = ethers.utils.keccak256(bridgeMessage); // keccak256 hash of bridge message
    const bridgeMessageBytes = ethers.utils.arrayify(bridgeMessageHash); // convert to bytes

    const flatSignature = validatorSigner
      ._signingKey()
      .signDigest(bridgeMessageBytes); // sign raw message - without EIP-712 prefix
    const expandedSignature = ethers.utils.splitSignature(flatSignature);
    const proof = {
      eventId,
      validatorSetId,
      v: [expandedSignature.v],
      r: [expandedSignature.r],
      s: [expandedSignature.s],
      validators: [validatorSigner.address]
    };

    /**
     * Tests
     */

    // fails due to no suuplied verification fee
    await expect(
      bridge
        .connect(user)
        .receiveMessage(source, destination, appMessage, proof)
    ).is.revertedWith("Bridge: must supply bridge fee");

    // fails due to inactive bridge
    await expect(
      bridge
        .connect(user)
        .receiveMessage(source, destination, appMessage, proof, {
          value: verificationFee
        })
    ).is.revertedWith("Bridge: bridge inactive");

    // activate bridge
    await bridge.connect(owner).setActive(true);

    // fails due to unset validators
    await expect(
      bridge
        .connect(user)
        .receiveMessage(source, destination, appMessage, proof, {
          value: verificationFee
        })
    ).is.revertedWith("Bridge: future validator set");

    // set validators
    await bridge.forceActiveValidatorSet(
      [validatorSigner.address],
      validatorSetId
    );

    // successfully verifies message
    await expect(
      bridge
        .connect(user)
        .receiveMessage(source, destination, appMessage, proof, {
          value: verificationFee
        })
    )
      .to.emit(bridge, "MessageReceived")
      .withArgs(1, source, destination, appMessage);

    // ensure event id is successfully set
    expect(await bridge.verifiedEventIds(eventId)).is.true;

    // fails due to expired event id (prevent replay attack)
    await expect(
      bridge
        .connect(user)
        .receiveMessage(source, destination, appMessage, proof, {
          value: verificationFee
        })
    ).is.revertedWith("Bridge: eventId replayed");

    // fails due to invalid signature
    await expect(
      bridge
        .connect(user)
        .receiveMessage(
          source,
          destination,
          appMessage,
          { ...proof, eventId: eventId + 1 },
          { value: verificationFee }
        )
    ).is.revertedWith("Bridge: signature invalid");

    // increase eventId (prevent replay attack) - send with the same message params
    const newEventId = eventId + 1;
    const expandedSignatureUpd = ethers.utils.splitSignature(
      validatorSigner
        ._signingKey()
        .signDigest(
          ethers.utils.arrayify(
            ethers.utils.keccak256(
              ethers.utils.defaultAbiCoder.encode(
                ["address", "address", "bytes", "uint32", "uint256"],
                [source, destination, appMessage, validatorSetId, newEventId]
              )
            )
          )
        )
    );
    const proofUpd = {
      eventId: newEventId,
      validatorSetId,
      v: [expandedSignatureUpd.v],
      r: [expandedSignatureUpd.r],
      s: [expandedSignatureUpd.s],
      validators: [validatorSigner.address]
    };

    // set active validator set such that activeValidatorSetId - validatorSetId > proofTTL
    await bridge.forceActiveValidatorSet([validatorSigner.address], 9);

    // fails due to expired proof
    await expect(
      bridge
        .connect(user)
        .receiveMessage(source, destination, appMessage, proofUpd, {
          value: verificationFee
        })
    ).is.revertedWith("Bridge: expired proof");
  });

  it("_verifyMessage - no consensus", async () => {
    const { owner, user, bridge, mockBridge } = await loadFixture(setup);

    /**
     * Setup
     */
    const source = "0x0000000000000000000000000000000000000001";
    const destination = mockBridge.address;
    const validatorPrivateKey =
      "0xcb6df9de1efca7a3998a8ead4e02159d5fa99c3e0d4fd6432667390bb4726854"; // alice private key
    const validatorSigner = new ethers.Wallet(validatorPrivateKey); // address: 0xE04CC55ebEE1cBCE552f250e85c57B70B2E2625b
    const verificationFee = await bridge.bridgeFee();
    const eventId = 1;
    const validatorSetId = 1;
    const validators = [owner.address];

    await bridge.connect(owner).setActive(true); // activate bridge
    await bridge.forceActiveValidatorSet(
      // set single validator
      [
        validatorSigner.address,
        validatorSigner.address,
        validatorSigner.address,
        validatorSigner.address,
        validatorSigner.address
      ],
      validatorSetId
    );

    // encode valitators and validatorSetId into app message
    const appMessage = ethers.utils.defaultAbiCoder.encode(
      ["address[]", "uint256"],
      [validators, validatorSetId]
    );

    // Bridge message required for verification - abi encoded
    const bridgeMessage = ethers.utils.defaultAbiCoder.encode(
      ["address", "address", "bytes", "uint32", "uint256"],
      [source, destination, appMessage, validatorSetId, eventId]
    );
    const bridgeMessageHash = ethers.utils.keccak256(bridgeMessage); // keccak256 hash of bridge message
    const bridgeMessageBytes = ethers.utils.arrayify(bridgeMessageHash); // convert to bytes

    const flatSignature = validatorSigner
      ._signingKey()
      .signDigest(bridgeMessageBytes); // sign raw message - without EIP-712 prefix
    const expandedSignature = ethers.utils.splitSignature(flatSignature);

    /**
     * Tests
     */

    const proofInvalidValidatorSet = {
      eventId,
      validatorSetId,
      v: [expandedSignature.v],
      r: [expandedSignature.r],
      s: [expandedSignature.s],
      validators: [] // empty validator set
    };
    // proof contains 0 validators in set; should fail
    await expect(
      bridge
        .connect(user)
        .receiveMessage(
          source,
          destination,
          appMessage,
          proofInvalidValidatorSet,
          { value: verificationFee }
        )
    ).to.be.revertedWith("Bridge: invalid validator set");

    const proofUnexpectedValidators = {
      eventId,
      validatorSetId,
      v: [expandedSignature.v],
      r: [expandedSignature.r],
      s: [expandedSignature.s],
      validators: [
        // more validators than those set from `forceActiveValidatorSet`
        validatorSigner.address,
        validatorSigner.address,
        validatorSigner.address,
        validatorSigner.address
      ]
    };
    // proof contains 2 validators in set - more than required; should fail
    await expect(
      bridge
        .connect(user)
        .receiveMessage(
          source,
          destination,
          appMessage,
          proofUnexpectedValidators,
          { value: verificationFee }
        )
    ).to.be.revertedWith("Bridge: unexpected validator digest");

    const proofIncorrectValidator = {
      eventId,
      validatorSetId,
      v: [expandedSignature.v],
      r: [expandedSignature.r],
      s: [expandedSignature.s],
      validators: [owner.address]
    };
    // proof contains incorrect validator address in set; should fail
    await expect(
      bridge
        .connect(user)
        .receiveMessage(
          source,
          destination,
          appMessage,
          proofIncorrectValidator,
          { value: verificationFee }
        )
    ).to.be.revertedWith("Bridge: unexpected validator digest");

    const omitted = utils.formatBytes32String("");
    const proofIncompleteSignatures = {
      // TODO `not enough signatures`
      eventId,
      validatorSetId,
      v: [expandedSignature.v, 0, 0, expandedSignature.v, 0],
      r: [expandedSignature.r, omitted, omitted, expandedSignature.r, omitted],
      s: [expandedSignature.s, omitted, omitted, expandedSignature.s, omitted],
      validators: [
        validatorSigner.address,
        validatorSigner.address,
        validatorSigner.address,
        validatorSigner.address,
        validatorSigner.address
      ] // more validators than those set from `forceActiveValidatorSet`
    };
    // proof contains not enough validators required to pass consensus
    // validators.length = 5; acceptance_threshold = 5 * 60 / 100 => 3; only 2 signatures provided..
    await expect(
      bridge
        .connect(user)
        .receiveMessage(
          source,
          destination,
          appMessage,
          proofIncompleteSignatures,
          { value: verificationFee }
        )
    ).to.be.revertedWith("Bridge: not enough signatures");
  });

  it("onMessageReceived", async () => {
    const { owner, user, bridge } = await loadFixture(setup);

    const source = await bridge.palletAddress();
    const destination = bridge.address; // bridge address to call onMessageReceived

    const validatorSetId = 1;
    const validators = [owner.address];

    // encode valitators and validatorSetId into app message
    const appMessage = ethers.utils.defaultAbiCoder.encode(
      ["address[]", "uint256"],
      [validators, validatorSetId]
    );

    // ensure onMessageReceived is not callable by anyone
    await expect(
      bridge.connect(user).onMessageReceived(source, appMessage)
    ).to.revertedWith("Bridge: only bridge can call");

    // source must be pallet address
    await expect(
      callTransitivelyViaReceiveMessage({
        bridge,
        txExecutor: user,
        owner,
        source: user.address,
        destination,
        appMessage,
        validatorSetId
      })
    ).to.revertedWith("Bridge: source must be pallet");
  });

  it("_setValidators", async () => {
    const { user, owner, bridge } = await loadFixture(setup);

    const userInitialBalance = await user.getBalance();

    const source = await bridge.palletAddress();
    const destination = bridge.address; // bridge address to call onMessageReceived

    const validatorSetId = 1;
    const validators = [owner.address];
    const endowedAmount = utils.parseEther("0.04");

    // endow the bridge (as owner) with some funds
    await bridge.connect(owner).endow({ value: endowedAmount });

    // fails if validators are empty
    const msg1 = ethers.utils.defaultAbiCoder.encode(
      ["address[]", "uint256"],
      [[], validatorSetId]
    );
    await expect(
      callTransitivelyViaReceiveMessage({
        bridge,
        txExecutor: user,
        owner,
        source,
        destination,
        appMessage: msg1,
        validatorSetId
      })
    ).to.revertedWith("Bridge: empty validator set");

    // fails if validator id is the same
    const msg2 = ethers.utils.defaultAbiCoder.encode(
      ["address[]", "uint256"],
      [validators, validatorSetId]
    );
    await expect(
      callTransitivelyViaReceiveMessage({
        bridge,
        txExecutor: user,
        owner,
        source,
        destination,
        appMessage: msg2,
        validatorSetId
      })
    ).to.revertedWith("Bridge: validator set id replayed");

    const msgValidatorSetId = 2;
    const msg3 = ethers.utils.defaultAbiCoder.encode(
      ["address[]", "uint256"],
      [validators, msgValidatorSetId]
    ); // validatorSetId = 2
    const expectedValidatorSetDigest =
      "0xa9404f191a6a84d0d36e618e9552617f03e20ee60e640f27c07db9245d83e495"; // keccak256(validators)
    const userBalanceBeforeTx = await user.getBalance();
    const tx = await callTransitivelyViaReceiveMessage({
      bridge,
      txExecutor: user,
      owner,
      source,
      destination,
      appMessage: msg3,
      validatorSetId,
      fee: 0
    });
    const txHash = tx.hash;
    let receipt = await ethers.provider.getTransactionReceipt(txHash);
    const gasFee = receipt.effectiveGasPrice.mul(receipt.gasUsed);
    expect(tx)
      .to.emit(bridge, "SetValidators")
      .withArgs(expectedValidatorSetDigest, endowedAmount, msgValidatorSetId);

    const maxRewardPayout = await bridge.maxRewardPayout();
    const accumulatedMessageFees = await bridge.accumulatedMessageFees();
    const bridgeBalance = endowedAmount;
    const bridgeBalMinusMsgFee = bridgeBalance.sub(accumulatedMessageFees);
    let balanceChangeExpected;
    if (bridgeBalMinusMsgFee.lt(maxRewardPayout)) {
      balanceChangeExpected = bridgeBalMinusMsgFee;
    } else {
      balanceChangeExpected = maxRewardPayout;
    }
    balanceChangeExpected = balanceChangeExpected.sub(gasFee); // minus gas fee incurred
    const userNewBalance = await user.getBalance();
    expect(userNewBalance.sub(userBalanceBeforeTx).toString()).to.equal(
      balanceChangeExpected.toString()
    );
    // user should end up with more balance (after paying tx fees) as they received reward payout
    expect(await user.getBalance()).gt(userInitialBalance);

    // ensure active validator set id is set - from message
    expect(await bridge.activeValidatorSetId()).equals(msgValidatorSetId);

    // ensure set digest is applied for validator set id
    expect(await bridge.validatorSetDigests(msgValidatorSetId)).equals(
      expectedValidatorSetDigest
    );
  });
});
