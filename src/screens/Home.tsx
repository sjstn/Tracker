import { useLiveQuery } from "dexie-react-hooks";
import { db, getSettings } from "../db/db";
import { startWorkout } from "../db/repo";
import { Marker } from "../components/plan/Marker";
import { WeekSetupCard } from "../components/setup/WeekSetupCard";
import { TodayPlan } from "../components/plan/TodayPlan";
import { Button, Card, Empty, Section } from "../components/ui";
import { fmt, isoDate, localDay, parseDay, weekDays } from "../lib/format";
import { navigate } from "../lib/router";
import { useToday } from "../lib/useToday";
import { HistoryList } from "./History";

const DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export function Home() {
  const today = useToday();
  const days = weekDays(parseDay(today));
  const from = isoDate(days[0]);
  const to = isoDate(days[6]);
  const data = useLiveQuery(async () => {
    const [sessions, runs, routines, draft, sets, settings, planDays] = await Promise.all([
      db.sessions.toArray(),
      db.runs.where("date").aboveOrEqual(from).toArray(),
      db.routines.orderBy("order").toArray(),
      db.drafts.get("current"),
      db.loggedSets.where("performedAt").aboveOrEqual(new Date(days[0]).toISOString()).toArray(),
      getSettings(),
      db.planDays.where("date").between(from, to, true, true).toArray(),
    ]);
    const weekSessions = sessions.filter((s) => localDay(s.performedAt) >= from);
    const volume = sets.filter((s) => !s.isWarmup).reduce((t, s) => t + s.weight * s.reps, 0);
    return { weekSessions, runs, routines, draft, volume, settings, planDays };
  }, [from, to]);

  if (!data) return null;
  const { weekSessions, runs, routines, draft, volume, settings, planDays } = data;
  const planActive = settings.weekTemplate.some((d) => d.length > 0);
  const km = runs.reduce((t, r) => t + r.km, 0);

  const begin = async (routineId: number | null) => {
    if (draft) { navigate("workout"); return; }
    await startWorkout(routineId);
    navigate("workout");
  };

  return (
    <div>
      <p className="mt-6 text-sm text-soft">
        {settings.name && <><span className="font-medium text-ink">Hallo, {settings.name}</span> · </>}
        {parseDay(today).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">Diese Woche</h1>

      <Card className="mt-4 p-2">
      <div className="grid grid-cols-7 gap-1" role="group" aria-label="Wochenübersicht">
        {days.map((d, i) => {
          const iso = isoDate(d);
          const plan = planDays.find((p) => p.date === iso);
          const gym = weekSessions.filter((s) => localDay(s.performedAt) === iso && !s.planItemId).length;
          const run = runs.filter((r) => r.date === iso && !r.planItemId).length;
          const isToday = iso === today;
          return (
            <div key={iso} aria-label={`${DAYS[i]} ${d.getDate()}.: ${plan?.items.map((x) => `${x.label} ${x.status === "done" ? "erledigt" : x.status === "skipped" ? "ausgelassen" : "geplant"}`).join(", ") || "frei"}${gym + run ? `, ${gym + run} ohne Plan` : ""}`}
              className={`flex min-h-20 flex-col items-center gap-0.5 rounded-lg py-2 ${isToday ? "bg-tint ring-1 ring-plate/30" : ""}`}>
              <span className={`text-xs font-medium ${isToday ? "text-plate-ink" : "text-soft"}`}>{DAYS[i]}</span>
              <span className={`text-base font-semibold ${isToday ? "text-plate-ink" : ""}`}>{d.getDate()}</span>
              <span className="mt-1 flex flex-col items-center gap-1">
                {plan?.items.map((i) => <Marker key={i.id} kind={i.ref.kind} status={i.status} />)}
                {[...Array(gym)].map((_, k) => <Marker key={"g" + k} kind="routine" />)}
                {[...Array(run)].map((_, k) => <Marker key={"r" + k} kind="runPlan" />)}
              </span>
            </div>
          );
        })}
      </div>
      </Card>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat value={String(weekSessions.length + runs.length)} label="Einheiten" />
        <Stat value={`${fmt(volume / 1000, 1)} t`} label="bewegt" />
        <Stat value={`${fmt(km, 1)} km`} label="gelaufen" />
      </div>

      {draft ? (
        <button type="button" onClick={() => navigate("workout")}
          className="mt-5 flex w-full items-center justify-between rounded-xl bg-plate px-4 py-4 text-left text-white shadow-sm">
          <span>
            <span className="block text-base font-semibold">Training läuft</span>
            <span className="text-sm opacity-85">{draft.routineName ?? "Freies Training"}, seit {new Date(draft.startedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr</span>
          </span>
          <span className="font-semibold">Weiter</span>
        </button>
      ) : planActive ? (
        <TodayPlan today={today} />
      ) : (
        <>
          {!settings.weekCardHidden && <WeekSetupCard />}
          <Section title="Training starten">
            <div className="grid gap-2">
              {routines.map((r) => (
                <Button key={r.id} variant="plate" className="justify-between! text-base" onClick={() => begin(r.id!)}>{r.name}<span aria-hidden className="opacity-80">›</span></Button>
              ))}
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => begin(null)}>Freies Training</Button>
                <Button onClick={() => navigate("run")}>Lauf eintragen</Button>
              </div>
              {!routines.length && <p className="text-sm text-soft">Leg unter „Pläne“ dein erstes Trainingsprogramm an, dann startest du es hier mit einem Tipp und bekommst Gewichtsvorschläge.</p>}
            </div>
          </Section>
        </>
      )}

      <Section title="Zuletzt" action={<button type="button" className="text-sm font-semibold text-plate-ink" onClick={() => navigate("history")}>Alle</button>}>
        <HistoryList limit={4} empty={<Empty>Noch nichts eingetragen. Nach dem ersten Training füllt sich die Woche.</Empty>} />
      </Section>
    </div>
  );
}

function Stat({ value, label, className = "" }: { value: string; label: string; className?: string }) {
  return (
    <Card className="p-3">
      <span className="block text-xs font-medium text-soft">{label}</span>
      <b className={`mt-0.5 block text-lg font-semibold tracking-tight tnum ${className}`}>{value}</b>
    </Card>
  );
}
