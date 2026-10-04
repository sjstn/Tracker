import "fake-indexeddb/auto";
import Dexie from "dexie";
import { describe, expect, it } from "vitest";
import { AppDB, DEFAULT_SETTINGS, SCHEMA_V1, getSettings } from "./db";
import { exportBackup, importBackup } from "./repo";
import { isoDate } from "../lib/format";
import { addDays } from "../lib/days";
import { changePlan, deleteRunPlan, ensureHorizon, findItem, refInUse, saveWeekSetup, undoPlanChange } from "./schedule";
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
