import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import {
  ConfidentialUSDT,
  ConfidentialUSDT__factory,
  VaultRocket,
  VaultRocket__factory,
} from "../types";

describe("VaultRocket", function () {
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let token: ConfidentialUSDT;
  let vault: VaultRocket;
  let vaultAddress: string;
  let tokenAddress: string;

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    [owner, alice] = await ethers.getSigners();

    const tokenFactory = (await ethers.getContractFactory("ConfidentialUSDT")) as ConfidentialUSDT__factory;
    token = (await tokenFactory.deploy()) as ConfidentialUSDT;
    tokenAddress = await token.getAddress();

    const vaultFactory = (await ethers.getContractFactory("VaultRocket")) as VaultRocket__factory;
    vault = (await vaultFactory.deploy(tokenAddress)) as VaultRocket;
    vaultAddress = await vault.getAddress();

    const latestBlock = await ethers.provider.getBlock("latest");
    await vault.configureCampaign(
      "Demo Launch",
      2_000_000,
      Number(latestBlock?.timestamp ?? 0) + 3600
    );

    await token.mint(alice.address, 5_000_000);
    const expiry = Math.floor(Date.now() / 1000) + 60 * 60;
    await token.connect(alice).setOperator(vaultAddress, expiry);
  });

  it("records encrypted contributions and total raised", async function () {
    const encrypted = await fhevm
      .createEncryptedInput(vaultAddress, alice.address)
      .add64(1_250_000)
      .encrypt();

    await vault.connect(alice).contribute(encrypted.handles[0], encrypted.inputProof);

    const activeId = await vault.campaignId();

    const encryptedContribution = await vault.getContribution(activeId, alice.address);
    const decryptedContribution = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedContribution,
      vaultAddress,
      alice,
    );
    expect(decryptedContribution).to.equal(1_250_000n);

    const campaign = await vault.getCampaign();
    const decryptedTotal = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      campaign[5],
      vaultAddress,
      owner,
    );
    expect(decryptedTotal).to.equal(1_250_000n);
  });

  it("lets the owner close and withdraw contributions", async function () {
    const encrypted = await fhevm
      .createEncryptedInput(vaultAddress, alice.address)
      .add64(900_000)
      .encrypt();

    await vault.connect(alice).contribute(encrypted.handles[0], encrypted.inputProof);

    const campaignBeforeClose = await vault.getCampaign();
    const expectedPayout = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      campaignBeforeClose[5],
      vaultAddress,
      owner,
    );

    await vault.connect(owner).closeCampaign();
    const campaign = await vault.getCampaign();
    expect(campaign[3]).to.eq(true);

    const ownerBalance = await token.confidentialBalanceOf(owner.address);
    const decryptedOwnerBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      ownerBalance,
      tokenAddress,
      owner,
    );
    expect(decryptedOwnerBalance).to.equal(expectedPayout);
  });
});
