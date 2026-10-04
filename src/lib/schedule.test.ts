import { describe, expect, it } from "vitest";
import type { PlanDay, ShiftMode, TrainingRef } from "../db/types";
import { generate, moveItem, overdue, postponeFrom, postponeOverdue, pullForward, rebuildFrom, removeRef, skipDay, skipOverdue, swapDays, type PlanCtx } from "./schedule";

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

const idOf = (days: PlanDay[], date: string, label: string) => days.find((d) => d.date === date)!.items.find((i) => i.label === label)!.id;

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

describe("postponeFrom – Fortlaufend", () => {
  it("Pause am Dienstag schiebt alles einen Tag, auch den Ruhetag", () => {
    const days = postponeFrom(twoWeeks(), "2026-10-06", "2026-10-06", ctx());
    expect(view(days, MON, "2026-10-12")).toEqual([
      "05 Zone 2", "06 –", "07 Push", "08 Longrun", "09 Pull+Z2 kurz", "10 –", "11 Intervall", "12 Beine",
    ]);
    expect(days.find((d) => d.date === "2026-10-06")!.seq).toBeNull();
  });

  it("hängt den Überlauf hinten an und setzt die Reihenfolge danach fort", () => {
    const c = ctx();
    const days = postponeFrom(twoWeeks(c), "2026-10-06", "2026-10-06", c);
    expect(view(days, "2026-10-19", "2026-10-19")).toEqual(["19 Beine"]);
    expect(view(generate(days, "2026-10-20", "2026-10-20", c), "2026-10-20", "2026-10-20")).toEqual(["20 Zone 2"]);
  });

  it("lässt erledigte Trainings des Tages stehen", () => {
    const days = postponeFrom(markDone(twoWeeks(), "2026-10-08", "Pull"), "2026-10-08", "2026-10-08", ctx());
    expect(view(days, "2026-10-08", "2026-10-11")).toEqual(["08 Pull✓", "09 Z2 kurz", "10 –", "11 Intervall"]);
  });
});

describe("postponeFrom – Feste Woche", () => {
  it("der nächste Ruhetag fängt die Verschiebung auf", () => {
    const c = ctx("fixedWeek");
    const days = postponeFrom(twoWeeks(c), "2026-10-06", "2026-10-06", c);
    expect(view(days, "2026-10-06", "2026-10-12")).toEqual([
      "06 –", "07 Push", "08 Longrun", "09 Pull+Z2 kurz", "10 Intervall", "11 Beine", "12 Zone 2",
    ]);
  });

  it("was über Sonntag hinausfällt, wird am alten Tag ausgelassen", () => {
    const c = ctx("fixedWeek");
    const days = postponeFrom(twoWeeks(c), "2026-10-10", "2026-10-10", c);
    expect(view(days, "2026-10-10", "2026-10-12")).toEqual(["10 –", "11 Intervall+Beine✗", "12 Zone 2"]);
  });
});

describe("postponeOverdue", () => {
  it("Fortlaufend: vergessene Tage landen in ihrer Reihenfolge ab heute", () => {
    const days = postponeOverdue(markDone(twoWeeks(), MON, "Zone 2"), "2026-10-08", ctx());
    expect(view(days, "2026-10-06", "2026-10-11")).toEqual([
      "06 –", "07 –", "08 Push", "09 Longrun", "10 Pull+Z2 kurz", "11 –",
    ]);
  });

  it("Feste Woche: Vorwoche fällt weg, diese Woche rückt ab heute nach", () => {
    const c = ctx("fixedWeek");
    const days = postponeOverdue(twoWeeks(c), "2026-10-13", c);
    expect(view(days, MON, MON)).toEqual(["05 Zone 2✗"]);
    expect(view(days, "2026-10-11", "2026-10-16")).toEqual([
      "11 Beine✗", "12 –", "13 Zone 2", "14 Push", "15 Longrun", "16 Pull+Z2 kurz",
    ]);
    expect(overdue(days, "2026-10-13")).toEqual([]);
  });
});

describe("Moduswechsel", () => {
  it("Feste Woche richtet verschobene Tage wieder am Wochentag aus", () => {
    const shifted = postponeFrom(twoWeeks(), "2026-10-06", "2026-10-06", ctx()); // Fortlaufend: Mo 12. wäre Beine
    expect(view(shifted, "2026-10-12", "2026-10-12")).toEqual(["12 Beine"]);
    const fixed = rebuildFrom(shifted, "2026-10-12", ctx("fixedWeek"));
    expect(view(fixed, "2026-10-12", "2026-10-13")).toEqual(["12 Zone 2", "13 Push"]);
  });
});

describe("Tauschen und Ziehen", () => {
  it("swapDays tauscht die offenen Trainings zweier Tage", () => {
    expect(view(swapDays(twoWeeks(), "2026-10-06", "2026-10-07"), "2026-10-06", "2026-10-07")).toEqual(["06 Longrun", "07 Push"]);
  });

  it("swapDays lässt erledigte Trainings am Tag", () => {
    const days = swapDays(markDone(twoWeeks(), "2026-10-08", "Pull"), "2026-10-08", "2026-10-10");
    expect(view(days, "2026-10-08", "2026-10-10")).toEqual(["08 Pull✓+Intervall", "09 –", "10 Z2 kurz"]);
  });

  it("pullForward holt ein Training auf heute und rückt den Rest nach", () => {
    expect(view(pullForward(twoWeeks(), "2026-10-06", "2026-10-08"), "2026-10-06", "2026-10-09")).toEqual([
      "06 Pull+Z2 kurz", "07 Push", "08 Longrun", "09 –",
    ]);
  });

  it("moveItem verschiebt auf einen Ruhetag", () => {
    const days = twoWeeks();
    const out = moveItem(days, idOf(days, "2026-10-07", "Longrun"), "2026-10-09", "add", "2026-10-06");
    expect(view(out, "2026-10-07", "2026-10-09")).toEqual(["07 –", "08 Pull+Z2 kurz", "09 Longrun"]);
  });

  it("moveItem legt dazu oder tauscht mit dem belegten Tag", () => {
    const days = twoWeeks();
    const id = idOf(days, "2026-10-07", "Longrun");
    expect(view(moveItem(days, id, "2026-10-08", "add", "2026-10-06"), "2026-10-07", "2026-10-08")).toEqual(["07 –", "08 Pull+Z2 kurz+Longrun"]);
    expect(view(moveItem(days, id, "2026-10-08", "swap", "2026-10-06"), "2026-10-07", "2026-10-08")).toEqual(["07 Pull+Z2 kurz", "08 Longrun"]);
  });

  it("moveItem ignoriert vergangene Zieltage und erledigte Items", () => {
    const days = markDone(twoWeeks(), "2026-10-06", "Push");
    expect(moveItem(days, idOf(days, "2026-10-07", "Longrun"), MON, "add", "2026-10-06")).toEqual(days);
    expect(moveItem(days, idOf(days, "2026-10-06", "Push"), "2026-10-09", "add", "2026-10-06")).toEqual(days);
  });

  it("removeRef entfernt offene Termine ab dem Stichtag, Erledigtes bleibt", () => {
    const days = removeRef(markDone(twoWeeks(), "2026-10-06", "Push"), { kind: "routine", id: 1 }, "2026-10-06");
    expect(view(days, "2026-10-06", "2026-10-06")).toEqual(["06 Push✓"]);
    expect(view(days, "2026-10-13", "2026-10-13")).toEqual(["13 –"]);
  });
});
