# VaultRocket

VaultRocket is a confidential fundraising dApp built on Zama FHEVM. It enables a fundraiser to collect encrypted
contributions in cUSDT while keeping each donor's amount private, and still allowing the fundraiser to withdraw the
total at any time.

## Overview

VaultRocket solves a common problem in on-chain fundraising: amounts are public by default, which exposes donor
behavior, strategic signals, and competitive insights. By using Fully Homomorphic Encryption (FHE), VaultRocket keeps
contribution values encrypted end-to-end while preserving verifiable settlement on-chain.

The system consists of:
- A confidential ERC7984 token (cUSDT) used for payments.
- A VaultRocket fundraiser contract that stores encrypted contribution totals and per-user contributions.
- A React + Vite frontend that encrypts inputs and decrypts only the data the user is permitted to see.

## Problem Statement

Traditional crowdfunding on public blockchains exposes:
- Individual contribution sizes and timing, revealing donor behavior.
- Total raise progress, which can influence market perception.
- Negotiation or competitive leverage for participating teams or investors.
- Sensitive financial data that is visible to anyone monitoring the chain.

VaultRocket addresses these pain points with encrypted amounts while preserving on-chain verifiability.

## Solution

VaultRocket uses FHE to encrypt contribution amounts:
- Contributors encrypt the amount client-side and submit ciphertext to the fundraiser.
- The contract updates encrypted totals without ever seeing plaintext values.
- The fundraiser can decrypt the total raised; each contributor can decrypt their own contribution.
- Everyone can verify transactions and campaign status, but cannot see the plaintext amounts.

## Advantages

- Privacy-preserving fundraising on a public blockchain.
- Verifiable on-chain accounting with encrypted state updates.
- Clear separation of access: contributors see their own totals, the fundraiser sees the aggregate.
- Simple operator-based cUSDT transfers, no approvals for plaintext amounts.
- Real-time campaign status without leaking sensitive values.

## Key Features

- Configure a campaign with a name, target amount, and end timestamp.
- Encrypted cUSDT contributions with per-contributor aggregation.
- Encrypted global total that only the fundraiser can decrypt.
- Ability for the fundraiser to close the campaign at any time and withdraw all cUSDT.
- Campaign lifecycle tracking (active, finalized, ended by time).
- Frontend that handles encryption/decryption and wallet interactions.

## How It Works

Contributor flow:
1. Connect a wallet on Sepolia.
2. Obtain or mint cUSDT on the deployed ConfidentialUSDT contract.
3. Encrypt the contribution amount client-side.
4. Submit the encrypted amount to VaultRocket.
5. Decrypt and view your own encrypted contribution total.

Fundraiser flow:
1. Deploy ConfidentialUSDT and VaultRocket.
2. Configure the campaign with metadata.
3. Monitor campaign status and decrypt the aggregated total when needed.
4. Close the campaign and withdraw all encrypted cUSDT.

## Architecture

- Smart contracts (Solidity + FHEVM):
  - `contracts/ConfidentialUSDT.sol` (ERC7984 cUSDT token).
  - `contracts/VaultRocket.sol` (fundraising logic, encrypted accounting).
- Deployment:
  - `deploy/deploy.ts` using Hardhat Deploy.
- Frontend (React + Vite):
  - `frontend/src/config/contracts.ts` stores contract addresses and ABI in TypeScript.
  - Reads via `viem` and writes via `ethers`.
  - Wallet connection via RainbowKit + wagmi.
  - Zama relayer for encryption/decryption.

## Smart Contracts

### ConfidentialUSDT (cUSDT)

- ERC7984-based confidential token.
- Mint function is public for testnet usage.
- Uses FHE to mint encrypted balances.
- 6 decimals (front-end uses 1_000_000 as the base unit).

### VaultRocket

Core functions:
- `configureCampaign(name, targetAmount, endTimestamp)`:
  - Sets campaign metadata.
  - Creates a new campaign ID if the previous campaign is finalized.
- `contribute(encryptedAmount, inputProof)`:
  - Accepts an encrypted amount and updates encrypted totals.
  - Uses cUSDT operator-based transfer.
- `closeCampaign()`:
  - Finalizes the campaign and transfers all cUSDT to the owner.
- `getCampaign()`:
  - Returns campaign metadata and encrypted total handle.
- `getContribution(id, contributor)`:
  - Returns a contributor's encrypted total handle.
- `isActive()` and `activeCampaignId()`:
  - Helper views for campaign status.

Notes:
- `targetAmount` is informational and not enforced by the contract.
- If the campaign end time has passed, contributions are rejected.
- Campaign owners can close at any time, independent of end time.

## Encryption and Privacy Model

- All contribution amounts are encrypted client-side before submission.
- The contract never sees plaintext values.
- The fundraiser is authorized to decrypt the aggregate total only.
- Each contributor is authorized to decrypt their own encrypted total.
- Amounts remain private, but addresses and timestamps are still public.

## Technology Stack

Smart contracts:
- Solidity 0.8.27
- Hardhat + hardhat-deploy
- FHEVM Hardhat plugin
- OpenZeppelin contracts

Frontend:
- React + Vite + TypeScript
- viem (read-only RPC calls)
- ethers (write transactions)
- RainbowKit + wagmi (wallet connections)

Tooling:
- npm
- TypeChain (ethers-v6 target)
- Zama relayer SDK (frontend encryption/decryption)

## Repository Layout

```
contracts/                 Smart contracts
deploy/                    Hardhat deploy scripts
tasks/                     Hardhat tasks
test/                      Contract tests
frontend/                  React + Vite frontend
deployments/               Deployment outputs and ABIs
docs/                      Zama-related references
scripts/                   Utility scripts
```

## Prerequisites

- Node.js 20+
- npm
- A Sepolia account with test ETH

## Installation

```bash
npm install
```

## Local Validation and Deployment

Run tasks and tests before any public deployment:

```bash
# Example task
npx hardhat accounts

# Compile and test
npm run compile
npm run test
```

Deploy to a local Hardhat node first:

```bash
npx hardhat node
npx hardhat deploy --network localhost
```

## Sepolia Deployment

1. Create a `.env` file in the project root:

```
PRIVATE_KEY=your_private_key_without_0x_prefix
INFURA_API_KEY=your_infura_project_id
```

2. Deploy contracts to Sepolia:

```bash
npx hardhat deploy --network sepolia
```

3. (Optional) Verify contracts:

```bash
npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
```

Notes:
- Deployment uses `process.env.PRIVATE_KEY` and `process.env.INFURA_API_KEY`.
- Do not use a mnemonic.

## Frontend Configuration

The frontend does not use environment variables or JSON files.

1. Copy contract addresses and ABI from `deployments/sepolia` into:
   - `frontend/src/config/contracts.ts`
2. Set `VAULT_ROCKET_ADDRESS` and `CUSDT_ADDRESS`.
3. Paste the contract ABI arrays into the same file.

## Frontend Development

```bash
cd frontend
npm install
npm run dev
```

Open the UI and connect a wallet on Sepolia to interact with VaultRocket.

## Usage Guide

Fundraiser:
- Deploy contracts and set addresses in the frontend.
- Configure a campaign with name, target amount, and end timestamp.
- Monitor encrypted totals (only the owner can decrypt the aggregate).
- Close the campaign to withdraw all cUSDT.

Contributor:
- Mint or receive cUSDT on Sepolia.
- Approve VaultRocket as operator on cUSDT.
- Submit an encrypted contribution.
- Decrypt and view your personal contribution total.

## Operational Constraints

- Campaign IDs start at 1; 0 means no active campaign.
- Contribution amounts use 6 decimals and are stored as euint64.
- The contract does not auto-finalize on target amount.
- There is no refund logic; contributors should only send funds they intend to donate.

## Security Considerations

- `ConfidentialUSDT.mint` is public for testnet convenience; do not use as-is for production.
- The fundraiser (owner) can close a campaign at any time.
- Encrypted values are private, but participation addresses are not.
- FHE operations rely on the Zama FHEVM protocol and its relayer infrastructure.

## Future Roadmap

Planned improvements:
- Access-controlled minting and real token supply management.
- Multi-campaign management with historical archives.
- Optional contribution limits and whitelisting support.
- Refund or milestone-based release flows.
- Enhanced analytics with privacy-preserving aggregates.
- UI improvements for campaign discovery and progress visualization.
- Automated deployment helpers and CI validation.

## License

BSD-3-Clause-Clear. See `LICENSE`.
