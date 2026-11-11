import type { PipelinesResponse, StyleInfo } from "@/types/api";
import { v1 } from "./endpoints";
import { api } from "./http";

export const listPipelines = () => api<PipelinesResponse>(v1.pipelines);

export const listStyles = () => api<{ styles: StyleInfo[] }>(v1.styles);
