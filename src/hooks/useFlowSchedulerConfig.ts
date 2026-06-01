import { useQuery } from '@tanstack/react-query'
import {
  getFlowSchedulerClearMacroConfigAsync,
  type FlowSchedulerClearMacroConfig,
  type FlowSchedulerClearMacroUnsupportedReason,
} from '../utils/flowScheduler'

export function useFlowSchedulerClearMacroConfig(chainId: number | undefined): {
  config: FlowSchedulerClearMacroConfig
  isSupported: boolean
  unsupportedReason: FlowSchedulerClearMacroUnsupportedReason | undefined
  isLoading: boolean
} {
  const { data, isLoading: isLoadingConfig } = useQuery({
    queryKey: ['flowSchedulerClearMacroConfig', chainId],
    queryFn: () => getFlowSchedulerClearMacroConfigAsync(chainId!),
    enabled: chainId != null,
  })

  const config = data ?? {
    clearMacroForwarderAddress: null,
    clearMacroForwarderWithPermit2Address: null,
    flowSchedulerClearMacroAddress: null,
  }

  return {
    config,
    isSupported:
      config.clearMacroForwarderAddress != null &&
      config.flowSchedulerClearMacroAddress != null,
    unsupportedReason: config.unsupportedReason,
    isLoading: chainId != null && isLoadingConfig,
  }
}
