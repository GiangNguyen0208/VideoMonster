import { useState } from "react";
import { Terminal } from "@/components/icons";
import { Badge, Card, CodeBox } from "@/components/ui";
import { useT } from "@/i18n";
import type { Kickoff, KickoffAgent } from "@/types/api";
import { cn } from "@/utils/cn";

/**
 * "Start your agent" — shown on a Studio-created project until the agent
 * writes anything. Studio never runs the agent itself; the user pastes one
 * command into their terminal and watches progress arrive here.
 */
export function KickoffPanel({ kickoff }: { kickoff: Kickoff }) {
  const t = useT();
  const L = t.project.kickoff;
  const [agentId, setAgentId] = useState(kickoff.agents[0]?.id ?? "");
  const agent = kickoff.agents.find((a) => a.id === agentId) ?? kickoff.agents[0];
  if (!agent) return null;

  return (
    <Card variant="active" className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Terminal className="size-5 text-accent" aria-hidden />
            {L.startTitle}
          </h2>
          <p className="mt-1 text-sm text-text-2">{L.startBody}</p>
        </div>
        <Badge tone="accent" dot pulse>
          {L.listening}
        </Badge>
      </div>
      <div role="tablist" aria-label={L.agentTabs} className="flex flex-wrap gap-2">
        {kickoff.agents.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={a.id === agent.id}
            onClick={() => setAgentId(a.id)}
            className={cn(
              "rounded-control border px-3 py-1.5 text-sm font-medium transition",
              a.id === agent.id
                ? "border-accent bg-accent-dim text-accent"
                : "border-border bg-surface-high text-text-2 hover:text-text",
            )}
          >
            {a.label}
          </button>
        ))}
      </div>
      <CommandBox agent={agent} />
      <div>
        <h2 className="text-lg font-semibold">{L.watchTitle}</h2>
        <p className="mt-1 text-sm text-text-2">{L.watchBody}</p>
      </div>
    </Card>
  );
}

function CommandBox({ agent }: { agent: KickoffAgent }) {
  const t = useT();
  return (
    <div className="space-y-1.5">
      <CodeBox code={agent.command} copyLabel={t.project.kickoff.copyCommand(agent.label)} />
      <p className="text-xs text-text-3">{t.project.kickoff.notes[agent.id] ?? agent.note}</p>
    </div>
  );
}
