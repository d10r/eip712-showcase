import { useState } from 'react'
import { useAccount, useChainId, useReadContract } from 'wagmi'
import { writeContract, waitForTransactionReceipt } from 'wagmi/actions'
import { config } from '../wagmi'
import { PermitParameters, TokenMetadata } from '../utils/permit'
import { useFlowSchedulerConfig } from '../hooks/useFlowSchedulerConfig'
import { getPermit2Config } from '../utils/permit2Witness'
import type { FlowSchedulerSignatureResult } from './FlowSchedulerForm'
import sfMetadata from '@superfluid-finance/metadata'

const relayerUrl = (): string | null => {
  const url = import.meta.env.VITE_RELAYER_URL
  return typeof url === 'string' && url.trim() !== '' ? url.trim().replace(/\/$/, '') : null
}

// ClearSigningMacroForwarder.runMacro (for FlowScheduler "Execute" via wallet)
const RUN_MACRO_ABI = [
  {
    type: 'function',
    name: 'runMacro',
    stateMutability: 'payable',
    inputs: [
      { name: 'm', type: 'address', internalType: 'contract IClearSigningMacro' },
      { name: 'params', type: 'bytes', internalType: 'bytes' },
      { name: 'signer', type: 'address', internalType: 'address' },
      { name: 'signature', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const

// Permit2ClearSigningMacroForwarder.runPermit2AndMacro - Permit2 + macro execution
const RUN_PERMIT2_AND_MACRO_ABI = [
  {
    type: 'function',
    name: 'runPermit2AndMacro',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'p',
        type: 'tuple',
        internalType: 'struct Permit2ClearSigningMacroForwarder.Permit2MacroParams',
        components: [
          {
            name: 'permit',
            type: 'tuple',
            internalType: 'struct IPermit2.PermitTransferFrom',
            components: [
              {
                name: 'permitted',
                type: 'tuple',
                internalType: 'struct IPermit2.TokenPermissions',
                components: [
                  { name: 'token', type: 'address', internalType: 'address' },
                  { name: 'amount', type: 'uint256', internalType: 'uint256' },
                ],
              },
              { name: 'nonce', type: 'uint256', internalType: 'uint256' },
              { name: 'deadline', type: 'uint256', internalType: 'uint256' },
            ],
          },
          {
            name: 'transferDetails',
            type: 'tuple',
            internalType: 'struct IPermit2.SignatureTransferDetails',
            components: [
              { name: 'to', type: 'address', internalType: 'address' },
              { name: 'requestedAmount', type: 'uint256', internalType: 'uint256' },
            ],
          },
          { name: 'owner', type: 'address', internalType: 'address' },
          { name: 'witness', type: 'bytes32', internalType: 'bytes32' },
          { name: 'witnessTypeString', type: 'string', internalType: 'string' },
          { name: 'signature', type: 'bytes', internalType: 'bytes' },
          { name: 'spender', type: 'address', internalType: 'address' },
          { name: 'upgradeSuperToken', type: 'address', internalType: 'address' },
        ],
      },
      { name: 'm', type: 'address', internalType: 'contract IClearSigningMacro' },
      { name: 'params', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const

// ERC20 ABI for permit, allowance, and approve
const ERC20_ABI = [
  {
    name: 'permit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' }
    ],
    outputs: []
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    outputs: [{ type: 'uint256' }]
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ type: 'bool' }]
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }]
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }]
  },
] as const

// Mintable token (e.g. test tokens)
const MINT_ABI = [
  {
    name: 'mint',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ type: 'bool' }]
  },
] as const

const MAX_UINT256 = 2n ** 256n - 1n
const MINT_AMOUNT_WHOLE_TOKENS = 1_000_000

// Helper function to split a signature into v, r, s components
const splitSignature = (signature: string) => {
  const signatureHex = signature.startsWith('0x') ? signature.slice(2) : signature;
  
  // A signature is 65 bytes: r (32 bytes) + s (32 bytes) + v (1 byte)
  const r = `0x${signatureHex.slice(0, 64)}` as `0x${string}`;
  const s = `0x${signatureHex.slice(64, 128)}` as `0x${string}`;
  const v = parseInt(signatureHex.slice(128, 130), 16);
  
  return { r, s, v };
};

interface SignatureDisplayProps {
  signature: string | null
  permitParams?: PermitParameters
  tokenMetadata?: TokenMetadata
  flowSchedulerResult?: FlowSchedulerSignatureResult
}

const SignatureDisplay: React.FC<SignatureDisplayProps> = ({
  signature,
  permitParams,
  tokenMetadata,
  flowSchedulerResult,
}) => {
  const { address } = useAccount()
  const chainId = useChainId()
  const { config: flowSchedulerConfig } = useFlowSchedulerConfig(chainId ?? undefined)
  const [isLoading, setIsLoading] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!signature) return null

  const isFlowScheduler = !!flowSchedulerResult
  const hasPermit2 = !!(flowSchedulerResult?.permit2)
  const permit2Config = chainId != null ? getPermit2Config(chainId) : { permit2Address: null }

  const canExecuteFlowScheduler =
    isFlowScheduler &&
    !!flowSchedulerResult?.params &&
    !!address &&
    !!flowSchedulerConfig.forwarderAddress &&
    !!flowSchedulerConfig.macroAddress &&
    chainId != null

  const canExecuteClearSigningOnly = canExecuteFlowScheduler && !hasPermit2

  const permit2Forwarder = flowSchedulerConfig.permit2ForwarderAddress ?? flowSchedulerConfig.forwarderAddress
  const canExecutePermit2AndMacro =
    hasPermit2 &&
    !!flowSchedulerResult?.permit2 &&
    !!address &&
    !!permit2Config.permit2Address &&
    !!permit2Forwarder &&
    !!flowSchedulerConfig.macroAddress &&
    !!flowSchedulerResult?.scheduleParams?.superToken &&
    chainId != null &&
    flowSchedulerResult.permit2.spender.toLowerCase() === permit2Forwarder!.toLowerCase()

  const permit2Token = hasPermit2 && flowSchedulerResult?.permit2 ? flowSchedulerResult.permit2.permit.token as `0x${string}` : undefined

  const { data: underlyingBalance, refetch: refetchUnderlyingBalance } = useReadContract({
    address: hasPermit2 && flowSchedulerResult?.permit2 && address ? permit2Token : undefined,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: hasPermit2 && address ? [address as `0x${string}`] : undefined,
  })

  const { data: tokenDecimals } = useReadContract({
    address: hasPermit2 && flowSchedulerResult?.permit2 ? permit2Token : undefined,
    abi: ERC20_ABI,
    functionName: 'decimals',
  })

  const permit2Amount = flowSchedulerResult?.permit2?.permit.amount ?? 0n
  const hasUnderlyingBalance = underlyingBalance != null && underlyingBalance >= permit2Amount
  const needsUnderlyingBalance = canExecutePermit2AndMacro && !hasUnderlyingBalance && permit2Amount > 0n
  const mintAmount = tokenDecimals != null ? BigInt(MINT_AMOUNT_WHOLE_TOKENS) * 10n ** BigInt(tokenDecimals) : 10n ** 18n * BigInt(MINT_AMOUNT_WHOLE_TOKENS)

  const { data: permit2Allowance, refetch: refetchPermit2Allowance } = useReadContract({
    address: hasPermit2 && flowSchedulerResult?.permit2 && address && permit2Config.permit2Address
      ? permit2Token
      : undefined,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args:
      hasPermit2 && address && permit2Config.permit2Address
        ? [address as `0x${string}`, permit2Config.permit2Address as `0x${string}`]
        : undefined,
  })

  const hasPermit2Allowance = permit2Allowance != null && permit2Allowance >= permit2Amount
  const needsPermit2Approval = canExecutePermit2AndMacro && !hasPermit2Allowance && permit2Amount > 0n

  const canExecuteViaRelayer = canExecuteFlowScheduler && relayerUrl() != null

  const executePermit = async () => {
    if (!address || !permitParams || !signature) {
      setError('Missing required data')
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      setTxHash(null)

      // Split the signature into v, r, s components
      const { v, r, s } = splitSignature(signature)

      console.log('Executing permit with params:', {
        owner: permitParams.owner,
        spender: permitParams.spender,
        value: permitParams.value,
        deadline: permitParams.deadline,
        v, r, s
      })

      // Execute the permit transaction using Wagmi's writeContract
      const hash = await writeContract(config, {
        address: permitParams.tokenAddress,
        abi: ERC20_ABI,
        functionName: 'permit',
        args: [
          permitParams.owner,
          permitParams.spender,
          permitParams.value,
          permitParams.deadline,
          v,
          r,
          s
        ],
        chainId: permitParams.chainId
      })

      setTxHash(hash)
      
      // Wait for transaction to be mined
      await waitForTransactionReceipt(config, { hash })
      console.log('Transaction confirmed:', hash)
      
    } catch (err) {
      console.error('Transaction error:', err)
      setError(err instanceof Error ? err.message : 'Transaction failed')
    } finally {
      setIsLoading(false)
    }
  }

  const executeFlowScheduler = async () => {
    if (!flowSchedulerResult?.params || !address || !flowSchedulerConfig.forwarderAddress || !flowSchedulerConfig.macroAddress || chainId == null) return
    try {
      setIsLoading(true)
      setError(null)
      setTxHash(null)
      const sig = flowSchedulerResult.signature
      const signatureHex = sig.startsWith('0x') ? sig : `0x${sig}`
      const hash = await writeContract(config, {
        address: flowSchedulerConfig.forwarderAddress,
        abi: RUN_MACRO_ABI,
        functionName: 'runMacro',
        args: [
          flowSchedulerConfig.macroAddress,
          flowSchedulerResult.params,
          address,
          signatureHex as `0x${string}`,
        ],
        chainId,
      })
      setTxHash(hash)
      await waitForTransactionReceipt(config, { hash })
      console.log('[FlowScheduler] runMacro confirmed:', hash)
    } catch (err) {
      console.error('runMacro error:', err)
      setError(err instanceof Error ? err.message : 'Transaction failed')
    } finally {
      setIsLoading(false)
    }
  }

  const mintUnderlying = async () => {
    if (!flowSchedulerResult?.permit2 || !address || chainId == null) return
    try {
      setIsLoading(true)
      setError(null)
      const hash = await writeContract(config, {
        address: flowSchedulerResult.permit2.permit.token as `0x${string}`,
        abi: MINT_ABI,
        functionName: 'mint',
        args: [address as `0x${string}`, mintAmount],
        chainId,
      })
      await waitForTransactionReceipt(config, { hash })
      // Brief delay so RPC has propagated the new balance
      await new Promise((r) => setTimeout(r, 1500))
      await refetchUnderlyingBalance()
    } catch (err) {
      console.error('Mint error:', err)
      setError(err instanceof Error ? err.message : 'Mint failed')
    } finally {
      setIsLoading(false)
    }
  }

  const approvePermit2 = async () => {
    if (
      !flowSchedulerResult?.permit2 ||
      !address ||
      !permit2Config.permit2Address ||
      chainId == null
    )
      return
    try {
      setIsLoading(true)
      setError(null)
      const hash = await writeContract(config, {
        address: flowSchedulerResult.permit2.permit.token as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [permit2Config.permit2Address as `0x${string}`, MAX_UINT256],
        chainId,
      })
      await waitForTransactionReceipt(config, { hash })
      refetchPermit2Allowance()
    } catch (err) {
      console.error('Permit2 approval error:', err)
      setError(err instanceof Error ? err.message : 'Approval failed')
    } finally {
      setIsLoading(false)
    }
  }

  const executePermit2AndMacro = async () => {
    if (
      !flowSchedulerResult?.permit2 ||
      !flowSchedulerResult?.params ||
      !flowSchedulerResult?.scheduleParams?.superToken ||
      !address ||
      !permit2Config.permit2Address ||
      !permit2Forwarder ||
      !flowSchedulerConfig.macroAddress ||
      chainId == null
    )
      return
    const { permit, transferDetails, witnessStructHash, witnessTypeString } = flowSchedulerResult.permit2
    const sig = flowSchedulerResult.signature
    const signatureHex = (sig.startsWith('0x') ? sig : `0x${sig}`) as `0x${string}`
    const upgradeSuperToken = flowSchedulerResult.scheduleParams.superToken as `0x${string}`
    console.log('[SignatureDisplay] executePermit2AndMacro caller (owner):', address)
    console.log('[SignatureDisplay] executePermit2AndMacro permit2Forwarder (spender):', permit2Forwarder)
    console.log('[SignatureDisplay] executePermit2AndMacro permit2.spender (from signed message):', flowSchedulerResult.permit2.spender)
    console.log('[SignatureDisplay] executePermit2AndMacro permit:', { token: permit.token, amount: permit.amount.toString(), nonce: permit.nonce.toString(), deadline: permit.deadline.toString() })
    console.log('[SignatureDisplay] executePermit2AndMacro transferDetails:', { to: transferDetails.to, requestedAmount: transferDetails.requestedAmount.toString() })
    console.log('[SignatureDisplay] executePermit2AndMacro upgradeSuperToken:', upgradeSuperToken)
    console.log('[SignatureDisplay] executePermit2AndMacro witnessStructHash:', witnessStructHash)
    console.log('[SignatureDisplay] executePermit2AndMacro signature length:', signatureHex.length)
    try {
      setIsLoading(true)
      setError(null)
      setTxHash(null)
      const permit2MacroParams = {
        permit: {
          permitted: { token: permit.token, amount: permit.amount },
          nonce: permit.nonce,
          deadline: permit.deadline,
        },
        transferDetails: { to: transferDetails.to, requestedAmount: transferDetails.requestedAmount },
        owner: address,
        witness: witnessStructHash as `0x${string}`,
        witnessTypeString,
        signature: signatureHex,
        spender: flowSchedulerResult.permit2.spender,
        upgradeSuperToken,
      }
      const macroHash = await writeContract(config, {
        address: permit2Forwarder!,
        abi: RUN_PERMIT2_AND_MACRO_ABI,
        functionName: 'runPermit2AndMacro',
        args: [permit2MacroParams, flowSchedulerConfig.macroAddress!, flowSchedulerResult.params],
        chainId,
      })
      setTxHash(macroHash)
      await waitForTransactionReceipt(config, { hash: macroHash })
      console.log('[FlowScheduler] runPermit2AndMacro confirmed:', macroHash)
    } catch (err) {
      console.error('Permit2 + macro execution error:', err)
      setError(err instanceof Error ? err.message : 'Execution failed')
    } finally {
      setIsLoading(false)
    }
  }

  const executeViaRelayer = async () => {
    if (!flowSchedulerResult?.params || !address || !flowSchedulerConfig.macroAddress) return
    const baseUrl = relayerUrl()
    if (!baseUrl) return
    try {
      setIsLoading(true)
      setError(null)
      setTxHash(null)
      const sig = flowSchedulerResult.signature
      const signatureHex = sig.startsWith('0x') ? sig : `0x${sig}`
      const payload: Record<string, unknown> = {
        macro: flowSchedulerConfig.macroAddress,
        params: flowSchedulerResult.params,
        signer: address,
        signature: signatureHex,
      }
      if (flowSchedulerResult.permit2 && flowSchedulerResult.scheduleParams?.superToken) {
        payload.permit2 = {
          permit: flowSchedulerResult.permit2.permit,
          transferDetails: flowSchedulerResult.permit2.transferDetails,
          witnessStructHash: flowSchedulerResult.permit2.witnessStructHash,
          witnessTypeString: flowSchedulerResult.permit2.witnessTypeString,
          permit2Address: permit2Config.permit2Address,
          spender: flowSchedulerResult.permit2.spender,
          upgradeSuperToken: flowSchedulerResult.scheduleParams.superToken,
        }
      }
      const res = await fetch(`${baseUrl}/relay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error ?? `Relayer error: ${res.status}`)
        return
      }
      if (data.txHash) setTxHash(data.txHash)
      if (data.status === 'failed' && data.error) setError(data.error)
    } catch (err) {
      console.error('Relayer request failed:', err)
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setIsLoading(false)
    }
  }

  const getExplorerLink = (forChainId?: number) => {
    const cid = forChainId ?? permitParams?.chainId
    if (!txHash || cid == null) return '#'
    const network = sfMetadata.networks.find((net: { chainId: number }) => net.chainId === cid)
    if (!network?.explorer) return '#'
    let baseUrl = network.explorer
    if (!baseUrl.endsWith('/')) baseUrl += '/'
    if (!baseUrl.includes('tx')) baseUrl += 'tx/'
    return `${baseUrl}${txHash}`
  }

  const canExecute = !isFlowScheduler && !!permitParams && !!tokenMetadata

  return (
    <div className="signature-display">
      <h2>Signature Result</h2>
      <div className="signature-box">
        <div className="signature-label">EIP-712 Signature:</div>
        <code>{signature}</code>
      </div>

      {tokenMetadata?.usedEIP5267 && (
        <div className="eip5267-indicator">
          <span className="badge">EIP-5267</span>
          <span className="hint">Using exact domain parameters from contract</span>
        </div>
      )}

      {hasPermit2 && (
        <div className="eip5267-indicator">
          <span className="badge">Permit2</span>
          <span className="hint">Signature over PermitWitnessTransferFrom with ClearSigning witness</span>
        </div>
      )}

      {canExecute && (
        <button
          onClick={executePermit}
          disabled={isLoading}
          className="button transaction-button"
        >
          {isLoading ? 'Processing...' : 'Execute Permit'}
        </button>
      )}

      {canExecuteClearSigningOnly && (
        <>
          <button
            onClick={executeFlowScheduler}
            disabled={isLoading}
            className="button transaction-button button-small"
            title="Execute runMacro via connected wallet"
          >
            {isLoading ? 'Processing...' : 'Execute'}
          </button>
          {canExecuteViaRelayer && (
            <button
              onClick={executeViaRelayer}
              disabled={isLoading}
              className="button transaction-button"
            >
              {isLoading ? 'Sending...' : 'Execute via relayer'}
            </button>
          )}
        </>
      )}

      {hasPermit2 && (
        <>
          {needsUnderlyingBalance && (
            <button
              onClick={mintUnderlying}
              disabled={isLoading}
              className="button transaction-button button-small"
              title="Mint underlying tokens (required before Execute for test tokens)"
            >
              {isLoading ? 'Processing...' : `Mint ${MINT_AMOUNT_WHOLE_TOKENS.toLocaleString()} underlying`}
            </button>
          )}
          {needsPermit2Approval && (
            <button
              onClick={approvePermit2}
              disabled={isLoading}
              className="button transaction-button button-small"
              title="Approve Permit2 to spend your tokens (required before Execute)"
            >
              {isLoading ? 'Processing...' : 'Approve Permit2'}
            </button>
          )}
          {canExecutePermit2AndMacro && (
            <button
              onClick={executePermit2AndMacro}
              disabled={isLoading || needsUnderlyingBalance || needsPermit2Approval}
              className="button transaction-button button-small"
              title="Execute runPermit2AndMacro (forwarder pulls, upgrades, runs macro)"
            >
              {isLoading ? 'Processing...' : 'Execute'}
            </button>
          )}
          {canExecuteViaRelayer && (
            <button
              onClick={executeViaRelayer}
              disabled={isLoading}
              className="button transaction-button"
            >
              {isLoading ? 'Sending...' : 'Execute via relayer'}
            </button>
          )}
        </>
      )}

      {txHash && (
        <div className="transaction-success">
          <p>Transaction submitted!</p>
          <a
            href={getExplorerLink(permitParams?.chainId ?? chainId ?? undefined)}
            target="_blank"
            rel="noopener noreferrer"
            className="tx-link"
          >
            View on Explorer
          </a>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      {!txHash && !isFlowScheduler && (
        <div className="signature-info">
          <p>This signature can be submitted on-chain along with the permit parameters to approve token spending without requiring a separate transaction.</p>
        </div>
      )}

      {isFlowScheduler && (
        <div className="signature-info">
          {hasPermit2 ? (
            <>
              <p>This Permit2 + ScheduleFlow signature authorizes a token transfer and the flow schedule. Execute calls runPermit2AndMacro (forwarder pulls via Permit2, upgrades, and runs the macro). Ensure you have enough underlying balance; use Mint if the token supports it (e.g. test tokens). You must also approve Permit2 to spend your tokens before Execute.</p>
              {needsUnderlyingBalance && (
                <p className="info-message">
                  Mint underlying tokens before Execute (insufficient balance).
                </p>
              )}
              {needsPermit2Approval && !needsUnderlyingBalance && (
                <p className="info-message">
                  Approve Permit2 to spend your tokens before Execute.
                </p>
              )}
            </>
          ) : (
            <p>This ScheduleFlow signature can be used with the forwarder&apos;s runMacro to create the flow schedule on-chain.</p>
          )}
          {!relayerUrl() && (
            <p className="info-message">Set VITE_RELAYER_URL to enable &quot;Execute via relayer&quot;.</p>
          )}
        </div>
      )}
    </div>
  )
}

export default SignatureDisplay 