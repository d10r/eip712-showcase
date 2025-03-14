import React, { useState } from 'react'
import { ethers } from 'ethers'
import { useAccount } from 'wagmi'
import { PermitData } from '../utils/permit'

// ERC20 interface for permit execution
const ERC20_INTERFACE = [
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external',
  'function transferFrom(address sender, address recipient, uint256 amount) external returns (bool)'
]

interface TransactionWidgetProps {
  signature: string
  permitData: PermitData | null
  onTransactionComplete: () => void
}

const TransactionWidget: React.FC<TransactionWidgetProps> = ({ 
  signature, 
  permitData, 
  onTransactionComplete 
}) => {
  const { address } = useAccount()
  const [isLoading, setIsLoading] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [transactionType, setTransactionType] = useState<'permit' | 'transferFrom'>('permit')

  if (!signature || !permitData) {
    return null
  }

  // Split signature into v, r, s components
  const splitSignature = () => {
    const sig = ethers.utils.splitSignature(signature)
    return { v: sig.v, r: sig.r, s: sig.s }
  }

  const executePermit = async () => {
    if (!address || !permitData || !signature) {
      setError('Missing required data')
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      setTxHash(null)

      const provider = new ethers.providers.Web3Provider(window.ethereum)
      const signer = provider.getSigner()
      const tokenContract = new ethers.Contract(
        permitData.tokenAddress,
        ERC20_INTERFACE,
        signer
      )

      const { v, r, s } = splitSignature()

      // Execute the permit transaction
      const tx = await tokenContract.permit(
        permitData.owner,
        permitData.spender,
        permitData.value,
        permitData.deadline,
        v, r, s
      )

      setTxHash(tx.hash)
      
      // Wait for transaction to be mined
      await tx.wait()
      onTransactionComplete()
    } catch (err) {
      console.error('Transaction error:', err)
      setError(err instanceof Error ? err.message : 'Transaction failed')
    } finally {
      setIsLoading(false)
    }
  }

  const executeTransferFrom = async () => {
    if (!address || !permitData || !signature) {
      setError('Missing required data')
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      setTxHash(null)

      const provider = new ethers.providers.Web3Provider(window.ethereum)
      const signer = provider.getSigner()
      const tokenContract = new ethers.Contract(
        permitData.tokenAddress,
        ERC20_INTERFACE,
        signer
      )

      // First execute the permit
      const { v, r, s } = splitSignature()
      const permitTx = await tokenContract.permit(
        permitData.owner,
        permitData.spender,
        permitData.value,
        permitData.deadline,
        v, r, s
      )

      // Wait for permit transaction to be mined
      await permitTx.wait()

      // Then execute the transferFrom
      const transferTx = await tokenContract.transferFrom(
        permitData.owner,
        permitData.spender, // Using spender as recipient for this example
        permitData.value
      )

      setTxHash(transferTx.hash)
      
      // Wait for transaction to be mined
      await transferTx.wait()
      onTransactionComplete()
    } catch (err) {
      console.error('Transaction error:', err)
      setError(err instanceof Error ? err.message : 'Transaction failed')
    } finally {
      setIsLoading(false)
    }
  }

  const executeTransaction = () => {
    if (transactionType === 'permit') {
      executePermit()
    } else {
      executeTransferFrom()
    }
  }

  const formatTokenAmount = () => {
    if (!permitData) return '0'
    const value = ethers.utils.formatUnits(permitData.value, permitData.tokenDecimals)
    return `${value} ${permitData.tokenSymbol}`
  }

  const getTransactionTypeDescription = () => {
    if (transactionType === 'permit') {
      return 'Submit the permit to approve the token spending'
    } else {
      return 'Submit the permit and transfer tokens in one transaction'
    }
  }

  const getExplorerLink = () => {
    if (!txHash || !permitData) return '#'
    
    const explorerBaseUrls: Record<number, string> = {
      1: 'https://etherscan.io/tx/',
      5: 'https://goerli.etherscan.io/tx/',
      11155111: 'https://sepolia.etherscan.io/tx/',
      137: 'https://polygonscan.com/tx/',
      43113: 'https://testnet.snowtrace.io/tx/',
      80001: 'https://mumbai.polygonscan.com/tx/'
    }
    
    const baseUrl = explorerBaseUrls[permitData.chainId] || 'https://etherscan.io/tx/'
    return `${baseUrl}${txHash}`
  }

  return (
    <div className="transaction-widget">
      <h2>Submit Transaction</h2>
      
      <div className="transaction-details">
        <p>
          <strong>Token:</strong> {permitData.tokenName} ({permitData.tokenSymbol})
        </p>
        <p>
          <strong>Amount:</strong> {formatTokenAmount()}
        </p>
        <p>
          <strong>Owner:</strong> {permitData.owner.substring(0, 6)}...{permitData.owner.substring(permitData.owner.length - 4)}
        </p>
        <p>
          <strong>Spender:</strong> {permitData.spender.substring(0, 6)}...{permitData.spender.substring(permitData.spender.length - 4)}
        </p>
        <p>
          <strong>Deadline:</strong> {new Date(permitData.deadline * 1000).toLocaleString()}
        </p>
      </div>

      <div className="transaction-type-selector">
        <label>
          <input
            type="radio"
            value="permit"
            checked={transactionType === 'permit'}
            onChange={() => setTransactionType('permit')}
          />
          Permit Only
        </label>
        <label>
          <input
            type="radio"
            value="transferFrom"
            checked={transactionType === 'transferFrom'}
            onChange={() => setTransactionType('transferFrom')}
          />
          Permit + Transfer
        </label>
        <p className="transaction-description">{getTransactionTypeDescription()}</p>
      </div>

      <button
        onClick={executeTransaction}
        disabled={isLoading}
        className="button transaction-button"
      >
        {isLoading ? 'Processing...' : 'Submit Transaction'}
      </button>

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
    </div>
  )
}

export default TransactionWidget 