import { useEffect, useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Card } from "@/components/ui";
import { useT } from "@/i18n";
import {
  ApiError,
  queryKeys,
  useAddReference,
  useInputs,
  useRemoveReference,
  useRemoveUpload,
  useUploadLimits,
  type InputFile,
} from "@/lib/api";
import { fmtBytes, mediaURL } from "@/lib/format";
import { DropZone } from "./DropZone";
import { FileRow, MediaPreview } from "./FileRow";
import { acceptAttr, ALL_KINDS, describeMedia, kindOf, uploadErrorText } from "./media";
import { cancelUpload, dismissUpload, enqueueUploads, isActive, useUploads } from "./uploadStore";

/**
 * Source material of a project: uploaded files (with live upload progress)
 * and reference links. Removing is allowed until the agent starts.
 */
export function InputsPanel({
  projectId,
  studioProject,
}: {
  projectId: string;
  /** Created in Studio: show the panel even while it is empty. */
  studioProject: boolean;
}) {
  const t = useT();
  const L = t.uploads;
  const queryClient = useQueryClient();
  const inputs = useInputs(projectId).data;
  const limits = useUploadLimits().data;
  const uploads = useUploads(projectId);
  const remove = useRemoveUpload(projectId);
  const doneCount = uploads.filter((u) => u.state === "done").length;

  // A finished upload is in inputs.json now; drop its progress row once the
  // refreshed list shows it.
  useEffect(() => {
    if (doneCount === 0) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.inputs(projectId) }).then(() => {
      for (const u of uploads) if (u.state === "done") dismissUpload(u.id);
    });
  }, [doneCount, projectId, queryClient, uploads]);

  const files = inputs?.files ?? [];
  const refs = inputs?.references ?? [];
  const started = inputs?.started ?? false;
  if (!studioProject && files.length === 0 && refs.length === 0 && uploads.length === 0) {
    return null;
  }

  const removeError = remove.error instanceof ApiError ? uploadErrorText(remove.error.code) : null;

  return (
    <Card className="space-y-6" role="region" aria-labelledby="inputs-h">
      <div className="space-y-1">
        <h2 id="inputs-h" className="text-lg font-semibold">
          {L.heading}
        </h2>
        <p className="text-sm text-text-2">{started ? L.started : L.intro}</p>
      </div>

      <ul className="divide-y divide-border-soft rounded-card border border-border-soft">
        {files.length === 0 && uploads.length === 0 && (
          <li className="px-4 py-3 text-sm text-text-3">{L.empty}</li>
        )}
        {files.map((f) => (
          <ServerFile
            key={f.path}
            projectId={projectId}
            file={f}
            onRemove={started ? undefined : () => remove.mutate(f.name)}
          />
        ))}
        {uploads
          .filter((u) => u.state !== "done")
          .map((u) => (
            <FileRow
              key={u.id}
              name={u.name}
              media={kindOf(u.name, limits)}
              meta={fmtBytes(u.size)}
              upload={u}
              issue={
                u.state === "error" ? `${uploadErrorText(u.error, limits)} ${L.retryHint}` : null
              }
              onRemove={() => (isActive(u) ? cancelUpload(u.id) : dismissUpload(u.id))}
              removeLabel={isActive(u) ? L.cancel(u.name) : L.dismiss}
            />
          ))}
      </ul>
      {removeError && (
        <p role="alert" className="text-sm text-danger">
          {removeError}
        </p>
      )}

      <DropZone
        label={L.choose}
        accept={acceptAttr(ALL_KINDS, limits)}
        onFiles={(list) => enqueueUploads(projectId, list)}
        hint={limits && L.maxSize(fmtBytes(limits.max_bytes))}
      />

      <References projectId={projectId} started={started} refs={refs} />
    </Card>
  );
}

function ServerFile({
  projectId,
  file,
  onRemove,
}: {
  projectId: string;
  file: InputFile;
  onRemove?: () => void;
}) {
  const t = useT();
  const src = mediaURL(projectId, file.path);
  return (
    <FileRow
      name={file.name}
      media={file.media}
      meta={describeMedia(file)}
      tag={file.kind === "reference" ? t.uploads.reference : undefined}
      preview={
        file.media === "subtitle"
          ? undefined
          : () => <MediaPreview src={src} media={file.media} name={file.name} />
      }
      onRemove={onRemove}
      removeLabel={t.uploads.remove(file.name)}
    />
  );
}

function References({
  projectId,
  started,
  refs,
}: {
  projectId: string;
  started: boolean;
  refs: { id: string; url: string; notes: string | null }[];
}) {
  const t = useT();
  const L = t.uploads;
  const urlId = useId();
  const notesId = useId();
  const add = useAddReference(projectId);
  const remove = useRemoveReference(projectId);
  const limits = useUploadLimits().data;
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const error =
    add.error instanceof ApiError
      ? add.error.status === 422 && !add.error.code
        ? L.errors.bad_url
        : uploadErrorText(add.error.code)
      : null;

  return (
    <section className="space-y-3" aria-labelledby={`${urlId}-h`}>
      <div>
        <h3 id={`${urlId}-h`} className="font-medium">
          {L.references}
        </h3>
        <p className="text-xs text-text-3">{L.referencesHint}</p>
      </div>
      {refs.length > 0 && (
        <ul className="space-y-2">
          {refs.map((r) => (
            <li key={r.id} className="flex items-start gap-3 text-sm">
              <div className="min-w-0 flex-1">
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="break-all text-accent underline"
                >
                  {r.url}
                </a>
                {r.notes && <p className="text-text-2">{r.notes}</p>}
              </div>
              {!started && (
                <button
                  type="button"
                  onClick={() => remove.mutate(r.id)}
                  aria-label={L.removeLink(r.url)}
                  className="text-text-3 hover:text-danger"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        className="grid gap-2 sm:grid-cols-[2fr_2fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate(
            { url: url.trim(), notes: notes.trim() },
            {
              onSuccess: () => {
                setUrl("");
                setNotes("");
              },
            },
          );
        }}
      >
        <label htmlFor={urlId} className="space-y-1 text-sm">
          <span className="block text-text-2">{L.link}</span>
          <input
            id={urlId}
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
            className="h-10 w-full rounded-control border border-border bg-surface-2 px-3"
          />
        </label>
        <label htmlFor={notesId} className="space-y-1 text-sm">
          <span className="block text-text-2">{L.notes}</span>
          <input
            id={notesId}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="h-10 w-full rounded-control border border-border bg-surface-2 px-3"
          />
        </label>
        <Button type="submit" disabled={!url.trim() || add.isPending}>
          {L.addLink}
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <DropZone
        compact
        multiple={false}
        label={L.uploadReference}
        accept={acceptAttr(["video"], limits)}
        onFiles={(list) => enqueueUploads(projectId, list, "reference")}
        hint={L.uploadReference}
      />
    </section>
  );
}
