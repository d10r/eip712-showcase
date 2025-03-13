import { ethers } from 'ethers'

// ERC20 interface for metadata and permit functionality
const ERC20_INTERFACE = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function nonces(address owner) view returns (uint256)',
]

// ERC20 Permit type data for EIP-712 signing
export const ERC20PermitType = [
  { name: 'owner', type: 'address' },
  { name: 'spender', type: 'address' },
  { name: 'value', type: 'uint256' },
  { name: 'nonce', type: 'uint256' },
  { name: 'deadline', type: 'uint256' },
]

// Token metadata interface
export interface TokenMetadata {
  name: string
  symbol: string
  decimals: number
}

// Fetch token metadata
export async function fetchTokenMetadata(tokenAddress: string): Promise<TokenMetadata> {
  const provider = new ethers.providers.Web3Provider(window.ethereum)
  const tokenContract = new ethers.Contract(
    tokenAddress,
    ERC20_INTERFACE,
    provider
  )

  try {
    const [name, symbol, decimals] = await Promise.all([
      tokenContract.name(),
      tokenContract.symbol(),
      tokenContract.decimals(),
    ])

    return { name, symbol, decimals }
  } catch (error) {
    console.error('Error fetching token metadata:', error)
    throw new Error('Failed to fetch token metadata. Make sure this is a valid ERC20 token address.')
  }
}

// Generate permit data for signing
export async function createPermitData(
  tokenAddress: string,
  owner: string,
  spender: string,
  amount: string,
  chainId: number
) {
  // Connect to token contract to get name, decimals and nonce
  const provider = new ethers.providers.Web3Provider(window.ethereum)
  const tokenContract = new ethers.Contract(
    tokenAddress,
    ERC20_INTERFACE,
    provider
  )

  // Get token details
  const [name, decimals, nonce] = await Promise.all([
    tokenContract.name(),
    tokenContract.decimals(),
    tokenContract.nonces(owner),
  ])

  // Adjust amount based on token decimals
  const adjustedAmount = ethers.utils.parseUnits(amount, decimals).toString()
  
  const deadline = Math.floor(Date.now() / 1000) + 3600 // 1 hour from now

  // Create the EIP-712 domain separator
  const domain = {
    name,
    version: '1',
    chainId,
    verifyingContract: tokenAddress,
  }

  // Create the typed data structure
  const types = {
    Permit: ERC20PermitType
  }

  // Create the message data
  const message = {
    owner,
    spender,
    value: adjustedAmount,
    nonce: nonce.toString(),
    deadline,
  }

  // Combine into a typed data object for signing
  const typedData = {
    domain,
    types,
    primaryType: 'Permit',
    message,
  }

  return { typedData, deadline, adjustedAmount }
} 