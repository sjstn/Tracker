import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db } from "../../db/db";
import { startWorkout } from "../../db/repo";
import { planCtx } from "../../db/schedule";
import type { PlanDay, PlanItem } from "../../db/types";
import { addDays } from "../../lib/days";
import { niceDate } from "../../lib/format";
import { navigate } from "../../lib/router";
import { describeTarget } from "../../lib/runTarget";
import { HORIZON_DAYS, openItems, overdue, postponeFrom, pullForward, skipDay, swapDays } from "../../lib/schedule";
import { Button, Card, Empty, Section, Sheet } from "../ui";
import { planAction } from "./actions";
import { Marker } from "./Marker";
import { itemName, usePlanNames, type PlanNames } from "./names";
import { OverdueBanner } from "./OverdueBanner";
import { WeekPreview } from "./WeekPreview";

export function TodayPlan({ today }: { today: string }) {
  const names = usePlanNames();
  const days = useLiveQuery(() => db.planDays.where("date").between(addDays(today, -60), addDays(today, HORIZON_DAYS + 30), true, true).toArray(), [today]);
  const [sheet, setSheet] = useState<null | "pause" | "other">(null);
  if (!days || !names) return null;

  const todayDay = days.find((d) => d.date === today);
  const open = openItems(todayDay);
  const late = overdue(days, today);
  const next = days.filter((d) => d.date > today && openItems(d).length).slice(0, 2);

  return (
    <>
      {late.length > 0 && <OverdueBanner days={late} today={today} names={names} />}
      <Section title="Heute">
        {open.length
          ? <div className="grid gap-2">{open.map((i) => <TodayCard key={i.id} item={i} names={names} />)}</div>
          : <Empty>{emptyText(todayDay)}</Empty>}
        <div className={`mt-2 grid gap-2 ${open.length ? "grid-cols-3" : "grid-cols-2"}`}>
          {open.length > 0 && <Button className="px-2" onClick={() => setSheet("pause")}>Heute Pause</Button>}
          <Button className="px-2" onClick={() => setSheet("other")}>Was anderes</Button>
          <Button className="px-2" onClick={() => navigate("week")}>Woche ändern</Button>
        </div>
      </Section>

      {next.length > 0 && (
        <Section title="Als Nächstes" action={<button type="button" className="text-sm font-semibold text-plate-ink" onClick={() => navigate("week")}>Ganze Woche</button>}>
          <Card>
            <ul className="divide-y divide-line">
              {next.map((d) => (
                <li key={d.date} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="w-20 shrink-0 text-xs text-soft">{niceDate(d.date)}</span>
                  <span className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                    {openItems(d).map((i) => <span key={i.id} className="inline-flex items-center gap-1.5 font-medium"><Marker kind={i.ref.kind} status="planned" />{itemName(names, i)}</span>)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      )}

      <PauseSheet open={sheet === "pause"} onClose={() => setSheet(null)} today={today} days={days} names={names} />
      <OtherSheet open={sheet === "other"} onClose={() => setSheet(null)} today={today} days={days} names={names} />
    </>
  );
}

function emptyText(day?: PlanDay) {
  if (day?.items.some((i) => i.status === "done")) return "Alles erledigt für heute. Stark!";
  if (day?.items.length) return "Heute ausgelassen. Morgen geht's weiter.";
  return "Heute ist Ruhetag. Erhol dich gut.";
}

function TodayCard({ item, names }: { item: PlanItem; names: PlanNames }) {
  const name = itemName(names, item);
  if (item.ref.kind === "runPlan") {
    const plan = names.runPlan(item.ref.id);
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2"><Marker kind="runPlan" status="planned" /><span className="font-semibold">{name}</span></div>
        {plan && <p className="mt-1 text-sm text-soft">{describeTarget(plan)}</p>}
        <Button variant="plate" className="mt-3 w-full" onClick={() => navigate(`run?item=${item.id}`)}>Ergebnis eintragen</Button>
      </Card>
    );
  }
  const routineId = item.ref.id;
  const start = async () => {
    if (await db.drafts.get("current")) { navigate("workout"); return; }
    await startWorkout(routineId, db, { planItemId: item.id });
    navigate("workout");
  };
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2"><Marker kind="routine" status="planned" /><span className="font-semibold">{name}</span></div>
      <Button variant="plate" className="mt-3 w-full" onClick={start}>Training starten</Button>
    </Card>
  );
}

type SheetProps = { open: boolean; onClose: () => void; today: string; days: PlanDay[]; names: PlanNames };

function PauseSheet({ open, onClose, today, days, names }: SheetProps) {
  const [how, setHow] = useState<"shift" | "skip">("shift");
  const ctx = useLiveQuery(() => planCtx(), []);
  const names0 = openItems(days.find((d) => d.date === today)).map((i) => itemName(names, i)).join(" + ");
  const preview = ctx ? (how === "shift" ? postponeFrom(days, today, today, ctx) : skipDay(days, today)) : days;
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (await planAction((d, c) => (how === "shift" ? postponeFrom(d, today, today, c) : skipDay(d, today)), how === "shift" ? "Trainings verschoben" : "Training ausgelassen")) onClose();
    } finally { setBusy(false); }
  };
  const choice = (k: "shift" | "skip", title: string, text: string) => (
    <button type="button" role="radio" aria-checked={how === k} onClick={() => setHow(k)}
      className={`block w-full rounded-lg p-3 text-left ${how === k ? "bg-tint ring-2 ring-plate" : "ring-1 ring-line"}`}>
      <span className="block text-sm font-semibold">{title}</span>
      <span className="mt-0.5 block text-xs text-soft">{text}</span>
    </button>
  );
  return (
    <Sheet open={open} onClose={onClose} title="Heute Pause">
      <p className="mb-3 text-sm text-soft">Was soll mit {names0 || "dem heutigen Training"} passieren?</p>
      <div className="grid gap-2" role="radiogroup" aria-label="Pause">
        {choice("shift", "Verschieben", ctx?.mode === "fixedWeek" ? "Rückt bis zum nächsten Ruhetag dieser Woche nach." : "Alles rutscht einen Tag nach hinten.")}
        {choice("skip", "Ausfallen lassen", "Fällt aus, der Rest bleibt, wo er ist.")}
      </div>
      <p className="mt-4 mb-1.5 text-xs font-medium text-soft">So sieht die Woche danach aus</p>
      <WeekPreview before={days} after={preview} from={today} names={names} />
      <Button variant="plate" className="mt-4 w-full" disabled={busy} onClick={confirm}>Pause eintragen</Button>
    </Sheet>
  );
}

function OtherSheet({ open, onClose, today, days, names }: SheetProps) {
  const [target, setTarget] = useState<string | null>(null);
  const [shift, setShift] = useState(false);
  const options = days.filter((d) => d.date > today && openItems(d).length).slice(0, 10);
  const close = () => { setTarget(null); setShift(false); onClose(); };
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    if (!target || busy) return;
    setBusy(true);
    try {
      if (await planAction((d) => (shift ? pullForward(d, today, target) : swapDays(d, today, target)), shift ? "Vorgezogen, der Rest rückt nach" : "Getauscht")) close();
    } finally { setBusy(false); }
  };
  const free = async () => {
    if (!(await db.drafts.get("current"))) await startWorkout(null, db, { planItemId: null });
    close();
    navigate("workout");
  };
  return (
    <Sheet open={open} onClose={close} title="Heute was anderes machen">
      <p className="mb-3 text-sm text-soft">Das gewählte Training kommt auf heute.</p>
      {options.length ? (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface shadow-sm" role="radiogroup" aria-label="Training für heute">
          {options.map((d) => (
            <li key={d.date}>
              <button type="button" role="radio" aria-checked={target === d.date} onClick={() => setTarget(d.date)}
                className={`flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left text-sm ${target === d.date ? "bg-tint" : ""}`}>
                <span className="w-20 shrink-0 text-xs text-soft">{niceDate(d.date)}</span>
                <span className="flex flex-1 flex-wrap gap-x-3">{openItems(d).map((i) => <span key={i.id} className="inline-flex items-center gap-1.5 font-medium"><Marker kind={i.ref.kind} status="planned" />{itemName(names, i)}</span>)}</span>
                {target === d.date && <span aria-hidden className="text-plate-ink">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : <Empty>In den nächsten Tagen ist nichts geplant.</Empty>}
      <label className="mt-3 flex min-h-11 items-center justify-between gap-3 text-sm">
        <span>Statt tauschen: alles dazwischen rückt einen Tag nach</span>
        <input type="checkbox" checked={shift} onChange={(e) => setShift(e.target.checked)} className="h-5 w-5 accent-[var(--plate)]" />
      </label>
      <Button variant="plate" className="mt-2 w-full" disabled={!target || busy} onClick={confirm}>Heute machen</Button>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button onClick={free}>Freies Training</Button>
        <Button onClick={() => { close(); navigate("run"); }}>Lauf ohne Plan</Button>
      </div>
    </Sheet>
  );
}
