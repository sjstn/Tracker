import "fake-indexeddb/auto";
import Dexie from "dexie";
import { describe, expect, it } from "vitest";
import { AppDB, DEFAULT_SETTINGS, SCHEMA_V1, getSettings } from "./db";
import { exportBackup, importBackup } from "./repo";

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
