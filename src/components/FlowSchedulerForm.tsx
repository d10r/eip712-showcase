import React, { useState, useEffect } from 'react'
import { useAccount, useSignTypedData, useChainId } from 'wagmi'
import {
  getFlowSchedulerConfig,
  getDescriptionAndParamsFromMacro,
  getRunMacroParams,
  getNextNonce,
  buildScheduleFlowTypedData,
  SECURITY_DOMAIN,
  SECURITY_PROVIDER,
  type ScheduleFlowParams,
  type ScheduleFlowSecurity,
} from '../utils/flowScheduler'
import type { Hex } from 'viem'
import { isAddress, hashTypedData } from 'viem'

function defaultStartDate(): number {
  return Math.floor(Date.now() / 1000) + 3600
}
function defaultEndDate(): number {
  return Math.floor(Date.now() / 1000) + 604800
}

export interface FlowSchedulerSignatureResult {
  signature: string
  /** Full payload for runMacro, from forwarder.encodeParams(actionParams, security). */
  params: Hex
  /** Decoded schedule fields (inputs to the macro). */
  scheduleParams: ScheduleFlowParams
  security: ScheduleFlowSecurity
}

interface FlowSchedulerFormProps {
  onSignatureGenerated: (result: FlowSchedulerSignatureResult) => void
}

const FlowSchedulerForm: React.FC<FlowSchedulerFormProps> = ({ onSignatureGenerated }) => {
  const { address } = useAccount()
  const chainId = useChainId()
  const { signTypedDataAsync } = useSignTypedData()

  const config = chainId != null ? getFlowSchedulerConfig(chainId) : { forwarderAddress: null, macroAddress: null }
  const { forwarderAddress, macroAddress } = config

  const [superToken, setSuperToken] = useState('')
  const [receiver, setReceiver] = useState('')
  const [startDate, setStartDate] = useState('')
  const [startMaxDelay, setStartMaxDelay] = useState(String(86400))
  const [flowRateTokensPerDay, setFlowRateTokensPerDay] = useState('1')
  const [startAmount, setStartAmount] = useState('0')
  const [endDate, setEndDate] = useState('')
  const [userData, setUserData] = useState('0x')
  const [validAfter, setValidAfter] = useState('0')
  const [validBefore, setValidBefore] = useState('0')

  const [nonce, setNonce] = useState<bigint | null>(null)
  const [isLoadingNonce, setIsLoadingNonce] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!forwarderAddress || !address || chainId == null) {
      setNonce(null)
      return
    }
    let cancelled = false
    setIsLoadingNonce(true)
    getNextNonce(forwarderAddress, address)
      .then((n) => {
        if (!cancelled) {
          setNonce(n)
          console.log('[FlowScheduler] next nonce:', n.toString())
        }
      })
      .catch(() => {
        if (!cancelled) setNonce(null)
      })
      .finally(() => {
        if (!cancelled) setIsLoadingNonce(false)
      })
    return () => {
      cancelled = true
    }
  }, [forwarderAddress, address, chainId])

  useEffect(() => {
    setStartDate((s) => s || String(defaultStartDate()))
    setEndDate((e) => e || String(defaultEndDate()))
  }, [])

  const handleSign = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!address || chainId == null) {
      setError('Wallet not connected or chain not selected')
      return
    }
    if (!forwarderAddress || !macroAddress) {
      setError('Contract addresses are not configured for the connected chain.')
      return
    }
    if (nonce == null) {
      setError('Nonce not available.')
      return
    }

    try {
      setIsLoading(true)
      setError('')

      if (!superToken || !isAddress(superToken)) throw new Error('Invalid superToken address')
      if (!receiver || !isAddress(receiver)) throw new Error('Invalid receiver address')
      const startDateNum = parseInt(startDate, 10)
      const startMaxDelayNum = parseInt(startMaxDelay, 10)
      const endDateNum = parseInt(endDate, 10)
      if (isNaN(startDateNum) || isNaN(startMaxDelayNum) || isNaN(endDateNum)) {
        throw new Error('Invalid start/end dates or startMaxDelay')
      }
      const flowRateTokens = parseFloat(flowRateTokensPerDay)
      if (isNaN(flowRateTokens) || flowRateTokens <= 0) throw new Error('Invalid flow rate')
      const flowRateWeiPerSec = BigInt(Math.round(flowRateTokens * 1e18)) / 86400n
      const startAmountBig = BigInt(startAmount)
      let userDataHex = userData.trim().toLowerCase()
      if (!userDataHex.startsWith('0x')) userDataHex = '0x' + userDataHex
      if (userDataHex === '0x') userDataHex = '0x' as `0x${string}`

      const scheduleParams: ScheduleFlowParams = {
        superToken: superToken as `0x${string}`,
        receiver: receiver as `0x${string}`,
        startDate: startDateNum,
        startMaxDelay: startMaxDelayNum,
        flowRate: flowRateWeiPerSec,
        startAmount: startAmountBig,
        endDate: endDateNum,
        userData: userDataHex as `0x${string}`,
      }
      const security: ScheduleFlowSecurity = {
        domain: SECURITY_DOMAIN,
        provider: SECURITY_PROVIDER,
        validAfter: BigInt(validAfter),
        validBefore: BigInt(validBefore),
        nonce,
      }

      console.log('[FlowScheduler] sign inputs: chainId', chainId, 'forwarder', forwarderAddress, 'macro', macroAddress)
      console.log('[FlowScheduler] scheduleParams:', scheduleParams)
      console.log('[FlowScheduler] security:', security)

      let description: string
      let actionParams: Hex
      try {
        const result = await getDescriptionAndParamsFromMacro(macroAddress, scheduleParams)
        description = result.description
        actionParams = result.actionParams
      } catch (err) {
        console.warn('Macro fetch failed:', err)
        setError('Failed to fetch description and params from macro. Check your RPC and macro address.')
        return
      }
      console.log('[FlowScheduler] description (for EIP-712 message):', description)

      const params = await getRunMacroParams(forwarderAddress, actionParams, security)
      console.log('[FlowScheduler] params (from forwarder.encodeParams):', params.length, 'chars')

      const typedData = buildScheduleFlowTypedData(
        scheduleParams,
        security,
        description,
        chainId,
        forwarderAddress
      )

      const digest = hashTypedData({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: 'ScheduleFlow',
        message: typedData.message,
      })
      console.log('[FlowScheduler] EIP-712 digest (being signed):', digest)

      const signature = await signTypedDataAsync({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: 'ScheduleFlow',
        message: typedData.message,
      })

      console.log('[FlowScheduler] signature received:', signature)

      onSignatureGenerated({ signature, params, scheduleParams, security })
    } catch (err) {
      console.error('[FlowScheduler] signature/flow error:', err)
      setError(err instanceof Error ? err.message : 'An unknown error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  if (chainId != null && getFlowSchedulerConfig(chainId).forwarderAddress == null) {
    return (
      <div className="flow-scheduler-form">
        <h2>FlowScheduler</h2>
        <p className="info-message">Contract addresses are not configured for the connected chain. Set VITE_OP_SEPOLIA_ONLY712_FORWARDER_ADDRESS and VITE_OP_SEPOLIA_FLOW_SCHEDULER_712_MACRO_ADDRESS for OP Sepolia.</p>
      </div>
    )
  }

  return (
    <div className="flow-scheduler-form">
      <h2>FlowScheduler</h2>
      {(forwarderAddress != null || macroAddress != null) && (
        <div className="flow-scheduler-debug">
          {forwarderAddress != null && <small>Forwarder: {forwarderAddress}</small>}
          {macroAddress != null && <small>Macro: {macroAddress}</small>}
        </div>
      )}
      <form onSubmit={handleSign}>
        <div className="form-group">
          <label htmlFor="flow-superToken">SuperToken:</label>
          <input
            id="flow-superToken"
            type="text"
            value={superToken}
            onChange={(e) => setSuperToken(e.target.value)}
            placeholder="0x..."
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="flow-receiver">Receiver:</label>
          <input
            id="flow-receiver"
            type="text"
            value={receiver}
            onChange={(e) => setReceiver(e.target.value)}
            placeholder="0x..."
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="flow-startDate">Start date (unix):</label>
          <input
            id="flow-startDate"
            type="number"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            placeholder={String(defaultStartDate())}
          />
        </div>
        <div className="form-group">
          <label htmlFor="flow-startMaxDelay">Start max delay (s):</label>
          <input
            id="flow-startMaxDelay"
            type="number"
            value={startMaxDelay}
            onChange={(e) => setStartMaxDelay(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="flow-flowRate">Flow rate (tokens/day):</label>
          <input
            id="flow-flowRate"
            type="text"
            value={flowRateTokensPerDay}
            onChange={(e) => setFlowRateTokensPerDay(e.target.value)}
            placeholder="1"
          />
        </div>
        <div className="form-group">
          <label htmlFor="flow-startAmount">Start amount:</label>
          <input
            id="flow-startAmount"
            type="text"
            value={startAmount}
            onChange={(e) => setStartAmount(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="flow-endDate">End date (unix):</label>
          <input
            id="flow-endDate"
            type="number"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            placeholder={String(defaultEndDate())}
          />
        </div>
        <div className="form-group">
          <label htmlFor="flow-userData">User data (hex):</label>
          <input
            id="flow-userData"
            type="text"
            value={userData}
            onChange={(e) => setUserData(e.target.value)}
            placeholder="0x"
          />
        </div>
        <div className="form-group">
          <label htmlFor="flow-validAfter">Valid after:</label>
          <input
            id="flow-validAfter"
            type="text"
            value={validAfter}
            onChange={(e) => setValidAfter(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="flow-validBefore">Valid before:</label>
          <input
            id="flow-validBefore"
            type="text"
            value={validBefore}
            onChange={(e) => setValidBefore(e.target.value)}
          />
        </div>
        {isLoadingNonce && <div className="info-message">Fetching nonce...</div>}
        {nonce != null && (
          <div className="info-message">
            <small>Nonce (FlowSchedulerMacro key): {nonce.toString()}</small>
          </div>
        )}
        <button
          type="submit"
          disabled={isLoading || !address || nonce == null}
          className="button"
        >
          {isLoading ? 'Signing...' : 'Sign ScheduleFlow'}
        </button>
      </form>
      {error && <div className="error">{error}</div>}
    </div>
  )
}

export default FlowSchedulerForm
