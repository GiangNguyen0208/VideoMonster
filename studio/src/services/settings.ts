import type { SettingsView, StudioSettings } from "@/types/api";
import { v1 } from "./endpoints";
import { api } from "./http";

export const getSettings = () => api<SettingsView>(v1.settings);

export const putSettings = (settings: StudioSettings) =>
  api<SettingsView>(v1.settings, { method: "PUT", json: settings });
