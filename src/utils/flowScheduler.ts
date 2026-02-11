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

const SECURITY_TYPE = [
  { name: 'domain', type: 'string' },
  { name: 'provider', type: 'string' },
  { name: 'validAfter', type: 'uint256' },
  { name: 'validBefore', type: 'uint256' },
  { name: 'nonce', type: 'uint256' },
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
  const securityMessage = {
    domain: security.domain,
    provider: security.provider,
    validAfter: security.validAfter,
    validBefore: security.validBefore,
    nonce: security.nonce,
  }
  console.log('[FlowScheduler] EIP-712 message.action:', actionMessage)
  console.log('[FlowScheduler] EIP-712 message.security:', securityMessage)

  const message = {
    action: actionMessage,
    security: securityMessage,
  }
  const typedData = {
    domain,
    types: {
      ScheduleFlow: [
        { name: 'action', type: 'Action' },
        { name: 'security', type: 'Security' },
      ],
      Action: ACTION_TYPE,
      Security: SECURITY_TYPE,
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
  console.log('[FlowScheduler] fetching description and actionParams from macro:', macroAddress, 'scheduleParams:', scheduleParams)
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
  console.log('[FlowScheduler] macro returned description:', description, 'actionParams length:', actionParamsBytes.length, 'action structHash:', structHash)
  return { description, actionParams: actionParamsBytes as Hex }
}

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
      { name: 'actionParams', type: 'bytes', internalType: 'bytes' },
      {
        name: 'security',
        type: 'tuple',
        internalType: 'struct Only712MacroForwarder.SecurityType',
        components: [
          { name: 'domain', type: 'string', internalType: 'string' },
          { name: 'provider', type: 'string', internalType: 'string' },
          { name: 'validAfter', type: 'uint256', internalType: 'uint256' },
          { name: 'validBefore', type: 'uint256', internalType: 'uint256' },
          { name: 'nonce', type: 'uint256', internalType: 'uint256' },
        ],
      },
    ],
    outputs: [{ name: '', type: 'bytes', internalType: 'bytes' }],
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
  return payload as Hex
}

export function getFlowSchedulerConfig(chainId: number): {
  forwarderAddress: Address | null
  macroAddress: Address | null
} {
  if (chainId !== OP_SEPOLIA_CHAIN_ID) {
    return { forwarderAddress: null, macroAddress: null }
  }
  const forwarder = import.meta.env.VITE_OP_SEPOLIA_ONLY712_FORWARDER_ADDRESS as string | undefined
  const macro = import.meta.env.VITE_OP_SEPOLIA_FLOW_SCHEDULER_712_MACRO_ADDRESS as string | undefined
  return {
    forwarderAddress: forwarder && /^0x[a-fA-F0-9]{40}$/.test(forwarder) ? (forwarder as Address) : null,
    macroAddress: macro && /^0x[a-fA-F0-9]{40}$/.test(macro) ? (macro as Address) : null,
  }
}

export { SECURITY_DOMAIN, SECURITY_PROVIDER }
