import type { RunPlan, TrainingRef } from "../db/types";
import { formFromRunPlan, type RunPlanForm } from "./runTarget";

/** Training im Entwurf des Assistenten, über den Namen statt über eine ID. */
export type DraftRef = { kind: "routine"; name: string } | { kind: "runPlan"; name: string };
export interface Preset { id: string; name: string; description: string; week: DraftRef[][] }

const R = (name: string): DraftRef => ({ kind: "routine", name });
const L = (name: string): DraftRef => ({ kind: "runPlan", name });

export const PRESETS: Preset[] = [
  { id: "hybrid", name: "Hybrid", description: "Kraft und Laufen im Wechsel",
    week: [[L("Zone 2")], [R("Push")], [L("Longrun")], [R("Pull"), L("Z2 kurz")], [], [L("Intervall")], [R("Beine")]] },
  { id: "ppl", name: "Push / Pull / Beine", description: "3× Kraft",
    week: [[R("Push")], [], [R("Pull")], [], [R("Beine")], [], []] },
  { id: "fullbody", name: "Ganzkörper + Laufen", description: "3× Kraft, 2× locker laufen",
    week: [[R("Ganzkörper A")], [L("Zone 2")], [R("Ganzkörper B")], [], [R("Ganzkörper A")], [L("Zone 2")], []] },
  { id: "running", name: "Nur Laufen", description: "4 Läufe pro Woche",
    week: [[L("Zone 2")], [], [L("Intervall")], [], [L("Zone 2")], [], [L("Longrun")]] },
  { id: "empty", name: "Leer", description: "Selbst zusammenstellen", week: [[], [], [], [], [], [], []] },
];

export const nameKey = (s: string) => s.trim().toLocaleLowerCase("de-DE");

export const RUN_DEFAULTS: Record<string, Pick<RunPlan, "targetKind" | "targetValue" | "paceMin" | "paceMax">> = {
  "zone 2": { targetKind: "duration", targetValue: 45 * 60, paceMin: 390, paceMax: 420 },
  "z2 kurz": { targetKind: "duration", targetValue: 20 * 60, paceMin: 390, paceMax: 420 },
  longrun: { targetKind: "distance", targetValue: 15, paceMin: 375, paceMax: 405 },
  intervall: { targetKind: "distance", targetValue: 8, paceMin: 270, paceMax: 290 },
};

/** Entfernt doppelte Namen (Schreibweise egal), die erste Schreibweise gewinnt. */
export function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.filter((n) => { const k = nameKey(n); if (!k || seen.has(k)) return false; seen.add(k); return true; });
}

const namesOf = (week: DraftRef[][], kind: DraftRef["kind"]) => uniqueNames(week.flat().filter((r) => r.kind === kind).map((r) => r.name));

export const runPlanNames = (week: DraftRef[][]) => namesOf(week, "runPlan");

/** Namen aus der Woche, die es als Kraftplan bzw. Laufart noch nicht gibt. */
export function missingNames(week: DraftRef[][], routines: { name: string }[], runPlans: { name: string }[]) {
  const have = (list: { name: string }[]) => new Set(list.map((x) => nameKey(x.name)));
  const r = have(routines), l = have(runPlans);
  return {
    routines: namesOf(week, "routine").filter((n) => !r.has(nameKey(n))),
    runPlans: namesOf(week, "runPlan").filter((n) => !l.has(nameKey(n))),
  };
}

export function toTemplate(week: DraftRef[][], routineIds: Map<string, number>, runPlanIds: Map<string, number>): TrainingRef[][] {
  return week.map((day) => day.flatMap((r): TrainingRef[] => {
    const id = (r.kind === "routine" ? routineIds : runPlanIds).get(nameKey(r.name));
    return id === undefined ? [] : [{ kind: r.kind, id }];
  }));
}

export function weekFromTemplate(template: TrainingRef[][], routines: { id?: number; name: string }[], runPlans: { id?: number; name: string }[]): DraftRef[][] {
  const r = new Map(routines.map((x) => [x.id, x.name]));
  const l = new Map(runPlans.map((x) => [x.id, x.name]));
  return template.map((day) => day.flatMap((ref): DraftRef[] => {
    const name = (ref.kind === "routine" ? r : l).get(ref.id);
    return name === undefined ? [] : [{ kind: ref.kind, name }];
  }));
}

/** Formular für eine Laufart: vorhandene Werte, sonst Standardziel, sonst 45 min ohne Pace. */
export function defaultRunForm(name: string, existing?: RunPlan): RunPlanForm {
  if (existing) return formFromRunPlan(existing);
  const d = RUN_DEFAULTS[nameKey(name)];
  if (d) return formFromRunPlan({ ...d, name, order: 0 });
  return { name, targetKind: "duration", target: "45", paceFrom: "", paceTo: "" };
}
