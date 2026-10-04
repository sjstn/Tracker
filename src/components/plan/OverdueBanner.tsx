import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db, getSettings } from "../../db/db";
import { startWorkout } from "../../db/repo";
import type { PlanDay, PlanItem } from "../../db/types";
import { niceDate, parseDay } from "../../lib/format";
import { navigate } from "../../lib/router";
import { openItems, postponeOverdue, skipOverdue } from "../../lib/schedule";
import { Button, Card, toast } from "../ui";
import { planAction } from "./actions";
import { itemName, type PlanNames } from "./names";

const longDay = (iso: string) => parseDay(iso).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "numeric" });

export function OverdueBanner({ days, today, names }: { days: PlanDay[]; today: string; names: PlanNames }) {
  const total = days.reduce((t, d) => t + openItems(d).length, 0);
  const single = days.length === 1 ? days[0] : null;
  const settings = useLiveQuery(() => getSettings(), []);
  const [busy, setBusy] = useState(false);
  const recent = [...days].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  const run = async (fn: Parameters<typeof planAction>[0], msg: string) => {
    if (busy) return;
    setBusy(true);
    try { await planAction(fn, msg); } finally { setBusy(false); }
  };

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
        {!single && (
          <ul className="divide-y divide-line rounded-lg ring-1 ring-line">
            {recent.flatMap((d) => openItems(d).map((i) => (
              <li key={i.id} className="flex min-h-12 items-center gap-3 px-3 py-1.5 text-sm">
                <span className="w-20 shrink-0 text-xs text-soft">{niceDate(d.date)}</span>
                <span className="flex-1 font-medium">{itemName(names, i)}</span>
                <button type="button" className="min-h-10 px-2 text-sm font-semibold text-plate-ink" onClick={() => catchUp(i, d.date)}>nachtragen</button>
              </li>
            )))}
          </ul>
        )}
        {!single && days.length > recent.length && <p className="text-xs text-soft">+ {days.length - recent.length} ältere Tage</p>}
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={busy} onClick={() => run((d, c) => postponeOverdue(d, today, c), settings?.shiftMode === "fixedWeek" ? "Verschoben – was nicht mehr in die Woche passt, ist ausgelassen" : "Verschoben")}>{single ? "Verschieben" : "Alle verschieben"}</Button>
          <Button disabled={busy} onClick={() => run((d) => skipOverdue(d, today), "Als ausgelassen markiert")}>{single ? "Ausgelassen" : "Alle ausgelassen"}</Button>
        </div>
      </div>
    </Card>
  );
}
