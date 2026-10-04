// Datenmodell nach "Gym Tracker – Milestone 1" (anml), umgesetzt für ein Gerät / eine Person.
// Die User-Tabelle entfällt; ihre Profil- und Standardwerte liegen in `Settings`.

export type IncrementType = "fixed" | "percent";
export type WarmupScheme = "percent_of_working" | "fixed_weight";
export type SetType = "warmup" | "working";
export type Accent = "amber" | "indigo" | "emerald" | "rose";
export type ThemeMode = "system" | "light" | "dark";

/** Verweis auf ein planbares Training: Kraftplan oder Laufart. */
export type TrainingRef = { kind: "routine"; id: number } | { kind: "runPlan"; id: number };
export type ShiftMode = "continuous" | "fixedWeek";
export type PlanItemStatus = "planned" | "done" | "skipped";
export interface PlanItem {
  id: string;
  ref: TrainingRef;
  status: PlanItemStatus;
  /** Name zum Zeitpunkt der Planung, falls der Plan später gelöscht wird */
  label: string;
}
export interface PlanDay {
  date: string; // YYYY-MM-DD, lokaler Tag
  /** Wochentag der Musterwoche (0 = Mo), aus dem der Tag stammt; null = eingefügte Pause */
  seq: number | null;
  items: PlanItem[];
}
/** Laufart mit Ziel. Dauer in Sekunden, Pace in Sekunden pro km. */
export interface RunPlan {
  id?: number;
  name: string;
  targetKind: "duration" | "distance";
  targetValue: number;
  paceMin: number | null; // schnelleres Ende
  paceMax: number | null; // langsameres Ende
  order: number;
}

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
  /** Musterwoche: 7 Einträge ab Montag, [] = Ruhetag */
  weekTemplate: TrainingRef[][];
  shiftMode: ShiftMode;
  /** Aus dem Alter berechnet, damit es nicht veraltet */
  birthYear: number | null;
  /** Assistent wurde mit „Fertig" oder „Später" verlassen */
  setupSeen: boolean;
  /** Karte „Woche einrichten?" wurde weggeklickt */
  weekCardHidden: boolean;
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
  /** Termin aus dem Wochenplan, der mit diesem Training erledigt wurde */
  planItemId?: string;
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
  planItemId?: string;
  runPlanId?: number;
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
  planItemId?: string | null;
  /** Nachtrag für einen vergangenen Tag (YYYY-MM-DD) */
  performedOn?: string | null;
}
