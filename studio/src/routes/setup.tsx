import { Badge, Banner, Button, Card, EmptyState, Spinner } from "@/components/ui";
import {
  byCapabilityPriority,
  capabilityLabel,
  GENERIC_PROVIDERS,
  RUNTIME_LABELS,
} from "@/content/labels";
import { UnlockCard } from "@/features/setup/UnlockCard";
import { VideoTypeList } from "@/features/setup/VideoTypeList";
import { useT } from "@/i18n";
import { useSetup, type SetupView } from "@/lib/api";
import { fmtAgo } from "@/lib/format";
import { ServerDown } from "./ServerDown";

export function SetupPage() {
  const t = useT();
  const L = t.setup;
  const { setup, view, checking, failedJob, recheck } = useSetup();

  return (
    <section className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{L.title}</h1>
          <p className="mt-1 text-text-2">{L.intro}</p>
        </div>
        {view && (
          <Button onClick={() => recheck.mutate()} disabled={checking || recheck.isPending}>
            {checking ? L.checking : L.checkAgain}
          </Button>
        )}
      </header>

      {setup.isError && <ServerDown />}
      {failedJob && (
        <Banner
          tone="danger"
          title={L.checkFailed}
          action={<Button onClick={() => recheck.mutate()}>{t.common.tryAgain}</Button>}
        >
          {failedJob.error}
        </Banner>
      )}
      {!view && checking && (
        <EmptyState title={L.checkingTitle}>
          <span className="inline-flex items-center gap-2">
            <Spinner label={L.checking} /> {L.checkingBody}
          </span>
        </EmptyState>
      )}
      {view && <SetupContent view={view} checking={checking} onSaved={() => recheck.mutate()} />}
    </section>
  );
}

function SetupContent({
  view,
  checking,
  onSaved,
}: {
  view: SetupView;
  checking: boolean;
  onSaved: () => void;
}) {
  const t = useT();
  const L = t.setup;
  const tier = L.tiers[view.tier] ?? { label: view.tier_label, explanation: view.tier_explanation };
  return (
    <div className="space-y-10">
      <Card className="flex flex-wrap items-center gap-4">
        <Badge tone="accent">{tier.label}</Badge>
        <p className="flex-1 text-text">{tier.explanation}</p>
        <p className="text-sm text-text-3">
          {checking
            ? L.checkingAgain
            : view.checked_at
              ? L.checkedAgo(fmtAgo(view.checked_at))
              : ""}
        </p>
      </Card>

      {view.warnings.length > 0 && (
        <section aria-labelledby="warn-h" className="space-y-2">
          <h2 id="warn-h" className="text-lg font-semibold">
            {L.thingsToKnow}
          </h2>
          <ul className="space-y-2">
            {view.warnings.map((w) => (
              <li
                key={w}
                className="rounded-control border border-accent/40 bg-accent-dim px-3 py-2 font-mono text-xs whitespace-pre-wrap text-text-2"
              >
                {w}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="works-h" className="space-y-3">
        <h2 id="works-h" className="text-lg font-semibold">
          {L.worksNow}
        </h2>
        <p className="text-sm text-text-2">
          {L.engines}{" "}
          {Object.entries(view.runtimes).map(([name, ok], i) => (
            <span key={name}>
              {i > 0 && " · "}
              <span className={ok ? "text-success" : "text-text-3 line-through"}>
                {RUNTIME_LABELS[name] ?? name} {ok ? "✓" : "✗"}
              </span>
            </span>
          ))}
        </p>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[...view.works_now]
            .sort((a, b) => byCapabilityPriority(a.capability, b.capability))
            .map((w) => (
              <li
                key={w.capability}
                className="rounded-control border border-border bg-surface px-3 py-2"
              >
                <p className="font-medium">{capabilityLabel(w.capability)}</p>
                <p className="text-xs text-text-3">
                  {w.providers.filter((p) => !GENERIC_PROVIDERS.has(p)).join(", ") || L.builtIn}
                </p>
              </li>
            ))}
        </ul>
      </section>

      <section aria-labelledby="types-h" className="space-y-3">
        <h2 id="types-h" className="text-lg font-semibold">
          {L.videoTypes}
        </h2>
        <VideoTypeList types={view.video_types} offers={view.offers} />
      </section>

      {view.suggested_offers.length > 0 && (
        <section aria-labelledby="unlock-h" className="space-y-3">
          <h2 id="unlock-h" className="text-lg font-semibold">
            {L.unlockMore}
          </h2>
          <div className="grid gap-4 lg:grid-cols-3">
            {view.suggested_offers.map((offer) => (
              <UnlockCard
                key={offer.env_var}
                offer={offer}
                status={view.keys[offer.env_var]}
                onSaved={onSaved}
              />
            ))}
          </div>
        </section>
      )}

      {view.offers.length > view.suggested_offers.length && (
        <details className="group">
          <summary className="cursor-pointer text-lg font-semibold">
            {L.allProviders(view.offers.length)}
          </summary>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {view.offers.slice(view.suggested_offers.length).map((offer) => (
              <UnlockCard
                key={offer.env_var}
                offer={offer}
                status={view.keys[offer.env_var]}
                onSaved={onSaved}
              />
            ))}
          </div>
        </details>
      )}

      {view.hardware.length > 0 && (
        <details>
          <summary className="cursor-pointer text-lg font-semibold">
            {L.hardware(view.hardware.length)}
          </summary>
          <p className="mt-2 text-sm text-text-2">{L.hardwareBody}</p>
          <ul className="mt-3 space-y-2">
            {view.hardware.map((h) => (
              <li key={h.tool} className="rounded-control border border-border bg-surface p-3">
                <p className="font-medium">
                  {capabilityLabel(h.capability)}{" "}
                  <span className="text-sm font-normal text-text-3">· {h.provider}</span>
                </p>
                <p className="mt-1 text-sm whitespace-pre-line text-text-2">
                  {h.install_instructions}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
