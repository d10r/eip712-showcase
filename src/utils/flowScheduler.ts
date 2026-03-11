import { readContract } from 'wagmi/actions'
import { type Address, type Hex } from 'viem'
import { config } from '../wagmi'

export const OP_SEPOLIA_CHAIN_ID = 11155420

const SECURITY_DOMAIN = 'flowscheduler.xyz'
const SECURITY_PROVIDER = 'macros.superfluid.eth'

/** Nonce key for FlowScheduler macro: uint192 derived from "FlowSchedulerMacro" */
export function flowSchedulerNonceKey(): bigint {
  /*
  const hash = keccak256(toBytes('FlowSchedulerMacro'))
  const hex = hash.slice(2)
  const bytes24 = hex.slice(hex.length - 48)
  return BigInt.asUintN(192, BigInt('0x' + bytes24))
  */
  // keep the number human-readable
  return BigInt(0);
}

export interface ScheduleFlowParams {
  superToken: Address
  receiver: Address
  startDate: number
  startMaxDelay: number
  flowRate: bigint
  startAmount: bigint
  endDate: number
  userData: `0x${string}`
}

export interface ScheduleFlowSecurity {
  domain: string
  provider: string
  validAfter: bigint
  validBefore: bigint
  nonce: bigint
}

/** Must match FlowScheduler712Macro._ACTION_TYPE_DEFINITION in usermacro-examples */
const ACTION_TYPE = [
  { name: 'description', type: 'string' },
  { name: 'superToken', type: 'address' },
  { name: 'receiver', type: 'address' },
  { name: 'startDate', type: 'uint32' },
  { name: 'startMaxDelay', type: 'uint32' },
  { name: 'flowRate', type: 'int96' },
  { name: 'startAmount', type: 'uint256' },
  { name: 'endDate', type: 'uint32' },
  { name: 'userData', type: 'bytes' },
] as const

export const EIP712_DOMAIN_NAME = 'ClearSigning'
export const EIP712_DOMAIN_VERSION = '1'

export function buildScheduleFlowTypedData(
  scheduleParams: ScheduleFlowParams,
  security: ScheduleFlowSecurity,
  description: string,
  chainId: number,
  verifyingContract: Address
) {
  const domain = {
    name: EIP712_DOMAIN_NAME,
    version: EIP712_DOMAIN_VERSION,
    chainId,
    verifyingContract,
  }
  console.log('[FlowScheduler] EIP-712 domain:', domain)

  const actionMessage = {
    description,
    superToken: scheduleParams.superToken,
    receiver: scheduleParams.receiver,
    startDate: scheduleParams.startDate,
    startMaxDelay: scheduleParams.startMaxDelay,
    flowRate: scheduleParams.flowRate,
    startAmount: scheduleParams.startAmount,
    endDate: scheduleParams.endDate,
    userData: scheduleParams.userData,
  }
  console.log('[FlowScheduler] EIP-712 message.action:', actionMessage)
  console.log('[FlowScheduler] EIP-712 message.security:', {
    domain: security.domain,
    provider: security.provider,
    validAfter: security.validAfter,
    validBefore: security.validBefore,
    nonce: security.nonce,
  })

  /** Must match ClearSigningMacroForwarder: PrimaryType(Action action, Security security) with nested Security */
  const message = {
    action: actionMessage,
    security: {
      domain: security.domain,
      provider: security.provider,
      validAfter: security.validAfter,
      validBefore: security.validBefore,
      nonce: security.nonce,
    },
  }
  const typedData = {
    domain,
    types: {
      ScheduleFlow: [
        { name: 'action', type: 'Action' },
        { name: 'security', type: 'Security' },
      ],
      Action: ACTION_TYPE,
      Security: [
        { name: 'domain', type: 'string' },
        { name: 'provider', type: 'string' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
      ],
    },
    primaryType: 'ScheduleFlow' as const,
    message,
  }
  console.log('[FlowScheduler] full typedData:', typedData)
  return typedData
}

const FLOW_SCHEDULER_712_MACRO_ABI = [
  {
    type: 'function',
    name: 'encodeCreateFlowScheduleParams',
    stateMutability: 'view',
    inputs: [
      { name: 'lang', type: 'bytes32', internalType: 'bytes32' },
      {
        name: 'cfsParams',
        type: 'tuple',
        internalType: 'struct FlowSchedulerMacro.CreateFlowScheduleParams',
        components: [
          { name: 'superToken', type: 'address', internalType: 'contract ISuperToken' },
          { name: 'receiver', type: 'address', internalType: 'address' },
          { name: 'startDate', type: 'uint32', internalType: 'uint32' },
          { name: 'startMaxDelay', type: 'uint32', internalType: 'uint32' },
          { name: 'flowRate', type: 'int96', internalType: 'int96' },
          { name: 'startAmount', type: 'uint256', internalType: 'uint256' },
          { name: 'endDate', type: 'uint32', internalType: 'uint32' },
          { name: 'userData', type: 'bytes', internalType: 'bytes' },
        ],
      },
    ],
    outputs: [
      { name: 'description', type: 'string', internalType: 'string' },
      { name: 'params', type: 'bytes', internalType: 'bytes' },
      { name: 'structHash', type: 'bytes32', internalType: 'bytes32' },
    ],
  },
] as const

const LANG_EN = '0x656e000000000000000000000000000000000000000000000000000000000000' as `0x${string}`

export async function getDescriptionAndParamsFromMacro(
  macroAddress: Address,
  scheduleParams: ScheduleFlowParams
): Promise<{ description: string; actionParams: Hex }> {
  console.log('[FlowScheduler] getDescriptionAndParamsFromMacro macro:', macroAddress)
  console.log('[FlowScheduler] getDescriptionAndParamsFromMacro scheduleParams:', JSON.stringify(scheduleParams, (_, v) => (typeof v === 'bigint' ? v.toString() : v)))
  const [description, actionParamsBytes, structHash] = await readContract(config, {
    address: macroAddress,
    abi: FLOW_SCHEDULER_712_MACRO_ABI,
    functionName: 'encodeCreateFlowScheduleParams',
    args: [
      LANG_EN,
      {
        superToken: scheduleParams.superToken,
        receiver: scheduleParams.receiver,
        startDate: scheduleParams.startDate,
        startMaxDelay: scheduleParams.startMaxDelay,
        flowRate: scheduleParams.flowRate,
        startAmount: scheduleParams.startAmount,
        endDate: scheduleParams.endDate,
        userData: scheduleParams.userData,
      },
    ],
  })
  console.log('[FlowScheduler] macro returned description:', description)
  const apHex = String(actionParamsBytes)
  console.log('[FlowScheduler] macro returned actionParams length:', apHex.length, 'hex (first 66 chars):', apHex.slice(0, 66) + (apHex.length > 66 ? '...' : ''))
  console.log('[FlowScheduler] macro returned action structHash:', structHash)
  return { description, actionParams: actionParamsBytes as Hex }
}

/** Security struct for ClearSigning payload - must match IClearSigningForwarder.Security */
const SECURITY_ABI_COMPONENTS = [
  { name: 'domain', type: 'string', internalType: 'string' },
  { name: 'provider', type: 'string', internalType: 'string' },
  { name: 'validAfter', type: 'uint256', internalType: 'uint256' },
  { name: 'validBefore', type: 'uint256', internalType: 'uint256' },
  { name: 'nonce', type: 'uint256', internalType: 'uint256' },
] as const

const ONLY712_FORWARDER_ABI = [
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
      { name: 'params', type: 'bytes', internalType: 'bytes' },
      {
        name: 'security',
        type: 'tuple',
        internalType: 'struct IClearSigningForwarder.Security',
        components: [...SECURITY_ABI_COMPONENTS],
      },
    ],
    outputs: [{ name: '', type: 'bytes', internalType: 'bytes' }],
  },
  {
    type: 'function',
    name: 'getStructHash',
    stateMutability: 'view',
    inputs: [
      { name: 'm', type: 'address', internalType: 'contract IClearSigningMacro' },
      { name: 'params', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [{ name: '', type: 'bytes32', internalType: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'getTypeDefinition',
    stateMutability: 'view',
    inputs: [
      { name: 'm', type: 'address', internalType: 'contract IClearSigningMacro' },
      { name: 'params', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [{ name: '', type: 'string', internalType: 'string' }],
  },
  {
    type: 'function',
    name: 'getPermit2WitnessStructHash',
    stateMutability: 'view',
    inputs: [
      { name: 'm', type: 'address', internalType: 'contract IClearSigningMacro' },
      { name: 'params', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [{ name: '', type: 'bytes32', internalType: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'getPermit2WitnessTypeString',
    stateMutability: 'view',
    inputs: [
      { name: 'm', type: 'address', internalType: 'contract IClearSigningMacro' },
      { name: 'params', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [{ name: '', type: 'string', internalType: 'string' }],
  },
] as const

export async function getNextNonce(forwarderAddress: Address, sender: Address): Promise<bigint> {
  const key = flowSchedulerNonceKey()
  const nonce = await readContract(config, {
    address: forwarderAddress,
    abi: ONLY712_FORWARDER_ABI,
    functionName: 'getNonce',
    args: [sender, key],
  })
  return nonce
}

/**
 * Encode the full payload for runMacro using the forwarder's encodeParams.
 * actionParams come from the macro (e.g. second return value of encodeCreateFlowScheduleParams).
 */
export async function getRunMacroParams(
  forwarderAddress: Address,
  actionParams: Hex,
  security: ScheduleFlowSecurity
): Promise<Hex> {
  console.log('[FlowScheduler] getRunMacroParams forwarder:', forwarderAddress)
  const payload = await readContract(config, {
    address: forwarderAddress,
    abi: ONLY712_FORWARDER_ABI,
    functionName: 'encodeParams',
    args: [
      actionParams,
      {
        domain: security.domain,
        provider: security.provider,
        validAfter: security.validAfter,
        validBefore: security.validBefore,
        nonce: security.nonce,
      },
    ],
  })
  const pHex = String(payload)
  console.log('[FlowScheduler] encodeParams returned payload length:', pHex.length, 'hex (first 66):', pHex.slice(0, 66) + (pHex.length > 66 ? '...' : ''))
  return payload as Hex
}

export function getFlowSchedulerConfig(chainId: number): {
  forwarderAddress: Address | null
  permit2ForwarderAddress: Address | null
  macroAddress: Address | null
} {
  if (chainId !== OP_SEPOLIA_CHAIN_ID) {
    return { forwarderAddress: null, permit2ForwarderAddress: null, macroAddress: null }
  }
  const forwarder = import.meta.env.VITE_OP_SEPOLIA_ONLY712_FORWARDER_ADDRESS as string | undefined
  const permit2Forwarder = import.meta.env.VITE_OP_SEPOLIA_PERMIT2_MACRO_FORWARDER_ADDRESS as string | undefined
  const macro = import.meta.env.VITE_OP_SEPOLIA_FLOW_SCHEDULER_712_MACRO_ADDRESS as string | undefined
  const addr = (a: string) => (/^0x[a-fA-F0-9]{40}$/.test(a) ? (a as Address) : null)
  return {
    forwarderAddress: addr(forwarder ?? ''),
    permit2ForwarderAddress: addr(permit2Forwarder ?? '') ?? (forwarder ? addr(forwarder) : null),
    macroAddress: addr(macro ?? ''),
  }
}

/**
 * Fetches the struct hash for the ClearSigning payload from the forwarder.
 */
export async function getStructHash(
  forwarderAddress: Address,
  macroAddress: Address,
  params: Hex
): Promise<Hex> {
  const structHash = await readContract(config, {
    address: forwarderAddress,
    abi: ONLY712_FORWARDER_ABI,
    functionName: 'getStructHash',
    args: [macroAddress, params],
  })
  return structHash as Hex
}

/**
 * Fetches the Permit2 witness struct hash from the forwarder (Permit2ClearSigningMacroForwarder).
 * Uses constant "ClearSigning" type name for deterministic ordering.
 */
export async function getPermit2WitnessStructHash(
  forwarderAddress: Address,
  macroAddress: Address,
  params: Hex
): Promise<Hex> {
  console.log('[FlowScheduler] getPermit2WitnessStructHash forwarder:', forwarderAddress, 'macro:', macroAddress)
  const structHash = await readContract(config, {
    address: forwarderAddress,
    abi: ONLY712_FORWARDER_ABI,
    functionName: 'getPermit2WitnessStructHash',
    args: [macroAddress, params],
  })
  console.log('[FlowScheduler] getPermit2WitnessStructHash returned:', structHash)
  return structHash as Hex
}

/**
 * Fetches the Permit2 witness type string from the forwarder (Permit2ClearSigningMacroForwarder).
 * Uses constant "ClearSigning" for deterministic alphabetical ordering.
 */
export async function getPermit2WitnessTypeString(
  forwarderAddress: Address,
  macroAddress: Address,
  params: Hex
): Promise<string> {
  const result = await readContract(config, {
    address: forwarderAddress,
    abi: ONLY712_FORWARDER_ABI,
    functionName: 'getPermit2WitnessTypeString',
    args: [macroAddress, params],
  })
  console.log('[FlowScheduler] getPermit2WitnessTypeString length:', result.length, 'preview:', result.slice(0, 120) + '...')
  return result
}

/**
 * Fetches the type definition from the forwarder for building the witness type string.
 */
export async function getTypeDefinition(
  forwarderAddress: Address,
  macroAddress: Address,
  params: Hex
): Promise<string> {
  const result = await readContract(config, {
    address: forwarderAddress,
    abi: ONLY712_FORWARDER_ABI,
    functionName: 'getTypeDefinition',
    args: [macroAddress, params],
  })
  console.log('[FlowScheduler] getTypeDefinition:', result)
  return result
}

/** Minimal ABI for fetching underlying token from SuperToken */
const SUPERTOKEN_UNDERLYING_ABI = [
  {
    type: 'function',
    name: 'getUnderlyingToken',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
  },
] as const

/** Minimal ABI for ERC20 decimals */
const ERC20_DECIMALS_ABI = [
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8', internalType: 'uint8' }],
  },
] as const

export async function getUnderlyingToken(superTokenAddress: Address): Promise<Address | null> {
  const underlying = await readContract(config, {
    address: superTokenAddress,
    abi: SUPERTOKEN_UNDERLYING_ABI,
    functionName: 'getUnderlyingToken',
  })
  if (!underlying || underlying === '0x0000000000000000000000000000000000000000') return null
  return underlying as Address
}

export async function getTokenDecimals(tokenAddress: Address): Promise<number> {
  const decimals = await readContract(config, {
    address: tokenAddress,
    abi: ERC20_DECIMALS_ABI,
    functionName: 'decimals',
  })
  return Number(decimals)
}

export { SECURITY_DOMAIN, SECURITY_PROVIDER }
