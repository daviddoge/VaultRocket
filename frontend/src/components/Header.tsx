import { ConnectButton } from '@rainbow-me/rainbowkit';

export function Header() {
  return (
    <header className="vr-header">
      <div className="vr-header__brand">
        <div className="vr-accent-dot" />
        <div>
          <p className="vr-label">VaultRocket</p>
          <h1 className="vr-title">Encrypted fundraising</h1>
        </div>
      </div>
      <ConnectButton />
    </header>
  );
}
