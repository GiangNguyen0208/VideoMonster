import type { Job, SavedKey, SetupResponse } from "@/types/api";
import { v1 } from "./endpoints";
import { api } from "./http";

export const getJob = (jobId: string) => api<Job>(v1.job(jobId));

export const getSetup = () => api<SetupResponse>(v1.setup);

export const recheckSetup = () => api<{ job: Job }>(v1.setupRecheck, { method: "POST" });

/** Write one provider key to `.env`; the answer carries only a masked hint. */
export const saveEnvKey = (key: string, value: string) =>
  api<SavedKey>(v1.setupEnv, { method: "PUT", json: { key, value } });
