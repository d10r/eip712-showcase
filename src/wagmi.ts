import { createConfig, http } from 'wagmi'
import { Chain, mainnet } from 'wagmi/chains'
import { injected, walletConnect } from 'wagmi/connectors'
import metadata from '@superfluid-finance/metadata'

// Get WalletConnect project ID from environment variables
const projectId = import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID

// Convert Superfluid networks to wagmi chains format
function convertToWagmiChain(network: any): Chain {
  return {
    id: network.chainId,
    name: network.humanReadableName,
    nativeCurrency: {
      name: network.nativeTokenSymbol,
      symbol: network.nativeTokenSymbol,
      decimals: 18 // Assuming all EVM chains have 18 decimals
    },
    rpcUrls: {
      default: { http: network.publicRPCs && network.publicRPCs.length > 0 ? [network.publicRPCs[0]] : [''] },
      public: { http: network.publicRPCs || [''] }
    },
    blockExplorers: network.explorer ? {
      default: { name: 'Explorer', url: network.explorer }
    } : undefined
  } as Chain
}

// Get all networks from Superfluid metadata
const { networks } = metadata;
// We need at least one valid chain for wagmi's type system
const sfChains = networks.map(convertToWagmiChain);
const allChains = [mainnet, ...sfChains] as const;

console.log(`Loaded ${allChains.length} chains (${sfChains.length} from Superfluid metadata)`);

// Configuration with Superfluid chains
export const config = createConfig({
  chains: allChains,
  transports: Object.fromEntries(
    allChains.map(chain => [
      chain.id, 
      http(chain.rpcUrls.default.http[0])
    ])
  ),
  connectors: [
    injected({
      shimDisconnect: true,
    }),
    walletConnect({ 
      projectId
    })
  ]
})

export const chains = allChains 