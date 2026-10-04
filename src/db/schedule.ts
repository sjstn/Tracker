import { db, getSettings, type AppDB } from "./db";
import type { PlanDay, PlanItem, PlanItemStatus, ShiftMode, TrainingRef } from "./types";
import { addDays } from "../lib/days";
import { isoDate } from "../lib/format";
import { generate, HORIZON_DAYS, rebuildFrom, refKey, removeRef, sameRef, type PlanCtx } from "../lib/schedule";

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

// Stand vor der letzten Plan-Änderung, solange die Meldung mit "Rückgängig" sichtbar ist
let undoSnapshot: PlanDay[] | null = null;

const planTables = (database: AppDB) => [database.planDays, database.settings, database.routines, database.runPlans];

export async function planCtx(database: AppDB = db): Promise<PlanCtx> {
  const [s, routines, runPlans] = await Promise.all([getSettings(database), database.routines.toArray(), database.runPlans.toArray()]);
  const names = new Map<string, string>([
    ...routines.map((r) => [refKey({ kind: "routine", id: r.id! }), r.name] as [string, string]),
    ...runPlans.map((r) => [refKey({ kind: "runPlan", id: r.id! }), r.name] as [string, string]),
  ]);
  return { template: s.weekTemplate, mode: s.shiftMode, label: (ref) => names.get(refKey(ref)) ?? "Training", newId: uid };
}

const hasTemplate = (ctx: PlanCtx) => ctx.template.some((d) => d.length > 0);

/** Füllt den Vorrat auf heute bis heute + 13 auf. Ohne Musterwoche passiert nichts. */
export async function ensureHorizon(today = isoDate(), database: AppDB = db) {
  await database.transaction("rw", planTables(database), async () => {
    const ctx = await planCtx(database);
    if (!hasTemplate(ctx)) return;
    const days = await database.planDays.toArray();
    const have = new Set(days.map((d) => d.date));
    const added = generate(days, today, addDays(today, HORIZON_DAYS - 1), ctx).filter((d) => !have.has(d.date));
    if (added.length) await database.planDays.bulkPut(added);
  });
}

/** Musterwoche oder Modus speichern; ab morgen wird neu geplant, heute bleibt. */
export async function saveWeekSetup(patch: { weekTemplate?: TrainingRef[][]; shiftMode?: ShiftMode }, today = isoDate(), database: AppDB = db) {
  await database.transaction("rw", planTables(database), async () => {
    await database.settings.put({ ...(await getSettings(database)), ...patch });
    const ctx = await planCtx(database);
    let days = rebuildFrom(await database.planDays.toArray(), addDays(today, 1), ctx);
    if (hasTemplate(ctx)) days = generate(days, today, addDays(today, HORIZON_DAYS - 1), ctx);
    await database.planDays.bulkPut(days);
    undoSnapshot = null;
  });
}

/** Führt eine Planungsregel aus und merkt sich den Stand davor für "Rückgängig". */
export async function changePlan(fn: (days: PlanDay[], ctx: PlanCtx) => PlanDay[], database: AppDB = db) {
  await database.transaction("rw", planTables(database), async () => {
    const days = await database.planDays.toArray();
    const next = fn(days, await planCtx(database));
    await database.planDays.bulkPut(next);
    undoSnapshot = days;
  });
}

export function clearPlanUndo() { undoSnapshot = null; }

export async function undoPlanChange(database: AppDB = db): Promise<boolean> {
  if (!undoSnapshot) return false;
  const snap = undoSnapshot;
  undoSnapshot = null;
  await database.transaction("rw", database.planDays, async () => {
    await database.planDays.clear();
    await database.planDays.bulkAdd(snap);
  });
  return true;
}

export async function findItem(itemId: string, database: AppDB = db): Promise<{ day: PlanDay; item: PlanItem } | undefined> {
  const day = await database.planDays.filter((d) => d.items.some((i) => i.id === itemId)).first();
  const item = day?.items.find((i) => i.id === itemId);
  return day && item ? { day, item } : undefined;
}

export async function openItemToday(ref: TrainingRef, today = isoDate(), database: AppDB = db): Promise<PlanItem | undefined> {
  const day = await database.planDays.get(today);
  return day?.items.find((i) => i.status === "planned" && sameRef(i.ref, ref));
}

/** Nur innerhalb einer Transaktion aufrufen, die planDays einschließt. */
export async function setItemStatus(itemId: string, status: PlanItemStatus, database: AppDB) {
  const found = await findItem(itemId, database);
  if (!found) return;
  found.day.items = found.day.items.map((i) => (i.id === itemId ? { ...i, status } : i));
  await database.planDays.put(found.day);
  undoSnapshot = null; // Ein erledigtes Training soll ein altes "Rückgängig" nicht zurückdrehen
}

export async function refInUse(ref: TrainingRef, today = isoDate(), database: AppDB = db): Promise<boolean> {
  const s = await getSettings(database);
  if (s.weekTemplate.some((d) => d.some((r) => sameRef(r, ref)))) return true;
  return (await database.planDays.where("date").aboveOrEqual(today).toArray())
    .some((d) => d.items.some((i) => i.status === "planned" && sameRef(i.ref, ref)));
}

/** Entfernt offene Termine an allen Tagen, auch vergangene. Nur innerhalb einer Transaktion über settings + planDays aufrufen. */
export async function removeRefEverywhere(ref: TrainingRef, database: AppDB) {
  const s = await getSettings(database);
  await database.settings.put({ ...s, weekTemplate: s.weekTemplate.map((d) => d.filter((r) => !sameRef(r, ref))) });
  await database.planDays.bulkPut(removeRef(await database.planDays.toArray(), ref, ""));
  undoSnapshot = null;
}

export async function deleteRunPlan(id: number, database: AppDB = db) {
  await database.transaction("rw", [database.runPlans, database.settings, database.planDays], async () => {
    await removeRefEverywhere({ kind: "runPlan", id }, database);
    await database.runPlans.delete(id);
  });
}
