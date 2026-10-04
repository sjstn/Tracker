import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { AppDB, EXERCISE_LIBRARY } from "./db";
import { deleteRoutine, exportBackup, finishWorkout, importBackup, lastWorkingSet, startWorkout } from "./repo";

let db: AppDB;
beforeEach(async () => { db = new AppDB("test-" + Math.random()); await db.open(); });

async function routineWith(exerciseId: number) {
  const routineId = (await db.routines.add({ name: "Push", order: 0 })) as number;
  const reId = (await db.routineExercises.add({ routineId, exerciseId, order: 0 })) as number;
  await db.setTemplates.bulkAdd([
    { routineExerciseId: reId, slotNumber: 1, type: "warmup" },
    { routineExerciseId: reId, slotNumber: 2, type: "working" },
    { routineExerciseId: reId, slotNumber: 3, type: "working" },
  ]);
  return routineId;
}

describe("Datenbank", () => {
  it("legt Standard-Übungen und Einstellungen an", async () => {
    expect(await db.exercises.count()).toBe(EXERCISE_LIBRARY.length);
    expect(EXERCISE_LIBRARY.length).toBeGreaterThanOrEqual(40);
    expect((await db.settings.get("profile"))?.repTargetMin).toBe(5);
  });

  it("schlägt nach erreichtem Ziel mehr Gewicht vor, inkl. Aufwärmsatz", async () => {
    const bench = (await db.exercises.where("name").equals("Bankdrücken (Langhantel)").first())!;
    const routineId = await routineWith(bench.id!);

    const d1 = await startWorkout(routineId, db);
    expect(d1.exercises[0].sets.map((s) => s.isWarmup)).toEqual([true, false, false]);
    d1.exercises[0].sets.forEach((s) => { s.weight = s.isWarmup ? "40" : "80"; s.reps = s.isWarmup ? "5" : "8"; s.completed = true; });
    d1.exercises[0].sets[2].reps = "6";
    const sessionId = await finishWorkout(d1, db);
    expect(sessionId).not.toBeNull();
    expect(await db.drafts.get("current")).toBeUndefined();

    const d2 = await startWorkout(routineId, db);
    const [warm, s2, s3] = d2.exercises[0].sets;
    expect(s2).toMatchObject({ targetWeight: 82.5, targetReps: 5 }); // Slot 2 hatte 8 Wdh.
    expect(s3).toMatchObject({ targetWeight: 80, targetReps: 7 });   // Slot 3 hatte 6 Wdh.
    expect(warm.targetWeight).toBe(42.5);                            // 50 % von 82,5 → gerundet
  });

  it("Historie ist übungsweit, nicht an den Plan gebunden", async () => {
    const squat = (await db.exercises.where("name").equals("Kniebeuge").first())!;
    const r1 = await routineWith(squat.id!);
    const d = await startWorkout(r1, db);
    d.exercises[0].sets.forEach((s) => { s.weight = "100"; s.reps = "8"; s.completed = true; });
    await finishWorkout(d, db);
    await deleteRoutine(r1, db);
    expect((await lastWorkingSet(squat.id!, 2, db))?.weight).toBe(100);
    expect((await db.sessions.toArray())[0].routineId).toBeNull();
  });

  it("speichert nur abgehakte Sätze und verwirft leere Trainings", async () => {
    const d = await startWorkout(null, db);
    expect(await finishWorkout(d, db)).toBeNull();
    expect(await db.sessions.count()).toBe(0);
  });

  it("Sicherung lässt sich exportieren und wieder einspielen", async () => {
    await db.runs.add({ date: "2026-10-01", km: 5, seconds: 1500, note: null });
    const json = await exportBackup(db);
    await db.runs.clear();
    await importBackup(json, db);
    expect(await db.runs.count()).toBe(1);
    await expect(importBackup("{}", db)).rejects.toThrow();
  });
});
