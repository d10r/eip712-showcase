import { useState } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { writeContract, waitForTransactionReceipt } from 'wagmi/actions'
import { config } from '../wagmi'
import { PermitParameters, TokenMetadata } from '../utils/permit'
import { getFlowSchedulerConfig } from '../utils/flowScheduler'
import type { FlowSchedulerSignatureResult } from './FlowSchedulerForm'
import sfMetadata from '@superfluid-finance/metadata'

const relayerUrl = (): string | null => {
  const url = import.meta.env.VITE_RELAYER_URL
  return typeof url === 'string' && url.trim() !== '' ? url.trim().replace(/\/$/, '') : null
}

// Only712MacroForwarder.runMacro (for FlowScheduler "Execute" via wallet)
const RUN_MACRO_ABI = [
  {
    type: 'function',
    name: 'runMacro',
    stateMutability: 'payable',
    inputs: [
      { name: 'm', type: 'address', internalType: 'contract IUserDefined712Macro' },
      { name: 'params', type: 'bytes', internalType: 'bytes' },
      { name: 'signer', type: 'address', internalType: 'address' },
      { name: 'signature', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const

// ERC20 ABI for permit execution
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
  }
] as const;

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
  const [isLoading, setIsLoading] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!signature) return null

  const isFlowScheduler = !!flowSchedulerResult
  const flowSchedulerConfig = chainId != null ? getFlowSchedulerConfig(chainId) : { forwarderAddress: null, macroAddress: null }
  const canExecuteFlowScheduler =
    isFlowScheduler &&
    !!flowSchedulerResult?.params &&
    !!address &&
    !!flowSchedulerConfig.forwarderAddress &&
    !!flowSchedulerConfig.macroAddress &&
    chainId != null
  const canExecuteViaRelayer =
    canExecuteFlowScheduler && relayerUrl() != null

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
      const res = await fetch(`${baseUrl}/relay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          macro: flowSchedulerConfig.macroAddress,
          params: flowSchedulerResult.params,
          signer: address,
          signature: signatureHex,
        }),
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

      {canExecute && (
        <button
          onClick={executePermit}
          disabled={isLoading}
          className="button transaction-button"
        >
          {isLoading ? 'Processing...' : 'Execute Permit'}
        </button>
      )}

      {canExecuteFlowScheduler && (
        <>
          <button
            onClick={executeFlowScheduler}
            disabled={isLoading}
            className="button transaction-button button-small"
            title="Execute runMacro via connected wallet (for debugging)"
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
          <p>This ScheduleFlow signature can be used with the forwarder&apos;s runMacro to create the flow schedule on-chain.</p>
          {!relayerUrl() && (
            <p className="info-message">Set VITE_RELAYER_URL to enable &quot;Execute via relayer&quot;.</p>
          )}
        </div>
      )}
    </div>
  )
}

export default SignatureDisplay 