process.env.TZ = "Europe/Berlin";
import { describe, expect, it } from "vitest";
import type { PlanDay, ShiftMode, TrainingRef } from "../db/types";
import { generate, overdue, rebuildFrom, skipDay, skipOverdue, type PlanCtx } from "./schedule";

const R = (id: number): TrainingRef => ({ kind: "routine", id });
const L = (id: number): TrainingRef => ({ kind: "runPlan", id });
// Musterwoche aus dem Konzept: Mo Zone 2, Di Push, Mi Longrun, Do Pull + Z2 kurz, Fr Pause, Sa Intervall, So Beine
export const TEMPLATE: TrainingRef[][] = [[L(1)], [R(1)], [L(2)], [R(2), L(3)], [], [L(4)], [R(3)]];
const NAMES: Record<string, string> = {
  "runPlan:1": "Zone 2", "routine:1": "Push", "runPlan:2": "Longrun", "routine:2": "Pull",
  "runPlan:3": "Z2 kurz", "runPlan:4": "Intervall", "routine:3": "Beine",
};
export function ctx(mode: ShiftMode = "continuous", template = TEMPLATE): PlanCtx {
  let n = 0;
  return { template, mode, label: (r) => NAMES[`${r.kind}:${r.id}`], newId: () => `i${++n}` };
}
/** Kurzansicht: "06 Push", "08 Pull+Z2 kurz", "09 –"; ✓ = erledigt, ✗ = ausgelassen */
export function view(days: PlanDay[], from: string, to: string): string[] {
  return days.filter((d) => d.date >= from && d.date <= to).map((d) =>
    `${d.date.slice(8)} ${d.items.map((i) => i.label + (i.status === "done" ? "✓" : i.status === "skipped" ? "✗" : "")).join("+") || "–"}`);
}
export const MON = "2026-10-05";
export const twoWeeks = (c = ctx()) => generate([], MON, "2026-10-18", c);
export const markDone = (days: PlanDay[], date: string, label: string) =>
  days.map((d) => d.date !== date ? d : { ...d, items: d.items.map((i) => i.label === label ? { ...i, status: "done" as const } : i) });

describe("generate", () => {
  it("legt die Musterwoche ab Montag an", () => {
    expect(view(twoWeeks(), MON, "2026-10-11")).toEqual([
      "05 Zone 2", "06 Push", "07 Longrun", "08 Pull+Z2 kurz", "09 –", "10 Intervall", "11 Beine",
    ]);
  });

  it("startet beim heutigen Wochentag, wenn noch nichts geplant ist", () => {
    expect(view(generate([], "2026-10-07", "2026-10-08", ctx()), "2026-10-07", "2026-10-08")).toEqual(["07 Longrun", "08 Pull+Z2 kurz"]);
  });

  it("ergänzt nur fehlende Tage und setzt die Reihenfolge fort", () => {
    const first = generate([], MON, "2026-10-07", ctx());
    const more = generate(first, MON, "2026-10-09", ctx());
    expect(more.length).toBe(5);
    expect(more[0].items[0].id).toBe(first[0].items[0].id);
    expect(view(more, "2026-10-08", "2026-10-09")).toEqual(["08 Pull+Z2 kurz", "09 –"]);
  });

  it("zählt über Zeitumstellung und Jahreswechsel richtig", () => {
    const dst = generate([], "2026-10-24", "2026-10-27", ctx("fixedWeek"));
    expect(dst.map((d) => d.date)).toEqual(["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"]);
    expect(view(dst, "2026-10-26", "2026-10-26")).toEqual(["26 Zone 2"]);
    const year = generate([], "2026-12-28", "2027-01-10", ctx());
    expect(year.length).toBe(14);
    expect(view(year, "2027-01-04", "2027-01-04")).toEqual(["04 Zone 2"]);
  });

  it("gibt die Eingabe unverändert zurück", () => {
    const days = twoWeeks();
    const before = JSON.stringify(days);
    generate(days, MON, "2026-10-25", ctx());
    expect(JSON.stringify(days)).toBe(before);
  });
});

describe("Ausfallen und vergessene Tage", () => {
  it("skipDay markiert nur die offenen Trainings des Tages", () => {
    const days = skipDay(markDone(twoWeeks(), "2026-10-08", "Pull"), "2026-10-08");
    expect(view(days, "2026-10-08", "2026-10-09")).toEqual(["08 Pull✓+Z2 kurz✗", "09 –"]);
  });

  it("overdue findet vergangene Tage mit offenen Trainings", () => {
    const days = markDone(twoWeeks(), MON, "Zone 2");
    expect(overdue(days, "2026-10-07").map((d) => d.date)).toEqual(["2026-10-06"]);
    expect(overdue(days, MON)).toEqual([]);
  });

  it("skipOverdue markiert alle vergessenen Tage als ausgelassen", () => {
    const days = skipOverdue(twoWeeks(), "2026-10-07");
    expect(view(days, MON, "2026-10-07")).toEqual(["05 Zone 2✗", "06 Push✗", "07 Longrun"]);
  });
});

describe("rebuildFrom", () => {
  it("baut ab dem Stichtag neu auf und lässt Erledigtes stehen", () => {
    const days = markDone(twoWeeks(), "2026-10-06", "Push");
    const pullOnTuesday = TEMPLATE.map((d, i) => (i === 1 ? [R(2)] : d));
    const rebuilt = rebuildFrom(days, "2026-10-07", ctx("continuous", pullOnTuesday));
    expect(view(rebuilt, "2026-10-06", "2026-10-07")).toEqual(["06 Push✓", "07 Longrun"]);
    expect(view(rebuilt, "2026-10-13", "2026-10-13")).toEqual(["13 Pull"]);
  });
});
