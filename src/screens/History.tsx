import { useLiveQuery } from "dexie-react-hooks";
import type { ReactNode } from "react";
import { db } from "../db/db";
import { deleteSession } from "../db/repo";
import { Button, Card, Empty, Header, toast } from "../components/ui";
import { clock, fmt, localDay, monthLabel, niceDate, pace } from "../lib/format";
import { navigate } from "../lib/router";

type Item =
  | { kind: "gym"; id: number; day: string; ts: string; title: string; meta: string; detail: string; pr: boolean }
  | { kind: "run"; id: number; day: string; ts: string; title: string; meta: string; detail: string };

/** Alle Kraft-Einheiten und Läufe, neueste zuerst. */
async function loadItems(limit?: number): Promise<Item[]> {
  const [sessions, runs, sets, exercises] = await Promise.all([
    db.sessions.toArray(), db.runs.toArray(), db.loggedSets.toArray(), db.exercises.toArray(),
  ]);
  const names = new Map(exercises.map((e) => [e.id!, e.name]));

  // Bestwert-Markierung: Session, in der das bisher schwerste Arbeitsgewicht einer Übung erstmals gehoben wurde
  const prSessions = new Set<number>();
  const best = new Map<number, { w: number; s: number; t: string }>();
  for (const s of sets) {
    if (s.isWarmup) continue;
    const b = best.get(s.exerciseId);
    if (!b || s.weight > b.w || (s.weight === b.w && s.performedAt < b.t)) best.set(s.exerciseId, { w: s.weight, s: s.workoutSessionId, t: s.performedAt });
  }
  best.forEach((b) => prSessions.add(b.s));

  const items: Item[] = [
    ...sessions.map((s): Item => {
      const ss = sets.filter((x) => x.workoutSessionId === s.id);
      const work = ss.filter((x) => !x.isWarmup);
      const exIds = [...new Set(ss.map((x) => x.exerciseId))];
      return {
        kind: "gym", id: s.id!, day: localDay(s.performedAt), ts: s.performedAt, title: s.routineName ?? "Freies Training",
        meta: `${niceDate(s.performedAt)}, ${work.length} ${work.length === 1 ? "Satz" : "Sätze"}, ${fmt(work.reduce((t, x) => t + x.weight * x.reps, 0), 0)} kg${s.durationSeconds ? `, ${Math.round(s.durationSeconds / 60)} min` : ""}`,
        detail: exIds.map((id) => names.get(id) ?? "Übung").join(", "), pr: prSessions.has(s.id!),
      };
    }),
    ...runs.map((r): Item => ({
      kind: "run", id: r.id!, day: r.date, ts: r.date + "T12:00:00", title: `Lauf, ${fmt(r.km, 2)} km`,
      meta: `${niceDate(r.date)}, ${clock(r.seconds)}, ${pace(r.seconds, r.km)} min/km`, detail: r.note ?? "",
    })),
  ].sort((a, b) => b.day.localeCompare(a.day) || b.ts.localeCompare(a.ts));
  return limit ? items.slice(0, limit) : items;
}

function Row({ item }: { item: Item }) {
  return (
    <li>
      <button type="button" onClick={() => navigate(item.kind === "gym" ? `session/${item.id}` : `run/${item.id}`)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/60">
        <span aria-hidden className={`h-2 shrink-0 rounded-full ${item.kind === "gym" ? "w-2 bg-plate" : "w-4 bg-track"}`} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{item.title}</span>
          <span className="block text-xs text-soft tnum">{item.meta}</span>
          {item.detail && <span className="mt-0.5 block truncate text-xs text-soft">{item.detail}</span>}
        </span>
        {item.kind === "gym" && item.pr && <span className="shrink-0 rounded-md bg-tint px-2 py-0.5 text-xs font-medium text-plate-ink ring-1 ring-inset ring-plate/30">Bestwert</span>}
        <span aria-hidden className="text-soft">›</span>
      </button>
    </li>
  );
}

export function HistoryList({ limit, empty }: { limit?: number; empty: ReactNode }) {
  const items = useLiveQuery(() => loadItems(limit), [limit]);
  if (!items) return null;
  if (!items.length) return <>{empty}</>;
  return <Card><ul className="divide-y divide-line">{items.map((i) => <Row key={i.kind + i.id} item={i} />)}</ul></Card>;
}

export function History() {
  const items = useLiveQuery(() => loadItems(), []);
  if (!items) return null;
  const months: [string, Item[]][] = [];
  for (const i of items) {
    const m = monthLabel(i.day);
    if (months[months.length - 1]?.[0] !== m) months.push([m, []]);
    months[months.length - 1][1].push(i);
  }
  return (
    <div>
      <Header title="Verlauf" />
      {!items.length && <Empty>Hier erscheinen alle Trainings und Läufe, sobald du welche einträgst.</Empty>}
      {months.map(([m, list]) => (
        <section key={m}>
          <h2 className="mt-5 mb-2 text-sm font-medium text-soft">{m}</h2>
          <Card><ul className="divide-y divide-line">{list.map((i) => <Row key={i.kind + i.id} item={i} />)}</ul></Card>
        </section>
      ))}
    </div>
  );
}

export function SessionDetail({ id }: { id: number }) {
  const data = useLiveQuery(async () => {
    const session = await db.sessions.get(id);
    if (!session) return { session: null };
    const les = (await db.loggedExercises.where("workoutSessionId").equals(id).toArray()).sort((a, b) => a.order - b.order);
    const sets = await db.loggedSets.where("workoutSessionId").equals(id).toArray();
    const ex = new Map((await db.exercises.bulkGet(les.map((l) => l.exerciseId))).map((e) => [e?.id, e]));
    return { session, groups: les.map((l) => ({ l, ex: ex.get(l.exerciseId), sets: sets.filter((s) => s.loggedExerciseId === l.id).sort((a, b) => a.slotNumber - b.slotNumber) })) };
  }, [id]);
  if (!data) return null;
  if (!data.session) return <div><Header title="Training" onBack /><Empty>Dieses Training gibt es nicht mehr.</Empty></div>;
  const { session, groups } = data;

  const remove = async () => {
    if (!confirm("Dieses Training endgültig löschen? Die Gewichtsvorschläge richten sich dann wieder nach dem vorherigen Training.")) return;
    await deleteSession(id);
    toast("Training gelöscht");
    navigate("history", true);
  };

  return (
    <div>
      <Header title={session.routineName ?? "Freies Training"} onBack />
      <p className="text-sm text-soft">
        {new Date(session.performedAt).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}
        {", "}{new Date(session.performedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr
        {session.durationSeconds ? `, ${Math.round(session.durationSeconds / 60)} min` : ""}
      </p>
      {groups!.map(({ l, ex, sets }) => (
        <Card key={l.id} className="mt-4 p-4">
          <button type="button" className="font-semibold" onClick={() => ex && navigate(`exercise/${ex.id}`)}>{ex?.name ?? "Gelöschte Übung"}</button>
          <ol className="mt-2 grid gap-1">
            {sets.map((s) => (
              <li key={s.id} className="flex gap-3 tnum">
                <span className="w-6 text-center text-sm font-medium text-soft">{s.isWarmup ? "A" : s.slotNumber}</span>
                <span className={s.isWarmup ? "text-soft" : ""}>{fmt(s.weight, 2)} kg × {s.reps}</span>
              </li>
            ))}
          </ol>
        </Card>
      ))}
      {session.notes && <p className="mt-4 whitespace-pre-wrap">{session.notes}</p>}
      <div className="mt-8"><Button variant="danger" className="w-full" onClick={remove}>Training löschen</Button></div>
    </div>
  );
}
