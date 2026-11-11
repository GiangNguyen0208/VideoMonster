import { useId, useState, type ReactNode } from "react";
import { Button, Card, ChipGroup, Spinner } from "@/components/ui";
import { useT } from "@/i18n";
import {
  ApiError,
  useSaveSettings,
  useSettings,
  type SettingsView,
  type StudioSettings,
} from "@/lib/api";
import { fmtMoney } from "@/lib/format";
import { fieldErrors } from "./errors";

/** Spending limits, review policy and output defaults (writes config.yaml). */
export function SettingsForm() {
  const view = useSettings();
  const t = useT();
  if (view.isPending) return <Spinner label={t.settings.loading} />;
  if (view.isError || !view.data) {
    return <p className="text-sm text-danger">{t.settings.loadError}</p>;
  }
  return <Form view={view.data} />;
}

function Form({ view }: { view: SettingsView }) {
  const t = useT();
  const L = t.settings;
  const save = useSaveSettings();
  const [v, setV] = useState<StudioSettings>(view.settings);
  const [saved, setSaved] = useState(false);
  const bad = fieldErrors(save.error);
  const set = <S extends keyof StudioSettings>(section: S, patch: Partial<StudioSettings[S]>) => {
    setSaved(false);
    setV((prev) => ({ ...prev, [section]: { ...prev[section], ...patch } }));
  };
  const money = (n: number) =>
    Number.isFinite(n) && n >= 0 && n <= 10000 ? null : L.errors.amount;
  const clientErrors = {
    "budget.total_usd": money(v.budget.total_usd),
    "budget.single_action_approval_usd": money(v.budget.single_action_approval_usd),
  };
  const errorFor = (key: keyof typeof clientErrors | string) =>
    (clientErrors as Record<string, string | null>)[key] ??
    (bad.has(key) ? L.errors.invalid : null);
  const hasClientErrors = Object.values(clientErrors).some(Boolean);
  const dirty = JSON.stringify(v) !== JSON.stringify(view.settings);

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (hasClientErrors) return;
        save.mutate(v, { onSuccess: () => setSaved(true) });
      }}
      noValidate
    >
      <Card className="space-y-5">
        <div>
          <h2 className="font-semibold">{L.spending.title}</h2>
          <p className="text-sm text-text-2">{L.spending.intro}</p>
        </div>
        <ChipGroup
          label={L.spending.mode}
          value={v.budget.mode}
          onChange={(mode) => set("budget", { mode: mode as StudioSettings["budget"]["mode"] })}
          options={(["observe", "warn", "cap"] as const).map((m) => ({
            value: m,
            label: t.cost.modes[m]!.title,
          }))}
        />
        <p className="-mt-3 text-xs text-text-3">{t.cost.modes[v.budget.mode]?.body}</p>
        <MoneyField
          label={L.spending.total}
          hint={L.spending.totalHint}
          value={v.budget.total_usd}
          error={errorFor("budget.total_usd")}
          onChange={(total_usd) => set("budget", { total_usd })}
        />
        <MoneyField
          label={L.spending.singleAction(fmtMoney(v.budget.single_action_approval_usd))}
          hint={L.spending.singleActionHint}
          value={v.budget.single_action_approval_usd}
          error={errorFor("budget.single_action_approval_usd")}
          onChange={(single_action_approval_usd) => set("budget", { single_action_approval_usd })}
        />
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 accent-accent"
            checked={v.budget.require_approval_for_new_paid_tool}
            onChange={(e) =>
              set("budget", { require_approval_for_new_paid_tool: e.target.checked })
            }
          />
          {L.spending.newTool}
        </label>
      </Card>

      <Card className="space-y-5">
        <div>
          <h2 className="font-semibold">{L.defaults.title}</h2>
          <p className="text-sm text-text-2">{L.defaults.intro}</p>
        </div>
        <ChipGroup
          label={L.defaults.review}
          value={v.checkpoint.policy}
          onChange={(policy) =>
            set("checkpoint", { policy: policy as StudioSettings["checkpoint"]["policy"] })
          }
          options={(["guided", "manual_all", "auto_noncreative"] as const).map((p) => ({
            value: p,
            label: L.defaults.policies[p]!,
          }))}
        />
        <Select
          label={L.defaults.resolution}
          engineTerm="output.default_resolution"
          value={v.output.default_resolution}
          error={errorFor("output.default_resolution")}
          onChange={(default_resolution) => set("output", { default_resolution })}
          options={view.choices.resolutions.map((r) => ({
            value: r,
            label: `${r.replace("x", "×")}${L.defaults.shapes[r] ? ` — ${L.defaults.shapes[r]}` : ""}`,
          }))}
        />
        <Select
          label={L.defaults.fps}
          engineTerm="output.default_fps"
          value={String(v.output.default_fps)}
          error={errorFor("output.default_fps")}
          onChange={(fps) => set("output", { default_fps: Number(fps) })}
          options={view.choices.fps.map((f) => ({
            value: String(f),
            label: L.defaults.fpsValue(f),
          }))}
        />
      </Card>

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          variant="primary"
          disabled={save.isPending || !dirty || hasClientErrors}
        >
          {save.isPending ? L.saving : L.save}
        </Button>
        {saved && !dirty && (
          <p role="status" className="text-sm text-success">
            {L.saved}
          </p>
        )}
        {save.isError && bad.size === 0 && (
          <p role="alert" className="text-sm text-danger">
            {save.error instanceof ApiError && save.error.status === 403
              ? L.errors.locked
              : L.errors.save}
          </p>
        )}
      </div>
      <p className="text-xs text-text-3">{L.footnote}</p>
    </form>
  );
}

function Labeled({
  label,
  hint,
  error,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: (ids: { id: string; describedBy?: string }) => ReactNode;
}) {
  const id = useId();
  const describedBy =
    [hint && `${id}-h`, error && `${id}-e`].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children({ id, describedBy })}
      {hint && (
        <p id={`${id}-h`} className="text-xs text-text-3">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-e`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function MoneyField({
  label,
  hint,
  value,
  error,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  error: string | null;
  onChange: (n: number) => void;
}) {
  return (
    <Labeled label={label} hint={hint} error={error}>
      {({ id, describedBy }) => (
        <input
          id={id}
          type="number"
          min={0}
          step={0.5}
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? Number.NaN : e.target.valueAsNumber)}
          className="h-10 w-40 rounded-control border border-border bg-surface-2 px-3 text-sm aria-invalid:border-danger"
        />
      )}
    </Labeled>
  );
}

function Select({
  label,
  engineTerm,
  value,
  error,
  options,
  onChange,
}: {
  label: string;
  engineTerm: string;
  value: string;
  error: string | null;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <Labeled
      label={
        <span
          title={engineTerm}
          className="cursor-help underline decoration-dotted underline-offset-4"
        >
          {label}
        </span>
      }
      error={error}
    >
      {({ id, describedBy }) => (
        <select
          id={id}
          aria-describedby={describedBy}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 rounded-control border border-border bg-surface-2 px-3 text-sm"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Labeled>
  );
}
