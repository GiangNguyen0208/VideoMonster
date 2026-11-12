import { useQuery } from "@tanstack/react-query";
import { getProjectCost, getResults, getSpendSince } from "@/services";
import { queryKeys } from "./queryKeys";

export function useResults(projectId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.results(projectId),
    queryFn: () => getResults(projectId),
    enabled: Boolean(projectId) && enabled,
  });
}

export function useProjectCost(projectId: string) {
  return useQuery({
    queryKey: queryKeys.cost(projectId),
    queryFn: () => getProjectCost(projectId),
    enabled: Boolean(projectId),
  });
}

/** Start of the current month in the user's time zone. */
export function monthStart(now = new Date()): string {
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

/** Spend across all projects since the start of this month. */
export function useMonthSpend() {
  const since = monthStart();
  return useQuery({ queryKey: queryKeys.monthSpend(since), queryFn: () => getSpendSince(since) });
}
