import { useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui";
import { useT } from "@/i18n";
import { fmtClock } from "@/utils/format";
import type { BoardState } from "@/types/api";
import { replayBounds } from "./replay";

/** A whole run replays in about 20 seconds, whatever its real length. */
const TICKS = 200;
const TICK_MS = 100;
const SLIDER_MAX = 1000;

/**
 * Scrub back through a run. `at` is the moment shown (epoch ms), or null for
 * the live view; the page redraws itself from `onChange`.
 */
export function ReplayBar({
  state,
  at,
  onChange,
}: {
  state: BoardState;
  at: number | null;
  onChange: (at: number | null) => void;
}) {
  const t = useT();
  const L = t.project.replay;
  const sliderId = useId();
  const bounds = useMemo(() => replayBounds(state), [state]);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing || at === null || !bounds) return;
    const id = setTimeout(() => {
      const next = Math.min(bounds.t1, at + (bounds.t1 - bounds.t0) / TICKS);
      onChange(next);
      if (next >= bounds.t1) setPlaying(false);
    }, TICK_MS);
    return () => clearTimeout(id);
  }, [playing, at, bounds, onChange]);

  if (!bounds) return null;

  if (at === null) {
    return (
      <div className="flex items-center justify-end gap-3 text-sm text-text-2">
        <span>{L.hint}</span>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            onChange(bounds.t0);
            setPlaying(true);
          }}
        >
          {L.start}
        </Button>
      </div>
    );
  }

  const pos = Math.round(((at - bounds.t0) / Math.max(1, bounds.t1 - bounds.t0)) * SLIDER_MAX);
  const stop = () => {
    setPlaying(false);
    onChange(null);
  };
  return (
    <div role="group" aria-label={L.label} className="flex items-center gap-3">
      <Button size="sm" variant="secondary" onClick={() => setPlaying(!playing)}>
        {playing ? L.pause : L.play}
      </Button>
      <label htmlFor={sliderId} className="sr-only">
        {L.scrub}
      </label>
      <input
        id={sliderId}
        type="range"
        min={0}
        max={SLIDER_MAX}
        value={pos}
        onPointerDown={() => setPlaying(false)}
        onChange={(e) => {
          setPlaying(false);
          onChange(bounds.t0 + (Number(e.target.value) / SLIDER_MAX) * (bounds.t1 - bounds.t0));
        }}
        className="min-w-0 flex-1 accent-[var(--amber)]"
      />
      <span className="w-20 shrink-0 text-right font-mono text-xs text-text-2">
        {fmtClock(new Date(at).toISOString())}
      </span>
      <Button size="sm" variant="ghost" onClick={stop}>
        {L.live}
      </Button>
    </div>
  );
}
