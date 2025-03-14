import { useState } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { writeContract, waitForTransactionReceipt } from 'wagmi/actions'
import { config } from '../wagmi'
import { PermitParameters, TokenMetadata } from '../utils/permit'

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
}

const SignatureDisplay: React.FC<SignatureDisplayProps> = ({ 
  signature, 
  permitParams, 
  tokenMetadata
}) => {
  const { address } = useAccount()
  const chainId = useChainId()
  const [isLoading, setIsLoading] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  if (!signature) return null

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

  const getExplorerLink = () => {
    if (!txHash || !permitParams) return '#'
    
    const explorerBaseUrls: Record<number, string> = {
      1: 'https://etherscan.io/tx/',
      5: 'https://goerli.etherscan.io/tx/',
      11155111: 'https://sepolia.etherscan.io/tx/',
      137: 'https://polygonscan.com/tx/',
      43113: 'https://testnet.snowtrace.io/tx/',
      80001: 'https://mumbai.polygonscan.com/tx/'
    }
    
    const baseUrl = explorerBaseUrls[permitParams.chainId] || 'https://etherscan.io/tx/'
    return `${baseUrl}${txHash}`
  }

  const canExecute = !!permitParams && !!tokenMetadata;

  return (
    <div className="signature-display">
      <h2>Signature Result</h2>
      <div className="signature-box">
        <div className="signature-label">EIP-712 Signature:</div>
        <code>{signature}</code>
      </div>
      
      {canExecute && (
        <button
          onClick={executePermit}
          disabled={isLoading}
          className="button transaction-button"
        >
          {isLoading ? 'Processing...' : 'Execute Permit'}
        </button>
      )}

      {txHash && (
        <div className="transaction-success">
          <p>Transaction submitted!</p>
          <a 
            href={getExplorerLink()} 
            target="_blank" 
            rel="noopener noreferrer"
            className="tx-link"
          >
            View on Explorer
          </a>
        </div>
      )}

      {error && <div className="error">{error}</div>}
      
      {!txHash && (
        <div className="signature-info">
          <p>This signature can be submitted on-chain along with the permit parameters to approve token spending without requiring a separate transaction.</p>
        </div>
      )}
    </div>
  )
}

export default SignatureDisplay 