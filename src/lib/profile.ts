import { num } from "./format";

export const birthYearFromAge = (age: number, now = new Date()) => now.getFullYear() - age;
export const ageFromBirthYear = (birthYear: number | null, now = new Date()) =>
  birthYear === null ? null : now.getFullYear() - birthYear;

export interface AboutForm { height: string; age: string; weight: string }
export type AboutErrors = Partial<Record<keyof AboutForm, string>>;
export interface AboutValues { heightCm: number | null; age: number | null; weightKg: number | null }

const RANGES: Record<keyof AboutForm, [number, number, string]> = {
  height: [100, 250, "Größe zwischen 100 und 250 cm, z. B. 180."],
  age: [10, 100, "Alter zwischen 10 und 100 Jahren."],
  weight: [20, 400, "Gewicht zwischen 20 und 400 kg, z. B. 82,4."],
};

/** Leere Felder = nicht ändern; sonst muss der Wert im Bereich liegen. */
export function validateAbout(f: AboutForm): { values: AboutValues; errors: AboutErrors } {
  const errors: AboutErrors = {};
  const read = (k: keyof AboutForm): number | null => {
    if (!f[k].trim()) return null;
    const n = num(f[k]);
    const [min, max, msg] = RANGES[k];
    if (!(n >= min && n <= max)) { errors[k] = msg; return null; }
    return n;
  };
  const values = { heightCm: read("height"), age: read("age"), weightKg: read("weight") };
  if (values.age !== null) values.age = Math.round(values.age);
  return { values, errors };
}
