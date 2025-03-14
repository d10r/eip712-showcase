import { readContract } from 'wagmi/actions'
import { Address, parseUnits } from 'viem'
import { config } from '../wagmi'

// ERC20 ABI for metadata and permit functionality
const ERC20_ABI = [
  { type: 'function', name: 'name', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'symbol', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
  { type: 'function', name: 'nonces', inputs: [{ type: 'address', name: 'owner' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'DOMAIN_SEPARATOR', inputs: [], outputs: [{ type: 'bytes32' }], stateMutability: 'view' },
  { type: 'function', name: 'permit', inputs: [
    { type: 'address', name: 'owner' },
    { type: 'address', name: 'spender' },
    { type: 'uint256', name: 'value' },
    { type: 'uint256', name: 'deadline' },
    { type: 'uint8', name: 'v' },
    { type: 'bytes32', name: 'r' },
    { type: 'bytes32', name: 's' }
  ], outputs: [], stateMutability: 'nonpayable' }
] as const;

// EIP-712 Permit type data
export const ERC20PermitType = [
  { name: 'owner', type: 'address' },
  { name: 'spender', type: 'address' },
  { name: 'value', type: 'uint256' },
  { name: 'nonce', type: 'uint256' },
  { name: 'deadline', type: 'uint256' },
] as const;

// Token metadata interface
export interface TokenMetadata {
  name: string
  symbol: string
  decimals: number
  supportsPermit?: boolean
}

// Core permit parameters used for operations
export interface PermitParameters {
  owner: Address
  spender: Address
  value: bigint
  deadline: bigint
  tokenAddress: Address
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

/**
 * Checks if a token supports the permit functionality (EIP-2612)
 */
export async function checkPermitSupport(tokenAddress: Address): Promise<boolean> {
  try {
    // Try to call nonces function first
    await readContract(config, {
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'nonces',
      args: ['0x0000000000000000000000000000000000000000']
    });
    return true;
  } catch (error) {
    try {
      // If nonces fails, try to check for DOMAIN_SEPARATOR
      await readContract(config, {
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'DOMAIN_SEPARATOR',
      });
      return true;
    } catch {
      // If both checks fail, token likely doesn't support permit
      return false;
    }
  }
}

/**
 * Fetches token metadata and checks permit support
 */
export async function fetchTokenMetadata(tokenAddress: Address): Promise<TokenMetadata> {
  try {
    // Get basic token info using readContract
    const [name, symbol, decimalsResult] = await Promise.all([
      readContract(config, {
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'name',
      }) as Promise<string>,
      readContract(config, {
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'symbol',
      }) as Promise<string>,
      readContract(config, {
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'decimals',
      }) as Promise<number>
    ]);

    // Check permit support
    const supportsPermit = await checkPermitSupport(tokenAddress);

    return { 
      name, 
      symbol, 
      decimals: decimalsResult, 
      supportsPermit 
    };
  } catch (error) {
    console.error('Error fetching token metadata:', error);
    throw new Error('Failed to fetch token metadata. Make sure this is a valid ERC20 token address on the current network.');
  }
}

/**
 * Creates typed data for EIP-712 signing of an ERC20 permit
 */
export async function createPermitData(
  tokenAddress: Address,
  owner: Address,
  spender: Address,
  amount: string,
  chainId: number
) {
  try {
    // Check permit support first
    const supportsPermit = await checkPermitSupport(tokenAddress);
    if (!supportsPermit) {
      throw new Error('This token does not support the permit functionality (EIP-2612).');
    }

    // Get token details
    const [name, symbol, decimals, nonceResult] = await Promise.all([
      readContract(config, {
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'name',
      }) as Promise<string>,
      readContract(config, {
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'symbol',
      }) as Promise<string>,
      readContract(config, {
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'decimals',
      }) as Promise<number>,
      readContract(config, {
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'nonces',
        args: [owner]
      }) as Promise<bigint>
    ]);

    // Adjust amount based on token decimals and convert to BigInt
    const adjustedAmount = parseUnits(amount, decimals);
    
    // Set deadline to 1 hour from now
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    // Create the EIP-712 domain separator
    const domain = {
      name,
      version: '1',
      chainId,
      verifyingContract: tokenAddress,
    };

    // Create the typed data structure
    const types = {
      Permit: ERC20PermitType
    };

    // Create the message data
    const message = {
      owner,
      spender,
      value: adjustedAmount,
      nonce: nonceResult,
      deadline,
    };

    // Combine into a typed data object for signing
    const typedData = {
      domain,
      types,
      primaryType: 'Permit' as const,
      message,
    };

    // Create parameters for execution
    const permitParams: PermitParameters = {
      owner,
      spender,
      value: adjustedAmount,
      deadline,
      tokenAddress,
      chainId
    };

    const tokenMetadata: TokenMetadata = {
      name,
      symbol,
      decimals,
      supportsPermit: true
    };

    return { typedData, permitParams, tokenMetadata };
  } catch (error) {
    console.error('Error creating permit data:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to create permit data. Check if the token supports EIP-2612.');
  }
} 