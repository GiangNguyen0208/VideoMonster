import { Button, ChipGroup, ComingSoon, controlClass, Select } from "@/components/ui";
import { LayoutGrid, List, Search } from "@/components/icons";
import { videoTypeLabel } from "@/content/labels";
import { useT } from "@/i18n";
import { cn } from "@/utils/cn";
import { STATUS_FILTERS, type StatusFilter } from "./filters";

export interface LibraryToolbarProps {
  q: string;
  status: StatusFilter;
  type: string;
  types: string[];
  series: string;
  seriesList: string[];
  bySeries: boolean;
  counts: Record<StatusFilter, number>;
  /** Writes one URL search param (empty value removes it). */
  onChange: (key: string, value: string) => void;
}

/** Search, type, series toggle, view switch and status chips; all state lives in the URL. */
export function LibraryToolbar({
  q,
  status,
  type,
  types,
  series,
  seriesList,
  bySeries,
  counts,
  onChange,
}: LibraryToolbarProps) {
  const t = useT();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative sm:w-80">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3"
          />
          <input
            type="search"
            value={q}
            onChange={(e) => onChange("q", e.target.value)}
            placeholder={t.library.search}
            aria-label={t.library.search}
            className={cn(controlClass, "h-10 pl-9")}
          />
        </div>
        {types.length > 1 && (
          <FilterSelect
            label={t.library.filterByType}
            allLabel={t.library.allTypes}
            value={type}
            options={types.map((x) => ({ value: x, label: videoTypeLabel(x) }))}
            onChange={(v) => onChange("type", v)}
          />
        )}
        {seriesList.length > 0 && (
          <FilterSelect
            label={t.library.filterBySeries}
            allLabel={t.library.allSeries}
            value={series}
            options={seriesList.map((x) => ({ value: x, label: x }))}
            onChange={(v) => onChange("series", v)}
          />
        )}
        <label className="flex items-center gap-2 text-sm text-text-2">
          <input
            type="checkbox"
            checked={bySeries}
            onChange={(e) => onChange("view", e.target.checked ? "series" : "")}
          />
          {t.library.groupBySeries}
        </label>
        <ComingSoon inline className="ml-auto">
          <div className="flex gap-1">
            <Button size="sm" variant="secondary" aria-label={t.library.gridView}>
              <LayoutGrid aria-hidden className="size-4" />
            </Button>
            <Button size="sm" variant="ghost" aria-label={t.library.listView}>
              <List aria-hidden className="size-4" />
            </Button>
          </div>
        </ComingSoon>
      </div>
      <ChipGroup
        label={t.library.filterByStatus}
        hideLabel
        value={status}
        onChange={(v) => onChange("status", v === "all" ? "" : (v as string))}
        options={STATUS_FILTERS.map((f) => ({
          value: f,
          label: `${t.library.filters[f]} (${counts[f]})`,
        }))}
      />
    </div>
  );
}

/** A dropdown that narrows the list; the empty value means "all". */
function FilterSelect({
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  allLabel: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="h-10 w-auto"
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}
