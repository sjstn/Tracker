import type { ProgressionFields, ProgressionOverrides, RoutineExercise, SetTemplate, Settings } from "../db/types";

const FIELDS: (keyof ProgressionFields)[] = [
  "repTargetMin", "repTargetMax", "incrementType", "incrementValue", "warmupScheme", "warmupValue",
];

/**
 * Löst die Progressionswerte auf: Satz-Vorlage → Übung im Plan → Standard aus den Einstellungen.
 * Der spezifischste gesetzte Wert gewinnt.
 */
export function resolveProgression(
  defaults: ProgressionFields,
  routineExercise?: Partial<RoutineExercise> | null,
  setTemplate?: Partial<SetTemplate> | null,
): ProgressionFields {
  const out = { ...defaults } as Record<string, unknown>;
  for (const f of FIELDS) {
    const re = (routineExercise as ProgressionOverrides | undefined)?.[f];
    const st = (setTemplate as ProgressionOverrides | undefined)?.[f];
    if (st !== undefined && st !== null) out[f] = st;
    else if (re !== undefined && re !== null) out[f] = re;
  }
  const p = out as unknown as ProgressionFields;
  if (p.repTargetMax < p.repTargetMin) p.repTargetMax = p.repTargetMin;
  return p;
}

export function roundTo(value: number, step: number): number {
  if (!step || step <= 0) return Math.round(value * 100) / 100;
  return Math.round(Math.round(value / step) * step * 100) / 100;
}

/** Nächstes Arbeitsgewicht nach erreichtem Wiederholungsziel. Steigt immer mindestens um einen Rundungsschritt. */
export function increaseWeight(weight: number, p: Pick<ProgressionFields, "incrementType" | "incrementValue">, rounding: number): number {
  if (p.incrementType === "fixed") return Math.round((weight + p.incrementValue) * 100) / 100;
  const raw = weight * (1 + p.incrementValue / 100);
  const rounded = roundTo(raw, rounding);
  return rounded > weight ? rounded : Math.round((weight + (rounding || 0.5)) * 100) / 100;
}

export interface LastSet { weight: number; reps: number }

export interface Suggestion {
  weight: number | null;
  reps: number;
  hint: string;
  kind: "increase" | "repeat" | "first";
}

/**
 * Doppelte Progression je Übung und Satz-Slot:
 * Ziel erreicht (Wdh. ≥ Obergrenze) → Gewicht erhöhen, wieder bei Untergrenze starten.
 * Sonst → gleiches Gewicht, eine Wiederholung mehr anpeilen.
 */
export function suggestWorkingSet(last: LastSet | null | undefined, p: ProgressionFields, rounding: number): Suggestion {
  if (!last) {
    return { weight: null, reps: p.repTargetMin, kind: "first", hint: `Erstes Mal: Gewicht wählen, ${p.repTargetMin}–${p.repTargetMax} Wdh.` };
  }
  if (last.reps >= p.repTargetMax) {
    const weight = increaseWeight(last.weight, p, rounding);
    return { weight, reps: p.repTargetMin, kind: "increase", hint: `Ziel geschafft: +${fmtKg(weight - last.weight)} kg` };
  }
  const reps = Math.min(Math.max(last.reps + 1, p.repTargetMin), p.repTargetMax);
  return { weight: last.weight, reps, kind: "repeat", hint: `Letztes Mal ${last.reps} Wdh., Ziel ${p.repTargetMax}` };
}

export function warmupWeight(workingWeight: number | null, p: Pick<ProgressionFields, "warmupScheme" | "warmupValue">, rounding: number): number | null {
  if (p.warmupScheme === "fixed_weight") return p.warmupValue;
  if (workingWeight === null) return null;
  return roundTo(workingWeight * (p.warmupValue / 100), rounding);
}

/** Geschätztes 1RM nach Epley, nur für Statistik. */
export function estimatedOneRepMax(weight: number, reps: number): number {
  if (reps <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

export function fmtKg(n: number): string {
  return n.toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

/** Für Tests und Vorschau: Standardwerte aus den Einstellungen herausziehen. */
export function progressionDefaults(s: Settings): ProgressionFields {
  const { repTargetMin, repTargetMax, incrementType, incrementValue, warmupScheme, warmupValue } = s;
  return { repTargetMin, repTargetMax, incrementType, incrementValue, warmupScheme, warmupValue };
}
