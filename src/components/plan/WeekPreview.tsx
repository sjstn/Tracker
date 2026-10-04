import type { PlanDay } from "../../db/types";
import { addDays, weekdayIndex } from "../../lib/days";
import { Marker } from "./Marker";
import { itemName, WEEKDAYS, type PlanNames } from "./names";

const sig = (d: PlanDay | undefined) => JSON.stringify(d?.items.map((i) => [i.id, i.status]) ?? []);

/** 7 Tage ab `from` nach der Änderung; geänderte Tage sind hervorgehoben. */
export function WeekPreview({ before, after, from, names }: { before: PlanDay[]; after: PlanDay[]; from: string; names: PlanNames }) {
  const dates = [...Array(7)].map((_, k) => addDays(from, k));
  const b = new Map(before.map((d) => [d.date, d]));
  const a = new Map(after.map((d) => [d.date, d]));
  return (
    <div className="grid grid-cols-7 gap-0.5 text-center text-[11px]">
      {dates.map((date) => {
        const day = a.get(date);
        const changed = sig(day) !== sig(b.get(date));
        const items = day?.items ?? [];
        return (
          <div key={date} className={`rounded-md px-0.5 py-1 ${changed ? "bg-tint ring-1 ring-plate/30" : "bg-surface-2"}`}>
            <div className="font-medium text-soft">{WEEKDAYS[weekdayIndex(date)]}</div>
            <div className="mt-1 flex min-h-2 flex-wrap justify-center gap-0.5">{items.map((i) => <Marker key={i.id} kind={i.ref.kind} status={i.status} />)}</div>
            <div className="mt-0.5 truncate font-medium">{items.length ? items.map((i) => itemName(names, i)).join(" + ") : "Pause"}</div>
          </div>
        );
      })}
    </div>
  );
}
