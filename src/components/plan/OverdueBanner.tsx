import { db } from "../../db/db";
import { startWorkout } from "../../db/repo";
import type { PlanDay, PlanItem } from "../../db/types";
import { parseDay } from "../../lib/format";
import { navigate } from "../../lib/router";
import { openItems, postponeOverdue, skipOverdue } from "../../lib/schedule";
import { Button, Card, toast } from "../ui";
import { planAction } from "./actions";
import { itemName, type PlanNames } from "./names";

const longDay = (iso: string) => parseDay(iso).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "numeric" });

export function OverdueBanner({ days, today, names }: { days: PlanDay[]; today: string; names: PlanNames }) {
  const total = days.reduce((t, d) => t + openItems(d).length, 0);
  const single = days.length === 1 ? days[0] : null;

  const catchUp = async (item: PlanItem, date: string) => {
    if (item.ref.kind === "runPlan") { navigate(`run?item=${item.id}`); return; }
    if (await db.drafts.get("current")) { toast("Es läuft schon ein Training."); navigate("workout"); return; }
    await startWorkout(item.ref.id, db, { planItemId: item.id, performedOn: date });
    navigate("workout");
  };

  return (
    <Card className="mt-5 border-plate/40 p-4">
      <p className="text-sm font-semibold">
        {single
          ? `${longDay(single.date)}: ${openItems(single).map((i) => itemName(names, i)).join(" + ")} nicht eingetragen`
          : `${total} Termine aus den letzten Tagen sind offen`}
      </p>
      <p className="mt-0.5 text-xs text-soft">Hast du trainiert, trag es nach. Sonst verschieben oder als ausgelassen markieren.</p>
      <div className="mt-3 grid gap-2">
        {single && openItems(single).map((i) => (
          <Button key={i.id} onClick={() => catchUp(i, single.date)}>{itemName(names, i)} nachtragen</Button>
        ))}
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => planAction((d, c) => postponeOverdue(d, today, c), "Verschoben")}>{single ? "Verschieben" : "Alle verschieben"}</Button>
          <Button onClick={() => planAction((d) => skipOverdue(d, today), "Als ausgelassen markiert")}>{single ? "Ausgelassen" : "Alle ausgelassen"}</Button>
        </div>
      </div>
    </Card>
  );
}
