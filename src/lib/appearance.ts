import type { Accent, ThemeMode } from "../db/types";

export const ACCENTS: [Accent, string, string][] = [
  ["amber", "Amber", "#f59e0b"],
  ["indigo", "Indigo", "#6366f1"],
  ["emerald", "Smaragd", "#10b981"],
  ["rose", "Rose", "#f43f5e"],
];
export const THEMES: [ThemeMode, string][] = [["system", "System"], ["light", "Hell"], ["dark", "Dunkel"]];

export interface Appearance { accent: Accent; theme: ThemeMode }
export interface AppearanceTarget { setAttribute(k: string, v: string): void; removeAttribute(k: string): void }
interface KeyValue { getItem(k: string): string | null; setItem(k: string, v: string): void }

// Spiegel in localStorage, damit index.html die Farbe schon vor dem Laden der Datenbank setzen kann
const KEY = "appearance";

export function applyAppearance(a: Appearance, root: AppearanceTarget = document.documentElement, storage: KeyValue | null = safeStorage()) {
  root.setAttribute("data-accent", a.accent);
  if (a.theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", a.theme);
  try { storage?.setItem(KEY, JSON.stringify({ accent: a.accent, theme: a.theme })); } catch { /* privater Modus */ }
}

export function readStoredAppearance(storage: KeyValue | null = safeStorage()): Appearance | null {
  try {
    const v = JSON.parse(storage?.getItem(KEY) ?? "null");
    if (ACCENTS.some(([k]) => k === v?.accent) && THEMES.some(([k]) => k === v?.theme)) return { accent: v.accent, theme: v.theme };
  } catch { /* ungültig */ }
  return null;
}

function safeStorage(): KeyValue | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
