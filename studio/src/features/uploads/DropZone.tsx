import { useId, useState, type ReactNode } from "react";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";

/** Drag-and-drop area with a regular file picker for keyboard and touch users. */
export function DropZone({
  accept,
  onFiles,
  hint,
  label,
  multiple = true,
  compact = false,
}: {
  accept: string;
  onFiles: (files: File[]) => void;
  hint?: ReactNode;
  /** Accessible name of the file input. */
  label: string;
  multiple?: boolean;
  compact?: boolean;
}) {
  const t = useT();
  const id = useId();
  const [over, setOver] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const files = [...e.dataTransfer.files];
        if (files.length) onFiles(multiple ? files : files.slice(0, 1));
      }}
      className={cn(
        "rounded-card border-2 border-dashed text-center transition",
        compact ? "px-4 py-3" : "px-6 py-8",
        over ? "border-accent bg-accent-dim" : "border-border bg-surface",
      )}
    >
      <p className="text-sm">
        {t.uploads.drop}{" "}
        <label htmlFor={id} className="cursor-pointer font-medium text-accent underline">
          {t.uploads.choose}
        </label>
      </p>
      <input
        id={id}
        type="file"
        aria-label={label}
        accept={accept || undefined}
        multiple={multiple}
        className="sr-only"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
      {hint && <div className="mt-1 text-xs text-text-3">{hint}</div>}
    </div>
  );
}
