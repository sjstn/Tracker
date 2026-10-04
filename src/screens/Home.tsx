import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import { startWorkout } from "../db/repo";
import { Button, Empty, Section } from "../components/ui";
import { fmt, isoDate, localDay, weekDays } from "../lib/format";
import { navigate } from "../lib/router";
import { HistoryList } from "./History";

const DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export function Home() {
  const days = weekDays();
  const from = isoDate(days[0]);
  const data = useLiveQuery(async () => {
    const [sessions, runs, routines, draft, sets] = await Promise.all([
      db.sessions.toArray(),
      db.runs.where("date").aboveOrEqual(from).toArray(),
      db.routines.orderBy("order").toArray(),
      db.drafts.get("current"),
      db.loggedSets.where("performedAt").aboveOrEqual(new Date(days[0]).toISOString()).toArray(),
    ]);
    const weekSessions = sessions.filter((s) => localDay(s.performedAt) >= from);
    const volume = sets.filter((s) => !s.isWarmup).reduce((t, s) => t + s.weight * s.reps, 0);
    return { weekSessions, runs, routines, draft, volume };
  }, [from]);

  if (!data) return null;
  const { weekSessions, runs, routines, draft, volume } = data;
  const today = isoDate();
  const km = runs.reduce((t, r) => t + r.km, 0);

  const begin = async (routineId: number | null) => {
    if (draft) { navigate("workout"); return; }
    await startWorkout(routineId);
    navigate("workout");
  };

  return (
    <div>
      <h1 className="mt-4 font-display text-4xl font-bold">Diese Woche</h1>

      <div className="mt-3 grid grid-cols-7 border-y-2 border-ink" role="group" aria-label="Wochenübersicht">
        {days.map((d, i) => {
          const iso = isoDate(d);
          const gym = weekSessions.filter((s) => localDay(s.performedAt) === iso).length;
          const run = runs.filter((r) => r.date === iso).length;
          const isToday = iso === today;
          return (
            <div key={iso} aria-label={`${DAYS[i]} ${d.getDate()}.: ${gym} Kraft, ${run} Lauf`}
              className={`flex min-h-28 flex-col items-center gap-1 border-l border-line py-2 first:border-l-0 ${isToday ? "bg-surface" : ""}`}>
              <span className={`font-display text-sm font-semibold ${isToday ? "text-ink" : "text-soft"}`}>{DAYS[i]}</span>
              <span className={`font-display text-2xl font-semibold leading-none ${isToday ? "" : "text-soft"}`}>{d.getDate()}</span>
              <span className="mt-1 flex flex-col items-center gap-1">
                {[...Array(gym)].map((_, k) => <span key={"g" + k} className="h-[18px] w-[18px] rounded-full border-[5px] border-plate bg-surface" />)}
                {[...Array(run)].map((_, k) => <span key={"r" + k} className="h-[7px] w-[22px] rounded bg-track" />)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat value={String(weekSessions.length + runs.length)} label="Einheiten" />
        <Stat value={`${fmt(volume / 1000, 1)} t`} label="bewegt" className="text-plate-ink" />
        <Stat value={`${fmt(km, 1)} km`} label="gelaufen" className="text-track-ink" />
      </div>

      {draft ? (
        <button type="button" onClick={() => navigate("workout")}
          className="mt-5 flex w-full items-center justify-between rounded-xl bg-plate px-4 py-4 text-left text-white">
          <span>
            <span className="block font-display text-xl font-bold">Training läuft</span>
            <span className="text-sm opacity-85">{draft.routineName ?? "Freies Training"}, seit {new Date(draft.startedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr</span>
          </span>
          <span className="font-semibold">Weiter</span>
        </button>
      ) : (
        <Section title="Training starten">
          <div className="grid gap-2">
            {routines.map((r) => (
              <Button key={r.id} variant="plate" className="justify-start text-lg" onClick={() => begin(r.id!)}>{r.name}</Button>
            ))}
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => begin(null)}>Freies Training</Button>
              <Button variant="track" onClick={() => navigate("run")}>Lauf eintragen</Button>
            </div>
            {!routines.length && <p className="text-sm text-soft">Leg unter „Pläne“ dein erstes Trainingsprogramm an, dann startest du es hier mit einem Tipp und bekommst Gewichtsvorschläge.</p>}
          </div>
        </Section>
      )}

      <Section title="Zuletzt" action={<button type="button" className="text-sm font-semibold text-plate-ink" onClick={() => navigate("history")}>Alle</button>}>
        <HistoryList limit={4} empty={<Empty>Noch nichts eingetragen. Nach dem ersten Training füllt sich die Woche.</Empty>} />
      </Section>
    </div>
  );
}

function Stat({ value, label, className = "" }: { value: string; label: string; className?: string }) {
  return (
    <div>
      <b className={`block font-display text-3xl font-bold leading-none tnum ${className}`}>{value}</b>
      <span className="text-sm text-soft">{label}</span>
    </div>
  );
}
