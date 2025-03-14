import React from 'react'
import { useAccount, useConnect, useDisconnect, useChainId } from 'wagmi'
import { chains } from '../wagmi'

const ConnectWallet: React.FC = () => {
  const { address, isConnected } = useAccount()
  const { connect, connectors, error } = useConnect()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  
  // Get chain info from our configured chains
  const getChainInfo = () => {
    if (!chainId) return null
    
    const currentChain = chains.find(chain => chain.id === chainId)
    
    if (!currentChain) {
      return (
        <span className="chain-name unsupported">
          Unsupported Network
        </span>
      )
    }
    
    return (
      <span className="chain-name">
        {currentChain.name}
      </span>
    )
  }

  if (isConnected && address) {
    return (
      <div className="wallet-info">
        <div className="connection-status">
          <p>
            <span className="connection-indicator"></span>
            Connected: <span className="address">{address.substring(0, 6)}...{address.substring(address.length - 4)}</span>
          </p>
          <p className="chain-info">
            {getChainInfo()}
          </p>
        </div>
        <button 
          onClick={() => disconnect()}
          className="button"
        >
          DISCONNECT
        </button>
      </div>
    )
  }

  return (
    <div className="connect-wallet">
      <h2>Connect Wallet</h2>
      <p className="connect-description">Connect your wallet to sign ERC20 permit messages</p>
      <div className="button-container">
        {connectors.map((connector) => (
          <button
            key={connector.id}
            onClick={() => connect({ connector })}
            className="button"
          >
            Connect {connector.name}
          </button>
        ))}
      </div>
      {error && <p className="error-message">Error: {error.message}</p>}
    </div>
  )
}

export default ConnectWallet 