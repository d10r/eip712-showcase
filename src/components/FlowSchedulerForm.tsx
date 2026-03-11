import React, { useState, useEffect } from 'react'
import { useAccount, useSignTypedData, useChainId } from 'wagmi'
import {
  getFlowSchedulerConfig,
  getDescriptionAndParamsFromMacro,
  getRunMacroParams,
  getNextNonce,
  buildScheduleFlowTypedData,
  getPermit2WitnessStructHash,
  getPermit2WitnessTypeString,
  getTypeDefinition,
  getUnderlyingToken,
  getTokenDecimals,
  SECURITY_DOMAIN,
  SECURITY_PROVIDER,
  type ScheduleFlowParams,
  type ScheduleFlowSecurity,
} from '../utils/flowScheduler'
import {
  buildPermit2WitnessTypedData,
  getPermit2Config,
  type PermitWitnessTransferFromTypedData,
} from '../utils/permit2Witness'
import type { Address, Hex } from 'viem'
import { isAddress, hashTypedData } from 'viem'

function defaultStartDate(): number {
  return Math.floor(Date.now() / 1000) + 3600
}
function defaultEndDate(): number {
  return Math.floor(Date.now() / 1000) + 604800
}

/** Default Permit2 deadline: 1 hour from now */
function defaultPermit2Deadline(): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + 3600)
}

/** Permit2 nonce: timestamp-based for uniqueness (Permit2 uses nonceBitmap) */
function defaultPermit2Nonce(): bigint {
  return BigInt(Date.now())
}

export interface Permit2Data {
  typedData: PermitWitnessTransferFromTypedData
  permit: { token: Address; amount: bigint; nonce: bigint; deadline: bigint }
  transferDetails: { to: Address; requestedAmount: bigint }
  spender: Address
  witnessStructHash: Hex
  witnessTypeString: string
}

export interface FlowSchedulerSignatureResult {
  signature: string
  /** Full payload for runMacro, from forwarder.encodeParams(actionParams, security). */
  params: Hex
  /** Decoded schedule fields (inputs to the macro). */
  scheduleParams: ScheduleFlowParams
  security: ScheduleFlowSecurity
  /** When set, signature is over Permit2 PermitWitnessTransferFrom; otherwise over ClearSigning ScheduleFlow. */
  permit2?: Permit2Data
}

interface FlowSchedulerFormProps {
  onSignatureGenerated: (result: FlowSchedulerSignatureResult) => void
}

const FlowSchedulerForm: React.FC<FlowSchedulerFormProps> = ({ onSignatureGenerated }) => {
  const { address } = useAccount()
  const chainId = useChainId()
  const { signTypedDataAsync } = useSignTypedData()

  const config = chainId != null ? getFlowSchedulerConfig(chainId) : { forwarderAddress: null, permit2ForwarderAddress: null, macroAddress: null }
  const { forwarderAddress, permit2ForwarderAddress, macroAddress } = config
  const effectiveForwarderForPermit2 = permit2ForwarderAddress ?? forwarderAddress
  const permit2Config = chainId != null ? getPermit2Config(chainId) : { permit2Address: null, wrapperAddress: null }

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

  const [wrapInPermit2, setWrapInPermit2] = useState(false)
  const [permit2Token, setPermit2Token] = useState('')
  const [permit2Amount, setPermit2Amount] = useState('1')
  const [permit2Spender, setPermit2Spender] = useState('')
  const [permit2To, setPermit2To] = useState('')
  const [permit2RequestedAmount, setPermit2RequestedAmount] = useState('1')

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

  useEffect(() => {
    if (!wrapInPermit2 || !effectiveForwarderForPermit2) return
    setPermit2Spender((prev) => prev || effectiveForwarderForPermit2)
    setPermit2To((prev) => prev || effectiveForwarderForPermit2)
  }, [wrapInPermit2, effectiveForwarderForPermit2])

  useEffect(() => {
    if (!wrapInPermit2 || !superToken || !isAddress(superToken)) return
    let cancelled = false
    getUnderlyingToken(superToken as Address)
      .then((underlying) => {
        if (!cancelled && underlying) setPermit2Token(underlying)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [wrapInPermit2, superToken])

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

      if (wrapInPermit2) {
        if (!effectiveForwarderForPermit2) {
          setError('Permit2ClearSigningMacroForwarder address not configured. Set VITE_OP_SEPOLIA_PERMIT2_MACRO_FORWARDER_ADDRESS or use it as the main forwarder.')
          return
        }
        if (!permit2Config.permit2Address) {
          setError('Permit2 address not configured for this chain.')
          return
        }
        if (!permit2Token || !isAddress(permit2Token)) {
          setError('Invalid Permit2 token address.')
          return
        }
        if (!permit2Spender || !isAddress(permit2Spender)) {
          setError('Invalid Permit2 spender address.')
          return
        }
        if (!permit2To || !isAddress(permit2To)) {
          setError('Invalid Permit2 transfer recipient (to).')
          return
        }
        const amountFloat = parseFloat(permit2Amount || '0')
        const requestedFloat = parseFloat(permit2RequestedAmount || permit2Amount || '0')
        if (isNaN(amountFloat) || amountFloat <= 0) {
          setError('Permit2 amount must be a positive number (in whole tokens).')
          return
        }
        const decimals = await getTokenDecimals(permit2Token as Address)
        const amountBig = BigInt(Math.round(amountFloat * 10 ** decimals))
        const requestedAmountBig = BigInt(Math.round(requestedFloat * 10 ** decimals))
        if (amountBig <= 0n) {
          setError('Permit2 amount must be positive.')
          return
        }

        const permit2Nonce = defaultPermit2Nonce()
        const permit2Deadline = defaultPermit2Deadline()

        console.log('[FlowScheduler] Permit2 flow: effectiveForwarderForPermit2:', effectiveForwarderForPermit2, 'permit2Spender:', permit2Spender, 'permit2To:', permit2To)
        console.log('[FlowScheduler] Permit2 flow: permit2Token:', permit2Token, 'amountBig:', amountBig.toString(), 'nonce:', permit2Nonce.toString(), 'deadline:', permit2Deadline.toString())
        console.log('[FlowScheduler] Permit2 flow: permit2Address:', permit2Config.permit2Address, 'chainId:', chainId)

        const [witnessStructHash, witnessTypeString, typeDefinition] = await Promise.all([
          getPermit2WitnessStructHash(effectiveForwarderForPermit2!, macroAddress, params),
          getPermit2WitnessTypeString(effectiveForwarderForPermit2!, macroAddress, params),
          getTypeDefinition(effectiveForwarderForPermit2!, macroAddress, params),
        ])

        console.log('[FlowScheduler] Permit2 flow: typeDefinition from forwarder:', typeDefinition)
        console.log('[FlowScheduler] Permit2 flow: client Action type must match FlowScheduler712Macro: Action(string description,address superToken,address receiver,uint32 startDate,uint32 startMaxDelay,int96 flowRate,uint256 startAmount,uint32 endDate,bytes userData)')
        console.log('[FlowScheduler] Permit2 flow: witnessStructHash (contract):', witnessStructHash)
        console.log('[FlowScheduler] Permit2 flow: witnessTypeString (contract) full length:', witnessTypeString.length)

        const permit2TypedData = buildPermit2WitnessTypedData({
          witnessStructHash: witnessStructHash as Hex,
          witnessMessage: typedData.message,
          witnessPrimaryType: 'ClearSigning',
          witnessTypes: {
            ClearSigning: typedData.types.ScheduleFlow,
            Action: typedData.types.Action,
            Security: typedData.types.Security,
          },
          witnessTypeString,
          token: permit2Token as Address,
          amount: amountBig,
          spender: permit2Spender as Address,
          nonce: permit2Nonce,
          deadline: permit2Deadline,
          permit2Address: permit2Config.permit2Address,
          chainId,
        })

        console.log('[FlowScheduler] Permit2 message (what user signs):', JSON.stringify(permit2TypedData.message, (_, v) => (typeof v === 'bigint' ? v.toString() : v)))
        console.log('[FlowScheduler] Permit2 domain:', permit2TypedData.domain)
        const permit2Digest = hashTypedData({
          domain: permit2TypedData.domain,
          types: permit2TypedData.types,
          primaryType: 'PermitWitnessTransferFrom',
          message: permit2TypedData.message,
        })
        console.log('[FlowScheduler] Permit2 EIP-712 digest (before signing):', permit2Digest)
        console.log('[FlowScheduler] signing Permit2 PermitWitnessTransferFrom with ScheduleFlow witness')

        const signature = await signTypedDataAsync({
          domain: permit2TypedData.domain,
          types: permit2TypedData.types,
          primaryType: 'PermitWitnessTransferFrom',
          message: permit2TypedData.message,
        })

        console.log('[FlowScheduler] Permit2 signature received:', signature, 'length:', signature.length)

        onSignatureGenerated({
          signature,
          params,
          scheduleParams,
          security,
          permit2: {
            typedData: permit2TypedData,
            permit: {
              token: permit2Token as Address,
              amount: amountBig,
              nonce: permit2Nonce,
              deadline: permit2Deadline,
            },
            transferDetails: {
              to: permit2To as Address,
              requestedAmount: requestedAmountBig,
            },
            spender: permit2Spender as Address,
            witnessStructHash: witnessStructHash as Hex,
            witnessTypeString,
          },
        })
      } else {
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
      }
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
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={wrapInPermit2}
              onChange={(e) => setWrapInPermit2(e.target.checked)}
              aria-describedby="permit2-desc"
            />
            {' '}Wrap action in Permit2
          </label>
          <p id="permit2-desc" className="form-hint">
            Sign the action as a Permit2 witness for token transfer + macro execution.
          </p>
        </div>
        {wrapInPermit2 && (
          <>
            {effectiveForwarderForPermit2 && (
              <div className="flow-scheduler-debug">
                <small>Permit2MacroForwarder: {effectiveForwarderForPermit2}</small>
              </div>
            )}
            <div className="form-group">
              <label htmlFor="permit2-token">Permit2 token (underlying of SuperToken):</label>
              <input
                id="permit2-token"
                type="text"
                value={permit2Token}
                onChange={(e) => setPermit2Token(e.target.value)}
                placeholder="0x..."
              />
              <p className="form-hint">Defaults to the underlying token of the SuperToken above.</p>
            </div>
            <div className="form-group">
              <label htmlFor="permit2-amount">Permit2 amount (tokens):</label>
              <input
                id="permit2-amount"
                type="text"
                value={permit2Amount}
                onChange={(e) => setPermit2Amount(e.target.value)}
                placeholder="1"
              />
            </div>
            <div className="form-group">
              <label htmlFor="permit2-spender">Permit2 spender:</label>
              <input
                id="permit2-spender"
                type="text"
                value={permit2Spender}
                onChange={(e) => setPermit2Spender(e.target.value)}
                placeholder="0x..."
              />
              <p className="form-hint">Defaults to Permit2MacroForwarder (required for Execute).</p>
            </div>
            <div className="form-group">
              <label htmlFor="permit2-to">Transfer to (recipient):</label>
              <input
                id="permit2-to"
                type="text"
                value={permit2To}
                onChange={(e) => setPermit2To(e.target.value)}
                placeholder="0x..."
              />
              <p className="form-hint">Defaults to Permit2MacroForwarder (tokens go to forwarder for upgrade).</p>
            </div>
            <div className="form-group">
              <label htmlFor="permit2-requested">Requested amount (tokens):</label>
              <input
                id="permit2-requested"
                type="text"
                value={permit2RequestedAmount}
                onChange={(e) => setPermit2RequestedAmount(e.target.value)}
                placeholder="1"
              />
            </div>
          </>
        )}
        {isLoadingNonce && <div className="info-message">Fetching nonce...</div>}
        {nonce != null && (
          <div className="info-message">
            <small>Nonce (FlowSchedulerMacro key): {nonce.toString()}</small>
          </div>
        )}
        <button
          type="submit"
          disabled={
            isLoading ||
            !address ||
            nonce == null ||
            (wrapInPermit2 && (!permit2Token || !permit2Spender || !permit2To || !permit2Amount))
          }
          className="button"
        >
          {isLoading ? 'Signing...' : wrapInPermit2 ? 'Sign Permit2 + ScheduleFlow' : 'Sign ScheduleFlow'}
        </button>
      </form>
      {error && <div className="error">{error}</div>}
    </div>
  )
}

export default FlowSchedulerForm
