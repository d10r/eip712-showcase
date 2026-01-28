import { useAccount, useDisconnect, useChainId, useSwitchChain } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { chains } from '../wagmi'
import { useState, useEffect } from 'react'

const ConnectWallet: React.FC = () => {
  const { address, isConnected, connector } = useAccount()
  const { open } = useWeb3Modal()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  const { switchChain, error: switchError } = useSwitchChain()
  const [switchingNetwork, setSwitchingNetwork] = useState(false)
  
  // Debug log when connector or chainId changes
  useEffect(() => {
    if (connector) {
      console.log('🔌 [DEBUG] Connector info:', {
        id: connector.id,
        name: connector.name,
        type: connector.type,
        isWalletConnect: connector.id === 'walletConnect' || connector.name === 'WalletConnect',
        details: connector
      });
    }
  }, [connector]);
  
  useEffect(() => {
    if (chainId) {
      console.log('⛓️ [DEBUG] Chain ID changed:', chainId);
      const currentChain = chains.find(chain => chain.id === chainId);
      console.log('⛓️ [DEBUG] Current chain:', currentChain);
    }
  }, [chainId]);
  
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

  const handleNetworkSwitch = async (newChainId: number) => {
    try {
      setSwitchingNetwork(true)
      console.log('🔄 [DEBUG] Starting network switch from', chainId, 'to', newChainId);
      
      // Debug current state
      console.log('🔍 [DEBUG] Current state:', {
        connector: {
          id: connector?.id,
          name: connector?.name,
          type: connector?.type,
          isWalletConnect: connector?.id === 'walletConnect'
        },
        currentChainId: chainId,
        targetChainId: newChainId,
        windowEthereum: !!window.ethereum
      });

      // Use Wagmi's switchChain hook - this is the idiomatic way
      await switchChain({ chainId: newChainId });
      
      // Debug after switch attempt
      console.log('🔍 [DEBUG] After switch attempt:', {
        wagmiChainId: chainId,
        windowEthereumChainId: window.ethereum ? await window.ethereum.request({ method: 'eth_chainId' }) : null,
        connectorDetails: connector
      });

      // Monitor chain changes for a short period
      const chainChangeHandler = (newChainId: string) => {
        console.log('🔍 [DEBUG] Chain change event:', {
          newChainId: parseInt(newChainId, 16),
          expectedChainId: newChainId,
          timestamp: new Date().toISOString()
        });
      };

      if (window.ethereum) {
        window.ethereum.on('chainChanged', chainChangeHandler);
        setTimeout(() => {
          window.ethereum.removeListener('chainChanged', chainChangeHandler);
        }, 5000);
      }

    } catch (error) {
      console.error("❌ [DEBUG] Error switching network:", {
        error,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
        connectorDetails: connector
      });
    } finally {
      setSwitchingNetwork(false);
    }
  };

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
          
          <div className="network-selector">
            <label>Network:</label>
            <select 
              value={chainId} 
              onChange={(e) => handleNetworkSwitch(Number(e.target.value))}
              disabled={switchingNetwork}
            >
              {chains.map((chain) => (
                <option key={chain.id} value={chain.id}>
                  {chain.name}
                </option>
              ))}
            </select>
            {switchingNetwork && <span className="loading-indicator">Switching...</span>}
          </div>
          
          {switchError && (
            <div className="network-message">
              <p>Network switching error. If you're using Trust Wallet or another mobile wallet, you may need to change networks directly in your wallet app.</p>
              <p>Error: {switchError.message}</p>
            </div>
          )}
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
      <button 
        onClick={() => open()}
        className="button"
      >
        CONNECT WALLET
      </button>
    </div>
  )
}

export default ConnectWallet 