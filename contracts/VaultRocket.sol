// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";

import {ConfidentialUSDT} from "./ConfidentialUSDT.sol";

/// @title VaultRocket confidential fundraising contract
/// @notice Accepts encrypted cUSDT contributions and lets the fundraiser withdraw at any time.
contract VaultRocket is Ownable, ZamaEthereumConfig {
    struct Campaign {
        string name;
        uint64 targetAmount;
        uint64 endTimestamp;
        bool finalized;
        euint64 totalRaised;
    }

    ConfidentialUSDT public immutable paymentToken;
    uint256 public campaignId;

    mapping(uint256 => Campaign) private campaigns;
    mapping(uint256 => mapping(address => euint64)) private contributions;

    event CampaignConfigured(
        uint256 indexed id,
        string name,
        uint64 targetAmount,
        uint64 endTimestamp
    );
    event ContributionReceived(uint256 indexed id, address indexed contributor, euint64 encryptedAmount);
    event CampaignClosed(uint256 indexed id, address indexed receiver, euint64 encryptedPayout, uint64 closedAt);

    error CampaignNotConfigured();
    error CampaignAlreadyFinalized();
    error CampaignEnded();
    error InvalidEndTimestamp();

    constructor(address tokenAddress) Ownable(msg.sender) {
        paymentToken = ConfidentialUSDT(tokenAddress);
    }

    /// @notice Configure the fundraising campaign metadata.
    /// @dev If the previous campaign is finalized, this starts a new round with a fresh id.
    function configureCampaign(string memory name, uint64 targetAmount, uint64 endTimestamp) external onlyOwner {
        if (endTimestamp <= block.timestamp) revert InvalidEndTimestamp();

        Campaign storage current = campaigns[campaignId];
        if (campaignId == 0 || current.finalized) {
            campaignId += 1;
            current = campaigns[campaignId];
            current.totalRaised = FHE.asEuint64(0);
        }

        if (!FHE.isInitialized(current.totalRaised)) {
            current.totalRaised = FHE.asEuint64(0);
        }

        current.name = name;
        current.targetAmount = targetAmount;
        current.endTimestamp = endTimestamp;
        current.finalized = false;

        emit CampaignConfigured(campaignId, name, targetAmount, endTimestamp);
    }

    /// @notice Contribute encrypted cUSDT to the active campaign.
    /// @param encryptedAmount Encrypted contribution amount created for the payment token contract.
    /// @param inputProof Proof for the encrypted amount.
    function contribute(externalEuint64 encryptedAmount, bytes calldata inputProof) external returns (euint64) {
        if (campaignId == 0) revert CampaignNotConfigured();

        Campaign storage current = campaigns[campaignId];
        if (current.finalized) revert CampaignAlreadyFinalized();
        if (block.timestamp >= current.endTimestamp) revert CampaignEnded();

        // Pull tokens from contributor using operator approval.
        euint64 contributionAmount = FHE.fromExternal(encryptedAmount, inputProof);
        FHE.allow(contributionAmount, address(this));
        FHE.allow(contributionAmount, address(paymentToken));
        euint64 transferred = paymentToken.confidentialTransferFrom(msg.sender, address(this), contributionAmount);

        contributions[campaignId][msg.sender] = FHE.add(contributions[campaignId][msg.sender], transferred);
        current.totalRaised = FHE.add(current.totalRaised, transferred);

        FHE.allowThis(contributions[campaignId][msg.sender]);
        FHE.allow(contributions[campaignId][msg.sender], msg.sender);

        FHE.allowThis(current.totalRaised);
        FHE.allow(current.totalRaised, owner());

        emit ContributionReceived(campaignId, msg.sender, transferred);
        return contributions[campaignId][msg.sender];
    }

    /// @notice Finalize the campaign and withdraw all raised cUSDT.
    function closeCampaign() external onlyOwner returns (euint64 payout) {
        if (campaignId == 0) revert CampaignNotConfigured();

        Campaign storage current = campaigns[campaignId];
        if (current.finalized) revert CampaignAlreadyFinalized();

        current.finalized = true;

        euint64 contractBalance = paymentToken.confidentialBalanceOf(address(this));
        if (!FHE.isInitialized(contractBalance)) {
            euint64 zeroCipher = FHE.asEuint64(0);
            FHE.allowThis(zeroCipher);
            FHE.allow(zeroCipher, owner());
            emit CampaignClosed(campaignId, owner(), zeroCipher, uint64(block.timestamp));
            return zeroCipher;
        }

        payout = paymentToken.confidentialTransfer(owner(), contractBalance);
        emit CampaignClosed(campaignId, owner(), payout, uint64(block.timestamp));
    }

    function getCampaign()
        external
        view
        returns (string memory name, uint64 targetAmount, uint64 endTimestamp, bool finalized, address ownerAddress, euint64 totalRaised)
    {
        if (campaignId == 0) revert CampaignNotConfigured();

        Campaign storage current = campaigns[campaignId];
        return (current.name, current.targetAmount, current.endTimestamp, current.finalized, owner(), current.totalRaised);
    }

    function getContribution(uint256 id, address contributor) external view returns (euint64) {
        return contributions[id][contributor];
    }

    function activeCampaignId() external view returns (uint256) {
        if (campaignId == 0) revert CampaignNotConfigured();
        return campaignId;
    }

    function isActive() external view returns (bool) {
        if (campaignId == 0) return false;

        Campaign storage current = campaigns[campaignId];
        if (current.finalized) return false;
        return block.timestamp < current.endTimestamp;
    }
}
