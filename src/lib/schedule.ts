import type { PlanDay, PlanItem, ShiftMode, TrainingRef } from "../db/types";
import { addDays, weekdayIndex } from "./days";

/* Regeln des Wochenplans als reine Funktionen: Plan-Tage rein, neue Plan-Tage raus.
   Erledigte und ausgelassene Items bewegt keine Regel. */

export const HORIZON_DAYS = 14;

export interface PlanCtx {
  template: TrainingRef[][];
  mode: ShiftMode;
  label: (ref: TrainingRef) => string;
  newId: () => string;
}

export const refKey = (r: TrainingRef) => `${r.kind}:${r.id}`;
export const sameRef = (a: TrainingRef, b: TrainingRef) => a.kind === b.kind && a.id === b.id;

const isOpen = (i: PlanItem) => i.status === "planned";
export const openItems = (d: PlanDay | undefined): PlanItem[] => (d ? d.items.filter(isOpen) : []);
const keptItems = (d: PlanDay | undefined): PlanItem[] => (d ? d.items.filter((i) => !isOpen(i)) : []);

const byDate = (a: PlanDay, b: PlanDay) => a.date.localeCompare(b.date);
const copy = (days: PlanDay[]): PlanDay[] => days.map((d) => ({ ...d, items: d.items.map((i) => ({ ...i })) })).sort(byDate);

function itemsFor(seq: number, ctx: PlanCtx): PlanItem[] {
  return (ctx.template[seq] ?? []).map((ref) => ({ id: ctx.newId(), ref, status: "planned" as const, label: ctx.label(ref) }));
}

/** Welcher Musterwochentag ist am Datum dran? Fortlaufend: nach dem letzten geplanten Tag davor. */
function nextSeq(sorted: PlanDay[], date: string, ctx: PlanCtx): number {
  if (ctx.mode === "fixedWeek") return weekdayIndex(date);
  for (let i = sorted.length - 1; i >= 0; i--) {
    const d = sorted[i];
    if (d.date < date && d.seq !== null) return (d.seq + 1) % 7;
  }
  return weekdayIndex(date);
}

/** Legt fehlende Tage von `from` bis `until` (inklusive) aus der Musterwoche an. */
export function generate(days: PlanDay[], from: string, until: string, ctx: PlanCtx): PlanDay[] {
  const out = copy(days);
  const have = new Set(out.map((d) => d.date));
  for (let date = from; date <= until; date = addDays(date, 1)) {
    if (have.has(date)) continue;
    const seq = nextSeq(out, date, ctx);
    out.push({ date, seq, items: itemsFor(seq, ctx) });
    out.sort(byDate);
  }
  return out;
}

/** Vergangene Tage mit offenen Trainings. */
export function overdue(days: PlanDay[], today: string): PlanDay[] {
  return copy(days).filter((d) => d.date < today && d.items.some(isOpen));
}

const skipOpen = (d: PlanDay): PlanDay => ({ ...d, items: d.items.map((i) => (isOpen(i) ? { ...i, status: "skipped" as const } : i)) });

export function skipDay(days: PlanDay[], date: string): PlanDay[] {
  return copy(days).map((d) => (d.date === date ? skipOpen(d) : d));
}

export function skipOverdue(days: PlanDay[], today: string): PlanDay[] {
  return copy(days).map((d) => (d.date < today ? skipOpen(d) : d));
}

/** Musterwoche oder Modus geändert: offene Trainings ab `from` neu erzeugen. */
export function rebuildFrom(days: PlanDay[], from: string, ctx: PlanCtx): PlanDay[] {
  const all = copy(days);
  const out = all.filter((d) => d.date < from);
  for (const d of all.filter((x) => x.date >= from)) {
    const seq = nextSeq(out, d.date, ctx);
    out.push({ date: d.date, seq, items: [...keptItems(d), ...itemsFor(seq, ctx)] });
  }
  return out;
}
