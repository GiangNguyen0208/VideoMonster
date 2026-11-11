import type { Demo, Job } from "@/types/api";
import { v1 } from "./endpoints";
import { api } from "./http";

export const listDemos = () => api<{ demos: Demo[] }>(v1.demos);

/** Start a render, or get the job of one already running. */
export const renderDemo = (name: string) =>
  api<{ job: Job }>(v1.demoRender(name), { method: "POST" });
