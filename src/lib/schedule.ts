import type { PlanDay, PlanItem, ShiftMode, TrainingRef } from "../db/types";
import { addDays, daysBetween, sundayOf, weekdayIndex } from "./days";

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
const index = (days: PlanDay[]) => new Map(days.map((d) => [d.date, d]));

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

/** Offene Trainings ab `from` nach hinten schieben; sie landen frühestens `today`, mindestens einen Tag später. */
export function postponeFrom(days: PlanDay[], from: string, today: string, ctx: PlanCtx): PlanDay[] {
  const n = Math.max(1, daysBetween(from, today));
  return ctx.mode === "continuous" ? shiftContinuous(days, from, n) : shiftFixedWeek(days, from, n);
}

/** Fortlaufend: Ab `from` rückt jeder Tag samt Musterwochentag um n Tage weiter, davor entstehen Pausentage. */
function shiftContinuous(days: PlanDay[], from: string, n: number): PlanDay[] {
  const out = copy(days);
  const src = new Map(out.filter((d) => d.date >= from).map((d) => [d.date, { seq: d.seq, items: openItems(d) }]));
  if (!src.size) return out;
  const last = out[out.length - 1].date;
  for (let k = 1; k <= n; k++) out.push({ date: addDays(last, k), seq: null, items: [] });
  for (const d of out) {
    if (d.date < from) continue;
    const s = src.get(addDays(d.date, -n));
    d.items = [...keptItems(d), ...(s ? s.items : [])];
    d.seq = s ? s.seq : null;
  }
  return out;
}

/** Feste Woche: Trainings rücken nach, bis ein Tag ohne offene Trainings sie aufnimmt; nach Sonntag fallen sie weg. */
function shiftFixedWeek(days: PlanDay[], from: string, n: number): PlanDay[] {
  const out = copy(days);
  const map = index(out);
  const start = addDays(from, n);
  const queue: { origin: string; items: PlanItem[] }[] = [];
  for (let date = from; date <= sundayOf(from); date = addDays(date, 1)) {
    const d = map.get(date);
    if (!d) continue;
    const incoming = openItems(d);
    d.items = keptItems(d);
    if (incoming.length) queue.push({ origin: date, items: incoming });
    if (date >= start && queue.length) d.items.push(...queue.shift()!.items);
  }
  for (const g of queue) map.get(g.origin)!.items.push(...g.items.map((i) => ({ ...i, status: "skipped" as const })));
  return out;
}

/** Alle vergessenen Tage verschieben, bis kein Tag vor `today` offene Trainings hat. */
export function postponeOverdue(days: PlanDay[], today: string, ctx: PlanCtx): PlanDay[] {
  let out = copy(days);
  // Fortlaufend reicht ein Durchgang; Feste Woche braucht einen pro betroffener Woche
  for (let guard = 0; guard < 520; guard++) {
    const first = overdue(out, today)[0];
    if (!first) break;
    out = postponeFrom(out, first.date, today, ctx);
  }
  return out;
}
