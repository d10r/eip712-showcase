import { createConfig, http } from 'wagmi'
import { mainnet, sepolia } from 'wagmi/chains'
import { injected, walletConnect } from 'wagmi/connectors'

// Get WalletConnect project ID from environment variables
const projectId = import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID

// Minimal configuration
export const config = createConfig({
  chains: [mainnet, sepolia],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
  connectors: [
    // Keep it simple with just two connectors
    injected(),
    walletConnect({ projectId })
  ]
})

export const chains = [mainnet, sepolia] 