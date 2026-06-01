import { readContract } from 'wagmi/actions'
import { type Address, type Hex } from 'viem'
import { config } from '../wagmi'
import sfMetadata from '@superfluid-finance/metadata'
import {
  CLEARMACRO_EIP712_DOMAIN_NAME,
  CLEARMACRO_EIP712_DOMAIN_VERSION,
  type ClearMacroSecurity,
  encodeClearMacroPayload,
  getClearMacroForwarderConfigAsync,
  getClearMacroNonce,
  getClearMacroPermit2WitnessStructHash,
  getClearMacroPermit2WitnessTypeString,
  getClearMacroPrimaryTypeName,
  getClearMacroStructHash,
  getClearMacroTypeDefinition,
  type ClearMacroForwarderConfig,
  type ClearMacroUnsupportedReason,
} from './clearMacro'

export {
  CLEARMACRO_EIP712_DOMAIN_NAME,
  CLEARMACRO_EIP712_DOMAIN_VERSION,
  encodeClearMacroPayload,
  getClearMacroStructHash,
  getClearMacroPermit2WitnessStructHash,
  getClearMacroPermit2WitnessTypeString,
  getClearMacroTypeDefinition,
  type ClearMacroSecurity,
  type ClearMacroForwarderConfig,
  type ClearMacroUnsupportedReason,
}

export const FLOW_SCHEDULER_SECURITY_DOMAIN = 'flowscheduler.xyz'
export const FLOW_SCHEDULER_SECURITY_PROVIDER = 'macros.superfluid.eth'

/** Nonce key for FlowScheduler ClearMacro payloads (uint192). */
export function flowSchedulerClearMacroNonceKey(): bigint {
  return 0n
}

export interface FlowSchedulerActionParams {
  superToken: Address
  receiver: Address
  startDate: number
  startMaxDelay: number
  flowRate: bigint
  startAmount: bigint
  endDate: number
  userData: `0x${string}`
}

/** Must match FlowScheduler ClearMacro `Action(...)` type definition. */
const FLOW_SCHEDULER_ACTION_TYPE = [
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

const CLEAR_MACRO_SECURITY_TYPE = [
  { name: 'domain', type: 'string' },
  { name: 'macroContract', type: 'address' },
  { name: 'provider', type: 'string' },
  { name: 'validAfter', type: 'uint256' },
  { name: 'validBefore', type: 'uint256' },
  { name: 'nonce', type: 'uint256' },
] as const

const FLOW_SCHEDULER_CLEAR_MACRO_ABI = [
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
      { name: 'actionParams', type: 'bytes', internalType: 'bytes' },
      { name: 'structHash', type: 'bytes32', internalType: 'bytes32' },
    ],
  },
] as const

const LANG_EN = '0x656e000000000000000000000000000000000000000000000000000000000000' as `0x${string}`

function getFlowSchedulerClearMacroAddressFromEnv(chainId: number): Address | null {
  const addrRegex = /^0x[a-fA-F0-9]{40}$/
  const metadata = sfMetadata as {
    getNetworkByChainId?: (chainId: number) => { uppercaseName?: string } | undefined
    networks?: { chainId: number; uppercaseName?: string }[]
  }
  const network = metadata.getNetworkByChainId?.(chainId) ?? metadata.networks?.find((n) => n.chainId === chainId)
  const env = import.meta.env as Record<string, string | undefined>
  const tryKey = (key: string) => {
    const v = env[key] ?? ''
    return addrRegex.test(v) ? (v as Address) : null
  }
  const keysToTry = [
    `VITE_${chainId}_FLOW_SCHEDULER_CLEAR_MACRO_ADDRESS`,
    ...(network?.uppercaseName ? [`VITE_${network.uppercaseName}_FLOW_SCHEDULER_CLEAR_MACRO_ADDRESS`] : []),
  ]
  for (const key of keysToTry) {
    const a = tryKey(key)
    if (a) return a
  }
  return null
}

export async function encodeFlowSchedulerActionParams(
  flowSchedulerClearMacroAddress: Address,
  action: FlowSchedulerActionParams
): Promise<{ description: string; actionParams: Hex }> {
  const [description, actionParamsBytes] = await readContract(config, {
    address: flowSchedulerClearMacroAddress,
    abi: FLOW_SCHEDULER_CLEAR_MACRO_ABI,
    functionName: 'encodeCreateFlowScheduleParams',
    args: [
      LANG_EN,
      {
        superToken: action.superToken,
        receiver: action.receiver,
        startDate: action.startDate,
        startMaxDelay: action.startMaxDelay,
        flowRate: action.flowRate,
        startAmount: action.startAmount,
        endDate: action.endDate,
        userData: action.userData,
      },
    ],
  })
  return { description, actionParams: actionParamsBytes as Hex }
}

export async function buildFlowSchedulerClearMacroTypedData(
  action: FlowSchedulerActionParams,
  security: ClearMacroSecurity,
  description: string,
  encodedPayload: Hex,
  flowSchedulerClearMacroAddress: Address,
  chainId: number,
  clearMacroForwarderAddress: Address
) {
  const primaryType = await getClearMacroPrimaryTypeName(flowSchedulerClearMacroAddress, encodedPayload)
  const domain = {
    name: CLEARMACRO_EIP712_DOMAIN_NAME,
    version: CLEARMACRO_EIP712_DOMAIN_VERSION,
    chainId,
    verifyingContract: clearMacroForwarderAddress,
  }
  const actionMessage = {
    description,
    superToken: action.superToken,
    receiver: action.receiver,
    startDate: action.startDate,
    startMaxDelay: action.startMaxDelay,
    flowRate: action.flowRate,
    startAmount: action.startAmount,
    endDate: action.endDate,
    userData: action.userData,
  }
  const message = {
    action: actionMessage,
    security: {
      domain: security.domain,
      macroContract: security.macroContract,
      provider: security.provider,
      validAfter: security.validAfter,
      validBefore: security.validBefore,
      nonce: security.nonce,
    },
  }
  return {
    domain,
    types: {
      [primaryType]: [
        { name: 'action', type: 'Action' },
        { name: 'security', type: 'Security' },
      ],
      Action: FLOW_SCHEDULER_ACTION_TYPE,
      Security: CLEAR_MACRO_SECURITY_TYPE,
    },
    primaryType,
    message,
  } as const
}

export type FlowSchedulerClearMacroUnsupportedReason =
  | ClearMacroUnsupportedReason
  | 'flow_scheduler_clear_macro_not_configured'

export interface FlowSchedulerClearMacroConfig {
  clearMacroForwarderAddress: Address | null
  clearMacroForwarderWithPermit2Address: Address | null
  flowSchedulerClearMacroAddress: Address | null
  unsupportedReason?: FlowSchedulerClearMacroUnsupportedReason
}

const NULL_CONFIG: FlowSchedulerClearMacroConfig = {
  clearMacroForwarderAddress: null,
  clearMacroForwarderWithPermit2Address: null,
  flowSchedulerClearMacroAddress: null,
}

export async function getFlowSchedulerClearMacroConfigAsync(
  chainId: number
): Promise<FlowSchedulerClearMacroConfig> {
  const forwarderConfig = await getClearMacroForwarderConfigAsync(chainId)
  if (forwarderConfig.unsupportedReason) {
    return { ...NULL_CONFIG, unsupportedReason: forwarderConfig.unsupportedReason }
  }

  const flowSchedulerClearMacroAddress = getFlowSchedulerClearMacroAddressFromEnv(chainId)
  return {
    ...forwarderConfig,
    flowSchedulerClearMacroAddress,
    ...(flowSchedulerClearMacroAddress == null && {
      unsupportedReason: 'flow_scheduler_clear_macro_not_configured' as const,
    }),
  }
}

export async function getFlowSchedulerNextNonce(
  clearMacroForwarderAddress: Address,
  sender: Address,
  chainId: number
): Promise<bigint> {
  return getClearMacroNonce(
    clearMacroForwarderAddress,
    sender,
    flowSchedulerClearMacroNonceKey(),
    chainId
  )
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
