import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'VaultRocket',
  projectId: '3ff0f4b6b45d6f6fbf0e9f5f3b3c2d1a',
  chains: [sepolia],
  ssr: false,
});
