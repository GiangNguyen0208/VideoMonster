export type MediaKind = "video" | "audio" | "image" | "subtitle";
export type UploadKind = "footage" | "reference";

export interface UploadLimits {
  max_bytes: number;
  extensions: Record<MediaKind, string[]>;
}

export interface InputFile {
  path: string;
  name: string;
  kind: UploadKind;
  media: MediaKind;
  size: number;
  duration_s: number | null;
  width: number | null;
  height: number | null;
  codec: string | null;
  uploaded_at: string;
}

export interface InputReference {
  id: string;
  url: string;
  notes: string | null;
  added_at: string;
  source: string;
}

export interface ProjectInputs {
  files: InputFile[];
  references: InputReference[];
  /** The agent has written a checkpoint: removing inputs is no longer allowed. */
  started: boolean;
}

export interface MusicTrack {
  name: string;
  title: string;
  size: number;
  duration_s: number | null;
}
