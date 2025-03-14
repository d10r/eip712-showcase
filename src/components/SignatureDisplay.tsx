import { useState } from 'react'
import { ethers } from 'ethers'
import { useAccount, useChainId } from 'wagmi'
import { PermitParameters, TokenMetadata } from '../utils/permit'

// ERC20 interface for permit execution
const ERC20_INTERFACE = [
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external'
];

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

  // Split signature into v, r, s components
  const splitSignature = () => {
    const sig = ethers.utils.splitSignature(signature)
    return { v: sig.v, r: sig.r, s: sig.s }
  }

  const executePermit = async () => {
    if (!address || !permitParams || !signature) {
      setError('Missing required data')
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      setTxHash(null)

      // Check if we have window.ethereum available
      if (!window.ethereum) {
        setError('No wallet provider detected. If using WalletConnect, this function is not supported yet.')
        return
      }

      // Get a provider and signer
      const provider = new ethers.providers.Web3Provider(window.ethereum as any)
      const signer = provider.getSigner()
      
      // Create contract instance
      const tokenContract = new ethers.Contract(
        permitParams.tokenAddress,
        ERC20_INTERFACE,
        signer
      )

      // Get the signature components
      const { v, r, s } = splitSignature()

      console.log('Executing permit with params:', {
        owner: permitParams.owner,
        spender: permitParams.spender,
        value: permitParams.value,
        deadline: permitParams.deadline,
        v, r, s
      })

      // Execute the permit transaction
      const tx = await tokenContract.permit(
        permitParams.owner,
        permitParams.spender,
        permitParams.value,
        permitParams.deadline,
        v, r, s
      )

      setTxHash(tx.hash)
      
      // Wait for transaction to be mined
      await tx.wait()
      console.log('Transaction confirmed:', tx.hash)
      
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