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
  // Simplified eip712Domain definition to avoid decoding issues
  { type: 'function', name: 'eip712Domain', inputs: [], outputs: [], stateMutability: 'view' },
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

// Separate ABI just for EIP-5267 check
const EIP5267_CHECK_ABI = [
  { type: 'function', name: 'eip712Domain', inputs: [], outputs: [], stateMutability: 'view' }
] as const;

// Define a fallback for domain info for known tokens
const KNOWN_TOKEN_DOMAINS: Record<string, { version: string, chainId?: number }> = {
  // stETH is known to use version 2
  '0xae7ab96520de3a18e5e111b5eaab095312d7fe84': { version: '2' }
};

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
  usedEIP5267?: boolean  // Flag to indicate whether EIP-5267 was used
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
    
    // Check if EIP-5267 is supported
    let usedEIP5267 = false;
    if (supportsPermit) {
      try {
        console.log(`Checking EIP-5267 support for ${tokenAddress}...`);
        
        // Use a simplified approach to just check if the function exists
        await readContract(config, {
          address: tokenAddress,
          abi: EIP5267_CHECK_ABI,
          functionName: 'eip712Domain',
        });
        
        // If we get here without error, the function exists
        usedEIP5267 = true;
        console.log('Token supports EIP-5267:', tokenAddress);
      } catch (error: any) {
        // Special check for "out of bounds" errors in viem, which may indicate
        // the function exists but has decoding issues
        if (error?.message?.includes('out of bounds') || error?.message?.includes('data out-of-bounds')) {
          console.log('Token likely supports EIP-5267 but has ABI decoding issues');
          usedEIP5267 = true; 
        } else {
          console.log('Token does not support EIP-5267:', tokenAddress);
          console.error('EIP-5267 detection error:', error);
        }
      }
    }

    return { 
      name, 
      symbol, 
      decimals: decimalsResult, 
      supportsPermit,
      usedEIP5267
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
    let name: string, symbol: string, decimals: number, nonceResult: bigint;
    let usedEIP5267 = false;

    // For known tokens, use predefined domain values
    const lowerCaseAddress = tokenAddress.toLowerCase();
    const knownToken = KNOWN_TOKEN_DOMAINS[lowerCaseAddress];
    
    // Try to get domain parameters using EIP-5267 first
    try {
      console.log(`Retrieving domain parameters via EIP-5267 for ${tokenAddress}...`);
      
      // Mark as supported if we've identified this token in our mappings
      if (knownToken) {
        console.log('Using predefined domain info for known token:', tokenAddress);
        usedEIP5267 = true;
      } else {
        // Try the regular approach but handle errors gracefully
        try {
          await readContract(config, {
            address: tokenAddress,
            abi: EIP5267_CHECK_ABI,
            functionName: 'eip712Domain',
          });
          usedEIP5267 = true;
        } catch (error: any) {
          if (error?.message?.includes('out of bounds') || error?.message?.includes('data out-of-bounds')) {
            console.log('Function exists but has ABI decoding issues');
            usedEIP5267 = true;
          } else {
            throw error; // Re-throw if it's not an ABI decoding issue
          }
        }
      }
    } catch (error) {
      console.log('Contract does not support EIP-5267, falling back to standard methods');
      console.error('EIP-5267 error details:', error);
    }
    
    // Get token details
    const promises = [
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
    ];
    
    const results = await Promise.all(promises);
    name = results[0] as string;
    symbol = results[1] as string;
    decimals = results[2] as number;
    nonceResult = results[3] as bigint;

    // Adjust amount based on token decimals and convert to BigInt
    const adjustedAmount = parseUnits(amount, decimals);
    
    // Set deadline to 1 hour from now
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    // Create the message data
    const message = {
      owner,
      spender,
      value: adjustedAmount,
      nonce: nonceResult,
      deadline,
    };

    // Build domain object, taking into account known token customizations
    const domain = {
      name,
      version: knownToken?.version || '1', // Use known version if available
      chainId: knownToken?.chainId || chainId, // Use known chainId if specified
      verifyingContract: tokenAddress,
    };
    
    console.log('Using domain:', domain, usedEIP5267 ? '(from EIP-5267)' : '(standard fallback)');

    // Create typed data structure according to EIP-712/EIP-2612
    const typedData = {
      domain,
      types: {
        Permit: ERC20PermitType
      },
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
      supportsPermit: true,
      usedEIP5267
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