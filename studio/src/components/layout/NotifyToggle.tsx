import { useState } from "react";
import { Bell, BellOff } from "@/components/icons";
import { useT } from "@/i18n";

const current = (): NotificationPermission =>
  typeof Notification === "undefined" ? "denied" : Notification.permission;

/**
 * Header bell: asks for browser-notification permission. Review pages then
 * notify when a step starts waiting while the tab is hidden.
 */
export function NotifyToggle({ className }: { className?: string }) {
  const t = useT();
  const [permission, setPermission] = useState(current);
  const L = t.app.notifications;
  const label = permission === "granted" ? L.on : permission === "denied" ? L.blocked : L.enable;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={permission === "granted"}
      disabled={permission !== "default"}
      onClick={() => void Notification.requestPermission().then(setPermission)}
      className={className}
    >
      {permission === "denied" ? (
        <BellOff className="size-4.5" aria-hidden />
      ) : (
        <Bell className="size-4.5" aria-hidden />
      )}
    </button>
  );
}
