import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db/db";
import type { Routine } from "../../db/types";
import { nameKey, type DraftRef } from "../../lib/presets";
import { navigate, rewriteCurrent } from "../../lib/router";
import { useToday } from "../../lib/useToday";
import { Card } from "../ui";
import { Marker } from "../plan/Marker";
import { itemName, usePlanNames } from "../plan/names";

export function StepDone({ week, name }: { week: DraftRef[][]; name: string | null }) {
  const today = useToday();
  const names = usePlanNames();
  const data = useLiveQuery(async () => {
    const day = await db.planDays.get(today);
    const inWeek = new Set(week.flat().filter((r) => r.kind === "routine").map((r) => nameKey(r.name)));
    const empty: Routine[] = [];
    for (const r of await db.routines.orderBy("order").toArray()) {
      if (inWeek.has(nameKey(r.name)) && !(await db.routineExercises.where("routineId").equals(r.id!).count())) empty.push(r);
    }
    return { day, empty };
  }, [today, week]);
  if (!data || !names) return null;

  const todays = data.day?.items.filter((i) => i.status === "planned") ?? [];
  const hasWeek = week.some((d) => d.length > 0);
  return (
    <div className="pt-6 text-center">
      <div aria-hidden className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-tint text-2xl text-ok ring-1 ring-ok/30">✓</div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Alles eingerichtet{name ? `, ${name}` : ""}</h1>
      <p className="mt-1 text-sm text-soft">
        {!hasWeek ? "Deine Woche kannst du später unter „Pläne“ anlegen."
          : todays.length ? <>Heute ist <b className="text-ink">{todays.map((i) => itemName(names, i)).join(" + ")}</b> dran.</>
          : "Heute ist Ruhetag."}
      </p>
      {data.empty.length > 0 && (
        <div className="mt-6 text-left">
          <p className="mb-1.5 text-sm font-medium text-soft">Noch ohne Übungen – jetzt zusammenstellen?</p>
          <Card>
            <ul className="divide-y divide-line">
              {data.empty.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => { rewriteCurrent("setup?step=done"); navigate(`routine/${r.id}`); }} className="flex min-h-12 w-full items-center gap-2 px-4 text-left text-sm">
                    <Marker kind="routine" /><span className="flex-1 font-medium">{r.name}</span>
                    <span className="text-xs font-semibold text-plate-ink">Übungen ›</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
