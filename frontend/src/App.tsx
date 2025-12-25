import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { WagmiProvider, useAccount, usePublicClient } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { Contract } from 'ethers';
import { isAddress, type Address } from 'viem';
import '@rainbow-me/rainbowkit/styles.css';

import { config } from './config/wagmi';
import { Header } from './components/Header';
import { useZamaInstance } from './hooks/useZamaInstance';
import { useEthersSigner } from './hooks/useEthersSigner';
import {
  CUSDT_ABI,
  CUSDT_ADDRESS,
  SUPPORTED_CHAIN_ID,
  VAULT_ROCKET_ABI,
  VAULT_ROCKET_ADDRESS,
} from './config/contracts';
import './styles/vault.css';

const queryClient = new QueryClient();
const ZERO_HANDLE = '0x0000000000000000000000000000000000000000000000000000000000000000';
const DECIMALS = 1_000_000n;

type CampaignDetails = {
  name: string;
  targetAmount: bigint;
  endTimestamp: bigint;
  finalized: boolean;
  ownerAddress: string;
  totalRaisedHandle: string;
};

function formatAmount(value: bigint | null | undefined) {
  if (value === null || value === undefined) return '—';
  const whole = value / DECIMALS;
  const fraction = value % DECIMALS;
  const fractionStr = fraction.toString().padStart(6, '0').replace(/0+$/, '').padEnd(1, '0');
  return `${whole.toString()}.${fractionStr.slice(0, 4)}`;
}

function parseAmount(input: string): bigint | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const [whole, fraction = ''] = trimmed.split('.');
  if (!/^[0-9]+$/.test(whole) || !/^[0-9]*$/.test(fraction)) return null;
  const paddedFraction = (fraction + '000000').slice(0, 6);
  return BigInt(whole + paddedFraction);
}

function VaultRocketApp() {
  const { address, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();
  const signerPromise = useEthersSigner();

  const [campaignId, setCampaignId] = useState<bigint | null>(null);
  const [campaign, setCampaign] = useState<CampaignDetails | null>(null);
  const [userContribution, setUserContribution] = useState<bigint | null>(null);
  const [totalRaised, setTotalRaised] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [contributionInput, setContributionInput] = useState('1.00');
  const [mintInput, setMintInput] = useState('100');
  const [campaignName, setCampaignName] = useState('');
  const [targetInput, setTargetInput] = useState('');
  const [endDateInput, setEndDateInput] = useState('');

  const addressesReady = useMemo(
    () => isAddress(VAULT_ROCKET_ADDRESS) && isAddress(CUSDT_ADDRESS),
    []
  );

  const isOnSupportedNetwork = chainId === SUPPORTED_CHAIN_ID;

  const decryptHandle = useCallback(
    async (handle: string, contractAddress: string) => {
      if (!instance || !signerPromise || !address) return null;

      const signer = await signerPromise;
      const keypair = instance.generateKeypair();
      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '10';
      const contracts = [contractAddress];
      const eip712 = instance.createEIP712(keypair.publicKey, contracts, startTimeStamp, durationDays);

      const signature = await signer.signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        eip712.message
      );

      const result = await instance.userDecrypt(
        [{ handle, contractAddress }],
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contracts,
        signer.address,
        startTimeStamp,
        durationDays
      );

      const value = result[handle];
      return typeof value === 'bigint' ? value : BigInt(value);
    },
    [address, instance, signerPromise]
  );

  const refreshState = useCallback(async () => {
    if (!addressesReady || !publicClient) return;
    try {
      setLoading(true);
      setError(null);

      const id = await publicClient
        .readContract({
          address: VAULT_ROCKET_ADDRESS as Address,
          abi: VAULT_ROCKET_ABI,
          functionName: 'campaignId',
        })
        .catch(() => 0n);

      if (id === 0n) {
        setCampaignId(null);
        setCampaign(null);
        setUserContribution(null);
        setTotalRaised(null);
        return;
      }

      const data = await publicClient.readContract({
        address: VAULT_ROCKET_ADDRESS as Address,
        abi: VAULT_ROCKET_ABI,
        functionName: 'getCampaign',
      });

      const details: CampaignDetails = {
        name: data[0],
        targetAmount: data[1],
        endTimestamp: data[2],
        finalized: data[3],
        ownerAddress: data[4],
        totalRaisedHandle: data[5],
      };

      setCampaignId(id);
      setCampaign(details);

      if (address) {
        const contributionHandle = await publicClient.readContract({
          address: VAULT_ROCKET_ADDRESS as Address,
          abi: VAULT_ROCKET_ABI,
          functionName: 'getContribution',
          args: [id, address],
        });

        if (contributionHandle !== ZERO_HANDLE && instance) {
          const decrypted = await decryptHandle(contributionHandle, VAULT_ROCKET_ADDRESS);
          setUserContribution(decrypted);
        } else {
          setUserContribution(0n);
        }
      } else {
        setUserContribution(null);
      }

      if (instance && address && details.ownerAddress.toLowerCase() === address.toLowerCase()) {
        if (details.totalRaisedHandle === ZERO_HANDLE) {
          setTotalRaised(0n);
        } else {
          const decryptedTotal = await decryptHandle(details.totalRaisedHandle, VAULT_ROCKET_ADDRESS);
          setTotalRaised(decryptedTotal);
        }
      } else {
        setTotalRaised(null);
      }
    } catch (err) {
      console.error(err);
      setError('Unable to load campaign data. Please check contract addresses and network.');
    } finally {
      setLoading(false);
    }
  }, [address, addressesReady, decryptHandle, instance, publicClient]);

  useEffect(() => {
    if (isOnSupportedNetwork) {
      refreshState();
    }
  }, [refreshState, isOnSupportedNetwork]);

  const requireSigner = useCallback(async () => {
    if (!signerPromise) throw new Error('Wallet not connected.');
    const signer = await signerPromise;
    if (!signer) throw new Error('Wallet not connected.');
    return signer;
  }, [signerPromise]);

  const handleContribution = useCallback(
    async (evt: FormEvent) => {
      evt.preventDefault();
      try {
        if (!instance) throw new Error('Encryption service not ready yet.');
        if (!addressesReady) throw new Error('Contract addresses are missing. Deploy and set them first.');
        if (!isConnected) throw new Error('Connect your wallet to continue.');
        if (!isOnSupportedNetwork) throw new Error('Please switch to the Sepolia network.');

        const amount = parseAmount(contributionInput);
        if (amount === null) throw new Error('Enter a valid contribution amount.');

        setPendingAction('contribution');
        setStatus('Encrypting amount...');
        setError(null);

        const signer = await requireSigner();
        const input = instance.createEncryptedInput(VAULT_ROCKET_ADDRESS, address as string);
        input.add64(amount);
        const encrypted = await input.encrypt();

        const vaultContract = new Contract(VAULT_ROCKET_ADDRESS, VAULT_ROCKET_ABI, signer);
        setStatus('Sending contribution...');
        const tx = await vaultContract.contribute(encrypted.handles[0], encrypted.inputProof);
        await tx.wait();

        setStatus('Contribution confirmed.');
        await refreshState();
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Contribution failed.');
      } finally {
        setPendingAction(null);
      }
    },
    [address, contributionInput, instance, isConnected, isOnSupportedNetwork, addressesReady, refreshState, requireSigner]
  );

  const handleMint = useCallback(
    async (evt: FormEvent) => {
      evt.preventDefault();
      try {
        if (!isConnected) throw new Error('Connect your wallet to mint.');
        if (!addressesReady) throw new Error('Contract addresses are missing.');

        const amount = parseAmount(mintInput);
        if (amount === null) throw new Error('Enter a valid mint amount.');

        const signer = await requireSigner();
        const tokenContract = new Contract(CUSDT_ADDRESS, CUSDT_ABI, signer);

        setPendingAction('mint');
        setStatus('Requesting mint...');
        setError(null);

        const tx = await tokenContract.mint(address, amount);
        await tx.wait();

        setStatus('Tokens minted.');
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Mint failed.');
      } finally {
        setPendingAction(null);
      }
    },
    [address, addressesReady, isConnected, mintInput, requireSigner]
  );

  const handleOperator = useCallback(async () => {
    try {
      if (!isConnected) throw new Error('Connect your wallet to continue.');
      if (!addressesReady) throw new Error('Contract addresses are missing.');

      const signer = await requireSigner();
      const tokenContract = new Contract(CUSDT_ADDRESS, CUSDT_ABI, signer);
      const expiry = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

      setPendingAction('operator');
      setStatus('Setting operator for VaultRocket...');
      setError(null);

      const tx = await tokenContract.setOperator(VAULT_ROCKET_ADDRESS, expiry);
      await tx.wait();

      setStatus('Operator approval saved.');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not set operator.');
    } finally {
      setPendingAction(null);
    }
  }, [addressesReady, isConnected, requireSigner]);

  const handleConfigure = useCallback(
    async (evt: FormEvent) => {
      evt.preventDefault();
      try {
        if (!addressesReady) throw new Error('Contract addresses are missing.');
        if (!isConnected) throw new Error('Connect your wallet first.');
        if (!campaign) throw new Error('Campaign not initialized.');
        if (campaign.ownerAddress.toLowerCase() !== (address || '').toLowerCase()) {
          throw new Error('Only the fundraiser can update the campaign.');
        }

        const target = parseAmount(targetInput);
        if (target === null) throw new Error('Enter a valid target.');
        const parsedEnd = Date.parse(endDateInput);
        if (Number.isNaN(parsedEnd)) throw new Error('Enter a valid end date.');

        const endTimestamp = Math.floor(parsedEnd / 1000);
        const signer = await requireSigner();
        const vaultContract = new Contract(VAULT_ROCKET_ADDRESS, VAULT_ROCKET_ABI, signer);

        setPendingAction('configure');
        setStatus('Updating campaign...');
        setError(null);

        const tx = await vaultContract.configureCampaign(campaignName || campaign.name, target, endTimestamp);
        await tx.wait();

        setStatus('Campaign updated.');
        await refreshState();
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Failed to configure campaign.');
      } finally {
        setPendingAction(null);
      }
    },
    [address, addressesReady, campaign, campaignName, endDateInput, isConnected, refreshState, requireSigner, targetInput]
  );

  const handleClose = useCallback(async () => {
    try {
      if (!addressesReady) throw new Error('Contract addresses are missing.');
      if (!isConnected) throw new Error('Connect your wallet first.');
      if (!campaign || campaignId === null) throw new Error('Campaign not initialized.');
      if (campaign.ownerAddress.toLowerCase() !== (address || '').toLowerCase()) {
        throw new Error('Only the fundraiser can close the campaign.');
      }

      const signer = await requireSigner();
      const vaultContract = new Contract(VAULT_ROCKET_ADDRESS, VAULT_ROCKET_ABI, signer);

      setPendingAction('close');
      setStatus('Closing campaign...');
      setError(null);

      const tx = await vaultContract.closeCampaign();
      await tx.wait();

      setStatus('Funds released to the fundraiser.');
      await refreshState();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Close failed.');
    } finally {
      setPendingAction(null);
    }
  }, [address, addressesReady, campaign, campaignId, isConnected, refreshState, requireSigner]);

  const isActive =
    campaign && !campaign.finalized && Number(campaign.endTimestamp) * 1000 > Date.now();

  const countdown = useMemo(() => {
    if (!campaign) return '';
    const remainingSeconds = Number(campaign.endTimestamp) - Math.floor(Date.now() / 1000);
    if (remainingSeconds <= 0) return 'Ended';
    const days = Math.floor(remainingSeconds / 86400);
    const hours = Math.floor((remainingSeconds % 86400) / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  }, [campaign]);

  return (
    <div className="vr-page">
      <Header />
      <main className="vr-main">
        <div className="vr-top">
          <div>
            <p className="vr-label">Campaign</p>
            <h2 className="vr-heading">{campaign?.name || 'VaultRocket'}</h2>
            <p className="vr-subtext">
              Encrypted contributions in cUSDT with on-chain access control. Configure a goal, collect privately, and
              settle instantly.
            </p>
          </div>
          <div className="vr-chip">
            {isOnSupportedNetwork ? 'Sepolia ready' : 'Switch to Sepolia'}
          </div>
        </div>

        {!addressesReady && (
          <div className="vr-banner vr-banner--warn">
            <p>Set deployed addresses inside deployments/sepolia to start the app.</p>
          </div>
        )}
        {zamaError && <div className="vr-banner vr-banner--warn">{zamaError}</div>}
        {error && <div className="vr-banner vr-banner--warn">{error}</div>}
        {status && <div className="vr-banner vr-banner--info">{status}</div>}

        <div className="vr-grid">
          <div className="vr-card vr-card--highlight">
            <div className="vr-card__header">
              <div>
                <p className="vr-label">Status</p>
                <h3 className="vr-card__title">{campaign?.name || 'Not configured'}</h3>
              </div>
              <div className={`vr-status ${isActive ? 'vr-status--active' : 'vr-status--idle'}`}>
                {isActive ? 'Active' : campaign?.finalized ? 'Closed' : 'Pending'}
              </div>
            </div>
            <div className="vr-stats">
              <div>
                <p className="vr-label">Target</p>
                <p className="vr-stat">{campaign ? `${formatAmount(campaign.targetAmount)} cUSDT` : '—'}</p>
              </div>
              <div>
                <p className="vr-label">Time left</p>
                <p className="vr-stat">{countdown || '—'}</p>
              </div>
              <div>
                <p className="vr-label">Total raised</p>
                <p className="vr-stat">
                  {totalRaised !== null
                    ? `${formatAmount(totalRaised)} cUSDT`
                    : campaign
                      ? 'Encrypted'
                      : '—'}
                </p>
              </div>
            </div>
            <div className="vr-hint">
              Latest campaign id: {campaignId !== null ? campaignId.toString() : '—'}
            </div>
          </div>

          <div className="vr-card">
            <div className="vr-card__header">
              <div>
                <p className="vr-label">Your balance</p>
                <h3 className="vr-card__title">Contribute</h3>
              </div>
            </div>
            <form className="vr-form" onSubmit={handleContribution}>
              <label className="vr-input__label">Amount (cUSDT)</label>
              <input
                type="text"
                className="vr-input"
                value={contributionInput}
                onChange={(e) => setContributionInput(e.target.value)}
                placeholder="1.00"
              />
              <div className="vr-form__actions">
                <button
                  className="vr-button vr-button--primary"
                  type="submit"
                  disabled={pendingAction !== null || zamaLoading || !isConnected}
                >
                  {pendingAction === 'contribution' ? 'Submitting...' : 'Send encrypted contribution'}
                </button>
                <button
                  className="vr-button vr-button--ghost"
                  type="button"
                  onClick={handleOperator}
                  disabled={pendingAction !== null || !isConnected}
                >
                  Approve VaultRocket as operator
                </button>
              </div>
              <div className="vr-note">
                Your personal total: {userContribution !== null ? `${formatAmount(userContribution)} cUSDT` : 'Connect to view'}
              </div>
            </form>
          </div>

          <div className="vr-card">
            <div className="vr-card__header">
              <div>
                <p className="vr-label">Utilities</p>
                <h3 className="vr-card__title">Get cUSDT test tokens</h3>
              </div>
            </div>
            <form className="vr-form" onSubmit={handleMint}>
              <label className="vr-input__label">Mint amount (cUSDT)</label>
              <input
                type="text"
                className="vr-input"
                value={mintInput}
                onChange={(e) => setMintInput(e.target.value)}
                placeholder="100"
              />
              <button
                className="vr-button vr-button--secondary"
                type="submit"
                disabled={pendingAction !== null || !isConnected}
              >
                {pendingAction === 'mint' ? 'Minting...' : 'Mint to wallet'}
              </button>
              <p className="vr-note">Minting is open for testing. Keep values small to stay within uint64 limits.</p>
            </form>
          </div>

          <div className="vr-card">
            <div className="vr-card__header">
              <div>
                <p className="vr-label">Admin</p>
                <h3 className="vr-card__title">Campaign controls</h3>
              </div>
            </div>
            <form className="vr-form" onSubmit={handleConfigure}>
              <label className="vr-input__label">Name</label>
              <input
                className="vr-input"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder={campaign?.name || 'Launch title'}
              />
              <label className="vr-input__label">Target (cUSDT)</label>
              <input
                className="vr-input"
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                placeholder={campaign ? formatAmount(campaign.targetAmount) : '5000'}
              />
              <label className="vr-input__label">End time</label>
              <input
                className="vr-input"
                type="datetime-local"
                value={endDateInput}
                onChange={(e) => setEndDateInput(e.target.value)}
              />
              <div className="vr-form__actions">
                <button
                  className="vr-button vr-button--primary"
                  type="submit"
                  disabled={pendingAction !== null || !isConnected}
                >
                  {pendingAction === 'configure' ? 'Saving...' : 'Save campaign'}
                </button>
                <button
                  className="vr-button vr-button--danger"
                  type="button"
                  onClick={handleClose}
                  disabled={pendingAction !== null || !isConnected}
                >
                  {pendingAction === 'close' ? 'Closing...' : 'Close & withdraw'}
                </button>
              </div>
              <p className="vr-note">
                Only the fundraiser address ({campaign?.ownerAddress || '—'}) can update settings or withdraw funds.
              </p>
            </form>
          </div>
        </div>

        <div className="vr-footer">
          <span>{loading ? 'Syncing encrypted data…' : 'Live'} </span>
          <span> | </span>
          <span>VaultRocket • FHE cUSDT crowdfunding</span>
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider locale="en" initialChain={SUPPORTED_CHAIN_ID}>
          <VaultRocketApp />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;
