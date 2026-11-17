import { useState } from "react";
import { Badge, Banner, Card, ErrorText, Spinner, controlClass } from "@/components/ui";
import { useT } from "@/i18n";
import { useDecisions, useRequirements, useSpecDecision } from "@/hooks/api";
import type { BriefImprovement, SpecFlow } from "@/types/api";
import { fmtMoney } from "@/utils/format";
import { GateActions } from "./GateActions";
import { CreatorInputs } from "./CreatorInputs";
import {
  answersWithDefaults,
  defaultPicks,
  missingRequired,
  pendingDecision,
  pickedCost,
} from "./spec";

/** Gate 1: the agent's reading of the request. The user corrects, answers and picks improvements. */
export function RequirementsPanel({ projectId, flow }: { projectId: string; flow: SpecFlow }) {
  const t = useT();
  const L = t.spec.requirements;
  const view = useRequirements(projectId, true);
  const decisions = useDecisions(projectId).data ?? [];
  const decide = useSpecDecision(projectId, "requirements");
  const [picks, setPicks] = useState<string[] | null>(null);
  const [typed, setTyped] = useState<Record<string, string>>({});

  if (view.isPending) return <Spinner label={L.loading} />;
  if (view.isError || !view.data) return <ErrorText>{L.loadFailed}</ErrorText>;
  const { brief, state, errors, token } = view.data;
  const open = flow.gate?.stage === "requirements" && token === flow.gate.token;
  const chosen = picks ?? defaultPicks(brief);
  const toggle = (id: string) =>
    setPicks(chosen.includes(id) ? chosen.filter((p) => p !== id) : [...chosen, id]);
  const base = brief.constraints.budget_cap_usd;
  const extra = pickedCost(brief, chosen);
  const missing = missingRequired(brief, typed);
  const send = (action: "approve" | "revise" | "abort", notes = "") =>
    decide.mutate({
      action,
      token: token ?? "",
      notes,
      selected_improvements: action === "approve" ? chosen : [],
      answers: action === "approve" ? answersWithDefaults(brief, typed) : {},
    });

  return (
    <Card className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold">{L.title}</h2>
        <p className="mt-1 text-sm text-text-2">{L.intro}</p>
      </header>
      {state === "invalid" && (
        <Banner tone="danger" title={L.invalid}>
          <ul className="list-disc pl-5 text-sm">
            {errors.slice(0, 5).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Banner>
      )}
      <section aria-labelledby="req-summary">
        <h3 id="req-summary" className="font-semibold">
          {L.summary}
        </h3>
        <p className="mt-1 text-sm">{brief.summary}</p>
        <p className="mt-2 text-xs text-text-3">
          {L.constraints(
            brief.constraints.duration_seconds,
            brief.constraints.aspect_ratio,
            fmtMoney(base),
          )}
        </p>
      </section>
      <Section title={L.goals}>
        {brief.goals.map((g) => (
          <li key={g.id}>
            <span className="font-medium">{g.text}</span>
            <span className="block text-xs text-text-3">
              {L.successCheck}: {g.success_check}
            </span>
          </li>
        ))}
      </Section>
      <Section title={L.nonGoals}>
        {brief.non_goals.map((n) => (
          <li key={n.id}>{n.text}</li>
        ))}
      </Section>
      <Section title={L.scenarios}>
        {brief.scenarios.map((s) => (
          <li key={s.id}>
            <span className="font-medium">{s.viewer}</span> — {s.situation}
            <span className="block text-xs text-text-3">→ {s.outcome}</span>
          </li>
        ))}
      </Section>
      {brief.assumptions.length > 0 && (
        <Section title={L.assumptions}>
          {brief.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </Section>
      )}
      {brief.open_questions.length > 0 && (
        <section aria-labelledby="req-questions" className="space-y-3">
          <h3 id="req-questions" className="font-semibold">
            {L.questions}
          </h3>
          {brief.open_questions.map((q) => (
            <label key={q.id} className="block space-y-1 text-sm">
              <span className="font-medium">{q.question}</span>
              <input
                className={controlClass}
                disabled={!open}
                placeholder={q.default_answer}
                value={typed[q.id] ?? ""}
                onChange={(e) => setTyped({ ...typed, [q.id]: e.target.value })}
              />
              <span className="text-xs text-text-3">{L.defaultIs(q.default_answer)}</span>
            </label>
          ))}
        </section>
      )}
      <CreatorInputs
        projectId={projectId}
        brief={brief}
        answers={typed}
        disabled={!open}
        onChange={(id, value) => setTyped({ ...typed, [id]: value })}
      />
      <section aria-labelledby="req-improvements" className="space-y-3">
        <h3 id="req-improvements" className="font-semibold">
          {L.improvements}
        </h3>
        {brief.improvements.map((imp) => (
          <ImprovementRow
            key={imp.id}
            imp={imp}
            checked={chosen.includes(imp.id)}
            disabled={!open}
            onToggle={() => toggle(imp.id)}
          />
        ))}
        <p className="text-sm">{L.total(fmtMoney(base), fmtMoney(extra))}</p>
      </section>
      {state === "approved" ? (
        <Banner tone="success" title={L.approved} />
      ) : open ? (
        <GateActions
          projectId={projectId}
          pending={pendingDecision(decisions, "requirements")}
          approveLabel={L.approve}
          busy={decide.isPending}
          approveBlocked={missing.length > 0 ? L.fillRequired(missing.map((m) => m.label)) : null}
          error={decide.error}
          onApprove={() => send("approve")}
          onRevise={(n) => send("revise", n)}
          onAbort={() => send("abort")}
        />
      ) : (
        <p className="text-sm text-text-3">{L.notOpen}</p>
      )}
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="font-semibold">{title}</h3>
      <ul className="list-disc space-y-1 pl-5 text-sm">{children}</ul>
    </section>
  );
}

function ImprovementRow({
  imp,
  checked,
  disabled,
  onToggle,
}: {
  imp: BriefImprovement;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const L = useT().spec.requirements;
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-control border border-border p-3 text-sm has-[:checked]:border-accent">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
        className="mt-1"
      />
      <span className="space-y-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{imp.title}</span>
          {imp.recommended && <Badge tone="accent">{L.recommended}</Badge>}
          <Badge tone={imp.risk === "low" ? "success" : imp.risk === "high" ? "danger" : "info"}>
            {L.risk[imp.risk]}
          </Badge>
          <span className="text-xs text-text-3">+{fmtMoney(imp.cost_delta_usd)}</span>
        </span>
        <span className="block text-text-2">{imp.benefit}</span>
        <span className="block text-xs text-text-3">{imp.rationale}</span>
      </span>
    </label>
  );
}
