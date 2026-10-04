// src/db/setup.test.ts
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { AppDB, getSettings } from "./db";
import { completeSetup, hideWeekCard, isAppEmpty, loadSetupDraft, markSetupSeen, markTourSeen, type SetupDraft } from "./setup";
import { PRESETS } from "../lib/presets";
import { addDays } from "../lib/days";
import { isoDate } from "../lib/format";

async function freshDb() { const d = new AppDB("setup-" + Math.random()); await d.open(); return d; }
const hybrid = PRESETS.find((p) => p.id === "hybrid")!.week;
async function draftFor(db: AppDB, patch: Partial<SetupDraft> = {}): Promise<SetupDraft> {
  return { ...(await loadSetupDraft(db)).draft, ...patch };
}

describe("Assistent speichern", () => {
  it("isAppEmpty erkennt eine frische App", async () => {
    const db = await freshDb();
    expect(await isAppEmpty(db)).toBe(true);
    await db.bodyweight.add({ weight: 80, recordedAt: new Date().toISOString() });
    expect(await isAppEmpty(db)).toBe(false);
  });

  it("isAppEmpty ist false bei laufendem Training", async () => {
    const db = await freshDb();
    await db.drafts.put({ key: "current", startedAt: new Date().toISOString(), routineId: null, routineName: null, notes: "", exercises: [], restEndsAt: null });
    expect(await isAppEmpty(db)).toBe(false);
  });

  it("erneutes Ausführen mit unveränderter Woche lässt verschobene Plan-Tage unberührt", async () => {
    const db = await freshDb();
    const draft = await draftFor(db, { week: hybrid });
    await completeSetup(draft, isoDate(), db);
    const tomorrow = addDays(isoDate(), 1);
    await db.planDays.update(tomorrow, { items: [] });
    await completeSetup(draft, isoDate(), db);
    expect((await db.planDays.get(tomorrow))!.items).toEqual([]);
  });

  it("legt Einstellungen, Gewicht, Pläne, Laufarten und 14 Plan-Tage an", async () => {
    const db = await freshDb();
    await completeSetup(await draftFor(db, { heightCm: 182, age: 35, weightKg: 82.4, week: hybrid }), isoDate(), db);
    const s = await getSettings(db);
    expect(s).toMatchObject({ heightCm: 182, birthYear: new Date().getFullYear() - 35, setupSeen: true });
    expect((await db.bodyweight.toArray()).map((b) => b.weight)).toEqual([82.4]);
    expect((await db.routines.toArray()).map((r) => r.name).sort()).toEqual(["Beine", "Pull", "Push"]);
    const longrun = (await db.runPlans.toArray()).find((p) => p.name === "Longrun")!;
    expect(longrun).toMatchObject({ targetKind: "distance", targetValue: 15, paceMin: 375, paceMax: 405 });
    expect(await db.runPlans.count()).toBe(4);
    const days = await db.planDays.orderBy("date").toArray();
    expect(days).toHaveLength(14);
    expect(days[13].date).toBe(addDays(isoDate(), 13));
    const push = (await db.routines.toArray()).find((r) => r.name === "Push")!;
    expect(s.weekTemplate[1]).toEqual([{ kind: "routine", id: push.id }]);
  });

  it("zweimal ausführen legt nichts doppelt an, vorhandener Plan behält seine Übungen", async () => {
    const db = await freshDb();
    const pushId = (await db.routines.add({ name: "push", order: 0 })) as number;
    await db.routineExercises.add({ routineId: pushId, exerciseId: 1, order: 0 });
    const draft = await draftFor(db, { week: hybrid });
    await completeSetup(draft, isoDate(), db);
    await completeSetup(draft, isoDate(), db);
    expect(await db.routines.count()).toBe(3);
    expect(await db.runPlans.count()).toBe(4);
    expect(await db.routineExercises.count()).toBe(1);
    expect((await getSettings(db)).weekTemplate[1]).toEqual([{ kind: "routine", id: pushId }]);
  });

  it("übernimmt Laufziele aus dem Entwurf, ungültige fallen auf den Standard zurück", async () => {
    const db = await freshDb();
    await db.runPlans.add({ name: "Zone 2", targetKind: "duration", targetValue: 2700, paceMin: null, paceMax: null, order: 0 });
    await completeSetup(await draftFor(db, {
      week: hybrid,
      runTargets: {
        "zone 2": { name: "Zone 2", targetKind: "duration", target: "60", paceFrom: "", paceTo: "" },
        longrun: { name: "Longrun", targetKind: "distance", target: "", paceFrom: "", paceTo: "" },
      },
    }), isoDate(), db);
    const plans = await db.runPlans.toArray();
    expect(plans.find((p) => p.name === "Zone 2")).toMatchObject({ targetValue: 3600, paceMin: null });
    expect(plans.find((p) => p.name === "Longrun")).toMatchObject({ targetValue: 15 });
    expect(plans.filter((p) => p.name === "Zone 2")).toHaveLength(1);
  });

  it("leere Felder lassen bestehende Werte stehen", async () => {
    const db = await freshDb();
    await db.settings.put({ ...(await getSettings(db)), heightCm: 175, birthYear: 1980 });
    await completeSetup(await draftFor(db, { heightCm: null, age: null, weightKg: null }), isoDate(), db);
    expect(await getSettings(db)).toMatchObject({ heightCm: 175, birthYear: 1980 });
    expect(await db.bodyweight.count()).toBe(0);
  });

  it("speichert Name und Geburtsdatum, ein reines Alter löscht das Datum", async () => {
    const db = await freshDb();
    await completeSetup(await draftFor(db, { name: "Justin", birthDate: "2004-10-04", age: null }), isoDate(), db);
    expect(await getSettings(db)).toMatchObject({ name: "Justin", birthDate: "2004-10-04", birthYear: 2004 });
    await completeSetup(await draftFor(db, { birthDate: null, age: 30 }), isoDate(), db);
    expect(await getSettings(db)).toMatchObject({ name: "Justin", birthDate: null, birthYear: new Date().getFullYear() - 30 });
  });

  it("loadSetupDraft füllt aus dem Bestand vor", async () => {
    const db = await freshDb();
    await db.settings.put({ ...(await getSettings(db)), heightCm: 180, birthYear: new Date().getFullYear() - 40 });
    await db.bodyweight.add({ weight: 81, recordedAt: new Date().toISOString() });
    const start = await loadSetupDraft(db);
    expect(start.draft).toMatchObject({ heightCm: 180, age: 40, birthDate: null, name: null, weightKg: null, shiftMode: "continuous" });
    expect(start.draft.progression.repTargetMin).toBe(5);
    expect(start).toMatchObject({ hasWeek: false, lastWeight: 81 });
  });

  it("„Später“ und die Karte merken sich ihren Zustand", async () => {
    const db = await freshDb();
    await markSetupSeen(db);
    await hideWeekCard(db);
    expect(await getSettings(db)).toMatchObject({ setupSeen: true, weekCardHidden: true });
  });

  it("merkt sich, dass die Einführung gesehen wurde", async () => {
    const db = await freshDb();
    expect((await getSettings(db)).tourSeen).toBe(false);
    await markTourSeen(db);
    expect((await getSettings(db)).tourSeen).toBe(true);
  });
});
