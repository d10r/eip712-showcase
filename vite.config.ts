import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')

  if (
    (env.VITE_CLEAR_MACRO_FORWARDER_ADDRESS ?? '').trim() !== '' &&
    (env.VITE_CLEAR_MACRO_FORWARDER_WITH_PERMIT2_ADDRESS ?? '').trim() !== ''
  ) {
    throw new Error(
      'Invalid config: set either VITE_CLEAR_MACRO_FORWARDER_ADDRESS or VITE_CLEAR_MACRO_FORWARDER_WITH_PERMIT2_ADDRESS, not both.'
    )
  }

  return {
    plugins: [react()],
  }
})