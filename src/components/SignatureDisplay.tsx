import { useState } from 'react'
import { useAccount, useChainId, useReadContract } from 'wagmi'
import { writeContract, waitForTransactionReceipt } from 'wagmi/actions'
import { config } from '../wagmi'
import { PermitParameters, TokenMetadata } from '../utils/permit'
import { useFlowSchedulerClearMacroConfig } from '../hooks/useFlowSchedulerConfig'
import { getPermit2Config } from '../utils/permit2Witness'
import type { FlowSchedulerClearMacroSignatureResult } from './FlowSchedulerForm'
import sfMetadata from '@superfluid-finance/metadata'

function clearMacroProviderUrl(): string | null {
  const url = import.meta.env.VITE_CLEARMACRO_PROVIDER_URL
  return typeof url === 'string' && url.trim() !== '' ? url.trim().replace(/\/$/, '') : null
}

const RUN_MACRO_ABI = [
  {
    type: 'function',
    name: 'runMacro',
    stateMutability: 'payable',
    inputs: [
      { name: 'm', type: 'address', internalType: 'contract IClearMacro' },
      { name: 'encodedPayload', type: 'bytes', internalType: 'bytes' },
      { name: 'signer', type: 'address', internalType: 'address' },
      { name: 'signature', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [{ name: 'success', type: 'bool', internalType: 'bool' }],
  },
] as const

const RUN_PERMIT2_AND_MACRO_ABI = [
  {
    type: 'function',
    name: 'runPermit2AndMacro',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'permit2Context',
        type: 'tuple',
        internalType: 'struct IClearMacroPermit2Extension.Permit2Context',
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
          { name: 'owner', type: 'address', internalType: 'address' },
          { name: 'witness', type: 'bytes32', internalType: 'bytes32' },
          { name: 'witnessTypeString', type: 'string', internalType: 'string' },
          { name: 'signature', type: 'bytes', internalType: 'bytes' },
          { name: 'spender', type: 'address', internalType: 'address' },
          { name: 'upgradeSuperToken', type: 'address', internalType: 'address' },
        ],
      },
      { name: 'm', type: 'address', internalType: 'contract IClearMacro' },
      { name: 'encodedPayload', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [{ name: 'success', type: 'bool', internalType: 'bool' }],
  },
] as const

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
      { name: 's', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
] as const

const MINT_ABI = [
  {
    name: 'mint',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const

const MAX_UINT256 = 2n ** 256n - 1n
const MINT_AMOUNT_WHOLE_TOKENS = 1_000_000

const splitSignature = (signature: string) => {
  const signatureHex = signature.startsWith('0x') ? signature.slice(2) : signature
  const r = `0x${signatureHex.slice(0, 64)}` as `0x${string}`
  const s = `0x${signatureHex.slice(64, 128)}` as `0x${string}`
  const v = parseInt(signatureHex.slice(128, 130), 16)
  return { r, s, v }
}

interface SignatureDisplayProps {
  signature: string | null
  permitParams?: PermitParameters
  tokenMetadata?: TokenMetadata
  flowSchedulerClearMacroResult?: FlowSchedulerClearMacroSignatureResult
}

const SignatureDisplay: React.FC<SignatureDisplayProps> = ({
  signature,
  permitParams,
  tokenMetadata,
  flowSchedulerClearMacroResult,
}) => {
  const { address } = useAccount()
  const chainId = useChainId()
  const { config: clearMacroConfig } = useFlowSchedulerClearMacroConfig(chainId ?? undefined)
  const [isLoading, setIsLoading] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!signature) return null

  const isFlowSchedulerClearMacro = !!flowSchedulerClearMacroResult
  const hasPermit2 = !!flowSchedulerClearMacroResult?.permit2Context
  const permit2Config = chainId != null ? getPermit2Config(chainId) : { permit2Address: null }

  const canExecuteClearMacro =
    isFlowSchedulerClearMacro &&
    !!flowSchedulerClearMacroResult?.encodedPayload &&
    !!address &&
    !!clearMacroConfig.clearMacroForwarderAddress &&
    !!clearMacroConfig.flowSchedulerClearMacroAddress &&
    chainId != null

  const canExecuteRunMacro = canExecuteClearMacro && !hasPermit2

  const clearMacroForwarderWithPermit2 = clearMacroConfig.clearMacroForwarderWithPermit2Address
  const canExecuteRunPermit2AndMacro =
    hasPermit2 &&
    !!flowSchedulerClearMacroResult?.permit2Context &&
    !!address &&
    !!permit2Config.permit2Address &&
    !!clearMacroForwarderWithPermit2 &&
    !!clearMacroConfig.flowSchedulerClearMacroAddress &&
    !!flowSchedulerClearMacroResult?.action?.superToken &&
    chainId != null &&
    flowSchedulerClearMacroResult.permit2Context.spender.toLowerCase() ===
      clearMacroForwarderWithPermit2!.toLowerCase()

  const permit2Token = hasPermit2
    ? (flowSchedulerClearMacroResult?.permit2Context?.permit.token as `0x${string}`)
    : undefined

  const { data: underlyingBalance, refetch: refetchUnderlyingBalance } = useReadContract({
    address: hasPermit2 && flowSchedulerClearMacroResult?.permit2Context && address ? permit2Token : undefined,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: hasPermit2 && address ? [address as `0x${string}`] : undefined,
  })

  const { data: tokenDecimals } = useReadContract({
    address: hasPermit2 && flowSchedulerClearMacroResult?.permit2Context ? permit2Token : undefined,
    abi: ERC20_ABI,
    functionName: 'decimals',
  })

  const permit2Amount = flowSchedulerClearMacroResult?.permit2Context?.permit.amount ?? 0n
  const hasUnderlyingBalance = underlyingBalance != null && underlyingBalance >= permit2Amount
  const needsUnderlyingBalance = canExecuteRunPermit2AndMacro && !hasUnderlyingBalance && permit2Amount > 0n
  const mintAmount =
    tokenDecimals != null
      ? BigInt(MINT_AMOUNT_WHOLE_TOKENS) * 10n ** BigInt(tokenDecimals)
      : 10n ** 18n * BigInt(MINT_AMOUNT_WHOLE_TOKENS)

  const { data: permit2Allowance, refetch: refetchPermit2Allowance } = useReadContract({
    address:
      hasPermit2 && flowSchedulerClearMacroResult?.permit2Context && address && permit2Config.permit2Address
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
  const needsPermit2Approval = canExecuteRunPermit2AndMacro && !hasPermit2Allowance && permit2Amount > 0n

  const canExecuteViaProvider = canExecuteClearMacro && clearMacroProviderUrl() != null

  const executePermit = async () => {
    if (!address || !permitParams || !signature) {
      setError('Missing required data')
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      setTxHash(null)
      const { v, r, s } = splitSignature(signature)
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
          s,
        ],
        chainId: permitParams.chainId,
      })
      setTxHash(hash)
      await waitForTransactionReceipt(config, { hash })
    } catch (err) {
      console.error('Transaction error:', err)
      setError(err instanceof Error ? err.message : 'Transaction failed')
    } finally {
      setIsLoading(false)
    }
  }

  const executeRunMacro = async () => {
    if (
      !flowSchedulerClearMacroResult?.encodedPayload ||
      !address ||
      !clearMacroConfig.clearMacroForwarderAddress ||
      !clearMacroConfig.flowSchedulerClearMacroAddress ||
      chainId == null
    )
      return
    try {
      setIsLoading(true)
      setError(null)
      setTxHash(null)
      const signatureHex = flowSchedulerClearMacroResult.signature.startsWith('0x')
        ? flowSchedulerClearMacroResult.signature
        : `0x${flowSchedulerClearMacroResult.signature}`
      const hash = await writeContract(config, {
        address: clearMacroConfig.clearMacroForwarderAddress,
        abi: RUN_MACRO_ABI,
        functionName: 'runMacro',
        args: [
          clearMacroConfig.flowSchedulerClearMacroAddress,
          flowSchedulerClearMacroResult.encodedPayload,
          address,
          signatureHex as `0x${string}`,
        ],
        chainId,
      })
      setTxHash(hash)
      await waitForTransactionReceipt(config, { hash })
    } catch (err) {
      console.error('runMacro error:', err)
      setError(err instanceof Error ? err.message : 'Transaction failed')
    } finally {
      setIsLoading(false)
    }
  }

  const mintUnderlying = async () => {
    if (!flowSchedulerClearMacroResult?.permit2Context || !address || chainId == null) return
    try {
      setIsLoading(true)
      setError(null)
      const hash = await writeContract(config, {
        address: flowSchedulerClearMacroResult.permit2Context.permit.token as `0x${string}`,
        abi: MINT_ABI,
        functionName: 'mint',
        args: [address as `0x${string}`, mintAmount],
        chainId,
      })
      await waitForTransactionReceipt(config, { hash })
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
    if (!flowSchedulerClearMacroResult?.permit2Context || !address || !permit2Config.permit2Address || chainId == null)
      return
    try {
      setIsLoading(true)
      setError(null)
      const hash = await writeContract(config, {
        address: flowSchedulerClearMacroResult.permit2Context.permit.token as `0x${string}`,
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

  const executeRunPermit2AndMacro = async () => {
    if (
      !flowSchedulerClearMacroResult?.permit2Context ||
      !flowSchedulerClearMacroResult?.encodedPayload ||
      !flowSchedulerClearMacroResult?.action?.superToken ||
      !address ||
      !clearMacroForwarderWithPermit2 ||
      !clearMacroConfig.flowSchedulerClearMacroAddress ||
      chainId == null
    )
      return
    const flowSchedulerClearMacroAddress = clearMacroConfig.flowSchedulerClearMacroAddress
    const { permit, witnessStructHash, witnessTypeString } = flowSchedulerClearMacroResult.permit2Context
    const signatureHex = (
      flowSchedulerClearMacroResult.signature.startsWith('0x')
        ? flowSchedulerClearMacroResult.signature
        : `0x${flowSchedulerClearMacroResult.signature}`
    ) as `0x${string}`
    const upgradeSuperToken = flowSchedulerClearMacroResult.action.superToken as `0x${string}`
    try {
      setIsLoading(true)
      setError(null)
      setTxHash(null)
      const hash = await writeContract(config, {
        address: clearMacroForwarderWithPermit2,
        abi: RUN_PERMIT2_AND_MACRO_ABI,
        functionName: 'runPermit2AndMacro',
        args: [
          {
            permit: {
              permitted: { token: permit.token, amount: permit.amount },
              nonce: permit.nonce,
              deadline: permit.deadline,
            },
            owner: address,
            witness: witnessStructHash as `0x${string}`,
            witnessTypeString,
            signature: signatureHex,
            spender: flowSchedulerClearMacroResult.permit2Context.spender,
            upgradeSuperToken,
          },
          flowSchedulerClearMacroAddress,
          flowSchedulerClearMacroResult.encodedPayload,
        ],
        chainId,
      })
      setTxHash(hash)
      await waitForTransactionReceipt(config, { hash })
    } catch (err) {
      console.error('runPermit2AndMacro error:', err)
      setError(err instanceof Error ? err.message : 'Execution failed')
    } finally {
      setIsLoading(false)
    }
  }

  const executeViaClearMacroProvider = async () => {
    if (
      !flowSchedulerClearMacroResult?.encodedPayload ||
      !address ||
      !clearMacroConfig.flowSchedulerClearMacroAddress ||
      chainId == null
    )
      return
    const baseUrl = clearMacroProviderUrl()
    if (!baseUrl) return
    try {
      setIsLoading(true)
      setError(null)
      setTxHash(null)
      const signatureHex = flowSchedulerClearMacroResult.signature.startsWith('0x')
        ? flowSchedulerClearMacroResult.signature
        : `0x${flowSchedulerClearMacroResult.signature}`
      const res = await fetch(`${baseUrl}/v1/relay-executions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'clearMacroV1',
          chainId,
          macroAddress: clearMacroConfig.flowSchedulerClearMacroAddress,
          signerAddress: address,
          payload: flowSchedulerClearMacroResult.encodedPayload,
          signature: signatureHex,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.message ?? data?.error ?? `Provider error: ${res.status}`)
        return
      }
      if (data.txHash) setTxHash(data.txHash)
      if (data.status === 'failed' && data.error) setError(data.error)
    } catch (err) {
      console.error('ClearMacro Provider request failed:', err)
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

  const canExecute = !isFlowSchedulerClearMacro && !!permitParams && !!tokenMetadata

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
          <span className="hint">PermitWitnessTransferFrom with ClearMacro witness</span>
        </div>
      )}

      {canExecute && (
        <button onClick={executePermit} disabled={isLoading} className="button transaction-button">
          {isLoading ? 'Processing...' : 'Execute Permit'}
        </button>
      )}

      {canExecuteRunMacro && (
        <>
          <button
            onClick={executeRunMacro}
            disabled={isLoading}
            className="button transaction-button button-small"
            title="Execute runMacro via connected wallet"
          >
            {isLoading ? 'Processing...' : 'Execute runMacro'}
          </button>
          {canExecuteViaProvider && (
            <button
              onClick={executeViaClearMacroProvider}
              disabled={isLoading}
              className="button transaction-button"
            >
              {isLoading ? 'Sending...' : 'Execute via provider'}
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
          {canExecuteRunPermit2AndMacro && (
            <button
              onClick={executeRunPermit2AndMacro}
              disabled={isLoading || needsUnderlyingBalance || needsPermit2Approval}
              className="button transaction-button button-small"
              title="Execute runPermit2AndMacro"
            >
              {isLoading ? 'Processing...' : 'Execute runPermit2AndMacro'}
            </button>
          )}
          {canExecuteViaProvider && (
            <button
              onClick={executeViaClearMacroProvider}
              disabled={isLoading}
              className="button transaction-button"
            >
              {isLoading ? 'Sending...' : 'Execute via provider'}
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

      {!txHash && !isFlowSchedulerClearMacro && (
        <div className="signature-info">
          <p>
            This signature can be submitted on-chain along with the permit parameters to approve token spending
            without requiring a separate transaction.
          </p>
        </div>
      )}

      {isFlowSchedulerClearMacro && (
        <div className="signature-info">
          {hasPermit2 ? (
            <>
              <p>
                This Permit2 signature authorizes a token transfer and the ClearMacro flow schedule. Execute calls
                runPermit2AndMacro on ClearMacroForwarderV1WithPermit2.
              </p>
              {needsUnderlyingBalance && (
                <p className="info-message">Mint underlying tokens before Execute (insufficient balance).</p>
              )}
              {needsPermit2Approval && !needsUnderlyingBalance && (
                <p className="info-message">Approve Permit2 to spend your tokens before Execute.</p>
              )}
            </>
          ) : (
            <p>
              This ClearMacro signature can be used with runMacro on ClearMacroForwarderV1 to create the flow schedule
              on-chain.
            </p>
          )}
          {!clearMacroProviderUrl() && (
            <p className="info-message">Set VITE_CLEARMACRO_PROVIDER_URL to enable Execute via provider.</p>
          )}
        </div>
      )}
    </div>
  )
}

export default SignatureDisplay
