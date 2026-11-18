/**
 * Plain-language summaries of the artifacts a gated step produced, so a
 * reviewer sees the key facts without opening raw JSON. The proposal and the
 * script have their own richer views and are not summarised here.
 */
import { asArray, asRecord, asText } from "@/features/project/adapters";
import { titleCase } from "@/content/labels";
import { msg } from "@/i18n";
import type { Stage } from "@/types/api";
import { fmtDuration, fmtMoney } from "@/utils/format";

export interface ArtifactFact {
  label: string;
  value: string;
}

export interface ArtifactItem {
  title: string;
  detail: string | null;
}

export interface ArtifactSummary {
  name: string;
  lead: string | null;
  facts: ArtifactFact[];
  items: ArtifactItem[];
}

/** Artifacts a step is known to produce when its manifest does not say. */
const STAGE_ARTIFACTS: Record<string, string[]> = {
  research: ["research_brief"],
  idea: ["brief"],
  scene_plan: ["scene_plan"],
  assets: ["asset_manifest"],
  edit: ["edit_decisions"],
  compose: ["render_report", "final_review"],
  publish: ["publish_log"],
};

/** Artifacts with a dedicated view elsewhere in the review panel. */
const HANDLED_ELSEWHERE = new Set(["proposal_packet", "script", "decision_log"]);

const MAX_ITEMS = 4;

/** `all` also lists the artifacts with their own review view (stage drawer). */
export function artifactNamesForStage(stage: Stage, all = false): string[] {
  const names = [...(stage.produces ?? []), ...(STAGE_ARTIFACTS[stage.name] ?? [])];
  return [...new Set(names)].filter(
    (n) => n && n !== "decision_log" && (all || !HANDLED_ELSEWHERE.has(n)),
  );
}

function short(text: string, max = 140): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function count(v: unknown): string | null {
  return Array.isArray(v) && v.length ? String(v.length) : null;
}

function seconds(v: unknown): string | null {
  return typeof v === "number" && v > 0 ? fmtDuration(v) : null;
}

function money(v: unknown): string | null {
  return typeof v === "number" ? fmtMoney(v) : null;
}

function items(list: unknown): ArtifactItem[] {
  return asArray(list)
    .slice(0, MAX_ITEMS)
    .flatMap((raw, i): ArtifactItem[] => {
      if (raw == null) return [];
      const r = asRecord(raw);
      if (!r) return [{ title: short(String(raw), 100), detail: null }];
      const title =
        asText(r.title) ??
        asText(r.name) ??
        asText(r.label) ??
        asText(r.id) ??
        asText(r.path) ??
        asText(r.description) ??
        asText(r.platform) ??
        msg().review.artifact.item(i + 1);
      const detail =
        asText(r.hook) ?? asText(r.summary) ?? asText(r.description) ?? asText(r.notes);
      return [
        { title: short(title, 100), detail: detail && detail !== title ? short(detail) : null },
      ];
    });
}

function toFacts(pairs: Array<[string, string | null | undefined]>): ArtifactFact[] {
  return pairs.flatMap(([label, value]) => (value ? [{ label, value }] : []));
}

/** Fallback for artifacts without a known shape: first scalars + first list. */
function generic(artifact: Record<string, unknown>): Pick<ArtifactSummary, "facts" | "items"> {
  const L = msg().review.artifact;
  const facts: ArtifactFact[] = [];
  let list: ArtifactItem[] = [];
  for (const [key, value] of Object.entries(artifact)) {
    if (facts.length >= 6) break;
    if (key === "version" || key === "decision_log_ref") continue;
    if (["string", "number", "boolean"].includes(typeof value)) {
      facts.push({ label: titleCase(key), value: short(String(value), 90) });
    } else if (Array.isArray(value)) {
      facts.push({ label: titleCase(key), value: L.itemCount(value.length) });
      if (!list.length) list = items(value);
    }
  }
  return { facts, items: list };
}

export function summarizeArtifact(name: string, artifact: unknown): ArtifactSummary | null {
  const a = asRecord(artifact);
  if (!a) return null;
  const L = msg().review.artifact;
  const done = (
    lead: string | null,
    pairs: Array<[string, string | null | undefined]>,
    list: ArtifactItem[] = [],
  ): ArtifactSummary => ({ name, lead, facts: toFacts(pairs), items: list });

  switch (name) {
    case "brief":
      return done(
        asText(a.hook),
        [
          [L.platform, asText(a.target_platform)],
          [L.duration, seconds(a.target_duration_seconds)],
          [L.tone, asText(a.tone)],
          [L.style, asText(a.style)],
        ],
        items(a.key_points),
      );
    case "research_brief":
      return done(
        asText(a.topic),
        [
          [L.sources, count(a.sources)],
          [L.dataPoints, count(a.data_points)],
          [L.angles, count(a.angles_discovered)],
        ],
        items(a.angles_discovered),
      );
    case "scene_plan": {
      const scenes = asArray(a.scenes);
      const end = scenes.reduce<number>((max, s) => {
        const v = Number(asRecord(s)?.end_seconds);
        return Number.isFinite(v) ? Math.max(max, v) : max;
      }, 0);
      return done(
        null,
        [
          [L.scenes, count(scenes)],
          [L.duration, seconds(end)],
        ],
        items(scenes),
      );
    }
    case "asset_manifest": {
      const assets = asArray(a.assets);
      const types = [...new Set(assets.map((x) => asText(asRecord(x)?.type)).filter(Boolean))];
      return done(
        null,
        [
          [L.assets, count(assets)],
          [L.types, types.join(", ")],
          [L.generationCost, money(a.total_cost_usd)],
        ],
        items(assets),
      );
    }
    case "edit_decisions":
      return done(
        null,
        [
          [L.cuts, count(a.cuts)],
          [L.runtime, asText(a.render_runtime) ?? asText(asRecord(a.metadata)?.render_runtime)],
        ],
        items(a.cuts),
      );
    case "render_report":
      return done(
        null,
        [
          [L.outputs, count(a.outputs)],
          [L.duration, seconds(a.duration_seconds)],
        ],
        items(a.outputs),
      );
    case "publish_log":
      return done(
        null,
        [[L.destinations, count(a.entries)]],
        asArray(a.entries)
          .slice(0, MAX_ITEMS)
          .flatMap((e): ArtifactItem[] => {
            const r = asRecord(e);
            if (!r) return [];
            return [
              {
                title: asText(r.platform) ?? asText(r.destination) ?? L.destination,
                detail: [asText(r.status), asText(r.url)].filter(Boolean).join(" · ") || null,
              },
            ];
          }),
      );
    default: {
      const g = generic(a);
      return { name, lead: null, ...g };
    }
  }
}

/** Summaries for every reviewable artifact the step has on disk. */
export function stageArtifactSummaries(
  stage: Stage,
  artifacts: Record<string, unknown>,
  all = false,
): ArtifactSummary[] {
  return artifactNamesForStage(stage, all).flatMap((name) => {
    const s = summarizeArtifact(name, artifacts[name]);
    return s && (s.lead || s.facts.length || s.items.length) ? [s] : [];
  });
}
