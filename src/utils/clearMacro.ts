import { readContract } from 'wagmi/actions'
import { type Address, type Hex } from 'viem'
import { createPublicClient, http } from 'viem'
import { config } from '../wagmi'

const addr = (a: string) => (/^0x[a-fA-F0-9]{40}$/.test(a) ? (a as Address) : null)

/** IClearMacroForwarderV1.Security */
export interface ClearMacroSecurity {
  domain: string
  macroContract: Address
  provider: string
  validAfter: bigint
  validBefore: bigint
  nonce: bigint
}

export const CLEARMACRO_EIP712_DOMAIN_NAME = 'ClearMacro'
export const CLEARMACRO_EIP712_DOMAIN_VERSION = '1'

const SECURITY_ABI_COMPONENTS = [
  { name: 'domain', type: 'string', internalType: 'string' },
  { name: 'macroContract', type: 'address', internalType: 'address' },
  { name: 'provider', type: 'string', internalType: 'string' },
  { name: 'validAfter', type: 'uint256', internalType: 'uint256' },
  { name: 'validBefore', type: 'uint256', internalType: 'uint256' },
  { name: 'nonce', type: 'uint256', internalType: 'uint256' },
] as const

/** IClearMacroForwarderV1 / IClearMacroForwarderV1WithPermit2 */
export const CLEAR_MACRO_FORWARDER_ABI = [
  {
    type: 'function',
    name: 'getNonce',
    stateMutability: 'view',
    inputs: [
      { name: 'sender', type: 'address', internalType: 'address' },
      { name: 'key', type: 'uint192', internalType: 'uint192' },
    ],
    outputs: [{ name: 'nonce', type: 'uint256', internalType: 'uint256' }],
  },
  {
    type: 'function',
    name: 'encodeParams',
    stateMutability: 'pure',
    inputs: [
      { name: 'actionParams', type: 'bytes', internalType: 'bytes' },
      {
        name: 'security',
        type: 'tuple',
        internalType: 'struct IClearMacroForwarderV1.Security',
        components: [...SECURITY_ABI_COMPONENTS],
      },
    ],
    outputs: [{ name: 'encodedPayload', type: 'bytes', internalType: 'bytes' }],
  },
  {
    type: 'function',
    name: 'getStructHash',
    stateMutability: 'view',
    inputs: [
      { name: 'm', type: 'address', internalType: 'contract IClearMacro' },
      { name: 'encodedPayload', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [{ name: 'structHash', type: 'bytes32', internalType: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'getDigest',
    stateMutability: 'view',
    inputs: [
      { name: 'm', type: 'address', internalType: 'contract IClearMacro' },
      { name: 'encodedPayload', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [{ name: 'digest', type: 'bytes32', internalType: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'getTypeDefinition',
    stateMutability: 'view',
    inputs: [
      { name: 'm', type: 'address', internalType: 'contract IClearMacro' },
      { name: 'encodedPayload', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [{ name: 'typeDef', type: 'string', internalType: 'string' }],
  },
  {
    type: 'function',
    name: 'getPermit2WitnessStructHash',
    stateMutability: 'view',
    inputs: [
      { name: 'm', type: 'address', internalType: 'contract IClearMacro' },
      { name: 'encodedPayload', type: 'bytes', internalType: 'bytes' },
      { name: 'upgradeSuperToken', type: 'address', internalType: 'address' },
    ],
    outputs: [{ name: 'structHash', type: 'bytes32', internalType: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'getPermit2WitnessTypeString',
    stateMutability: 'view',
    inputs: [
      { name: 'm', type: 'address', internalType: 'contract IClearMacro' },
      { name: 'encodedPayload', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [{ name: 'typeString', type: 'string', internalType: 'string' }],
  },
] as const

const CLEAR_MACRO_METADATA_ABI = [
  {
    type: 'function',
    name: 'getPrimaryTypeName',
    stateMutability: 'view',
    inputs: [{ name: 'encodedPayload', type: 'bytes', internalType: 'bytes' }],
    outputs: [{ name: 'name', type: 'string', internalType: 'string' }],
  },
] as const

export function getClearMacroForwarderAddress(): Address | null {
  return addr((import.meta.env.VITE_CLEAR_MACRO_FORWARDER_ADDRESS as string) ?? '') ?? null
}

export function getClearMacroForwarderWithPermit2Address(): Address | null {
  return addr((import.meta.env.VITE_CLEAR_MACRO_FORWARDER_WITH_PERMIT2_ADDRESS as string) ?? '') ?? null
}

export async function isContractDeployed(address: Address, chainId: number): Promise<boolean> {
  const chain = config.chains.find((c) => c.id === chainId)
  const rpcUrl = chain?.rpcUrls?.default?.http?.[0]
  if (!rpcUrl) return false
  const client = createPublicClient({
    chain: chain!,
    transport: http(rpcUrl),
  })
  const code = await client.getBytecode({ address })
  return code != null && code.length > 2
}

export async function getClearMacroNonce(
  clearMacroForwarderAddress: Address,
  sender: Address,
  key: bigint,
  chainId: number
): Promise<bigint> {
  return readContract(config, {
    address: clearMacroForwarderAddress,
    abi: CLEAR_MACRO_FORWARDER_ABI,
    functionName: 'getNonce',
    args: [sender, key],
    chainId,
  })
}

/** ABI-encode `IClearMacroForwarderV1.Payload` via `encodeParams(actionParams, security)`. */
export async function encodeClearMacroPayload(
  clearMacroForwarderAddress: Address,
  actionParams: Hex,
  security: ClearMacroSecurity
): Promise<Hex> {
  const encodedPayload = await readContract(config, {
    address: clearMacroForwarderAddress,
    abi: CLEAR_MACRO_FORWARDER_ABI,
    functionName: 'encodeParams',
    args: [
      actionParams,
      {
        domain: security.domain,
        macroContract: security.macroContract,
        provider: security.provider,
        validAfter: security.validAfter,
        validBefore: security.validBefore,
        nonce: security.nonce,
      },
    ],
  })
  return encodedPayload as Hex
}

export async function getClearMacroPrimaryTypeName(
  clearMacroAddress: Address,
  encodedPayload: Hex
): Promise<string> {
  return readContract(config, {
    address: clearMacroAddress,
    abi: CLEAR_MACRO_METADATA_ABI,
    functionName: 'getPrimaryTypeName',
    args: [encodedPayload],
  })
}

export async function getClearMacroStructHash(
  clearMacroForwarderAddress: Address,
  clearMacroAddress: Address,
  encodedPayload: Hex
): Promise<Hex> {
  const structHash = await readContract(config, {
    address: clearMacroForwarderAddress,
    abi: CLEAR_MACRO_FORWARDER_ABI,
    functionName: 'getStructHash',
    args: [clearMacroAddress, encodedPayload],
  })
  return structHash as Hex
}

export async function getClearMacroDigest(
  clearMacroForwarderAddress: Address,
  clearMacroAddress: Address,
  encodedPayload: Hex
): Promise<Hex> {
  const digest = await readContract(config, {
    address: clearMacroForwarderAddress,
    abi: CLEAR_MACRO_FORWARDER_ABI,
    functionName: 'getDigest',
    args: [clearMacroAddress, encodedPayload],
  })
  return digest as Hex
}

export async function getClearMacroTypeDefinition(
  clearMacroForwarderAddress: Address,
  clearMacroAddress: Address,
  encodedPayload: Hex
): Promise<string> {
  return readContract(config, {
    address: clearMacroForwarderAddress,
    abi: CLEAR_MACRO_FORWARDER_ABI,
    functionName: 'getTypeDefinition',
    args: [clearMacroAddress, encodedPayload],
  })
}

export async function getClearMacroPermit2WitnessStructHash(
  clearMacroForwarderWithPermit2Address: Address,
  clearMacroAddress: Address,
  encodedPayload: Hex,
  upgradeSuperToken: Address
): Promise<Hex> {
  const structHash = await readContract(config, {
    address: clearMacroForwarderWithPermit2Address,
    abi: CLEAR_MACRO_FORWARDER_ABI,
    functionName: 'getPermit2WitnessStructHash',
    args: [clearMacroAddress, encodedPayload, upgradeSuperToken],
  })
  return structHash as Hex
}

export async function getClearMacroPermit2WitnessTypeString(
  clearMacroForwarderWithPermit2Address: Address,
  clearMacroAddress: Address,
  encodedPayload: Hex
): Promise<string> {
  return readContract(config, {
    address: clearMacroForwarderWithPermit2Address,
    abi: CLEAR_MACRO_FORWARDER_ABI,
    functionName: 'getPermit2WitnessTypeString',
    args: [clearMacroAddress, encodedPayload],
  })
}

export type ClearMacroUnsupportedReason =
  | 'clear_macro_forwarder_not_deployed'
  | 'clear_macro_not_configured'
  | 'clear_macro_forwarder_not_configured'

export interface ClearMacroForwarderConfig {
  clearMacroForwarderAddress: Address | null
  clearMacroForwarderWithPermit2Address: Address | null
  unsupportedReason?: ClearMacroUnsupportedReason
}

const NULL_FORWARDER_CONFIG: ClearMacroForwarderConfig = {
  clearMacroForwarderAddress: null,
  clearMacroForwarderWithPermit2Address: null,
}

/**
 * Resolves ClearMacro forwarder addresses from env and checks deployment on `chainId`.
 * When `VITE_CLEAR_MACRO_FORWARDER_WITH_PERMIT2_ADDRESS` is set, it is used for both
 * plain and Permit2 flows (the contract implements both interfaces).
 */
export async function getClearMacroForwarderConfigAsync(
  chainId: number
): Promise<ClearMacroForwarderConfig> {
  const forwarderAddr = getClearMacroForwarderAddress()
  const forwarderWithPermit2Addr = getClearMacroForwarderWithPermit2Address()
  if (!forwarderAddr && !forwarderWithPermit2Addr) {
    return { ...NULL_FORWARDER_CONFIG, unsupportedReason: 'clear_macro_forwarder_not_configured' }
  }

  const configuredForwarder = forwarderWithPermit2Addr ?? forwarderAddr
  const forwarderDeployed = configuredForwarder
    ? await isContractDeployed(configuredForwarder, chainId)
    : false
  if (!forwarderDeployed) {
    return { ...NULL_FORWARDER_CONFIG, unsupportedReason: 'clear_macro_forwarder_not_deployed' }
  }

  return {
    clearMacroForwarderAddress: configuredForwarder,
    clearMacroForwarderWithPermit2Address: forwarderWithPermit2Addr,
  }
}
