import { useState } from "react";
import { Banner, Button, ButtonLink } from "@/components/ui";
import { capabilityLabel } from "@/content/labels";
import { useT } from "@/i18n";
import { useSetup } from "@/hooks/api";

const DISMISS_KEY = "studio.unlockMoreDismissed";

/** Home nudge for zero-key machines: one line, one link, dismissible. */
export function UnlockMoreCard() {
  const t = useT();
  const L = t.setup.nudge;
  const { view } = useSetup();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === "1");
  if (dismissed || !view || view.tier !== "zero_key") return null;
  const top = view.suggested_offers[0];

  return (
    <Banner
      tone="info"
      title={L.title}
      action={
        <div className="flex gap-2">
          <ButtonLink to="/setup" variant="primary" size="sm">
            {L.unlockMore}
          </ButtonLink>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              localStorage.setItem(DISMISS_KEY, "1");
              setDismissed(true);
            }}
          >
            {t.common.dismiss}
          </Button>
        </div>
      }
    >
      {top
        ? L.oneKeyAdds(top.new_capabilities.map(capabilityLabel).join(" & ") || L.moreTools)
        : L.generic}
    </Banner>
  );
}
