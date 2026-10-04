import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db/db";
import type { PlanItem, Routine, RunPlan, TrainingRef } from "../../db/types";
import { refKey } from "../../lib/schedule";

export const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
export const WEEKDAYS_LONG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

export interface PlanNames {
  routines: Routine[];
  runPlans: RunPlan[];
  name: (ref: TrainingRef, fallback?: string) => string;
  runPlan: (id: number) => RunPlan | undefined;
}

/** Aktuelle Namen von Kraftplänen und Laufarten; gelöschte fallen auf den gespeicherten Namen zurück. */
export function usePlanNames(): PlanNames | undefined {
  return useLiveQuery(async () => {
    const [routines, runPlans] = await Promise.all([db.routines.orderBy("order").toArray(), db.runPlans.orderBy("order").toArray()]);
    const names = new Map<string, string>([
      ...routines.map((r) => [refKey({ kind: "routine", id: r.id! }), r.name] as [string, string]),
      ...runPlans.map((r) => [refKey({ kind: "runPlan", id: r.id! }), r.name] as [string, string]),
    ]);
    const plans = new Map(runPlans.map((r) => [r.id!, r]));
    return {
      routines, runPlans,
      name: (ref: TrainingRef, fallback = "Gelöschtes Training") => names.get(refKey(ref)) ?? fallback,
      runPlan: (id: number) => plans.get(id),
    };
  }, []);
}

export const itemName = (n: PlanNames, i: PlanItem) => n.name(i.ref, i.label);
