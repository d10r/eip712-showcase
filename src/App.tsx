import { useState, useEffect, useCallback } from 'react'
import ConnectWallet from './components/ConnectWallet'
import PermitForm from './components/PermitForm'
import FlowSchedulerForm from './components/FlowSchedulerForm'
import SignatureDisplay from './components/SignatureDisplay'
import { PermitParameters, TokenMetadata } from './utils/permit'
import type { FlowSchedulerSignatureResult } from './components/FlowSchedulerForm'
import './App.css'

type Tab = 'permit' | 'flowScheduler'

const TAB_HASH_PREFIX = '#'

function tabFromHash(): Tab {
  const hash = window.location.hash.slice(TAB_HASH_PREFIX.length).toLowerCase()
  if (hash === 'flowscheduler') return 'flowScheduler'
  if (hash === 'permit') return 'permit'
  return 'permit'
}

function hashFromTab(tab: Tab): string {
  return TAB_HASH_PREFIX + tab
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>(() => tabFromHash())

  useEffect(() => {
    if (!window.location.hash) window.history.replaceState(null, '', hashFromTab(activeTab))
  }, [])

  useEffect(() => {
    const onHashChange = () => setActiveTab(tabFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const selectTab = useCallback((tab: Tab) => {
    setActiveTab(tab)
    window.history.replaceState(null, '', hashFromTab(tab))
  }, [])
  const [signature, setSignature] = useState<string | null>(null)
  const [permitParams, setPermitParams] = useState<PermitParameters | null>(null)
  const [tokenMetadata, setTokenMetadata] = useState<TokenMetadata | null>(null)
  const [flowSchedulerResult, setFlowSchedulerResult] = useState<FlowSchedulerSignatureResult | null>(null)

  const handlePermitSignatureGenerated = (
    sig: string,
    params: PermitParameters,
    metadata: TokenMetadata
  ) => {
    setSignature(sig)
    setPermitParams(params)
    setTokenMetadata(metadata)
    setFlowSchedulerResult(null)
  }

  const handleFlowSchedulerSignatureGenerated = (result: FlowSchedulerSignatureResult) => {
    setFlowSchedulerResult(result)
    setSignature(null)
    setPermitParams(null)
    setTokenMetadata(null)
  }

  return (
    <div className="App">
      <header>
        <h1>EIP-712 Demo</h1>
        <p className="subtitle">See how wallets handle signing requests</p>
      </header>

      <main>
        <ConnectWallet />

        <nav className="tabs">
          <button
            type="button"
            className={`tab ${activeTab === 'permit' ? 'active' : ''}`}
            onClick={() => selectTab('permit')}
          >
            ERC20 Permit
          </button>
          <button
            type="button"
            className={`tab ${activeTab === 'flowScheduler' ? 'active' : ''}`}
            onClick={() => selectTab('flowScheduler')}
          >
            FlowScheduler
          </button>
        </nav>

        {activeTab === 'permit' && (
          <>
            <PermitForm onSignatureGenerated={handlePermitSignatureGenerated} />
            {signature && (
              <SignatureDisplay
                signature={signature}
                permitParams={permitParams || undefined}
                tokenMetadata={tokenMetadata || undefined}
              />
            )}
          </>
        )}

        {activeTab === 'flowScheduler' && (
          <>
            <FlowSchedulerForm onSignatureGenerated={handleFlowSchedulerSignatureGenerated} />
            {flowSchedulerResult && (
              <SignatureDisplay
                signature={flowSchedulerResult.signature}
                flowSchedulerResult={flowSchedulerResult}
              />
            )}
          </>
        )}
      </main>

      <footer>
        <p>
          This application demonstrates EIP-712 signing (ERC20 permit and FlowScheduler).
        </p>
      </footer>
    </div>
  )
}

export default App 