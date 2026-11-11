import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { listDemos, renderDemo } from "@/services";
import type { Demo } from "@/types/api";
import { queryKeys } from "./queryKeys";
import { useJob } from "./setup";

export function useDemos() {
  return useQuery({ queryKey: queryKeys.demos, queryFn: listDemos, select: (d) => d.demos });
}

/** Start a demo render (or follow one already running) and poll its job. */
export function useDemoRender(demo: Demo) {
  const queryClient = useQueryClient();
  const start = useMutation({
    mutationFn: () => renderDemo(demo.name),
    onSuccess: ({ job }) => queryClient.setQueryData(queryKeys.job(job.id), job),
  });
  const jobId = start.data?.job.id ?? demo.job?.id ?? null;
  const job = useJob(jobId);
  const succeeded = job.data?.status === "succeeded";
  useEffect(() => {
    if (succeeded) void queryClient.invalidateQueries({ queryKey: queryKeys.demos });
  }, [succeeded, queryClient]);
  return { start, job: job.data ?? null };
}
