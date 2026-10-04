import Dexie, { type EntityTable } from "dexie";
import type {
  BodyweightEntry, Exercise, LoggedExercise, LoggedSet, Routine, RoutineExercise,
  Run, SetTemplate, Settings, WorkoutDraft, WorkoutSession,
} from "./types";

export const DEFAULT_SETTINGS: Settings = {
  key: "profile",
  heightCm: null,
  // Empfohlene Standard-Philosophie aus der Planung
  repTargetMin: 5,
  repTargetMax: 8,
  incrementType: "fixed",
  incrementValue: 2.5,
  warmupScheme: "percent_of_working",
  warmupValue: 50,
  weightRounding: 2.5,
  restSeconds: 120,
  accent: "amber",
  theme: "system",
};

export const MUSCLE_GROUPS = ["Brust", "Rücken", "Beine", "Schultern", "Arme", "Bauch"] as const;

export const EXERCISE_LIBRARY: [string, (typeof MUSCLE_GROUPS)[number]][] = [
  ["Bankdrücken (Langhantel)", "Brust"], ["Schrägbankdrücken (Langhantel)", "Brust"],
  ["Bankdrücken (Kurzhantel)", "Brust"], ["Schrägbankdrücken (Kurzhantel)", "Brust"],
  ["Brustpresse (Maschine)", "Brust"], ["Cable Fly", "Brust"], ["Dips", "Brust"], ["Liegestütz", "Brust"],
  ["Kreuzheben", "Rücken"], ["Langhantelrudern", "Rücken"], ["Klimmzug", "Rücken"], ["Klimmzug (Untergriff)", "Rücken"],
  ["Latzug", "Rücken"], ["Rudern am Kabel (sitzend)", "Rücken"], ["Kurzhantelrudern", "Rücken"],
  ["T-Bar-Rudern", "Rücken"], ["Face Pull", "Rücken"],
  ["Kniebeuge", "Beine"], ["Frontkniebeuge", "Beine"], ["Beinpresse", "Beine"], ["Rumänisches Kreuzheben", "Beine"],
  ["Beinstrecker", "Beine"], ["Beinbeuger", "Beine"], ["Ausfallschritte (gehend)", "Beine"],
  ["Bulgarian Split Squat", "Beine"], ["Wadenheben (stehend)", "Beine"], ["Wadenheben (sitzend)", "Beine"], ["Hip Thrust", "Beine"],
  ["Schulterdrücken (Langhantel)", "Schultern"], ["Schulterdrücken (Kurzhantel, sitzend)", "Schultern"],
  ["Arnold Press", "Schultern"], ["Seitheben", "Schultern"], ["Reverse Fly", "Schultern"],
  ["Frontheben", "Schultern"], ["Aufrechtes Rudern", "Schultern"],
  ["Langhantelcurl", "Arme"], ["Kurzhantelcurl", "Arme"], ["Hammercurl", "Arme"], ["Scottcurl", "Arme"],
  ["Kabelcurl", "Arme"], ["Trizepsdrücken am Kabel", "Arme"], ["Trizepsstrecken über Kopf", "Arme"],
  ["French Press (Skull Crusher)", "Arme"], ["Enges Bankdrücken", "Arme"],
  ["Plank", "Bauch"], ["Hängendes Beinheben", "Bauch"], ["Kabel-Crunch", "Bauch"],
  ["Russian Twist", "Bauch"], ["Ab Wheel Rollout", "Bauch"],
];

export class AppDB extends Dexie {
  settings!: EntityTable<Settings, "key">;
  exercises!: EntityTable<Exercise, "id">;
  routines!: EntityTable<Routine, "id">;
  routineExercises!: EntityTable<RoutineExercise, "id">;
  setTemplates!: EntityTable<SetTemplate, "id">;
  sessions!: EntityTable<WorkoutSession, "id">;
  loggedExercises!: EntityTable<LoggedExercise, "id">;
  loggedSets!: EntityTable<LoggedSet, "id">;
  bodyweight!: EntityTable<BodyweightEntry, "id">;
  runs!: EntityTable<Run, "id">;
  drafts!: EntityTable<WorkoutDraft, "key">;

  constructor(name = "satz-und-strecke") {
    super(name);
    this.version(1).stores({
      settings: "key",
      exercises: "++id, name, muscleGroup",
      routines: "++id, order",
      routineExercises: "++id, routineId, exerciseId",
      setTemplates: "++id, routineExerciseId",
      sessions: "++id, performedAt, routineId",
      loggedExercises: "++id, workoutSessionId, exerciseId",
      loggedSets: "++id, loggedExerciseId, workoutSessionId, exerciseId, [exerciseId+slotNumber], performedAt",
      bodyweight: "++id, recordedAt",
      runs: "++id, date",
      drafts: "key",
    });
    this.on("populate", async (tx) => {
      await tx.table("settings").add(DEFAULT_SETTINGS);
      await tx.table("exercises").bulkAdd(EXERCISE_LIBRARY.map(([name, muscleGroup]) => ({ name, muscleGroup, custom: false })));
    });
  }
}

export const db = new AppDB();

export async function getSettings(database: AppDB = db): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...((await database.settings.get("profile")) ?? {}) };
}

/** Bittet den Browser, die Daten nicht automatisch zu löschen (wichtig auf iOS). */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
