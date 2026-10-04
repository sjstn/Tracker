import { useLiveQuery } from "dexie-react-hooks";
import { useEffect } from "react";
import { db, getSettings, requestPersistence } from "./db/db";
import { applyAppearance } from "./lib/appearance";
import { Toaster, toast } from "./components/ui";
import { ensureHorizon } from "./db/schedule";
import { useToday } from "./lib/useToday";
import { navigate, useRoute } from "./lib/router";
import { Home } from "./screens/Home";
import { History, SessionDetail } from "./screens/History";
import { Routines, RoutineEdit } from "./screens/Routines";
import { Exercises, ExerciseDetail } from "./screens/Exercises";
import { Workout } from "./screens/Workout";
import { RunForm } from "./screens/RunForm";
import { RunPlanEdit } from "./screens/RunPlanEdit";
import { Profile } from "./screens/Profile";
import { Week } from "./screens/Week";

const TABS = [
  ["home", "Start"], ["routines", "Pläne"], ["exercises", "Übungen"], ["history", "Verlauf"], ["profile", "Ich"],
] as const;
// Welcher Tab bei Unterseiten hervorgehoben wird
const PARENT: Record<string, string> = { routine: "routines", exercise: "exercises", session: "history", run: "home", runplan: "routines", week: "home" };

export function App() {
  const { name, params } = useRoute();
  const draft = useLiveQuery(() => db.drafts.get("current"), []);
  const id = params.id ? Number(params.id) : undefined;

  const settings = useLiveQuery(() => getSettings(), []);

  useEffect(() => { requestPersistence(); }, []);
  useEffect(() => { if (settings) applyAppearance(settings); }, [settings?.accent, settings?.theme]);
  const today = useToday();
  useEffect(() => { ensureHorizon(today).catch(() => toast("Wochenplan konnte nicht geladen werden.")); }, [today]);

  let screen;
  switch (name) {
    case "workout": screen = <Workout />; break;
    case "routines": screen = <Routines />; break;
    case "routine": screen = <RoutineEdit id={id!} key={id} />; break;
    case "runplan": screen = <RunPlanEdit id={id!} key={id} />; break;
    case "exercises": screen = <Exercises />; break;
    case "exercise": screen = <ExerciseDetail id={id!} key={id} />; break;
    case "history": screen = <History />; break;
    case "session": screen = <SessionDetail id={id!} key={id} />; break;
    case "run": screen = <RunForm id={id} itemId={params.item} key={id ?? params.item ?? "new"} />; break;
    case "profile": screen = <Profile />; break;
    case "week": screen = <Week />; break;
    default: screen = <Home />;
  }
  const active = PARENT[name] ?? name;
  const inWorkout = name === "workout";

  return (
    <>
      <main className="mx-auto max-w-xl px-4 pb-28">{screen}</main>
      {!inWorkout && (
        <nav aria-label="Hauptnavigation" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/90 backdrop-blur"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          {draft && (
            <button type="button" onClick={() => navigate("workout")}
              className="flex w-full items-center justify-between bg-plate px-4 py-2 text-sm font-semibold text-white">
              <span>Training läuft: {draft.routineName ?? "Freies Training"}</span><span>Weiter</span>
            </button>
          )}
          <div className="mx-auto grid max-w-xl grid-cols-5">
            {TABS.map(([r, label]) => (
              <button key={r} type="button" aria-current={active === r ? "page" : undefined} onClick={() => navigate(r)}
                className={`min-h-15 border-t-2 text-sm font-medium ${active === r ? "border-plate text-plate-ink font-semibold" : "border-transparent text-soft"}`}>
                {label}
              </button>
            ))}
          </div>
        </nav>
      )}
      <Toaster />
    </>
  );
}
