import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, log } = hre.deployments;

  const deployedCUSDT = await deploy("ConfidentialUSDT", {
    from: deployer,
    log: true,
  });

  const deployedVaultRocket = await deploy("VaultRocket", {
    from: deployer,
    args: [deployedCUSDT.address],
    log: true,
  });

  const cusdtContract = await hre.ethers.getContractAt("ConfidentialUSDT", deployedCUSDT.address);
  const initialMint = 1_000_000 * 1_000_000; // 1,000,000 cUSDT with 6 decimals
  const mintTx = await cusdtContract.mint(deployer, initialMint);
  await mintTx.wait();

  log(`ConfidentialUSDT deployed at ${deployedCUSDT.address}`);
  log(`VaultRocket deployed at ${deployedVaultRocket.address}`);
  log(`Seeded deployer ${deployer} with ${initialMint} cUSDT`);
};
export default func;
func.id = "deploy_vaultrocket"; // id required to prevent reexecution
func.tags = ["VaultRocket"];
