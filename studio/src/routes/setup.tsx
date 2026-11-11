import {
  Badge,
  Banner,
  Button,
  Card,
  Collapsible,
  ComingSoon,
  EmptyState,
  InfoBox,
  Section,
  Spinner,
} from "@/components/ui";
import { CheckCircle2, RefreshCw, Terminal, TriangleAlert } from "@/components/icons";
import {
  byCapabilityPriority,
  capabilityLabel,
  GENERIC_PROVIDERS,
  RUNTIME_LABELS,
} from "@/content/labels";
import { PageHeader } from "@/components/layout/PageHeader";
import { ServerDown } from "@/components/layout/ServerDown";
import { UnlockCard } from "@/features/setup/UnlockCard";
import { VideoTypeList } from "@/features/setup/VideoTypeList";
import { useT } from "@/i18n";
import { useSetup } from "@/hooks/api";
import type { SetupView } from "@/types/api";
import { fmtAgo } from "@/utils/format";

export function SetupPage() {
  const t = useT();
  const L = t.setup;
  const { setup, view, checking, failedJob, recheck } = useSetup();

  return (
    <div className="space-y-8">
      <PageHeader
        title={L.title}
        description={L.intro}
        actions={
          view && (
            <>
              <ComingSoon inline>
                <Button variant="secondary" leftIcon={<Terminal className="size-4" />}>
                  {L.diagnostics}
                </Button>
              </ComingSoon>
              <Button
                onClick={() => recheck.mutate()}
                disabled={checking || recheck.isPending}
                leftIcon={<RefreshCw className={checking ? "size-4 animate-spin" : "size-4"} />}
              >
                {checking ? L.checking : L.checkAgain}
              </Button>
            </>
          )
        }
      />

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
    </div>
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
      <Card variant="active" padding="lg" className="flex flex-wrap items-center gap-4">
        <Badge tone="accent">{tier.label}</Badge>
        <p className="flex-1 text-lg font-medium text-text">{tier.explanation}</p>
        <p className="text-sm text-text-3">
          {checking
            ? L.checkingAgain
            : view.checked_at
              ? L.checkedAgo(fmtAgo(view.checked_at))
              : ""}
        </p>
      </Card>

      {view.warnings.length > 0 && (
        <Section title={L.thingsToKnow}>
          <ul className="space-y-2">
            {view.warnings.map((w) => (
              <li key={w}>
                <InfoBox icon={<TriangleAlert className="size-4 text-accent" />}>
                  <span className="font-mono text-xs whitespace-pre-wrap">{w}</span>
                </InfoBox>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section
        title={L.worksNow}
        description={
          <>
            {L.engines}{" "}
            {Object.entries(view.runtimes).map(([name, ok], i) => (
              <span key={name}>
                {i > 0 && " · "}
                <span className={ok ? "text-success" : "text-text-3 line-through"}>
                  {RUNTIME_LABELS[name] ?? name} {ok ? "✓" : "✗"}
                </span>
              </span>
            ))}
          </>
        }
      >
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...view.works_now]
            .sort((a, b) => byCapabilityPriority(a.capability, b.capability))
            .map((w) => (
              <li key={w.capability}>
                <Card padding="sm" className="flex h-full items-start gap-3">
                  <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />
                  <div className="min-w-0">
                    <p className="font-medium">{capabilityLabel(w.capability)}</p>
                    <p className="mt-1 font-mono text-xs text-text-3">
                      {w.providers.filter((p) => !GENERIC_PROVIDERS.has(p)).join(", ") || L.builtIn}
                    </p>
                  </div>
                </Card>
              </li>
            ))}
        </ul>
      </Section>

      <Section title={L.videoTypes}>
        <VideoTypeList types={view.video_types} offers={view.offers} />
      </Section>

      {view.suggested_offers.length > 0 && (
        <Section title={L.unlockMore}>
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
        </Section>
      )}

      {view.offers.length > view.suggested_offers.length && (
        <Collapsible label={L.allProviders(view.offers.length)}>
          <div className="grid gap-4 lg:grid-cols-3">
            {view.offers.slice(view.suggested_offers.length).map((offer) => (
              <UnlockCard
                key={offer.env_var}
                offer={offer}
                status={view.keys[offer.env_var]}
                onSaved={onSaved}
              />
            ))}
          </div>
        </Collapsible>
      )}

      {view.hardware.length > 0 && (
        <Collapsible label={L.hardware(view.hardware.length)}>
          <p className="text-sm text-text-2">{L.hardwareBody}</p>
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
        </Collapsible>
      )}
    </div>
  );
}
