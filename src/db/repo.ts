import { db, getSettings, type AppDB } from "./db";
import type { DraftExercise, DraftSet, LoggedSet, RoutineExercise, Run, SetTemplate, WorkoutDraft } from "./types";
import { openItemToday, removeRefEverywhere, setItemStatus } from "./schedule";
import { isoDate, parseDay } from "../lib/format";
import { progressionDefaults, resolveProgression, suggestWorkingSet, warmupWeight } from "../lib/progression";

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

/** Letzter abgeschlossener Arbeitssatz einer Übung in einem Slot – planübergreifend. */
export async function lastWorkingSet(exerciseId: number, slotNumber: number, database: AppDB = db): Promise<LoggedSet | undefined> {
  const sets = await database.loggedSets.where("[exerciseId+slotNumber]").equals([exerciseId, slotNumber]).toArray();
  return sets
    .filter((s) => !s.isWarmup && s.completed)
    .sort((a, b) => b.performedAt.localeCompare(a.performedAt))[0];
}

/** Baut die Sätze einer Übung samt Vorschlägen aus der Historie. */
export async function buildDraftExercise(
  exerciseId: number,
  routineExercise: RoutineExercise | null,
  templates: SetTemplate[],
  database: AppDB = db,
): Promise<DraftExercise> {
  const settings = await getSettings(database);
  const defaults = progressionDefaults(settings);

  let slots: Partial<SetTemplate>[] = [...templates].sort((a, b) => a.slotNumber - b.slotNumber);
  if (!slots.length) {
    // Ohne Plan: so viele Arbeitssätze wie beim letzten Mal, sonst drei
    const last = await database.loggedSets.where("exerciseId").equals(exerciseId).toArray();
    const lastSessionId = last.sort((a, b) => b.performedAt.localeCompare(a.performedAt))[0]?.workoutSessionId;
    const prev = last.filter((s) => s.workoutSessionId === lastSessionId);
    slots = prev.length
      ? prev.sort((a, b) => a.slotNumber - b.slotNumber).map((s) => ({ slotNumber: s.slotNumber, type: s.isWarmup ? "warmup" : "working" }))
      : [1, 2, 3].map((n) => ({ slotNumber: n, type: "working" as const }));
  }

  const sets: DraftSet[] = [];
  let firstHintShown = false;
  for (const t of slots) {
    const p = resolveProgression(defaults, routineExercise, t);
    if (t.type === "working") {
      const last = await lastWorkingSet(exerciseId, t.slotNumber!, database);
      const s = suggestWorkingSet(last, p, settings.weightRounding);
      // "Erstes Mal"-Hinweis nur einmal pro Übung zeigen
      const hint = s.kind === "first" ? (firstHintShown ? null : s.hint) : s.hint;
      if (s.kind === "first") firstHintShown = true;
      sets.push({ slotNumber: t.slotNumber!, isWarmup: false, weight: "", reps: "", targetWeight: s.weight, targetReps: s.reps, hint, completed: false });
    } else {
      sets.push({ slotNumber: t.slotNumber!, isWarmup: true, weight: "", reps: "", targetWeight: null, targetReps: p.repTargetMin, hint: null, completed: false });
    }
  }
  // Aufwärmsätze beziehen sich auf den ersten Arbeitssatz
  const firstWorking = sets.find((s) => !s.isWarmup)?.targetWeight ?? null;
  sets.forEach((s, i) => {
    if (!s.isWarmup) return;
    const p = resolveProgression(defaults, routineExercise, slots[i]);
    s.targetWeight = warmupWeight(firstWorking, p, settings.weightRounding);
    s.hint = p.warmupScheme === "percent_of_working" ? `Aufwärmen ${p.warmupValue} %` : "Aufwärmen";
  });

  return { key: uid(), exerciseId, routineExerciseId: routineExercise?.id ?? null, sets };
}

export async function startWorkout(
  routineId: number | null,
  database: AppDB = db,
  opts: { planItemId?: string | null; performedOn?: string | null } = {},
): Promise<WorkoutDraft> {
  // Steht der Plan heute an, wird das Training automatisch diesem Termin zugeordnet
  const planItemId = opts.planItemId !== undefined
    ? opts.planItemId
    : routineId !== null ? (await openItemToday({ kind: "routine", id: routineId }, isoDate(), database))?.id ?? null : null;
  const draft: WorkoutDraft = {
    key: "current", startedAt: new Date().toISOString(), routineId, routineName: null,
    notes: "", exercises: [], restEndsAt: null, planItemId, performedOn: opts.performedOn ?? null,
  };
  if (routineId !== null) {
    const routine = await database.routines.get(routineId);
    draft.routineName = routine?.name ?? null;
    const res = (await database.routineExercises.where("routineId").equals(routineId).toArray()).sort((a, b) => a.order - b.order);
    for (const re of res) {
      const templates = await database.setTemplates.where("routineExerciseId").equals(re.id!).toArray();
      draft.exercises.push(await buildDraftExercise(re.exerciseId, re, templates, database));
    }
  }
  await database.drafts.put(draft);
  return draft;
}

const num = (v: string) => { const n = parseFloat(v.replace(",", ".")); return Number.isFinite(n) ? n : NaN; };

/** Wert eines Satzes: eingegeben, sonst der Vorschlag. */
export function effectiveSet(s: DraftSet): { weight: number; reps: number } {
  const w = s.weight.trim() === "" ? s.targetWeight ?? NaN : num(s.weight);
  const r = s.reps.trim() === "" ? s.targetReps ?? NaN : num(s.reps);
  return { weight: w, reps: r };
}

/** Speichert das laufende Training und gibt die neue Session-ID zurück. */
export async function finishWorkout(draft: WorkoutDraft, database: AppDB = db): Promise<number | null> {
  // Nachtrag: Mittag des Termintags, keine Dauer
  const performedAt = draft.performedOn ? new Date(parseDay(draft.performedOn).setHours(12)).toISOString() : draft.startedAt;
  const durationSeconds = draft.performedOn ? null : Math.max(0, Math.round((Date.now() - new Date(draft.startedAt).getTime()) / 1000));
  const exercises = draft.exercises
    .map((x) => ({ x, sets: x.sets.filter((s) => s.completed).map((s) => ({ s, ...effectiveSet(s) })).filter((s) => Number.isFinite(s.weight) && s.reps > 0) }))
    .filter((e) => e.sets.length);

  return database.transaction("rw", [database.sessions, database.loggedExercises, database.loggedSets, database.drafts, database.planDays], async () => {
    if (!exercises.length) { await database.drafts.delete("current"); return null; }
    const sessionId = (await database.sessions.add({
      routineId: draft.routineId, routineName: draft.routineName, performedAt,
      notes: draft.notes.trim() || null, durationSeconds, ...(draft.planItemId ? { planItemId: draft.planItemId } : {}),
    })) as number;
    for (const [order, e] of exercises.entries()) {
      const leId = (await database.loggedExercises.add({
        workoutSessionId: sessionId, exerciseId: e.x.exerciseId, routineExerciseId: e.x.routineExerciseId, order,
      })) as number;
      await database.loggedSets.bulkAdd(e.sets.map(({ s, weight, reps }) => ({
        loggedExerciseId: leId, workoutSessionId: sessionId, exerciseId: e.x.exerciseId, performedAt,
        slotNumber: s.slotNumber, weight, reps, isWarmup: s.isWarmup, completed: true,
      })));
    }
    if (draft.planItemId) await setItemStatus(draft.planItemId, "done", database);
    await database.drafts.delete("current");
    return sessionId;
  });
}

export async function deleteSession(id: number, database: AppDB = db) {
  await database.transaction("rw", [database.sessions, database.loggedExercises, database.loggedSets, database.planDays], async () => {
    const planItemId = (await database.sessions.get(id))?.planItemId;
    await database.loggedSets.where("workoutSessionId").equals(id).delete();
    await database.loggedExercises.where("workoutSessionId").equals(id).delete();
    await database.sessions.delete(id);
    if (planItemId) await setItemStatus(planItemId, "planned", database);
  });
}

export async function deleteRoutine(id: number, database: AppDB = db) {
  await database.transaction("rw", [database.routines, database.routineExercises, database.setTemplates, database.sessions, database.settings, database.planDays], async () => {
    const res = await database.routineExercises.where("routineId").equals(id).primaryKeys();
    await database.setTemplates.where("routineExerciseId").anyOf(res as number[]).delete();
    await database.routineExercises.bulkDelete(res);
    await removeRefEverywhere({ kind: "routine", id }, database);
    await database.routines.delete(id);
    // Vergangene Trainings bleiben erhalten (routineId → null, Name bleibt gespeichert)
    await database.sessions.where("routineId").equals(id).modify({ routineId: null });
  });
}

/** Eigene Übungen lassen sich nur löschen, wenn sie nirgends verwendet werden. */
export async function exerciseInUse(id: number, database: AppDB = db): Promise<boolean> {
  return (await database.loggedExercises.where("exerciseId").equals(id).count()) > 0
    || (await database.routineExercises.where("exerciseId").equals(id).count()) > 0;
}

/** Lauf speichern; mit Termin wird dieser erledigt. Gibt die Lauf-ID zurück. */
export async function saveRun(run: Omit<Run, "id">, id?: number, database: AppDB = db): Promise<number> {
  return database.transaction("rw", [database.runs, database.planDays], async () => {
    let runId = id;
    if (id) await database.runs.update(id, run);
    else runId = (await database.runs.add(run)) as number;
    if (run.planItemId) await setItemStatus(run.planItemId, "done", database);
    return runId!;
  });
}

export async function deleteRun(id: number, database: AppDB = db) {
  await database.transaction("rw", [database.runs, database.planDays], async () => {
    const planItemId = (await database.runs.get(id))?.planItemId;
    await database.runs.delete(id);
    if (planItemId) await setItemStatus(planItemId, "planned", database);
  });
}

/* ---------- Sicherung ---------- */
const BACKUP_TABLES = ["settings", "exercises", "routines", "routineExercises", "setTemplates", "sessions", "loggedExercises", "loggedSets", "bodyweight", "runs", "runPlans", "planDays"] as const;

export async function exportBackup(database: AppDB = db): Promise<string> {
  const data: Record<string, unknown[]> = {};
  for (const t of BACKUP_TABLES) data[t] = await database.table(t).toArray();
  return JSON.stringify({ app: "tracker", version: 1, exportedAt: new Date().toISOString(), data }, null, 1);
}

export async function importBackup(text: string, database: AppDB = db) {
  const parsed = JSON.parse(text);
  if (parsed?.app !== "tracker" || !parsed.data) throw new Error("Diese Datei ist keine Sicherung von Tracker.");
  await database.transaction("rw", BACKUP_TABLES.map((t) => database.table(t)), async () => {
    for (const t of BACKUP_TABLES) {
      await database.table(t).clear();
      if (Array.isArray(parsed.data[t])) await database.table(t).bulkAdd(parsed.data[t]);
    }
  });
}
