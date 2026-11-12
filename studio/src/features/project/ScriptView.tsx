import { Screenplay } from "@/components/ui";
import { useT } from "@/i18n";
import { fmtDuration } from "@/utils/format";
import { asArray, asRecord, asText } from "./adapters";

/** Script as a screenplay page: section label, timing, narration text. */
export function ScriptView({ script }: { script: unknown }) {
  const t = useT();
  const s = asRecord(script);
  if (!s) return null;
  const sections = asArray(s.sections)
    .map(asRecord)
    .filter((x): x is Record<string, unknown> => Boolean(x));

  return (
    <Screenplay className="mx-auto max-w-2xl px-6 py-8 sm:px-10">
      {asText(s.title) && (
        <h3 className="mb-6 text-center text-lg font-bold tracking-wide uppercase">
          {asText(s.title)}
        </h3>
      )}
      <ol className="space-y-6">
        {sections.map((section, i) => {
          const start = typeof section.start_seconds === "number" ? section.start_seconds : null;
          const end = typeof section.end_seconds === "number" ? section.end_seconds : null;
          return (
            <li key={asText(section.id) ?? i}>
              <p className="text-sm font-bold uppercase">
                {asText(section.label) ?? t.project.script.section(i + 1)}
                {start !== null && (
                  <span className="ml-2 font-normal opacity-60">
                    {fmtDuration(start)}
                    {end !== null ? `–${fmtDuration(end)}` : ""}
                  </span>
                )}
              </p>
              <p className="mt-2 leading-relaxed whitespace-pre-line">{asText(section.text)}</p>
            </li>
          );
        })}
      </ol>
      {sections.length === 0 && <p className="text-center opacity-60">{t.project.script.empty}</p>}
    </Screenplay>
  );
}
