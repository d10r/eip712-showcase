import { useQuery } from '@tanstack/react-query'
import {
  getFlowSchedulerConfigAsync,
  type FlowSchedulerConfig,
  type FlowSchedulerUnsupportedReason,
} from '../utils/flowScheduler'

export function useFlowSchedulerConfig(chainId: number | undefined): {
  config: FlowSchedulerConfig
  isSupported: boolean
  unsupportedReason: FlowSchedulerUnsupportedReason | undefined
  isLoading: boolean
} {
  const { data, isLoading: isLoadingConfig } = useQuery({
    queryKey: ['flowSchedulerConfig', chainId],
    queryFn: () => getFlowSchedulerConfigAsync(chainId!),
    enabled: chainId != null,
  })

  const config = data ?? {
    forwarderAddress: null,
    permit2ForwarderAddress: null,
    macroAddress: null,
  }

  return {
    config,
    isSupported: config.forwarderAddress != null && config.macroAddress != null,
    unsupportedReason: config.unsupportedReason,
    isLoading: chainId != null && isLoadingConfig,
  }
}
