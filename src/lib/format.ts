export const num = (v: string | number | null | undefined): number => {
  if (v === null || v === undefined) return NaN;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};
export const fmt = (n: number, d = 1) => n.toLocaleString("de-DE", { maximumFractionDigits: d });
export const fmtInput = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? "" : String(n).replace(".", ","));

export function isoDate(d = new Date()): string {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}
export const localDay = (isoTs: string) => isoDate(new Date(isoTs));

export function weekDays(ref = new Date()): Date[] {
  const s = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
  return [...Array(7)].map((_, i) => { const d = new Date(s); d.setDate(s.getDate() + i); return d; });
}

export const niceDate = (iso: string) =>
  parseDay(iso.length > 10 ? localDay(iso) : iso).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" });
export const monthLabel = (iso: string) =>
  parseDay(iso.length > 10 ? localDay(iso) : iso).toLocaleDateString("de-DE", { month: "long", year: "numeric" });

export function clock(sec: number): string {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
export function pace(sec: number, km: number): string {
  if (!km || !sec) return "–";
  const p = sec / km;
  const m = Math.floor(p / 60), s = Math.round(p % 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, "0")}`;
}

/** "6:15", "6,15" oder "6.15" → 375 Sekunden pro km; "6" → 360. Ungültig → NaN. */
export function parsePace(v: string): number {
  const m = v.trim().match(/^(\d{1,2})(?:[:.,](\d{2}))?$/);
  if (!m) return NaN;
  const sec = m[2] === undefined ? 0 : Number(m[2]);
  return sec < 60 ? Number(m[1]) * 60 + sec : NaN;
}
export function fmtPace(secPerKm: number): string {
  const s = Math.round(secPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export const fmtMinutes = (sec: number) => `${fmt(sec / 60, 0)} min`;
