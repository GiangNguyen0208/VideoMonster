import { useEffect } from "react";
import { Badge, controlClass } from "@/components/ui";
import { useT } from "@/i18n";
import { useInputs, useMusic, useUseLibraryTrack } from "@/hooks/api";
import type { BriefInput, RequirementsBrief } from "@/types/api";
import { enqueueUploads, useUploadsSync } from "@/features/uploads/uploadStore";
import { effectiveAnswer, isRequired, uploadKindOf } from "./spec";

const ACCEPT = { audio: "audio/*", image: "image/*" } as const;

/**
 * What only the creator can give (language, voice, own recording, character
 * image, music, logo). Required items first; Approve waits for them.
 */
export function CreatorInputs({
  projectId,
  brief,
  answers,
  disabled,
  onChange,
}: {
  projectId: string;
  brief: RequirementsBrief;
  answers: Record<string, string>;
  disabled: boolean;
  onChange: (id: string, value: string) => void;
}) {
  const L = useT().spec.requirements.inputs;
  const all = brief.inputs ?? [];
  // An input tied to another answer ("recording" only for "upload") is hidden until that answer applies.
  const shown = all.filter(
    (i) =>
      !i.required_if ||
      effectiveAnswer(brief, answers, i.required_if.input) === i.required_if.equals,
  );
  if (shown.length === 0) return null;
  const required = shown.filter((i) => isRequired(brief, i, answers));
  const optional = shown.filter((i) => !isRequired(brief, i, answers));
  const row = (input: BriefInput, req: boolean) => (
    <InputRow
      key={input.id}
      projectId={projectId}
      input={input}
      required={req}
      value={effectiveAnswer(brief, answers, input.id)}
      disabled={disabled}
      onChange={(v) => onChange(input.id, v)}
    />
  );
  return (
    <section aria-labelledby="req-inputs" className="space-y-4">
      <div>
        <h3 id="req-inputs" className="font-semibold">
          {L.title}
        </h3>
        <p className="text-sm text-text-2">{L.intro}</p>
      </div>
      {required.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold tracking-wider text-accent uppercase">{L.required}</p>
          {required.map((i) => row(i, true))}
        </div>
      )}
      {optional.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold tracking-wider text-text-3 uppercase">{L.optional}</p>
          {optional.map((i) => row(i, false))}
        </div>
      )}
    </section>
  );
}

function InputRow({
  projectId,
  input,
  required,
  value,
  disabled,
  onChange,
}: {
  projectId: string;
  input: BriefInput;
  required: boolean;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  const L = useT().spec.requirements.inputs;
  const id = `in-${input.id}`;
  return (
    <div className="space-y-1 text-sm">
      <label htmlFor={id} className="flex flex-wrap items-center gap-2 font-medium">
        {input.label}
        {required ? <Badge tone="accent">{L.requiredBadge}</Badge> : null}
      </label>
      {input.help && <p className="text-xs text-text-3">{input.help}</p>}
      {input.kind === "text" && (
        <input
          id={id}
          className={controlClass}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {input.kind === "choice" && (
        <select
          id={id}
          className={controlClass}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {!input.default_answer && <option value="">{L.choose}</option>}
          {(input.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )}
      {input.kind === "boolean" && (
        <label className="flex items-center gap-2">
          <input
            id={id}
            type="checkbox"
            disabled={disabled}
            checked={value === "true"}
            onChange={(e) => onChange(e.target.checked ? "true" : "false")}
          />
          {L.yes}
        </label>
      )}
      {input.kind === "file" && (
        <FileInput
          projectId={projectId}
          input={input}
          id={id}
          value={value}
          disabled={disabled}
          onChange={onChange}
        />
      )}
    </div>
  );
}

function FileInput({
  projectId,
  input,
  id,
  value,
  disabled,
  onChange,
}: {
  projectId: string;
  input: BriefInput;
  id: string;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  const L = useT().spec.requirements.inputs;
  const kind = uploadKindOf(input);
  const uploads = useUploadsSync(projectId);
  const files = (useInputs(projectId).data?.files ?? []).filter((f) => f.kind === kind);
  const library = useMusic().data ?? [];
  const useTrack = useUseLibraryTrack(projectId);
  const newest = files.at(-1)?.path;
  const known = files.some((f) => f.path === value);

  // The file just uploaded becomes the answer, so the creator does not have to pick it again.
  useEffect(() => {
    if (newest && !known) onChange(newest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newest]);

  return (
    <div className="space-y-2">
      <input
        id={id}
        type="file"
        accept={input.accept ? ACCEPT[input.accept] : undefined}
        disabled={disabled}
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          if (picked.length) enqueueUploads(projectId, picked, kind);
          e.target.value = "";
        }}
      />
      {input.binds === "music_file" && library.length > 0 && (
        <select
          aria-label={L.library}
          className={controlClass}
          disabled={disabled || useTrack.isPending}
          value=""
          onChange={(e) => e.target.value && useTrack.mutate(e.target.value)}
        >
          <option value="">{L.library}</option>
          {library.map((t) => (
            <option key={t.name} value={t.name}>
              {t.title}
            </option>
          ))}
        </select>
      )}
      {uploads
        .filter((u) => u.state !== "done")
        .map((u) => (
          <p key={u.id} className="text-xs text-text-3">
            {u.name}: {u.state === "error" ? (u.error ?? "error") : L.uploading}
          </p>
        ))}
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f) => (
            <li key={f.path}>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={id}
                  disabled={disabled}
                  checked={value === f.path}
                  onChange={() => onChange(f.path)}
                />
                {f.name}
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
