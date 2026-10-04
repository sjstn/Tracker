import type { RunPlan } from "../db/types";
import { fmt, fmtInput, fmtMinutes, fmtPace, num, parsePace } from "./format";

export type RunTarget = Pick<RunPlan, "targetKind" | "targetValue" | "paceMin" | "paceMax">;
export interface RunCheck { reached: boolean; pace: "in" | "fast" | "slow" | null; paceSec: number }

// Kleine Toleranz, damit 44:50 bei 45 min nicht als verfehlt gilt
const TOLERANCE_SECONDS = 60;
const TOLERANCE_KM = 0.1;

export function checkRun(plan: RunTarget, km: number, seconds: number): RunCheck {
  const reached = plan.targetKind === "duration"
    ? seconds >= plan.targetValue - TOLERANCE_SECONDS
    : km >= plan.targetValue - TOLERANCE_KM - 1e-9;
  const paceSec = Math.round(seconds / km);
  let pace: RunCheck["pace"] = null;
  if (plan.paceMin !== null || plan.paceMax !== null) {
    pace = plan.paceMin !== null && paceSec < plan.paceMin ? "fast" : plan.paceMax !== null && paceSec > plan.paceMax ? "slow" : "in";
  }
  return { reached, pace, paceSec };
}

export function describeTarget(plan: RunTarget): string {
  const goal = plan.targetKind === "duration" ? fmtMinutes(plan.targetValue) : `${fmt(plan.targetValue, 1)} km`;
  const { paceMin: a, paceMax: b } = plan;
  if (a !== null && b !== null) return `${goal} · ${fmtPace(a)}–${fmtPace(b)} /km`;
  if (a !== null) return `${goal} · nicht schneller als ${fmtPace(a)} /km`;
  if (b !== null) return `${goal} · nicht langsamer als ${fmtPace(b)} /km`;
  return goal;
}

export interface RunPlanForm { name: string; targetKind: "duration" | "distance"; target: string; paceFrom: string; paceTo: string }
export type RunPlanErrors = Partial<Record<keyof RunPlanForm, string>>;

const optPace = (v: string) => (v.trim() ? parsePace(v) : null);

export function validateRunPlan(f: RunPlanForm): RunPlanErrors {
  const e: RunPlanErrors = {};
  if (!f.name.trim()) e.name = "Gib der Laufart einen Namen, z. B. Longrun.";
  if (!(num(f.target) > 0)) e.target = f.targetKind === "duration" ? "Trag die Dauer in Minuten ein, z. B. 45." : "Trag die Distanz in km ein, z. B. 10.";
  const a = optPace(f.paceFrom), b = optPace(f.paceTo);
  if (Number.isNaN(a)) e.paceFrom = "Pace als Minuten:Sekunden, z. B. 6:15.";
  if (Number.isNaN(b)) e.paceTo = "Pace als Minuten:Sekunden, z. B. 6:45.";
  if (a !== null && b !== null && !Number.isNaN(a) && !Number.isNaN(b) && a > b) e.paceTo = '"bis" darf nicht schneller sein als "von".';
  return e;
}

export function runPlanFromForm(f: RunPlanForm): Omit<RunPlan, "id" | "order"> {
  const t = num(f.target);
  return {
    name: f.name.trim(),
    targetKind: f.targetKind,
    targetValue: f.targetKind === "duration" ? Math.round(t * 60) : t,
    paceMin: optPace(f.paceFrom),
    paceMax: optPace(f.paceTo),
  };
}

export function formFromRunPlan(p: RunPlan): RunPlanForm {
  return {
    name: p.name,
    targetKind: p.targetKind,
    target: fmtInput(p.targetKind === "duration" ? p.targetValue / 60 : p.targetValue),
    paceFrom: p.paceMin !== null ? fmtPace(p.paceMin) : "",
    paceTo: p.paceMax !== null ? fmtPace(p.paceMax) : "",
  };
}
