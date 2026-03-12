/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WALLET_CONNECT_PROJECT_ID: string;
  /** ClearSigningMacroForwarder address (deterministic, same across chains). */
  readonly VITE_CLEAR_SIGNING_FORWARDER_ADDRESS?: string;
  /** Permit2ClearSigningMacroForwarder address (deterministic, same across chains). */
  readonly VITE_PERMIT2_CLEAR_SIGNING_FORWARDER_ADDRESS?: string;
  /** FlowScheduler712Macro per chain: VITE_<chainId>_... or VITE_<UPPERCASE_NAME>_... e.g. VITE_BASE_MAINNET_..., VITE_8453_... */
  readonly VITE_OPTIMISM_SEPOLIA_FLOW_SCHEDULER_712_MACRO_ADDRESS?: string;
  readonly VITE_BASE_MAINNET_FLOW_SCHEDULER_712_MACRO_ADDRESS?: string;
  readonly VITE_RELAYER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface EthereumProvider {
  request(args: { method: string; params?: any[] }): Promise<any>;
  on(event: string, handler: (...args: any[]) => void): void;
  removeListener(event: string, handler: (...args: any[]) => void): void;
}

interface Window {
  ethereum?: EthereumProvider;
}
