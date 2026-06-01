/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WALLET_CONNECT_PROJECT_ID: string;
  /** ClearMacro forwarder address (deterministic, same across chains). */
  readonly VITE_CLEAR_MACRO_FORWARDER_ADDRESS?: string;
  /** ClearMacro forwarder with Permit2 extension (deterministic, same across chains). */
  readonly VITE_CLEAR_MACRO_FORWARDER_WITH_PERMIT2_ADDRESS?: string;
  /** FlowScheduler ClearMacro per chain: VITE_<chainId>_... or VITE_<UPPERCASE_NAME>_... */
  readonly VITE_OPTIMISM_SEPOLIA_FLOW_SCHEDULER_CLEAR_MACRO_ADDRESS?: string;
  readonly VITE_BASE_MAINNET_FLOW_SCHEDULER_CLEAR_MACRO_ADDRESS?: string;
  /** ClearMacro Provider base URL for relay execution. */
  readonly VITE_CLEARMACRO_PROVIDER_URL?: string;
  readonly VITE_PERMIT2_ADDRESS?: string;
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
