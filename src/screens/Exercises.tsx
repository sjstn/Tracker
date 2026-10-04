import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { db, MUSCLE_GROUPS } from "../db/db";
import { exerciseInUse } from "../db/repo";
import { Button, Empty, Header, Input, Section, Select, toast } from "../components/ui";
import { LineChart } from "../components/LineChart";
import { fmt, niceDate } from "../lib/format";
import { estimatedOneRepMax } from "../lib/progression";
import { navigate } from "../lib/router";
import { BufferedText } from "./Routines";

export function Exercises() {
  const exercises = useLiveQuery(() => db.exercises.toArray(), []);
  const trained = useLiveQuery(async () => new Set((await db.loggedExercises.toArray()).map((l) => l.exerciseId)), []);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [newGroup, setNewGroup] = useState<string>(MUSCLE_GROUPS[0]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (exercises ?? [])
      .filter((e) => (!t || e.name.toLowerCase().includes(t)) && (!group || e.muscleGroup === group))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  }, [exercises, q, group]);
  if (!exercises) return null;

  const exact = exercises.some((e) => e.name.toLowerCase() === q.trim().toLowerCase());
  const create = async () => {
    const id = await db.exercises.add({ name: q.trim(), muscleGroup: newGroup, custom: true });
    setQ("");
    toast("Übung angelegt");
    navigate(`exercise/${id}`);
  };

  return (
    <div>
      <Header title="Übungen" />
      <div className="grid grid-cols-[1fr_8.5rem] gap-2">
        <Input type="search" placeholder="Suchen oder neu anlegen" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Übungen durchsuchen" />
        <Select aria-label="Nach Muskelgruppe filtern" value={group} onChange={setGroup} options={[["", "Alle"], ...MUSCLE_GROUPS.map((g) => [g, g] as [string, string])]} />
      </div>
      {q.trim() && !exact && (
        <div className="mt-3 rounded-xl bg-surface p-3">
          <p className="mb-2 text-sm text-soft">„{q.trim()}“ als eigene Übung anlegen</p>
          <div className="flex gap-2">
            <div className="flex-1"><Select aria-label="Muskelgruppe" value={newGroup} onChange={setNewGroup} options={MUSCLE_GROUPS.map((g) => [g, g])} /></div>
            <Button variant="plate" onClick={create}>Anlegen</Button>
          </div>
        </div>
      )}
      <ul className="mt-3">
        {list.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => navigate(`exercise/${e.id}`)} className="flex min-h-13 w-full items-center gap-3 border-b border-line py-2 text-left">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${trained?.has(e.id!) ? "bg-plate" : "border border-line"}`} aria-hidden />
              <span className="flex-1">{e.name}</span>
              <span className="text-sm text-soft">{e.custom ? "eigene · " : ""}{e.muscleGroup}</span>
            </button>
          </li>
        ))}
      </ul>
      {!list.length && !q && <Empty>Keine Übungen in dieser Gruppe.</Empty>}
    </div>
  );
}

export function ExerciseDetail({ id }: { id: number }) {
  const exercise = useLiveQuery(() => db.exercises.get(id), [id]);
  const sessions = useLiveQuery(async () => {
    const sets = (await db.loggedSets.where("exerciseId").equals(id).toArray()).filter((s) => !s.isWarmup);
    const by = new Map<number, typeof sets>();
    sets.forEach((s) => by.set(s.workoutSessionId, [...(by.get(s.workoutSessionId) ?? []), s]));
    return [...by.entries()].map(([sid, ss]) => {
      ss.sort((a, b) => a.slotNumber - b.slotNumber);
      const top = Math.max(...ss.map((s) => s.weight));
      const e1rm = Math.max(...ss.map((s) => estimatedOneRepMax(s.weight, s.reps)));
      return { sid, date: ss[0].performedAt, sets: ss, top, e1rm, volume: ss.reduce((t, s) => t + s.weight * s.reps, 0) };
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [id]);
  const [metric, setMetric] = useState<"top" | "e1rm">("top");

  if (exercise === undefined || !sessions) return null;
  if (!exercise) return <div><Header title="Übung" onBack /><Empty>Diese Übung gibt es nicht mehr.</Empty></div>;

  const best = sessions.reduce((b, s) => Math.max(b, s.top), 0);
  const bestE1rm = sessions.reduce((b, s) => Math.max(b, s.e1rm), 0);
  const points = [...sessions].reverse().map((s) => ({ date: s.date, value: Math.round((metric === "top" ? s.top : s.e1rm) * 10) / 10 }));

  const remove = async () => {
    if (await exerciseInUse(id)) { toast("Die Übung steckt in einem Plan oder Training und bleibt deshalb erhalten."); return; }
    if (!confirm(`„${exercise.name}“ löschen?`)) return;
    await db.exercises.delete(id);
    navigate("exercises", true);
  };

  return (
    <div>
      <Header title={exercise.name} onBack />
      <p className="text-soft">{exercise.muscleGroup}{exercise.custom ? ", eigene Übung" : ""}</p>

      {sessions.length ? (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div><b className="block font-display text-3xl font-bold leading-none text-pr tnum">{fmt(best, 2)}</b><span className="text-sm text-soft">kg Bestwert</span></div>
            <div><b className="block font-display text-3xl font-bold leading-none tnum">{fmt(bestE1rm, 1)}</b><span className="text-sm text-soft">kg geschätztes 1RM</span></div>
            <div><b className="block font-display text-3xl font-bold leading-none tnum">{sessions.length}</b><span className="text-sm text-soft">Trainings</span></div>
          </div>
          <Section title="Verlauf" action={
            <div className="flex gap-1 text-sm" role="group" aria-label="Kennzahl">
              {(["top", "e1rm"] as const).map((m) => (
                <button key={m} type="button" aria-pressed={metric === m} onClick={() => setMetric(m)}
                  className={`rounded-md px-2 py-1 ${metric === m ? "bg-surface-2 font-semibold" : "text-soft"}`}>{m === "top" ? "Schwerster Satz" : "1RM"}</button>
              ))}
            </div>}>
            <LineChart points={points} unit="kg" />
          </Section>
          <Section title="Alle Trainings">
            <ul>
              {sessions.map((s) => (
                <li key={s.sid}>
                  <button type="button" onClick={() => navigate(`session/${s.sid}`)} className="w-full border-b border-line py-2.5 text-left">
                    <span className="block text-sm text-soft">{niceDate(s.date)}</span>
                    <span className="tnum">{s.sets.map((x) => `${fmt(x.weight, 2)}×${x.reps}`).join("  ")}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        </>
      ) : (
        <div className="mt-4"><Empty>Noch nicht trainiert. Nach dem ersten Training siehst du hier Bestwert und Verlauf.</Empty></div>
      )}

      {exercise.custom && (
        <Section title="Bearbeiten">
          <div className="grid gap-3">
            <BufferedText label="Name" value={exercise.name} onCommit={(v) => v.trim() && db.exercises.update(id, { name: v.trim() })} />
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-soft">Muskelgruppe</span>
              <Select value={exercise.muscleGroup} onChange={(v) => db.exercises.update(id, { muscleGroup: v })} options={MUSCLE_GROUPS.map((g) => [g, g])} />
            </label>
            <Button variant="danger" onClick={remove}>Übung löschen</Button>
          </div>
        </Section>
      )}
    </div>
  );
}
