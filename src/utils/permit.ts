import { ethers } from 'ethers'

// ERC20 interface for metadata and permit functionality
const ERC20_INTERFACE = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function nonces(address owner) view returns (uint256)',
  // Add DOMAIN_SEPARATOR as a potential check for permit support
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
  // Add permit function for potential execution
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external'
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
  supportsPermit?: boolean
}

// Core permit parameters used for on-chain operations
export interface PermitParameters {
  owner: string
  spender: string
  value: string
  deadline: number
  tokenAddress: string
  chainId: number
}

// Data for the permit execution UI component
export interface SignedPermitExecutionContext {
  permitParams: PermitParameters
  tokenMetadata: TokenMetadata
  signature?: string
}

// For backward compatibility
export type PermitData = SignedPermitExecutionContext;

// Check if a token supports the permit functionality
export async function checkPermitSupport(tokenAddress: string): Promise<boolean> {
  const provider = new ethers.providers.Web3Provider(window.ethereum)
  const tokenContract = new ethers.Contract(
    tokenAddress,
    ERC20_INTERFACE,
    provider
  )

  try {
    // Try to call a function that should only exist if permit is supported
    // First check if nonces function works
    await tokenContract.nonces(ethers.constants.AddressZero)
    return true
  } catch (error) {
    try {
      // If nonces fails, try to check for DOMAIN_SEPARATOR existence
      await tokenContract.DOMAIN_SEPARATOR()
      return true
    } catch {
      // If both checks fail, token likely doesn't support permit
      return false
    }
  }
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

    // Check permit support
    const supportsPermit = await checkPermitSupport(tokenAddress)

    return { name, symbol, decimals, supportsPermit }
  } catch (error) {
    console.error('Error fetching token metadata:', error)
    throw new Error('Failed to fetch token metadata. Make sure this is a valid ERC20 token address.')
  }
}

// Ensure address has 0x prefix
function ensureHexAddress(address: string): `0x${string}` {
  if (!address.startsWith('0x')) {
    return `0x${address}` as `0x${string}`
  }
  return address as `0x${string}`
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

  try {
    // Check permit support first
    const supportsPermit = await checkPermitSupport(tokenAddress)
    if (!supportsPermit) {
      throw new Error('This token does not support the permit functionality (EIP-2612).')
    }

    // Get token details
    const [name, symbol, decimals, nonce] = await Promise.all([
      tokenContract.name(),
      tokenContract.symbol(),
      tokenContract.decimals(),
      tokenContract.nonces(owner),
    ])

    // Adjust amount based on token decimals
    const adjustedAmount = ethers.utils.parseUnits(amount, decimals).toString()
    
    const deadline = Math.floor(Date.now() / 1000) + 3600 // 1 hour from now

    // Ensure address has 0x prefix
    const verifyingContractAddress = ensureHexAddress(tokenAddress)

    // Create the EIP-712 domain separator
    const domain = {
      name,
      version: '1',
      chainId,
      verifyingContract: verifyingContractAddress,
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
      primaryType: 'Permit' as const,
      message,
    }

    // Create parameter objects for execution
    const permitParams: PermitParameters = {
      owner,
      spender,
      value: adjustedAmount,
      deadline,
      tokenAddress,
      chainId
    }

    const tokenMetadata: TokenMetadata = {
      name,
      symbol,
      decimals,
      supportsPermit: true
    }

    // Create full execution context
    const executionContext: SignedPermitExecutionContext = {
      permitParams,
      tokenMetadata
    }

    return { typedData, permitParams, tokenMetadata, executionContext }
  } catch (error) {
    console.error('Error creating permit data:', error)
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Failed to create permit data. Check if the token supports EIP-2612.')
  }
} 