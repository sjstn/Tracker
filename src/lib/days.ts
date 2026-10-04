import { isoDate, parseDay } from "./format";

/** Rechnen mit lokalen Tagen "YYYY-MM-DD" – ohne Uhrzeit, sicher über Zeitumstellungen. */
export function addDays(iso: string, n: number): string {
  const d = parseDay(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000);
}

/** Montag = 0 … Sonntag = 6 */
export const weekdayIndex = (iso: string) => (parseDay(iso).getDay() + 6) % 7;

export const sundayOf = (iso: string) => addDays(iso, 6 - weekdayIndex(iso));
