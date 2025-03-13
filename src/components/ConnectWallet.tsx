import React from 'react'
import { useAccount, useConnect, useDisconnect } from 'wagmi'

const ConnectWallet: React.FC = () => {
  const { address, isConnected } = useAccount()
  const { connect, connectors, error } = useConnect()
  const { disconnect } = useDisconnect()

  if (isConnected && address) {
    return (
      <div className="wallet-info">
        <p>Connected: {address.substring(0, 6)}...{address.substring(address.length - 4)}</p>
        <button 
          onClick={() => disconnect()}
          className="button"
        >
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <div className="connect-wallet">
      <h2>Connect Wallet</h2>
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