import { Badge } from "@/components/ui";
import { capabilityLabel, videoTypeLabel } from "@/content/labels";
import { useT } from "@/i18n";
import type { UnlockOffer, VideoTypeAvailability } from "@/lib/api";

const ORDER = { ready: 0, limited: 1, locked: 2 } as const;

/** Every video type with an honest state: ready, works-but-better-with, locked. */
export function VideoTypeList({
  types,
  offers,
}: {
  types: VideoTypeAvailability[];
  offers: UnlockOffer[];
}) {
  const t = useT();
  const L = t.setup;
  const sorted = [...types].sort(
    (a, b) => ORDER[a.state] - ORDER[b.state] || a.pipeline.localeCompare(b.pipeline),
  );
  return (
    <ul className="divide-y divide-border-soft rounded-card border border-border bg-surface">
      {sorted.map((vt) => {
        const unlockBy = offers.find((o) => o.unlocks_video_types.includes(vt.pipeline));
        return (
          <li key={vt.pipeline} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
            <span className="min-w-48 flex-1 font-medium">
              {videoTypeLabel(vt.pipeline)}
              {vt.stability === "beta" && (
                <span className="ml-2 text-xs font-normal text-text-3">{t.common.beta}</span>
              )}
            </span>
            {vt.state === "ready" && <Badge tone="success">{L.state.ready}</Badge>}
            {vt.state === "limited" && (
              <>
                <Badge tone="info">{L.state.limited}</Badge>
                <span className="text-sm text-text-3">
                  {L.betterWith(vt.missing_enhancements.map(capabilityLabel).join(", "))}
                </span>
              </>
            )}
            {vt.state === "locked" && (
              <>
                <Badge tone="neutral">{L.state.locked}</Badge>
                <span className="text-sm text-text-3">
                  {L.needs(vt.missing_required.map(capabilityLabel).join(", "))}
                </span>
                {unlockBy && (
                  <a href={`#key-${unlockBy.env_var}`} className="text-sm text-accent underline">
                    {L.unlock}
                  </a>
                )}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
