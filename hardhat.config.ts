import { HardhatUserConfig } from "hardhat/config";
const dotenv = require("dotenv");
import "@nomicfoundation/hardhat-toolbox";

dotenv.config();

const {
  TEST_DEPLOYER_PK,
  TEST_ROLES_MANAGER_PK,
  TEST_TOKEN_MANAGER_PK,
  TEST_PEG_MANAGER_PK,

  MAIN_DEPLOYER_PK,
  MAIN_ROLES_MANAGER_PK,
  MAIN_TOKEN_MANAGER_PK,
  MAIN_PEG_MANAGER_PK,

  LOCAL_RPC_URL,
  ROOT_RPC_URL,
  PORCINI_RPC_URL,
  SEPOLIA_RPC_URL,
  ETHERSCAN_API_KEY
} = process.env;

// devAccounts are used for both Dev and Staging environment
const getKey = (privateKey) => (privateKey ? [privateKey] : []);

const acc0 = getKey(TEST_DEPLOYER_PK);
const acc1 = getKey(TEST_ROLES_MANAGER_PK);
const acc2 = getKey(TEST_TOKEN_MANAGER_PK);
const acc3 = getKey(TEST_PEG_MANAGER_PK);

const devAccounts = [...acc0, ...acc1, ...acc2, ...acc3];

const acc10 = getKey(MAIN_DEPLOYER_PK);
const acc11 = getKey(MAIN_ROLES_MANAGER_PK);
const acc12 = getKey(MAIN_TOKEN_MANAGER_PK);
const acc13 = getKey(MAIN_PEG_MANAGER_PK);

const mainAccounts = [...acc10, ...acc11, ...acc12, ...acc13];

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      },
      {
        version: "0.8.22",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      }
    ]
  },
  networks: {
    // mainnet: {
    //   url: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
    //   accounts: [`0x${process.env.ETH_ACCOUNT_KEY}`],
    // },
    sepolia: {
      faucet: "https://goerli-faucet.pk910.de/",
      url: SEPOLIA_RPC_URL,
      accounts: devAccounts,
      timeout: 120000,
      chainId: 11155111
    },
    porcini: {
      url: PORCINI_RPC_URL,
      accounts: devAccounts,
      chainId: 7672
    },
    root: {
      url: ROOT_RPC_URL,
      accounts: mainAccounts
    }
  },
  etherscan: {
    apiKey: {
      sepolia: ETHERSCAN_API_KEY,
      porcini: ETHERSCAN_API_KEY
    },
    customChains: [
      {
        network: "porcini",
        chainId: 7672,
        urls: {
          apiURL: "https://sourcify.dev/server",
          browserURL: "https://repo.sourcify.dev"
        }
      }
    ]
  },
  sourcify: {
    enabled: true,
    // Optional: specify a different Sourcify server
    apiUrl: "https://sourcify.dev/server",
    // Optional: specify a different Sourcify repository
    browserUrl: "https://repo.sourcify.dev"
  }
};

export default config;
