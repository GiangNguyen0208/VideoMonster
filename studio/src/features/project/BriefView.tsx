import { BulletList, Fact } from "@/components/ui";
import { titleCase } from "@/content/labels";
import { useT } from "@/i18n";
import { fmtDuration } from "@/utils/format";
import { asArray, asRecord, asText } from "./adapters";

/** Brief (idea stage) and research brief, rendered as a readable summary. */
export function BriefView({ brief, research }: { brief?: unknown; research?: unknown }) {
  const t = useT();
  const L = t.project.brief;
  const b = asRecord(brief);
  const r = asRecord(research);
  if (!b && !r) return null;

  const keyPoints = asArray(b?.key_points)
    .map(asText)
    .filter((x): x is string => Boolean(x));
  const angles = asArray(r?.angles_discovered)
    .map(asRecord)
    .filter((a): a is Record<string, unknown> => Boolean(a));
  const dataPoints = asArray(r?.data_points)
    .map((d) => asText(asRecord(d)?.claim))
    .filter((x): x is string => Boolean(x));
  const sources = asArray(r?.sources).length;

  return (
    <div className="space-y-8">
      {b && (
        <section aria-labelledby="brief-h" className="space-y-4">
          <h3 id="brief-h" className="text-lg font-semibold">
            {L.heading}
          </h3>
          <dl className="grid gap-4 sm:grid-cols-2">
            {asText(b.title) && <Fact label={L.title}>{asText(b.title)}</Fact>}
            {asText(b.hook) && <Fact label={L.hook}>{asText(b.hook)}</Fact>}
            {asText(b.core_message) && <Fact label={L.coreMessage}>{asText(b.core_message)}</Fact>}
            {asText(b.target_audience) && (
              <Fact label={L.audience}>{asText(b.target_audience)}</Fact>
            )}
            {asText(b.target_platform) && (
              <Fact label={L.platform}>{titleCase(asText(b.target_platform)!)}</Fact>
            )}
            {typeof b.target_duration_seconds === "number" && (
              <Fact label={L.length}>{fmtDuration(b.target_duration_seconds)}</Fact>
            )}
            {asText(b.tone) && <Fact label={L.tone}>{asText(b.tone)}</Fact>}
          </dl>
          {keyPoints.length > 0 && (
            <Fact label={L.keyPoints}>
              <BulletList items={keyPoints} />
            </Fact>
          )}
        </section>
      )}
      {r && (
        <section aria-labelledby="research-h" className="space-y-4">
          <h3 id="research-h" className="text-lg font-semibold">
            {L.research(asText(r.topic))}
          </h3>
          {angles.length > 0 && (
            <Fact label={L.angles}>
              <ul className="space-y-2">
                {angles.map((a, i) => (
                  <li
                    key={i}
                    className="rounded-control border border-border-soft bg-surface-2 p-3"
                  >
                    <p className="font-medium">{asText(a.name) ?? L.angle(i + 1)}</p>
                    {asText(a.hook) && <p className="text-sm text-text-2">{asText(a.hook)}</p>}
                  </li>
                ))}
              </ul>
            </Fact>
          )}
          {dataPoints.length > 0 && (
            <Fact label={L.facts}>
              <BulletList items={dataPoints} />
            </Fact>
          )}
          {sources > 0 && <p className="text-sm text-text-3">{L.sources(sources)}</p>}
        </section>
      )}
    </div>
  );
}
