import { isoDate, num } from "./format";

export const birthYearFromAge = (age: number, now = new Date()) => now.getFullYear() - age;
export const ageFromBirthYear = (birthYear: number | null, now = new Date()) =>
  birthYear === null ? null : now.getFullYear() - birthYear;

/** Tagesgenaues Alter aus "YYYY-MM-DD". */
export function ageFromBirthDate(iso: string, now = new Date()): number {
  const [y, m, d] = iso.split("-").map(Number);
  const beforeBirthday = now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d);
  return now.getFullYear() - y - (beforeBirthday ? 1 : 0);
}

/** Geburtsdatum geht vor, sonst nur das Geburtsjahr. */
export const currentAge = (p: { birthDate: string | null; birthYear: number | null }, now = new Date()) =>
  p.birthDate ? ageFromBirthDate(p.birthDate, now) : ageFromBirthYear(p.birthYear, now);

export interface AboutForm {
  name: string;
  height: string;
  ageMode: "age" | "date";
  age: string;
  birthDate: string; // YYYY-MM-DD aus dem Datumsfeld
  weight: string;
}
type AboutField = "name" | "height" | "age" | "birthDate" | "weight";
export type AboutErrors = Partial<Record<AboutField, string>>;
export interface AboutValues {
  name: string | null;
  heightCm: number | null;
  age: number | null;
  birthDate: string | null;
  weightKg: number | null;
}

const NAME_MAX = 40;
const AGE_MIN = 10, AGE_MAX = 100;
const RANGES: Record<"height" | "age" | "weight", [number, number, string]> = {
  height: [100, 250, "Größe zwischen 100 und 250 cm, z. B. 180."],
  age: [AGE_MIN, AGE_MAX, `Alter zwischen ${AGE_MIN} und ${AGE_MAX} Jahren.`],
  weight: [20, 400, "Gewicht zwischen 20 und 400 kg, z. B. 82,4."],
};

/** Leere Felder = nicht ändern; sonst muss der Wert gültig sein. Je nach Modus zählt Alter oder Geburtsdatum. */
export function validateAbout(f: AboutForm, now = new Date()): { values: AboutValues; errors: AboutErrors } {
  const errors: AboutErrors = {};
  const read = (k: "height" | "age" | "weight"): number | null => {
    if (!f[k].trim()) return null;
    const n = num(f[k]);
    const [min, max, msg] = RANGES[k];
    if (!(n >= min && n <= max)) { errors[k] = msg; return null; }
    return n;
  };

  const name = f.name.trim();
  if (name.length > NAME_MAX) errors.name = `Höchstens ${NAME_MAX} Zeichen.`;

  let age: number | null = null;
  let birthDate: string | null = null;
  if (f.ageMode === "age") {
    age = read("age");
    if (age !== null) age = Math.round(age);
  } else if (f.birthDate) {
    const a = /^\d{4}-\d{2}-\d{2}$/.test(f.birthDate) ? ageFromBirthDate(f.birthDate, now) : NaN;
    if (f.birthDate > isoDate(now)) errors.birthDate = "Das Geburtsdatum liegt in der Zukunft.";
    else if (!(a >= AGE_MIN && a <= AGE_MAX)) errors.birthDate = `Alter zwischen ${AGE_MIN} und ${AGE_MAX} Jahren.`;
    else birthDate = f.birthDate;
  }

  return {
    values: { name: name && !errors.name ? name : null, heightCm: read("height"), age, birthDate, weightKg: read("weight") },
    errors,
  };
}
