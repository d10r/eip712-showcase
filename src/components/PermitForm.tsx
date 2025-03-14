import React, { useState } from 'react'
import { useAccount, useSignTypedData, useChainId } from 'wagmi'
import { fetchTokenMetadata, createPermitData, TokenMetadata, SignedPermitExecutionContext, PermitParameters } from '../utils/permit'
import { ethers } from 'ethers'

interface PermitFormProps {
  onSignatureGenerated: (signature: string, permitParams: PermitParameters, tokenMetadata: TokenMetadata) => void
}

const PermitForm: React.FC<PermitFormProps> = ({ onSignatureGenerated }) => {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { signTypedDataAsync } = useSignTypedData()
  
  const [tokenAddress, setTokenAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [tokenMetadata, setTokenMetadata] = useState<TokenMetadata | null>(null)
  const [isLookingUpToken, setIsLookingUpToken] = useState(false)

  // Handle token address changes - fetch metadata
  const handleTokenAddressChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newAddress = e.target.value
    setTokenAddress(newAddress)
    setTokenMetadata(null)
    setError('')
    
    // Only attempt to fetch metadata if the address is a valid Ethereum address
    if (ethers.utils.isAddress(newAddress)) {
      setIsLookingUpToken(true)
      
      try {
        const metadata = await fetchTokenMetadata(newAddress)
        setTokenMetadata(metadata)
        
        // Display a warning if permit is not supported
        if (metadata.supportsPermit === false) {
          setError(`This token (${metadata.symbol}) doesn't support the permit functionality (EIP-2612).`)
        }
      } catch (err) {
        console.error('Error fetching token metadata:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch token details')
        setTokenMetadata(null)
      } finally {
        setIsLookingUpToken(false)
      }
    }
  }

  const handleSign = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!address || !chainId) {
      setError('Wallet not connected or chain not selected')
      return
    }

    try {
      setIsLoading(true)
      setError('')

      // Validate inputs
      if (!tokenAddress || !ethers.utils.isAddress(tokenAddress)) {
        throw new Error('Invalid token address')
      }
      if (!amount || parseFloat(amount) <= 0) {
        throw new Error('Invalid amount')
      }
      if (!recipient || !ethers.utils.isAddress(recipient)) {
        throw new Error('Invalid recipient address')
      }
      if (!tokenMetadata) {
        throw new Error('Token metadata not available. Please ensure this is a valid ERC20 token.')
      }
      if (tokenMetadata.supportsPermit === false) {
        throw new Error(`This token (${tokenMetadata.symbol}) doesn't support the permit functionality (EIP-2612).`)
      }

      // Debug logging
      console.log('tokenAddress', tokenAddress)
      console.log('address', address)
      console.log('recipient', recipient)
      console.log('amount', amount)
      console.log('chainId', chainId)

      // Create permit data with the proper amount formatting
      const { typedData, permitParams } = await createPermitData(
        tokenAddress,
        address,
        recipient,
        amount,
        chainId
      )

      // Debug logging
      console.log('typedData', typedData)

      try {
        // Use signTypedDataAsync instead of signTypedData
        const signature = await signTypedDataAsync({
          domain: typedData.domain as any,
          types: typedData.types,
          primaryType: 'Permit',
          message: typedData.message,
        })
        
        console.log('Signature received:', signature)
        
        // Pass the signature to the parent component
        onSignatureGenerated(signature, permitParams, tokenMetadata)
      } catch (signatureError) {
        console.error('Signature error:', signatureError)
        throw new Error('Failed to get a valid signature. The request may have been rejected.')
      }
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'An unknown error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="permit-form">
      <h2>ERC20 Permit Signing</h2>
      <form onSubmit={handleSign}>
        <div className="form-group">
          <label htmlFor="tokenAddress">Token Address:</label>
          <input
            id="tokenAddress"
            type="text"
            value={tokenAddress}
            onChange={handleTokenAddressChange}
            placeholder="0x..."
            required
          />
          {isLookingUpToken && <div className="info-message">Looking up token...</div>}
          {tokenMetadata && (
            <div className={`token-info ${!tokenMetadata.supportsPermit ? 'token-no-permit' : ''}`}>
              <p>
                <strong>{tokenMetadata.name} ({tokenMetadata.symbol})</strong>
                <span className="token-decimals"> - {tokenMetadata.decimals} decimals</span>
              </p>
              {tokenMetadata.supportsPermit !== undefined && (
                <div className="permit-support">
                  {tokenMetadata.supportsPermit 
                    ? <span className="permit-supported">Permit supported ✓</span> 
                    : <span className="permit-unsupported">Permit not supported ✗</span>}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="amount">Amount:</label>
          <input
            id="amount"
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="1.0"
            required
            disabled={!tokenMetadata || tokenMetadata.supportsPermit === false}
          />
          {tokenMetadata && amount && !isNaN(parseFloat(amount)) && (
            <div className="info-message">
              <small>
                Raw value: {ethers.utils.parseUnits(amount, tokenMetadata.decimals).toString()} 
                ({parseFloat(amount)} {tokenMetadata.symbol})
              </small>
            </div>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="recipient">Recipient (Spender):</label>
          <input
            id="recipient"
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="0x..."
            required
            disabled={!tokenMetadata || tokenMetadata.supportsPermit === false}
          />
        </div>

        <button 
          type="submit" 
          disabled={isLoading || !address || !tokenMetadata || tokenMetadata.supportsPermit === false}
          className="button"
        >
          {isLoading ? 'Signing...' : 'Sign Permit'}
        </button>
      </form>

      {error && <div className="error">{error}</div>}
    </div>
  )
}

export default PermitForm 