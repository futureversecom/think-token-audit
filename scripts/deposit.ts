import { ethers } from "hardhat";

// Deposit some ERC20 token to the CENNZnet bridge contract
async function main() {
  const ERC20PegFactory = await ethers.getContractFactory('ERC20Peg');
  console.log('Connecting to CENNZnet erc20peg contract...');
  const erc20Peg = ERC20PegFactory.attach("0x5FbDB2315678afecb367f032d93F642f64180aa3");
  console.log('CENNZnet erc20peg attached to:', erc20Peg.address);

  const BridgeFactory = await ethers.getContractFactory('CENNZnetBridge');
  console.log('Connecting to CENNZnet bridge contract...');
  const bridge = BridgeFactory.attach("0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512");
  console.log('CENNZnet bridge attached to:', bridge.address);

  console.log(await erc20Peg.setBridgeAddress(bridge.address));

  console.log('Connecting to test erc20 contract...');
  const MockERC20Factory = await ethers.getContractFactory('MockERC20');
  const mockERC20 = MockERC20Factory.attach("0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9");
  console.log(`connected. bridge: ${erc20Peg.address}, token: ${mockERC20.address}`);

  // make deposit
  let depositAmount = 5644;
  let cennznetAddress = "0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d";
  console.log(await mockERC20.approve(erc20Peg.address, depositAmount));
  console.log(await erc20Peg.deposit(mockERC20.address, depositAmount, cennznetAddress));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
