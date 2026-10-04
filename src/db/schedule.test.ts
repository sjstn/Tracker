import "fake-indexeddb/auto";
import Dexie from "dexie";
import { describe, expect, it } from "vitest";
import { AppDB, DEFAULT_SETTINGS, SCHEMA_V1, getSettings } from "./db";
import { deleteRoutine, deleteRun, deleteSession, exportBackup, finishWorkout, importBackup, saveRun, startWorkout } from "./repo";
import { isoDate } from "../lib/format";
import { addDays } from "../lib/days";
import { changePlan, deleteRunPlan, ensureHorizon, findItem, refInUse, saveWeekSetup, setItemStatus, undoPlanChange } from "./schedule";
import { postponeFrom } from "../lib/schedule";
import type { TrainingRef } from "./types";

describe("Datenbank Version 2", () => {
  it("rüstet eine Version-1-Datenbank ohne Datenverlust auf", async () => {
    const name = "upgrade-" + Math.random();
    const old = new Dexie(name);
    old.version(1).stores(SCHEMA_V1);
    await old.table("runs").add({ date: "2026-09-30", km: 5, seconds: 1500, note: null });
    await old.table("settings").add({ ...DEFAULT_SETTINGS, weekTemplate: undefined, shiftMode: undefined });
    old.close();

    const db = new AppDB(name);
    await db.open();
    expect(db.verno).toBe(2);
    expect(await db.runs.count()).toBe(1);
    expect(await db.planDays.count()).toBe(0);
    expect(await db.runPlans.count()).toBe(0);
    const s = await getSettings(db);
    expect(s.weekTemplate).toEqual([[], [], [], [], [], [], []]);
    expect(s.shiftMode).toBe("continuous");
  });

  it("sichert Laufarten und Plan-Tage mit und spielt alte Sicherungen weiter ein", async () => {
    const db = new AppDB("backup-" + Math.random());
    await db.open();
    await db.runPlans.add({ name: "Longrun", targetKind: "distance", targetValue: 15, paceMin: 375, paceMax: 405, order: 0 });
    await db.planDays.add({ date: "2026-10-06", seq: 1, items: [] });
    const json = await exportBackup(db);
    await db.runPlans.clear();
    await db.planDays.clear();
    await importBackup(json, db);
    expect(await db.runPlans.count()).toBe(1);
    expect(await db.planDays.count()).toBe(1);

    const old = JSON.parse(json);
    delete old.data.runPlans;
    delete old.data.planDays;
    await importBackup(JSON.stringify(old), db);
    expect(await db.planDays.count()).toBe(0);
  });
});

async function freshDb() { const d = new AppDB("plan-" + Math.random()); await d.open(); return d; }
async function withWeek(db: AppDB) {
  const push = (await db.routines.add({ name: "Push", order: 0 })) as number;
  const z2 = (await db.runPlans.add({ name: "Zone 2", targetKind: "duration", targetValue: 2700, paceMin: null, paceMax: null, order: 0 })) as number;
  const day: TrainingRef[] = [{ kind: "routine", id: push }, { kind: "runPlan", id: z2 }];
  await saveWeekSetup({ weekTemplate: [day, day, day, day, day, day, day] }, isoDate(), db);
  return { push, z2 };
}

describe("Plan-Speicher", () => {
  it("legt ohne Musterwoche keine Tage an", async () => {
    const db = await freshDb();
    await ensureHorizon(isoDate(), db);
    expect(await db.planDays.count()).toBe(0);
  });

  it("hält 14 Tage ab heute vor und benennt die Trainings", async () => {
    const db = await freshDb();
    await withWeek(db);
    await ensureHorizon(isoDate(), db);
    const days = await db.planDays.orderBy("date").toArray();
    expect(days.length).toBe(14);
    expect(days[0].date).toBe(isoDate());
    expect(days[13].date).toBe(addDays(isoDate(), 13));
    expect(days[0].items.map((i) => i.label)).toEqual(["Push", "Zone 2"]);
  });

  it("macht die letzte Plan-Änderung rückgängig", async () => {
    const db = await freshDb();
    await withWeek(db);
    const today = isoDate();
    await changePlan((d, c) => postponeFrom(d, today, today, c), db);
    expect((await db.planDays.get(today))!.items).toEqual([]);
    expect(await undoPlanChange(db)).toBe(true);
    expect((await db.planDays.get(today))!.items.length).toBe(2);
    expect(await undoPlanChange(db)).toBe(false);
  });

  it("Laufart löschen räumt Musterwoche und offene Termine auf", async () => {
    const db = await freshDb();
    const { z2 } = await withWeek(db);
    const ref: TrainingRef = { kind: "runPlan", id: z2 };
    expect(await refInUse(ref, isoDate(), db)).toBe(true);
    await deleteRunPlan(z2, isoDate(), db);
    expect(await refInUse(ref, isoDate(), db)).toBe(false);
    expect((await getSettings(db)).weekTemplate[0].map((r) => r.kind)).toEqual(["routine"]);
    expect(await findItem((await db.planDays.get(isoDate()))!.items[0].id, db)).toBeTruthy();
  });
});

describe("Termine erledigen", () => {
  it("Kraftplan von heute wird beim Start zugeordnet und beim Beenden erledigt", async () => {
    const db = await freshDb();
    const { push } = await withWeek(db);
    const today = isoDate();
    const draft = await startWorkout(push, db);
    const itemId = (await db.planDays.get(today))!.items[0].id;
    expect(draft.planItemId).toBe(itemId);

    await db.routineExercises.add({ routineId: push, exerciseId: 1, order: 0 });
    const d = await startWorkout(push, db);
    d.exercises = [{ key: "x", exerciseId: 1, routineExerciseId: null, sets: [{ slotNumber: 1, isWarmup: false, weight: "60", reps: "8", targetWeight: null, targetReps: null, hint: null, completed: true }] }];
    const sessionId = (await finishWorkout(d, db))!;
    expect((await db.sessions.get(sessionId))!.planItemId).toBe(itemId);
    expect((await findItem(itemId, db))!.item.status).toBe("done");

    await deleteSession(sessionId, db);
    expect((await findItem(itemId, db))!.item.status).toBe("planned");
  });

  it("ein leeres Training erledigt den Termin nicht", async () => {
    const db = await freshDb();
    const { push } = await withWeek(db);
    const d = await startWorkout(push, db);
    expect(await finishWorkout(d, db)).toBeNull();
    expect((await findItem(d.planItemId!, db))!.item.status).toBe("planned");
  });

  it("Nachtrag speichert das Datum des Termins ohne Dauer", async () => {
    const db = await freshDb();
    const { push } = await withWeek(db);
    const d = await startWorkout(push, db, { planItemId: null, performedOn: "2026-10-06" });
    d.exercises = [{ key: "x", exerciseId: 1, routineExerciseId: null, sets: [{ slotNumber: 1, isWarmup: false, weight: "60", reps: "8", targetWeight: null, targetReps: null, hint: null, completed: true }] }];
    const s = (await db.sessions.get((await finishWorkout(d, db))!))!;
    expect(isoDate(new Date(s.performedAt))).toBe("2026-10-06");
    expect(s.durationSeconds).toBeNull();
    expect(s.planItemId).toBeUndefined();
  });

  it("Lauf mit Termin erledigt ihn, Löschen gibt ihn frei", async () => {
    const db = await freshDb();
    const { z2 } = await withWeek(db);
    const itemId = (await db.planDays.get(isoDate()))!.items[1].id;
    const runId = await saveRun({ date: isoDate(), km: 7, seconds: 2820, note: null, planItemId: itemId, runPlanId: z2 }, undefined, db);
    expect((await findItem(itemId, db))!.item.status).toBe("done");
    await deleteRun(runId, db);
    expect((await findItem(itemId, db))!.item.status).toBe("planned");
  });

  it("Kraftplan löschen räumt die Woche auf, erledigte Termine behalten den Namen", async () => {
    const db = await freshDb();
    const { push } = await withWeek(db);
    const today = isoDate();
    const tomorrow = addDays(today, 1);
    const itemId = (await db.planDays.get(today))!.items[0].id;
    await db.transaction("rw", db.planDays, () => setItemStatus(itemId, "done", db));
    await deleteRoutine(push, db);
    expect((await getSettings(db)).weekTemplate[0].map((r) => r.kind)).toEqual(["runPlan"]);
    expect((await db.planDays.get(tomorrow))!.items.map((i) => i.label)).toEqual(["Zone 2"]);
    expect((await findItem(itemId, db))!.item).toMatchObject({ status: "done", label: "Push" });
  });
});
