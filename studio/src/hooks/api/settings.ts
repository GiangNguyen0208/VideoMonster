import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSettings, putSettings } from "@/services";
import type { StudioSettings } from "@/types/api";
import { queryKeys } from "./queryKeys";

export function useSettings() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: getSettings });
}

export function useSaveSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: StudioSettings) => putSettings(settings),
    onSuccess: (view) => queryClient.setQueryData(queryKeys.settings, view),
  });
}
