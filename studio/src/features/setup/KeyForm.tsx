import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import { useT } from "@/i18n";
import { ApiError, useSaveKey, type KeyStatus } from "@/lib/api";

/**
 * Masked, write-only key entry. The value is sent once and never shown again;
 * the server only ever returns a hint like ••••1234.
 */
export function KeyForm({
  envVar,
  status,
  onSaved,
}: {
  envVar: string;
  status: KeyStatus | undefined;
  onSaved: () => void;
}) {
  const t = useT();
  const L = t.setup.key;
  const id = useId();
  const [value, setValue] = useState("");
  const save = useSaveKey();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    save.mutate(
      { key: envVar, value: trimmed },
      {
        onSuccess: () => {
          setValue("");
          onSaved();
        },
      },
    );
  };

  const remove = () => save.mutate({ key: envVar, value: "" }, { onSuccess: onSaved });
  const error = save.error instanceof ApiError ? String(save.error.detail) : save.error?.message;

  return (
    <form onSubmit={submit} className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {envVar}
        {status?.set && (
          <span className="ml-2 font-normal text-success">
            {L.saved(status.hint ?? "")}
            {status.source === "environment" ? L.fromShell : ""}
          </span>
        )}
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id={id}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={status?.set ? L.replacePlaceholder : L.placeholder}
          className="h-10 min-w-0 flex-1 rounded-control border border-border bg-surface-2 px-3 font-mono text-sm placeholder:font-sans placeholder:text-text-3"
        />
        <Button type="submit" variant="primary" disabled={!value.trim() || save.isPending}>
          {save.isPending ? L.saving : L.save}
        </Button>
        {status?.source === "env_file" && (
          <Button variant="ghost" onClick={remove} disabled={save.isPending}>
            {L.remove}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <p className="text-xs text-text-3">
        {L.storedBefore} <code className="font-mono">.env</code> {L.storedAfter}
      </p>
    </form>
  );
}
