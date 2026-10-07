import { fmtInput, num } from "./format";

/** Tippt eine Taste des Zahlenfelds. `fresh`: Feld wurde gerade gewählt, die erste Taste ersetzt den Wert. */
export function pressKey(value: string, key: string, fresh: boolean, decimal: boolean): string {
  const v = fresh ? "" : value;
  if (key === "back") return v.slice(0, -1);
  if (key === ",") {
    if (!decimal || v.includes(",")) return v;
    return (v || "0") + ",";
  }
  if (!/^\d$/.test(key) || v.replace(",", "").length >= 5) return v;
  if (/,\d\d$/.test(v)) return v;
  return v === "0" ? key : v + key;
}

/** −/+ vom eingetragenen Wert, sonst vom Vorschlag aus. */
export function stepValue(value: string, fallback: number | null | undefined, delta: number): string {
  const base = value.trim() === "" ? fallback ?? 0 : num(value);
  const next = Math.max(0, Math.round(((Number.isFinite(base) ? base : 0) + delta) * 100) / 100);
  return fmtInput(next);
}
