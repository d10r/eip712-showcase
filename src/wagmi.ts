import { Chain, mainnet } from 'wagmi/chains'
import sfMetadata from '@superfluid-finance/metadata'
import { defaultWagmiConfig } from '@web3modal/wagmi'

// Get WalletConnect project ID from environment variables
const projectId = import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID

// Define metadata for the dApp
const metadata = {
  name: 'EIP-712 Demo',
  description: 'Demo application for EIP-712 signing',
  url: 'https://eip712-demo.xyz', // replace with your actual URL
  icons: ['https://avatars.githubusercontent.com/u/37784886']
}

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
const { networks } = sfMetadata;
// We need at least one valid chain for wagmi's type system
const sfChains = networks.map(convertToWagmiChain);

// Make sure we only include chains with valid RPC URLs
const validSfChains = sfChains.filter(chain => 
  chain.rpcUrls.default.http.length > 0 && 
  chain.rpcUrls.default.http[0] !== ''
);

console.log(`Found ${validSfChains.length} valid chains from Superfluid metadata (filtered from ${sfChains.length} total)`);

// Filter out duplicate chain IDs - keep only the first occurrence of each chain ID
const uniqueChainMap = new Map<number, Chain>();

// Add all SF chains to the map (only keeps one entry per chain ID)
validSfChains.forEach(chain => {
  if (!uniqueChainMap.has(chain.id)) {
    uniqueChainMap.set(chain.id, chain);
  } else {
    console.log(`  Skipping duplicate: Chain ID ${chain.id} (${chain.name})`);
  }
});

// Make sure mainnet is included (but don't duplicate it)
if (!uniqueChainMap.has(mainnet.id)) {
  uniqueChainMap.set(mainnet.id, mainnet);
}

// Convert the map back to an array, with mainnet as the first chain (to satisfy the type constraint)
const chainArray = Array.from(uniqueChainMap.values());

// Remove mainnet if it exists in the array
const mainnetIndex = chainArray.findIndex(chain => chain.id === mainnet.id);
if (mainnetIndex >= 0) {
  chainArray.splice(mainnetIndex, 1);
}

// Create the final array with mainnet as the first element
const allChains = [mainnet, ...chainArray] as const;

console.log(`Loaded ${allChains.length} chains (${uniqueChainMap.size - (uniqueChainMap.has(mainnet.id) ? 1 : 0)} from Superfluid metadata)`);

// Create wagmi config with Web3Modal 
export const config = defaultWagmiConfig({
  chains: allChains,
  projectId,
  metadata
})

export const chains = allChains 