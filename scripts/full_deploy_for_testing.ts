import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = process.env.HARDHAT_NETWORK || "testnet";

  // Get addresses based on network
  const prefix = network === "mainnet" ? "MAIN_" : "TEST_";

  const deployerPk = process.env[`${prefix}DEPLOYER_PK`];
  const rolesManagerPk = process.env[`${prefix}ROLES_MANAGER_PK`];
  const tokenManagerPk = process.env[`${prefix}TOKEN_MANAGER_PK`];

  const rolesManager = process.env[`${prefix}ROLES_MANAGER`];
  const tokenManager = process.env[`${prefix}TOKEN_MANAGER`];
  const multisig = process.env[`${prefix}MULTISIG`];

  const pegAddress =
    network === "sepolia"
      ? process.env.SEPOLIA_PEG_ADDRESS
      : network === "porcini"
      ? process.env.PORCINI_PEG_ADDRESS
      : process.env.ROOT_PEG_ADDRESS;

  if (
    !deployerPk ||
    !rolesManagerPk ||
    !tokenManagerPk ||
    !rolesManager ||
    !tokenManager ||
    !multisig
  ) {
    throw new Error("Missing required environment variables");
  }

  console.log(`\nDeploying to ${network} with:`);
  console.log("Deployer:", deployer.address);
  console.log("Roles Manager:", rolesManager);
  console.log("Token Manager:", tokenManager);
  console.log("Multisig:", multisig);

  // Add gas optimization comments
  console.log(`\nGas Optimization Report:`);
  console.log("Contracts are compiled with optimizer enabled");

  // Deploy Bridge
  const Bridge = await ethers.getContractFactory("Bridge");
  const bridge = await Bridge.deploy();
  await bridge.deployed();
  console.log("\nBridge deployed to:", bridge.address);
  console.log("The owner of the Bridge is:", deployer.address);

  // Deploy Token
  const Token = await ethers.getContractFactory("Token");
  const token = await Token.deploy(
    rolesManager,
    tokenManager,
    recoveryManager,
    multisig
  );
  await token.deployed();
  console.log("\nToken deployed to:", token.address);
  console.log("The Roles manager is:", rolesManager);
  console.log("The manager of the Token is:", tokenManager);
  console.log("The multisig of the Token is:", multisig);

  // // Deploy TokenPeg
  // const TokenPeg = await ethers.getContractFactory("TokenPeg");
  // const peg = await TokenPeg.deploy(
  //   bridge.address,
  //   token.address,
  //   rolesManager,
  //   pegManager
  // );
  // await peg.deployed();
  // console.log("\nTokenPeg deployed to:", peg.address);
  // console.log("The Roles manager of the TokenPeg is:", rolesManager);
  // console.log("The peg manager of the TokenPeg is:", pegManager);
  // console.log("Token role set (to store refunds):", token.address);

  // Setup phase
  console.log("\nStarting setup phase...");

  // 1. Activate bridge (deployer is bridge owner)
  await bridge.setActive(true);
  console.log("Bridge activated");

  // 2. Initialize token with peg address (token manager)
  const tokenManagerSigner = new ethers.Wallet(tokenManagerPk, ethers.provider);
  await token.connect(tokenManagerSigner).init(peg.address);
  console.log("Token initialized with peg address:", peg.address);

  // 3. Activate TokenPeg deposits/withdrawals and set pallet address (peg manager)
  const pegManagerSigner = new ethers.Wallet(pegManagerPk, ethers.provider);
  await peg.connect(pegManagerSigner).setDepositsActive(true);
  await peg.connect(pegManagerSigner).setWithdrawalsActive(true);
  console.log("TokenPeg deposits/withdrawals activated");
  await peg
    .connect(pegManagerSigner)
    .setPalletAddress(ethers.constants.AddressZero); // TODO: Set correct pallet address
  console.log("Pallet address set to:", ethers.constants.AddressZero);

  console.log("\nDeployment Complete");
  console.log("Bridge:", bridge.address);
  console.log("Token:", token.address);
  console.log("TokenPeg:", peg.address);

  console.log("\nVerification commands:");
  console.log(
    "Bridge:",
    `npx hardhat verify --network ${network} ${bridge.address}`
  );
  console.log(
    "Token:",
    `npx hardhat verify --network ${network} ${token.address} "${rolesManager}" "${tokenManager}" "${recoveryManager}" "${multisig}"`
  );
  console.log(
    "TokenPeg:",
    `npx hardhat verify --network ${network} ${peg.address} "${bridge.address}" "${token.address}" "${rolesManager}" "${pegManager}"`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
