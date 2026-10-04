// Datenmodell nach "Gym Tracker – Milestone 1" (anml), umgesetzt für ein Gerät / eine Person.
// Die User-Tabelle entfällt; ihre Profil- und Standardwerte liegen in `Settings`.

export type IncrementType = "fixed" | "percent";
export type WarmupScheme = "percent_of_working" | "fixed_weight";
export type SetType = "warmup" | "working";
export type Accent = "amber" | "indigo" | "emerald" | "rose";
export type ThemeMode = "system" | "light" | "dark";

/** Die sechs Progressionsfelder, überall gleich benannt. */
export interface ProgressionFields {
  repTargetMin: number;
  repTargetMax: number;
  incrementType: IncrementType;
  incrementValue: number;
  warmupScheme: WarmupScheme;
  warmupValue: number;
}
export type ProgressionOverrides = Partial<ProgressionFields>;

export interface Settings extends ProgressionFields {
  key: "profile";
  heightCm: number | null;
  /** Auf dieses Raster werden berechnete Gewichte gerundet (Prozent-Steigerung, Aufwärmsätze). */
  weightRounding: number;
  restSeconds: number;
  accent: Accent;
  theme: ThemeMode;
}

export interface Exercise {
  id?: number;
  name: string;
  muscleGroup: string;
  /** true = selbst angelegt, false = aus der Standard-Bibliothek */
  custom: boolean;
}

export interface Routine {
  id?: number;
  name: string;
  order: number;
}

/** Überschreibt Wiederholungsbereich und Steigerung; Aufwärmregeln liegen nur am Satz. */
export interface RoutineExercise extends Pick<ProgressionOverrides, "repTargetMin" | "repTargetMax" | "incrementType" | "incrementValue"> {
  id?: number;
  routineId: number;
  exerciseId: number;
  order: number;
}

export interface SetTemplate extends ProgressionOverrides {
  id?: number;
  routineExerciseId: number;
  slotNumber: number;
  type: SetType;
}

export interface WorkoutSession {
  id?: number;
  routineId: number | null;
  /** Name zum Zeitpunkt des Trainings, falls der Plan später gelöscht oder umbenannt wird */
  routineName: string | null;
  performedAt: string; // ISO-Zeitstempel
  notes: string | null;
  durationSeconds: number | null;
}

export interface LoggedExercise {
  id?: number;
  workoutSessionId: number;
  exerciseId: number;
  routineExerciseId: number | null;
  order: number;
}

export interface LoggedSet {
  id?: number;
  loggedExerciseId: number;
  // Denormalisiert für schnelle Abfrage der Historie je Übung und Satz-Slot
  workoutSessionId: number;
  exerciseId: number;
  performedAt: string;
  slotNumber: number;
  weight: number;
  reps: number;
  isWarmup: boolean;
  completed: boolean;
}

export interface BodyweightEntry {
  id?: number;
  weight: number;
  recordedAt: string;
}

export interface Run {
  id?: number;
  date: string; // YYYY-MM-DD
  km: number;
  seconds: number;
  note: string | null;
}

/* ---------- Laufendes Training (Entwurf, übersteht App-Neustarts) ---------- */
export interface DraftSet {
  slotNumber: number;
  isWarmup: boolean;
  weight: string;
  reps: string;
  /** Vorschlag der Progression, wird als Platzhalter angezeigt */
  targetWeight: number | null;
  targetReps: number | null;
  hint: string | null;
  completed: boolean;
}
export interface DraftExercise {
  key: string;
  exerciseId: number;
  routineExerciseId: number | null;
  sets: DraftSet[];
}
export interface WorkoutDraft {
  key: "current";
  startedAt: string;
  routineId: number | null;
  routineName: string | null;
  notes: string;
  exercises: DraftExercise[];
  restEndsAt: number | null;
}
