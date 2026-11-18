import { useState, type ReactNode } from "react";
import { thumbURL } from "@/services";
import { cn } from "@/utils/cn";

/**
 * A project image through the thumbnail endpoint. A file that fails to load
 * shows `fallback` (default: its name) instead of a broken-image icon.
 */
export function MediaThumb({
  projectId,
  path,
  width,
  alt = "",
  className,
  fallback,
}: {
  projectId: string;
  path: string;
  width?: number;
  alt?: string;
  className?: string;
  fallback?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-surface-2 p-2 text-center text-xs break-all text-text-3",
          className,
        )}
      >
        {fallback ?? path.split("/").at(-1)}
      </div>
    );
  }
  return (
    <img
      src={thumbURL(projectId, path, width)}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
