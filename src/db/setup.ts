// src/db/setup.ts
import { db, getSettings, type AppDB } from "./db";
import { saveWeekSetup } from "./schedule";
import type { ProgressionFields, Routine, RunPlan, Settings, ShiftMode } from "./types";
import { isoDate } from "../lib/format";
import { progressionDefaults } from "../lib/progression";
import { defaultRunForm, missingNames, nameKey, runPlanNames, toTemplate, weekFromTemplate, type DraftRef } from "../lib/presets";
import { birthYearFromAge, currentAge } from "../lib/profile";
import { formFromRunPlan, runPlanFromForm, validateRunPlan, type RunPlanForm } from "../lib/runTarget";

/** Alles, was der Assistent sammelt; gespeichert wird erst mit completeSetup. */
export interface SetupDraft {
  name: string | null;
  heightCm: number | null;
  age: number | null;
  birthDate: string | null; // geht vor dem Alter
  weightKg: number | null; // null = kein neuer Gewichtseintrag
  progression: ProgressionFields;
  week: DraftRef[][];
  shiftMode: ShiftMode;
  runTargets: Record<string, RunPlanForm>; // Schlüssel = nameKey
}
export interface SetupStart { draft: SetupDraft; routines: Routine[]; runPlans: RunPlan[]; hasWeek: boolean; lastWeight: number | null }

export async function loadSetupDraft(database: AppDB = db): Promise<SetupStart> {
  const [s, routines, runPlans, last] = await Promise.all([
    getSettings(database),
    database.routines.orderBy("order").toArray(),
    database.runPlans.orderBy("order").toArray(),
    database.bodyweight.orderBy("recordedAt").last(),
  ]);
  const week = weekFromTemplate(s.weekTemplate, routines, runPlans);
  return {
    draft: {
      name: s.name, heightCm: s.heightCm, age: currentAge(s), birthDate: s.birthDate, weightKg: null,
      progression: progressionDefaults(s), week, shiftMode: s.shiftMode,
      runTargets: Object.fromEntries(runPlans.map((p) => [nameKey(p.name), formFromRunPlan(p)])),
    },
    routines, runPlans, hasWeek: week.some((d) => d.length > 0), lastWeight: last?.weight ?? null,
  };
}

/** Speichert den Entwurf in einer Transaktion; mehrfach ausgeführt entstehen keine Doppel. */
export async function completeSetup(draft: SetupDraft, today = isoDate(), database: AppDB = db) {
  const tables = [database.settings, database.bodyweight, database.routines, database.runPlans, database.planDays];
  await database.transaction("rw", tables, async () => {
    const s = await getSettings(database);
    await database.settings.put({
      ...s, ...draft.progression, shiftMode: draft.shiftMode, setupSeen: true,
      ...(draft.heightCm !== null ? { heightCm: draft.heightCm } : {}),
      ...(draft.name !== null ? { name: draft.name } : {}),
      // Geburtsdatum geht vor; ein reines Alter ersetzt ein altes Datum
      ...(draft.birthDate !== null ? { birthDate: draft.birthDate, birthYear: Number(draft.birthDate.slice(0, 4)) }
        : draft.age !== null ? { birthYear: birthYearFromAge(draft.age), birthDate: null } : {}),
    });
    if (draft.weightKg !== null) await database.bodyweight.add({ weight: draft.weightKg, recordedAt: new Date().toISOString() });

    const routines = await database.routines.toArray();
    const runPlans = await database.runPlans.toArray();
    const missing = missingNames(draft.week, routines, runPlans);
    for (const [i, name] of missing.routines.entries()) await database.routines.add({ name, order: routines.length + i });

    const existingRun = new Map(runPlans.map((p) => [nameKey(p.name), p]));
    for (const name of runPlanNames(draft.week)) {
      const existing = existingRun.get(nameKey(name));
      let form = draft.runTargets[nameKey(name)] ?? defaultRunForm(name, existing);
      if (Object.keys(validateRunPlan({ ...form, name })).length) form = defaultRunForm(name, existing);
      const { targetKind, targetValue, paceMin, paceMax } = runPlanFromForm({ ...form, name });
      if (existing) await database.runPlans.update(existing.id!, { targetKind, targetValue, paceMin, paceMax });
      else await database.runPlans.add({ name, targetKind, targetValue, paceMin, paceMax, order: runPlans.length + missing.runPlans.indexOf(name) });
    }

    const routineIds = new Map((await database.routines.toArray()).map((r) => [nameKey(r.name), r.id!] as [string, number]));
    const runPlanIds = new Map((await database.runPlans.toArray()).map((r) => [nameKey(r.name), r.id!] as [string, number]));
    const weekTemplate = toTemplate(draft.week, routineIds, runPlanIds);
    // Unveränderte Woche: Plan-Tage (auch manuell verschobene) nicht neu aufbauen
    if (JSON.stringify(weekTemplate) !== JSON.stringify(s.weekTemplate) || draft.shiftMode !== s.shiftMode) {
      await saveWeekSetup({ weekTemplate, shiftMode: draft.shiftMode }, today, database);
    }
  });
}

/** Noch nichts eingetragen und keine Woche: dann startet der Assistent von selbst. */
export async function isAppEmpty(database: AppDB = db): Promise<boolean> {
  const counts = await Promise.all([
    database.sessions.count(), database.runs.count(), database.routines.count(),
    database.runPlans.count(), database.bodyweight.count(), database.planDays.count(), database.drafts.count(),
  ]);
  if (counts.some((c) => c > 0)) return false;
  return !(await getSettings(database)).weekTemplate.some((d) => d.length > 0);
}

async function patchSettings(patch: Partial<Settings>, database: AppDB) {
  await database.transaction("rw", database.settings, async () => {
    await database.settings.put({ ...(await getSettings(database)), ...patch });
  });
}
export const markSetupSeen = (database: AppDB = db) => patchSettings({ setupSeen: true }, database);
export const hideWeekCard = (database: AppDB = db) => patchSettings({ weekCardHidden: true }, database);
