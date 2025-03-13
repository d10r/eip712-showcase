import React, { useState } from 'react'
import ConnectWallet from './components/ConnectWallet'
import PermitForm from './components/PermitForm'
import SignatureDisplay from './components/SignatureDisplay'
import './App.css'

function App() {
  const [signature, setSignature] = useState<string | null>(null)

  return (
    <div className="App">
      <header>
        <h1>EIP-712 Demo: ERC20 Permit</h1>
      </header>
      
      <main>
        <ConnectWallet />
        
        <PermitForm onSignatureGenerated={setSignature} />
        
        <SignatureDisplay signature={signature} />
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