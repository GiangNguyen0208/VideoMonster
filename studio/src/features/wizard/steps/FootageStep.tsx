import { useEffect } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Info, Lock, Sparkles } from "@/components/icons";
import {
  Badge,
  Button,
  Card,
  ComingSoon,
  controlClass,
  ErrorText,
  Field,
  InfoBox,
  ListBox,
  Screenplay,
  Section,
  SelectableCard,
} from "@/components/ui";
import { goalById } from "@/content/goals";
import { DropZone } from "@/features/uploads/DropZone";
import { BlobPreview, FileRow } from "@/features/uploads/FileRow";
import {
  acceptAttr,
  describeMedia,
  fileIssue,
  kindOf,
  readDuration,
} from "@/features/uploads/media";
import { useT } from "@/i18n";
import { useUploadLimits } from "@/hooks/api";
import { fmtBytes, fmtLength } from "@/utils/format";
import { skipsFootage, tooShort, type StagedFile, type WizardValues } from "../wizard";

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

  const totalSize = staged.reduce((sum, f) => sum + f.file.size, 0);

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
              <SelectableCard
                key={value}
                selected={mode === value}
                onClick={() => setValue("production_mode", value!)}
              >
                <span className="block font-medium">{title}</span>
                <span className="block text-sm text-text-2">{body}</span>
              </SelectableCard>
            ))}
          </div>
        </fieldset>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          {!skip && (
            <Section
              title={L.yourFiles}
              action={
                staged.length > 0 && (
                  <Badge className="font-mono">
                    {L.filesSummary(staged.length, fmtBytes(totalSize))}
                  </Badge>
                )
              }
            >
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
                <ListBox>
                  {staged.map((f) => {
                    const media = kindOf(f.file.name, limits);
                    const issue =
                      fileIssue(f.file, needs.accept, limits) ??
                      (tooShort(f, needs.min_s)
                        ? t.uploads.tooShort(fmtLength(needs.min_s!))
                        : null);
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
                </ListBox>
              )}
              <p className="text-xs text-text-2">{L.uploadLater}</p>
              <InfoBox icon={<Info className="size-4" />}>{L.cliHint}</InfoBox>
            </Section>
          )}

          {needs.target_languages && (
            <Field label={L.targetLanguages} hint={L.targetLanguagesHint} error={languagesError}>
              {({ id, describedBy }) => (
                <input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(languagesError)}
                  className={controlClass}
                  {...register("target_languages")}
                />
              )}
            </Field>
          )}

          {problem && problem !== "languagesRequired" && <ErrorText>{L.errors[problem]}</ErrorText>}
        </div>

        <aside className="space-y-4">
          <ComingSoon>
            <Card className="space-y-3">
              <h2 className="flex items-center gap-2 font-semibold">
                <Sparkles className="size-4 text-info" aria-hidden />
                {L.referenceTitle}
              </h2>
              <p className="text-sm text-text-2">{L.referenceBody}</p>
              <div className="flex gap-2">
                <input
                  className={controlClass}
                  placeholder="https://"
                  aria-label={L.referenceUrl}
                />
                <Button size="md">{L.analyse}</Button>
              </div>
              <p className="text-xs text-text-2">{L.referenceLater}</p>
            </Card>
          </ComingSoon>
          <ComingSoon>
            <Screenplay title={L.directorLog} meta="—">
              <div aria-hidden className="space-y-2">
                <div className="h-3 w-full rounded bg-cream-ink/10" />
                <div className="h-3 w-4/5 rounded bg-cream-ink/10" />
              </div>
            </Screenplay>
          </ComingSoon>
          <p className="flex gap-2 text-xs text-text-2">
            <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {L.privacy}
          </p>
        </aside>
      </div>
    </div>
  );
}
