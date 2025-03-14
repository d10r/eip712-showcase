import { useState } from 'react'
import ConnectWallet from './components/ConnectWallet'
import PermitForm from './components/PermitForm'
import SignatureDisplay from './components/SignatureDisplay'
import { PermitParameters, TokenMetadata } from './utils/permit'
import './App.css'

function App() {
  const [signature, setSignature] = useState<string | null>(null)
  const [permitParams, setPermitParams] = useState<PermitParameters | null>(null)
  const [tokenMetadata, setTokenMetadata] = useState<TokenMetadata | null>(null)

  const handleSignatureGenerated = (
    sig: string, 
    params: PermitParameters, 
    metadata: TokenMetadata
  ) => {
    setSignature(sig)
    setPermitParams(params)
    setTokenMetadata(metadata)
  }

  return (
    <div className="App">
      <header>
        <h1>EIP-712 Demo: ERC20 Permit</h1>
        <p className="subtitle">Experience the future of token approvals</p>
      </header>
      
      <main>
        <ConnectWallet />
        
        <PermitForm onSignatureGenerated={handleSignatureGenerated} />
        
        {signature && (
          <SignatureDisplay 
            signature={signature}
            permitParams={permitParams || undefined}
            tokenMetadata={tokenMetadata || undefined}
          />
        )}
      </main>
      
      <footer>
        <p>
          This application demonstrates EIP-712 signing for ERC20 permit functions.
        </p>
      </footer>
    </div>
  )
}

export default App 