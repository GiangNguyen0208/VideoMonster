import { useEffect } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { goalById } from "@/content/goals";
import { DropZone } from "@/features/uploads/DropZone";
import { BlobPreview, FileRow } from "@/features/uploads/FileRow";
import {
  acceptAttr,
  describeMedia,
  fileIssue,
  fmtLength,
  kindOf,
  readDuration,
} from "@/features/uploads/media";
import { useT } from "@/i18n";
import { useUploadLimits } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fmtBytes } from "@/lib/format";
import { Field, inputClass } from "./fields";
import { skipsFootage, tooShort, type StagedFile, type WizardValues } from "./wizard";

let nextId = 0;

/**
 * "Add your footage" — files are picked and checked here, and upload after
 * the project is created (they need its folder).
 */
export function FootageStep({
  staged,
  onChange,
  problem,
}: {
  staged: StagedFile[];
  onChange: (update: (prev: StagedFile[]) => StagedFile[]) => void;
  /** `wizard.footage.errors` key set when Next was refused. */
  problem: string | null;
}) {
  const t = useT();
  const L = t.wizard.footage;
  const limits = useUploadLimits().data;
  const { register, setValue, control } = useFormContext<WizardValues>();
  const goalId = useWatch({ control, name: "goal" });
  const mode = useWatch({ control, name: "production_mode" });
  const needs = goalById(goalId)?.footage;
  const skip = skipsFootage({ goal: goalId, production_mode: mode });

  // Optional-upload goals start in "upload" mode.
  useEffect(() => {
    if (needs?.optional && !mode) setValue("production_mode", needs.optional.upload_mode);
  }, [needs, mode, setValue]);

  const add = (files: File[]) => {
    const fresh = files.map((file) => ({ id: `f${++nextId}`, file, duration: undefined }));
    onChange((prev) => [...prev, ...fresh]);
    for (const f of fresh) {
      void readDuration(f.file).then((duration) =>
        onChange((prev) => prev.map((p) => (p.id === f.id ? { ...p, duration } : p))),
      );
    }
  };

  if (!needs) return null;
  const canPreview = typeof URL.createObjectURL === "function";
  const languagesError = problem === "languagesRequired" ? L.errors[problem] : undefined;

  return (
    <div className="space-y-6">
      {needs.optional && (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">{L.modeLabel}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              [needs.optional.upload_mode, L.modeUpload, L.modeUploadBody],
              [needs.optional.skip_mode, L.modeSynthetic, L.modeSyntheticBody],
            ].map(([value, title, body]) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => setValue("production_mode", value!)}
                className={cn(
                  "rounded-card border p-4 text-left transition",
                  mode === value
                    ? "border-accent bg-accent-dim"
                    : "border-border bg-surface hover:border-accent/60",
                )}
              >
                <span className="block font-medium">{title}</span>
                <span className="mt-1 block text-sm text-text-2">{body}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {!skip && (
        <div className="space-y-3">
          <DropZone
            label={t.uploads.choose}
            accept={acceptAttr(needs.accept, limits)}
            onFiles={add}
            hint={
              <>
                {t.uploads.accepts(needs.accept.map((k) => t.uploads.media[k]).join(", "))}
                {limits && <> · {t.uploads.maxSize(fmtBytes(limits.max_bytes))}</>}
                {needs.min_s && (
                  <span className="block">{L.minLength(fmtLength(needs.min_s))}</span>
                )}
              </>
            }
          />
          {staged.length > 0 && (
            <ul className="divide-y divide-border-soft rounded-card border border-border-soft">
              {staged.map((f) => {
                const media = kindOf(f.file.name, limits);
                const issue =
                  fileIssue(f.file, needs.accept, limits) ??
                  (tooShort(f, needs.min_s) ? t.uploads.tooShort(fmtLength(needs.min_s!)) : null);
                return (
                  <FileRow
                    key={f.id}
                    name={f.file.name}
                    media={media}
                    meta={
                      f.duration === undefined && media && media !== "image"
                        ? `${fmtBytes(f.file.size)} · ${t.uploads.checking}`
                        : describeMedia({ size: f.file.size, duration_s: f.duration })
                    }
                    issue={issue}
                    preview={
                      canPreview && media && media !== "subtitle" && !issue
                        ? () => <BlobPreview file={f.file} media={media} />
                        : undefined
                    }
                    onRemove={() => onChange((prev) => prev.filter((p) => p.id !== f.id))}
                    removeLabel={t.uploads.remove(f.file.name)}
                  />
                );
              })}
            </ul>
          )}
          <p className="text-xs text-text-3">{L.uploadLater}</p>
        </div>
      )}

      {needs.target_languages && (
        <Field label={L.targetLanguages} hint={L.targetLanguagesHint} error={languagesError}>
          {({ id, describedBy }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              aria-invalid={Boolean(languagesError)}
              className={inputClass}
              {...register("target_languages")}
            />
          )}
        </Field>
      )}

      {problem && problem !== "languagesRequired" && (
        <p role="alert" className="text-sm text-danger">
          {L.errors[problem]}
        </p>
      )}
    </div>
  );
}
