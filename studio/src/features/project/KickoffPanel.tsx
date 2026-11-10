import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { useT } from "@/i18n";
import type { Kickoff, KickoffAgent } from "@/lib/api";
import { cn } from "@/lib/cn";

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
    <Card className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">{L.startTitle}</h2>
        <p className="mt-1 text-sm text-text-2">{L.startBody}</p>
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
              "rounded-full border px-3 py-1 text-sm",
              a.id === agent.id
                ? "border-accent bg-accent-dim text-accent"
                : "border-border text-text-2 hover:text-text",
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
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(agent.command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-stretch gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto rounded-control border border-border bg-surface-2 px-3 py-2 font-mono text-sm whitespace-nowrap select-all">
          {agent.command}
        </code>
        <Button onClick={() => void copy()} aria-label={t.project.kickoff.copyCommand(agent.label)}>
          {copied ? t.common.copied : t.common.copy}
        </Button>
      </div>
      <p className="text-xs text-text-3">{t.project.kickoff.notes[agent.id] ?? agent.note}</p>
    </div>
  );
}
