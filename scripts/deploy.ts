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
  console.log("Peg Address:", pegAddress);

  // Add gas optimization comments
  console.log(`\nGas Optimization Report:`);
  console.log("Contracts are compiled with optimizer enabled");

  // Deploy Token
  const Token = await ethers.getContractFactory("Token");
  const token = await Token.deploy(rolesManager, tokenManager, multisig);
  await token.deployed();
  console.log("\nToken deployed to:", token.address);
  console.log("The Roles manager is:", rolesManager);
  console.log("The manager of the Token is:", tokenManager);
  console.log("The multisig of the Token is:", multisig);

  // Setup phase

  // Initialize token with peg address (token manager) - with proper error handling
  try {
    const tokenManagerSigner = new ethers.Wallet(
      tokenManagerPk,
      ethers.provider
    );
    const tx = await token.connect(tokenManagerSigner).init(pegAddress);
    await tx.wait();
    console.log("Token initialized with peg address:", pegAddress);
  } catch (error) {
    console.error("Error initializing token:", error);
    throw error;
  }

  console.log("\nDeployment Complete");
  console.log("Token:", token.address);

  console.log("\nPlease verify your deployment:");
  console.log(
    "Token:",
    `npx hardhat verify --network ${network} ${token.address} "${rolesManager}" "${tokenManager}" "${multisig}"`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
