import { useQuery } from "@tanstack/react-query";
import { listPipelines, listStyles } from "@/services";
import { queryKeys } from "./queryKeys";

/**
 * Video types with lock state. The server starts the capability check on the
 * first call and answers `checked: false` until it finishes, so poll until
 * the lock badges can be filled in.
 */
export function usePipelines() {
  return useQuery({
    queryKey: queryKeys.pipelines,
    queryFn: listPipelines,
    staleTime: 60_000,
    refetchInterval: (q) => (q.state.data && !q.state.data.checked ? 2000 : false),
  });
}

export function useStyles() {
  return useQuery({
    queryKey: queryKeys.styles,
    queryFn: listStyles,
    staleTime: 5 * 60_000,
    select: (d) => d.styles,
  });
}
