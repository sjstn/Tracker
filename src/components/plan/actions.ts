import { changePlan, undoPlanChange } from "../../db/schedule";
import type { PlanDay } from "../../db/types";
import type { PlanCtx } from "../../lib/schedule";
import { toast } from "../ui";

/** Führt eine Planungsregel aus und bietet "Rückgängig" an. Schlägt sie fehl, bleibt der alte Stand. */
export async function planAction(fn: (days: PlanDay[], ctx: PlanCtx) => PlanDay[], msg: string): Promise<boolean> {
  try {
    await changePlan(fn);
    toast(msg, { label: "Rückgängig", run: () => { undoPlanChange().catch(() => toast("Konnte nicht rückgängig machen.")); } });
    return true;
  } catch {
    toast("Konnte nicht gespeichert werden.");
    return false;
  }
}
