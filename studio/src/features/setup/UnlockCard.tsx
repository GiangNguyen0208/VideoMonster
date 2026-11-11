import { Badge, Card } from "@/components/ui";
import { byCapabilityPriority, capabilityLabel, videoTypeLabel } from "@/content/labels";
import { msg, useT } from "@/i18n";
import type { KeyStatus, UnlockOffer } from "@/types/api";
import { KeyForm } from "./KeyForm";

const MAX_TITLE_CAPS = 2;
const MAX_IMPROVES = 3;

/** "AI images & AI video clips" — top capabilities only, "+N more" after. */
function titleFor(ids: string[]): string {
  const sorted = [...ids].sort(byCapabilityPriority);
  const shown = sorted.slice(0, MAX_TITLE_CAPS).map(capabilityLabel).join(" & ");
  const rest = sorted.length - MAX_TITLE_CAPS;
  return rest > 0 ? msg().setup.card.andMore(shown, rest) : shown;
}

export function UnlockCard({
  offer,
  status,
  onSaved,
}: {
  offer: UnlockOffer;
  status: KeyStatus | undefined;
  onSaved: () => void;
}) {
  const t = useT();
  const L = t.setup.card;
  const adds = offer.new_capabilities.length ? offer.new_capabilities : offer.capabilities;
  return (
    <Card id={`key-${offer.env_var}`} className="flex scroll-mt-24 flex-col gap-4">
      <div>
        <h3 className="font-semibold">{L.add(titleFor(adds))}</h3>
        <p className="text-sm text-text-3">{L.via(offer.providers.join(", "))}</p>
      </div>

      {(offer.unlocks_video_types.length > 0 || offer.improves_video_types.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {offer.unlocks_video_types.map((p) => (
            <Badge key={p} tone="success">
              {L.unlocks(videoTypeLabel(p))}
            </Badge>
          ))}
          {offer.improves_video_types.slice(0, MAX_IMPROVES).map((p) => (
            <Badge key={p} tone="info">
              {L.better(videoTypeLabel(p))}
            </Badge>
          ))}
          {offer.improves_video_types.length > MAX_IMPROVES && (
            <Badge tone="info">
              {L.moreImproved(offer.improves_video_types.length - MAX_IMPROVES)}
            </Badge>
          )}
        </div>
      )}

      {offer.install_instructions && (
        <p className="text-sm whitespace-pre-line text-text-2">{offer.install_instructions}</p>
      )}
      {offer.signup_url && (
        <a
          href={offer.signup_url}
          target="_blank"
          rel="noreferrer noopener"
          className="text-sm text-accent underline"
        >
          {L.getKey}
        </a>
      )}

      <div className="mt-auto">
        <KeyForm envVar={offer.env_var} status={status} onSaved={onSaved} />
      </div>
    </Card>
  );
}
