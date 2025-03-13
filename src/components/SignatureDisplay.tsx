import React from 'react'

interface SignatureDisplayProps {
  signature: string | null
}

const SignatureDisplay: React.FC<SignatureDisplayProps> = ({ signature }) => {
  if (!signature) return null

  return (
    <div className="signature-display">
      <h2>Signature Result</h2>
      <div className="signature-box">
        <div className="signature-label">EIP-712 Signature:</div>
        <code>{signature}</code>
      </div>
      <div className="signature-info">
        <p>This signature can be submitted on-chain along with the permit parameters to approve token spending without requiring a separate transaction.</p>
      </div>
    </div>
  )
}

export default SignatureDisplay 