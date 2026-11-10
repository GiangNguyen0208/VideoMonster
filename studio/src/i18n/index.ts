/**
 * Studio localization: typed message catalogs plus a tiny locale store.
 *
 * Components call `useT()` (re-renders on language change); plain helpers
 * such as adapters and formatters call `msg()`, which reads the same store —
 * they run during render of a component that already subscribed.
 */
import { useSyncExternalStore } from "react";
import { en, type Messages } from "./en";
import { vi } from "./vi";

export type Locale = "en" | "vi";
export type { Messages };

export const LOCALE_KEY = "studio.locale";
export const CATALOGS: Record<Locale, Messages> = { en, vi };
export const LOCALES: { id: Locale; label: string }[] = [
  { id: "en", label: "English" },
  { id: "vi", label: "Tiếng Việt" },
];

const isLocale = (v: unknown): v is Locale => v === "en" || v === "vi";

/** Saved choice, else the browser language, else English. */
export function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    // storage blocked: fall through to the browser language
  }
  const langs =
    typeof navigator === "undefined" ? [] : (navigator.languages ?? [navigator.language]);
  return langs.some((l) => l?.toLowerCase().startsWith("vi")) ? "vi" : "en";
}

let current: Locale = detectLocale();
const listeners = new Set<() => void>();

function apply(locale: Locale) {
  current = locale;
  if (typeof document !== "undefined") document.documentElement.lang = locale;
  listeners.forEach((l) => l());
}

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // not persisted; still switch for this tab
  }
  apply(locale);
}

/** Re-read the saved/browser locale (used by tests after clearing storage). */
export function resetLocale(): void {
  apply(detectLocale());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === LOCALE_KEY && isLocale(e.newValue) && e.newValue !== current) apply(e.newValue);
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, getLocale);
}

/** Messages for the current locale; the component re-renders on change. */
export function useT(): Messages {
  return CATALOGS[useLocale()];
}

/** Messages outside React (adapters, formatters, schema error lookup). */
export function msg(): Messages {
  return CATALOGS[current];
}

if (typeof document !== "undefined") document.documentElement.lang = current;
