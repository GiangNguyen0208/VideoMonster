import { useQuery } from "@tanstack/react-query";
import { getSession } from "@/services";
import { queryKeys } from "./queryKeys";

/** Server build facts (version, user) — the token itself stays inside `services/http`. */
export function useSession() {
  return useQuery({
    queryKey: queryKeys.session,
    queryFn: getSession,
    staleTime: Infinity,
    select: (s) => ({ version: s.version, user: s.user, features: s.features }),
  });
}
