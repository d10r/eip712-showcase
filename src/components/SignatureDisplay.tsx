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
        <p>Signature:</p>
        <code>{signature}</code>
      </div>
    </div>
  )
}

export default SignatureDisplay 