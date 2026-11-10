import { Controller, useFormContext } from "react-hook-form";
import { MusicPicker } from "@/features/music/MusicPicker";
import { useT } from "@/i18n";
import type { PipelineInfo, StyleInfo } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Advanced, ChipGroup, Field, inputClass } from "./fields";
import { errorText, stylesFor, type WizardValues } from "./wizard";

/** Step 3 — look and budget, with expert options tucked under Advanced. */
export function LookStep({
  info,
  styles,
  freeOnly,
}: {
  info: PipelineInfo | undefined;
  styles: StyleInfo[];
  freeOnly: boolean;
}) {
  const t = useT();
  const L = t.wizard.look;
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<WizardValues>();
  const recommended = new Set(info?.compatible_playbooks.recommended ?? []);
  const options = stylesFor(info, styles);

  return (
    <div className="space-y-8">
      <Controller
        control={control}
        name="style_playbook"
        render={({ field }) => (
          <fieldset>
            <legend className="mb-3 text-sm font-medium">{L.style}</legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <StyleCard
                selected={field.value === ""}
                onSelect={() => field.onChange("")}
                title={L.agentChooses}
                text={L.agentChoosesBody}
              />
              {options.map((s) => (
                <StyleCard
                  key={s.name}
                  selected={field.value === s.name}
                  onSelect={() => field.onChange(s.name)}
                  title={s.title}
                  text={s.best_for ?? s.mood ?? ""}
                  palette={s.palette}
                  tag={recommended.has(s.name) ? L.recommended : s.custom ? L.yours : undefined}
                />
              ))}
            </div>
          </fieldset>
        )}
      />

      <Controller
        control={control}
        name="music_track"
        render={({ field }) => (
          <details
            className="group rounded-card border border-border-soft bg-surface px-4 py-3"
            open={field.value !== "" || undefined}
          >
            <summary className="cursor-pointer text-sm font-medium group-open:mb-1">
              {t.music.heading}
            </summary>
            <p className="mb-3 text-xs text-text-3">{t.music.hint}</p>
            <MusicPicker value={field.value} onChange={field.onChange} />
          </details>
        )}
      />

      {freeOnly ? (
        <div className="rounded-card border border-success/40 bg-success-dim px-4 py-3">
          <p className="font-medium">{L.freeTitle}</p>
          <p className="text-sm text-text-2">{L.freeBody}</p>
        </div>
      ) : (
        <Field label={L.budget} hint={L.budgetHint} error={errorText(errors.cap_usd?.message)}>
          {({ id, describedBy }) => (
            <input
              id={id}
              type="number"
              min={0}
              max={1000}
              step={0.5}
              aria-describedby={describedBy}
              aria-invalid={Boolean(errors.cap_usd)}
              className={`${inputClass} max-w-40`}
              {...register("cap_usd", { valueAsNumber: true })}
            />
          )}
        </Field>
      )}

      <Advanced label={t.common.advanced}>
        <Controller
          control={control}
          name="render_runtime_preference"
          render={({ field }) => (
            <div className="space-y-1">
              <ChipGroup
                label={L.engine}
                value={field.value}
                onChange={(v) => field.onChange(v)}
                options={[
                  { value: "", label: L.noPreference },
                  { value: "remotion", label: "Remotion" },
                  { value: "hyperframes", label: "HyperFrames" },
                ]}
              />
              <p className="text-xs text-text-3">{L.engineHint}</p>
            </div>
          )}
        />
        <Controller
          control={control}
          name="composition_mode_preference"
          render={({ field }) => (
            <ChipGroup
              label={L.look}
              value={field.value}
              onChange={(v) => field.onChange(v)}
              options={[
                { value: "", label: L.noPreference },
                { value: "templated", label: L.lookStandard },
                { value: "atelier", label: L.lookCustom },
              ]}
            />
          )}
        />
        <Controller
          control={control}
          name="checkpoint_policy"
          render={({ field }) => (
            <ChipGroup
              label={L.reviewPoints}
              value={field.value}
              onChange={(v) => field.onChange(v)}
              options={[
                { value: "guided", label: L.reviewGuided },
                { value: "manual_all", label: L.reviewAll },
              ]}
            />
          )}
        />
      </Advanced>
    </div>
  );
}

function StyleCard({
  selected,
  onSelect,
  title,
  text,
  palette,
  tag,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  text: string;
  palette?: string[];
  tag?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "h-full rounded-card border p-4 text-left transition",
        selected
          ? "border-accent bg-accent-dim"
          : "border-border bg-surface hover:border-accent/60",
      )}
    >
      {palette && palette.length > 0 && (
        <span className="mb-3 flex h-6 overflow-hidden rounded-control" aria-hidden>
          {palette.map((c) => (
            <span key={c} className="flex-1" style={{ backgroundColor: c }} />
          ))}
        </span>
      )}
      <span className="flex items-center justify-between gap-2 font-medium">
        {title}
        {tag && <span className="text-xs font-normal text-accent">{tag}</span>}
      </span>
      <span className="mt-1 block text-sm text-text-2">{text}</span>
    </button>
  );
}
