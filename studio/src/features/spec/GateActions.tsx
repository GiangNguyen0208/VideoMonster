import { useState } from "react";
import { Button, ErrorText, Field, controlClass } from "@/components/ui";
import { useT } from "@/i18n";
import { useRetractDecision } from "@/hooks/api";
import type { StudioDecision } from "@/types/api";
import { errorText } from "@/utils/errors";

/**
 * Approve / request changes / stop for one gate. Studio only records the
 * answer; the agent applies it, so a recorded answer shows as "sent".
 */
export function GateActions({
  projectId,
  pending,
  approveLabel,
  busy,
  approveBlocked = null,
  error,
  onApprove,
  onRevise,
  onAbort,
}: {
  projectId: string;
  pending: StudioDecision | undefined;
  approveLabel: string;
  busy: boolean;
  /** Why Approve is disabled (e.g. required inputs missing), else null. */
  approveBlocked?: string | null;
  error: unknown;
  onApprove: () => void;
  onRevise: (notes: string) => void;
  onAbort: () => void;
}) {
  const t = useT();
  const L = t.spec.gate;
  const retract = useRetractDecision(projectId);
  const [revising, setRevising] = useState(false);
  const [notes, setNotes] = useState("");

  if (pending) {
    return (
      <div className="space-y-2 rounded-card border border-info/30 bg-info-dim p-4" role="status">
        <p className="font-medium">{L.sentTitle(pending.action)}</p>
        <p className="text-sm text-text-2">{L.sentBody}</p>
        <Button size="sm" variant="ghost" onClick={() => retract.mutate(pending.id)}>
          {L.undo}
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {revising && (
        <Field label={L.notesLabel} hint={L.notesHint}>
          {({ id, describedBy }) => (
            <textarea
              id={id}
              aria-describedby={describedBy}
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={controlClass}
            />
          )}
        </Field>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={onApprove} disabled={busy || Boolean(approveBlocked)}>
          {approveLabel}
        </Button>
        {revising ? (
          <Button
            variant="secondary"
            disabled={busy || !notes.trim()}
            onClick={() => onRevise(notes.trim())}
          >
            {L.sendChanges}
          </Button>
        ) : (
          <Button variant="secondary" disabled={busy} onClick={() => setRevising(true)}>
            {L.requestChanges}
          </Button>
        )}
        <Button variant="ghost" disabled={busy} onClick={onAbort}>
          {L.stop}
        </Button>
      </div>
      {approveBlocked ? <p className="text-sm text-text-3">{approveBlocked}</p> : null}
      {error ? <ErrorText>{errorText(error, t.spec.errors)}</ErrorText> : null}
    </div>
  );
}
