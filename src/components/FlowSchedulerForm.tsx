import React, { useState, useEffect } from 'react'
import { useAccount, useSignTypedData, useChainId } from 'wagmi'
import { useFlowSchedulerClearMacroConfig } from '../hooks/useFlowSchedulerConfig'
import {
  encodeFlowSchedulerActionParams,
  encodeClearMacroPayload,
  getFlowSchedulerNextNonce,
  buildFlowSchedulerClearMacroTypedData,
  getClearMacroPermit2WitnessStructHash,
  getClearMacroPermit2WitnessTypeString,
  getUnderlyingToken,
  getTokenDecimals,
  FLOW_SCHEDULER_SECURITY_DOMAIN,
  FLOW_SCHEDULER_SECURITY_PROVIDER,
  type FlowSchedulerActionParams,
  type ClearMacroSecurity,
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

function defaultPermit2Deadline(): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + 3600)
}

function defaultPermit2Nonce(): bigint {
  return BigInt(Date.now())
}

export interface Permit2ContextData {
  typedData: PermitWitnessTransferFromTypedData
  permit: { token: Address; amount: bigint; nonce: bigint; deadline: bigint }
  spender: Address
  witnessStructHash: Hex
  witnessTypeString: string
}

export interface FlowSchedulerClearMacroSignatureResult {
  signature: string
  /** ABI-encoded `IClearMacroForwarderV1.Payload` from `encodeParams`. */
  encodedPayload: Hex
  actionParams: Hex
  action: FlowSchedulerActionParams
  security: ClearMacroSecurity
  /** When set, signature is over Permit2 `PermitWitnessTransferFrom` with a `ClearMacro` witness. */
  permit2Context?: Permit2ContextData
}

interface FlowSchedulerFormProps {
  onSignatureGenerated: (result: FlowSchedulerClearMacroSignatureResult) => void
}

const FlowSchedulerForm: React.FC<FlowSchedulerFormProps> = ({ onSignatureGenerated }) => {
  const { address } = useAccount()
  const chainId = useChainId()
  const { signTypedDataAsync } = useSignTypedData()
  const { config, isSupported, unsupportedReason, isLoading: isConfigLoading } =
    useFlowSchedulerClearMacroConfig(chainId ?? undefined)
  const {
    clearMacroForwarderAddress,
    clearMacroForwarderWithPermit2Address,
    flowSchedulerClearMacroAddress,
  } = config
  const canUsePermit2 = clearMacroForwarderWithPermit2Address != null
  const permit2Config = chainId != null ? getPermit2Config(chainId) : { permit2Address: null }

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

  const [nonce, setNonce] = useState<bigint | null>(null)
  const [isLoadingNonce, setIsLoadingNonce] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!clearMacroForwarderAddress || !address || chainId == null) {
      setNonce(null)
      return
    }
    let cancelled = false
    setIsLoadingNonce(true)
    getFlowSchedulerNextNonce(clearMacroForwarderAddress, address, chainId)
      .then((n) => {
        if (!cancelled) setNonce(n)
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
  }, [clearMacroForwarderAddress, address, chainId])

  useEffect(() => {
    setStartDate((s) => s || String(defaultStartDate()))
    setEndDate((e) => e || String(defaultEndDate()))
  }, [])

  useEffect(() => {
    if (!wrapInPermit2 || !clearMacroForwarderWithPermit2Address) return
    setPermit2Spender((prev) => prev || clearMacroForwarderWithPermit2Address)
  }, [wrapInPermit2, clearMacroForwarderWithPermit2Address])

  useEffect(() => {
    if (!canUsePermit2) setWrapInPermit2(false)
  }, [canUsePermit2])

  useEffect(() => {
    if (!wrapInPermit2 || !superToken || !isAddress(superToken)) return
    let cancelled = false
    getUnderlyingToken(superToken as Address)
      .then((underlying) => {
        if (!cancelled && underlying) setPermit2Token(underlying)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [wrapInPermit2, superToken])

  const handleSign = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!address || chainId == null) {
      setError('Wallet not connected or chain not selected')
      return
    }
    if (!clearMacroForwarderAddress || !flowSchedulerClearMacroAddress) {
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

      const action: FlowSchedulerActionParams = {
        superToken: superToken as `0x${string}`,
        receiver: receiver as `0x${string}`,
        startDate: startDateNum,
        startMaxDelay: startMaxDelayNum,
        flowRate: flowRateWeiPerSec,
        startAmount: startAmountBig,
        endDate: endDateNum,
        userData: userDataHex as `0x${string}`,
      }
      const security: ClearMacroSecurity = {
        domain: FLOW_SCHEDULER_SECURITY_DOMAIN,
        macroContract: flowSchedulerClearMacroAddress,
        provider: FLOW_SCHEDULER_SECURITY_PROVIDER,
        validAfter: BigInt(validAfter),
        validBefore: BigInt(validBefore),
        nonce,
      }

      let description: string
      let actionParams: Hex
      try {
        const result = await encodeFlowSchedulerActionParams(flowSchedulerClearMacroAddress, action)
        description = result.description
        actionParams = result.actionParams
      } catch (err) {
        console.warn('ClearMacro encode failed:', err)
        setError('Failed to encode action params from macro. Check your RPC and macro address.')
        return
      }

      const encodedPayload = await encodeClearMacroPayload(
        clearMacroForwarderAddress,
        actionParams,
        security
      )

      const typedData = await buildFlowSchedulerClearMacroTypedData(
        action,
        security,
        description,
        encodedPayload,
        flowSchedulerClearMacroAddress,
        chainId,
        clearMacroForwarderAddress
      )

      if (wrapInPermit2) {
        if (!clearMacroForwarderWithPermit2Address) {
          setError('ClearMacroForwarderV1WithPermit2 is not deployed on this chain.')
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
        const amountFloat = parseFloat(permit2Amount || '0')
        if (isNaN(amountFloat) || amountFloat <= 0) {
          setError('Permit2 amount must be a positive number (in whole tokens).')
          return
        }
        const decimals = await getTokenDecimals(permit2Token as Address)
        const amountBig = BigInt(Math.round(amountFloat * 10 ** decimals))
        if (amountBig <= 0n) {
          setError('Permit2 amount must be positive.')
          return
        }

        const permit2Nonce = defaultPermit2Nonce()
        const permit2Deadline = defaultPermit2Deadline()
        const upgradeSuperToken = action.superToken as Address

        const [witnessStructHash, witnessTypeString] = await Promise.all([
          getClearMacroPermit2WitnessStructHash(
            clearMacroForwarderWithPermit2Address,
            flowSchedulerClearMacroAddress,
            encodedPayload,
            upgradeSuperToken
          ),
          getClearMacroPermit2WitnessTypeString(
            clearMacroForwarderWithPermit2Address,
            flowSchedulerClearMacroAddress,
            encodedPayload
          ),
        ])

        const clearMacroWitnessMessage = {
          upgradeSuperToken,
          action: typedData.message.action,
          security: typedData.message.security,
        }
        const permit2TypedData = buildPermit2WitnessTypedData({
          witnessMessage: clearMacroWitnessMessage,
          witnessPrimaryType: 'ClearMacro',
          witnessTypes: {
            ClearMacro: [
              { name: 'upgradeSuperToken', type: 'address' },
              { name: 'action', type: 'Action' },
              { name: 'security', type: 'Security' },
            ],
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

        const signature = await signTypedDataAsync({
          domain: permit2TypedData.domain,
          types: permit2TypedData.types,
          primaryType: 'PermitWitnessTransferFrom',
          message: permit2TypedData.message,
        })

        onSignatureGenerated({
          signature,
          encodedPayload,
          actionParams,
          action,
          security,
          permit2Context: {
            typedData: permit2TypedData,
            permit: {
              token: permit2Token as Address,
              amount: amountBig,
              nonce: permit2Nonce,
              deadline: permit2Deadline,
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
          primaryType: typedData.primaryType,
          message: typedData.message,
        })
        console.log('[FlowScheduler] ClearMacro EIP-712 digest:', digest)

        const signature = await signTypedDataAsync({
          domain: typedData.domain,
          types: typedData.types,
          primaryType: typedData.primaryType,
          message: typedData.message,
        })

        onSignatureGenerated({ signature, encodedPayload, actionParams, action, security })
      }
    } catch (err) {
      console.error('[FlowScheduler] signature error:', err)
      setError(err instanceof Error ? err.message : 'An unknown error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  if (chainId != null) {
    if (isConfigLoading) {
      return (
        <div className="flow-scheduler-form">
          <h2>FlowScheduler ClearMacro</h2>
          <p className="info-message">Checking ClearMacro forwarder deployment…</p>
        </div>
      )
    }
    if (!isSupported) {
      const message =
        unsupportedReason === 'clear_macro_forwarder_not_deployed'
          ? 'ClearMacroForwarderV1 is not deployed on this chain.'
          : unsupportedReason === 'flow_scheduler_clear_macro_not_configured'
            ? 'FlowScheduler ClearMacro is not configured for this chain. Add VITE_<chainId>_FLOW_SCHEDULER_CLEAR_MACRO_ADDRESS or VITE_<network>_FLOW_SCHEDULER_CLEAR_MACRO_ADDRESS to .env.'
            : unsupportedReason === 'clear_macro_forwarder_not_configured'
              ? 'Forwarder addresses not configured. Set VITE_CLEAR_MACRO_FORWARDER_ADDRESS and/or VITE_CLEAR_MACRO_FORWARDER_WITH_PERMIT2_ADDRESS.'
              : 'FlowScheduler ClearMacro is not supported on this chain.'
      return (
        <div className="flow-scheduler-form">
          <h2>FlowScheduler ClearMacro</h2>
          <p className="info-message">{message}</p>
        </div>
      )
    }
  }

  return (
    <div className="flow-scheduler-form">
      <h2>FlowScheduler ClearMacro</h2>
      {(clearMacroForwarderAddress != null || flowSchedulerClearMacroAddress != null) && (
        <div className="flow-scheduler-debug">
          {clearMacroForwarderAddress != null && (
            <small>ClearMacroForwarderV1: {clearMacroForwarderAddress}</small>
          )}
          {flowSchedulerClearMacroAddress != null && (
            <small>FlowScheduler ClearMacro: {flowSchedulerClearMacroAddress}</small>
          )}
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
        {canUsePermit2 && (
          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={wrapInPermit2}
                onChange={(e) => setWrapInPermit2(e.target.checked)}
                aria-describedby="permit2-desc"
              />
              {' '}Wrap in Permit2 (ClearMacro witness)
            </label>
            <p id="permit2-desc" className="form-hint">
              Sign Permit2 PermitWitnessTransferFrom with a ClearMacro witness for transfer + macro execution.
            </p>
          </div>
        )}
        {wrapInPermit2 && (
          <>
            {clearMacroForwarderWithPermit2Address && (
              <div className="flow-scheduler-debug">
                <small>ClearMacroForwarderV1WithPermit2: {clearMacroForwarderWithPermit2Address}</small>
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
              <p className="form-hint">
                Defaults to ClearMacroForwarderV1WithPermit2 (required for implied upgrade mode).
              </p>
            </div>
          </>
        )}
        {isLoadingNonce && <div className="info-message">Fetching nonce...</div>}
        {nonce != null && (
          <div className="info-message">
            <small>ClearMacro nonce (key 0): {nonce.toString()}</small>
          </div>
        )}
        <button
          type="submit"
          disabled={
            isLoading ||
            !address ||
            nonce == null ||
            (wrapInPermit2 && (!permit2Token || !permit2Spender || !permit2Amount))
          }
          className="button"
        >
          {isLoading ? 'Signing...' : wrapInPermit2 ? 'Sign Permit2 + ClearMacro' : 'Sign ClearMacro'}
        </button>
      </form>
      {error && <div className="error">{error}</div>}
    </div>
  )
}

export default FlowSchedulerForm
