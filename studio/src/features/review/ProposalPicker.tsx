import { useId } from "react";
import { Badge, ChipGroup } from "@/components/ui";
import { RUNTIME_LABELS } from "@/content/labels";
import { MusicPicker } from "@/features/music/MusicPicker";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { fmtMoney } from "@/lib/format";
import {
  runtimeOptions,
  type MusicSource,
  type Picks,
  type ProposalDefaults,
  type RuntimeId,
} from "./review";

const MUSIC: MusicSource[] = ["user_library", "ai_generated", "bring_your_own", "none"];

/**
 * Proposal review point: pick a concept, the budget, the rendering engine
 * (Remotion and HyperFrames always shown side by side), look and music.
 */
export function ProposalPicker({
  defaults,
  picks,
  onChange,
  available,
  rationale,
}: {
  defaults: ProposalDefaults;
  picks: Picks;
  onChange: (next: Picks) => void;
  available: Record<string, boolean> | null;
  rationale: Partial<Record<RuntimeId, string>>;
}) {
  const t = useT();
  const L = t.review.proposal;
  const budgetId = useId();
  const set = (patch: Partial<Picks>) => onChange({ ...picks, ...patch });
  const runtimes = runtimeOptions(defaults.runtime);
  const usable = runtimes.filter((r) => !available || available[r] !== false);

  return (
    <div className="space-y-6">
      {defaults.concepts.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">{L.concept}</legend>
          <div className="grid gap-3 md:grid-cols-2">
            {defaults.concepts.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={picks.concept === c.id}
                onClick={() => set({ concept: c.id })}
                className={cn(
                  "rounded-card border p-4 text-left transition",
                  picks.concept === c.id
                    ? "border-accent bg-accent-dim"
                    : "border-border bg-surface hover:border-accent/60",
                )}
              >
                <span className="block font-semibold">{c.title}</span>
                {c.hook && <span className="mt-1 block text-sm text-text-2">“{c.hook}”</span>}
                {c.approach && <span className="mt-1 block text-xs text-text-3">{c.approach}</span>}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <div className="space-y-1.5">
        <label htmlFor={budgetId} className="block text-sm font-medium">
          {L.budget}
        </label>
        <input
          id={budgetId}
          type="number"
          min={0}
          step={0.5}
          value={picks.budget}
          onChange={(e) => set({ budget: e.target.value })}
          className="h-10 w-40 rounded-control border border-border bg-surface-2 px-3 text-sm"
        />
        {defaults.estimate != null && (
          <p className="text-xs text-text-3">{L.estimate(fmtMoney(defaults.estimate))}</p>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">{L.engine}</legend>
        <p className="text-xs text-text-3">
          {usable.length === 1 ? L.onlyOne(RUNTIME_LABELS[usable[0]!] ?? usable[0]!) : L.engineHint}
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {runtimes.map((r) => {
            const disabled = Boolean(available) && available![r] === false;
            return (
              <button
                key={r}
                type="button"
                disabled={disabled}
                aria-pressed={picks.runtime === r}
                onClick={() => set({ runtime: r })}
                className={cn(
                  "rounded-card border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50",
                  picks.runtime === r
                    ? "border-accent bg-accent-dim"
                    : "border-border bg-surface enabled:hover:border-accent/60",
                )}
              >
                <span className="flex items-center justify-between gap-2 font-semibold">
                  {RUNTIME_LABELS[r] ?? r}
                  {defaults.runtime === r && <Badge tone="accent">{L.agentPick}</Badge>}
                </span>
                {rationale[r] && (
                  <span className="mt-1 block text-sm text-text-2">{rationale[r]}</span>
                )}
                {disabled && (
                  <span className="mt-1 block text-xs text-danger">{L.unavailable}</span>
                )}
              </button>
            );
          })}
        </div>
      </fieldset>

      <ChipGroup
        label={L.look}
        value={picks.mode}
        onChange={(v) => set({ mode: v as Picks["mode"] })}
        options={[
          { value: "templated", label: L.lookStandard },
          { value: "atelier", label: L.lookCustom },
        ]}
      />

      <ChipGroup
        label={L.music}
        value={picks.music}
        onChange={(v) => set({ music: v as Picks["music"] })}
        options={MUSIC.map((m) => ({ value: m, label: L.musicOptions[m] ?? m }))}
      />
      {picks.music === "user_library" && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{L.musicTrack}</p>
          <MusicPicker value={picks.musicTrack} onChange={(musicTrack) => set({ musicTrack })} />
        </div>
      )}
    </div>
  );
}
