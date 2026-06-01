import type { Address } from 'viem'

/** Canonical Permit2 address (same on most mainnets) */
export const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as Address

/** Permit2 EIP-712 domain (no version - Permit2 uses EIP712Domain(string name,uint256 chainId,address verifyingContract)) */
export const PERMIT2_DOMAIN_NAME = 'Permit2'

/** TokenPermissions type for Permit2 */
export const TOKEN_PERMISSIONS_TYPE = [
  { name: 'token', type: 'address' as const },
  { name: 'amount', type: 'uint256' as const },
]

export interface Permit2WitnessTypedDataParams {
  /** Full witness message object for EIP-712 signing (ClearMacro with nested Action and Security). */
  witnessMessage: Record<string, unknown>
  /** Primary type name of the witness — always `ClearMacro` for IClearMacroPermit2Extension. */
  witnessPrimaryType: string
  /** Full EIP-712 types for the witness and its dependencies */
  witnessTypes: Record<string, readonly { name: string; type: string }[]>
  /** Witness type string for Permit2 contract (from forwarder.getPermit2WitnessTypeString) */
  witnessTypeString: string
  token: Address
  amount: bigint
  spender: Address
  nonce: bigint
  deadline: bigint
  permit2Address: Address
  chainId: number
}

export interface PermitWitnessTransferFromTypedData {
  domain: {
    name: string
    chainId: number
    verifyingContract: Address
  }
  types: Record<string, readonly { name: string; type: string }[]>
  primaryType: 'PermitWitnessTransferFrom'
  message: {
    permitted: { token: Address; amount: bigint }
    spender: Address
    nonce: bigint
    deadline: bigint
    witness: Record<string, unknown>
  }
}

/**
 * Builds EIP-712 typed data for Permit2's PermitWitnessTransferFrom with a ClearMacro witness.
 * The witness is embedded as the full struct (for signing); the contract receives witnessStructHash.
 * For ClearMacro + Permit2, use witnessPrimaryType `ClearMacro` and witness fields
 * `(address upgradeSuperToken, Action action, Security security)`.
 */
export function buildPermit2WitnessTypedData(
  params: Permit2WitnessTypedDataParams
): PermitWitnessTransferFromTypedData {
  const {
    witnessMessage,
    witnessPrimaryType,
    witnessTypes,
    token,
    amount,
    spender,
    nonce,
    deadline,
    permit2Address,
    chainId,
  } = params

  const domain = {
    name: PERMIT2_DOMAIN_NAME,
    chainId,
    verifyingContract: permit2Address,
  }

  const types: Record<string, readonly { name: string; type: string }[]> = {
    PermitWitnessTransferFrom: [
      { name: 'permitted', type: 'TokenPermissions' },
      { name: 'spender', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'witness', type: witnessPrimaryType },
    ],
    TokenPermissions: [...TOKEN_PERMISSIONS_TYPE],
    ...witnessTypes,
  }

  const message = {
    permitted: { token, amount },
    spender,
    nonce,
    deadline,
    witness: witnessMessage,
  }

  console.log('[permit2Witness] buildPermit2WitnessTypedData domain:', domain)
  console.log('[permit2Witness] buildPermit2WitnessTypedData message.permitted:', { token, amount: amount.toString() })
  console.log('[permit2Witness] buildPermit2WitnessTypedData message.spender:', spender)
  console.log('[permit2Witness] buildPermit2WitnessTypedData message.nonce:', nonce.toString(), 'deadline:', deadline.toString())
  console.log('[permit2Witness] buildPermit2WitnessTypedData message.witness:', witnessMessage)
  console.log('[permit2Witness] buildPermit2WitnessTypedData witnessPrimaryType:', witnessPrimaryType, 'witnessTypes keys:', Object.keys(witnessTypes))

  return {
    domain,
    types,
    primaryType: 'PermitWitnessTransferFrom',
    message,
  }
}

export interface Permit2Config {
  permit2Address: Address | null
}

/** Get Permit2 config for a chain */
export function getPermit2Config(_chainId: number): Permit2Config {
  const permit2 = import.meta.env.VITE_PERMIT2_ADDRESS as string | undefined
  const addrRegex = /^0x[a-fA-F0-9]{40}$/
  return {
    permit2Address: permit2 && addrRegex.test(permit2) ? (permit2 as Address) : PERMIT2_ADDRESS,
  }
}
