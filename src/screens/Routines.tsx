import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { db, getSettings } from "../db/db";
import { deleteRoutine, startWorkout } from "../db/repo";
import { refInUse } from "../db/schedule";
import type { RoutineExercise, SetTemplate, Settings } from "../db/types";
import { ExercisePicker } from "../components/ExercisePicker";
import { WeekTemplateEditor } from "../components/plan/WeekTemplateEditor";
import { Marker } from "../components/plan/Marker";
import { Button, Card, Empty, Header, Input, NumberInput, Section, Select, toast } from "../components/ui";
import { describeTarget } from "../lib/runTarget";
import { fmtInput, num } from "../lib/format";
import { navigate } from "../lib/router";

export function Routines() {
  const routines = useLiveQuery(() => db.routines.orderBy("order").toArray(), []);
  const counts = useLiveQuery(async () => {
    const res = await db.routineExercises.toArray();
    const m = new Map<number, number>();
    res.forEach((r) => m.set(r.routineId, (m.get(r.routineId) ?? 0) + 1));
    return m;
  }, []);
  const runPlans = useLiveQuery(() => db.runPlans.orderBy("order").toArray(), []);
  const [name, setName] = useState("");
  const [runName, setRunName] = useState("");
  if (!routines || !runPlans) return null;

  const create = async () => {
    const n = name.trim();
    if (!n) { toast("Gib dem Plan einen Namen, z. B. Push oder Ganzkörper A."); return; }
    const id = await db.routines.add({ name: n, order: routines.length });
    setName("");
    navigate(`routine/${id}`);
  };
  const createRunPlan = async () => {
    const n = runName.trim();
    if (!n) { toast("Gib der Laufart einen Namen, z. B. Longrun."); return; }
    const id = await db.runPlans.add({ name: n, targetKind: "duration", targetValue: 45 * 60, paceMin: null, paceMax: null, order: runPlans.length });
    setRunName("");
    navigate(`runplan/${id}`);
  };
  const move = async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= routines.length) return;
    await db.transaction("rw", db.routines, async () => {
      await db.routines.update(routines[i].id!, { order: j });
      await db.routines.update(routines[j].id!, { order: i });
    });
  };

  return (
    <div>
      <Header title="Pläne" />
      <p className="mb-2 text-sm text-soft">Leg fest, an welchem Tag welches Training dran ist. Die App schlägt dir jeden Tag das passende vor und hilft beim Verschieben.</p>
      <WeekTemplateEditor />
      <Section title="Krafttraining">
        {!routines.length && <Empty>Noch kein Plan. Leg unten deinen ersten an.</Empty>}
        <ul className="grid gap-2">
          {routines.map((r, i) => (
            <li key={r.id} className="flex items-center gap-2 rounded-xl border border-line bg-surface p-2 pl-4 shadow-sm">
              <button type="button" className="flex-1 py-2 text-left" onClick={() => navigate(`routine/${r.id}`)}>
                <span className="block font-semibold">{r.name}</span>
                <span className="text-sm text-soft">{counts?.get(r.id!) ?? 0} Übungen</span>
              </button>
              <div className="flex flex-col">
                <button type="button" aria-label={`${r.name} nach oben`} disabled={i === 0} onClick={() => move(i, -1)} className="h-8 w-10 text-soft disabled:opacity-25">▲</button>
                <button type="button" aria-label={`${r.name} nach unten`} disabled={i === routines.length - 1} onClick={() => move(i, 1)} className="h-8 w-10 text-soft disabled:opacity-25">▼</button>
              </div>
              <Button variant="plate" className="px-3" onClick={async () => {
                if (await db.drafts.get("current")) { toast("Es läuft schon ein Training."); navigate("workout"); return; }
                await startWorkout(r.id!); navigate("workout");
              }}>Start</Button>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex gap-2">
          <Input placeholder="Neuer Plan, z. B. Push" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} aria-label="Name des neuen Plans" />
          <Button variant="primary" onClick={create}>Anlegen</Button>
        </div>
      </Section>
      <Section title="Laufen">
        {!runPlans.length && <Empty>Noch keine Laufart. Leg unten z. B. „Zone 2“ oder „Longrun“ an.</Empty>}
        {runPlans.length > 0 && (
          <Card>
            <ul className="divide-y divide-line">
              {runPlans.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => navigate(`runplan/${p.id}`)} className="flex min-h-13 w-full items-center gap-3 px-4 py-2 text-left">
                    <Marker kind="runPlan" />
                    <span className="flex-1 text-sm font-medium">{p.name}</span>
                    <span className="text-xs text-soft">{describeTarget(p)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <div className="mt-3 flex gap-2">
          <Input placeholder="Neue Laufart, z. B. Longrun" value={runName} onChange={(e) => setRunName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createRunPlan()} aria-label="Name der neuen Laufart" />
          <Button variant="primary" onClick={createRunPlan}>Anlegen</Button>
        </div>
      </Section>
    </div>
  );
}

const COMPOUND_GROUPS = ["Brust", "Rücken", "Beine", "Schultern"];

export function RoutineEdit({ id }: { id: number }) {
  const routine = useLiveQuery(() => db.routines.get(id), [id]);
  const items = useLiveQuery(async () => {
    const res = (await db.routineExercises.where("routineId").equals(id).toArray()).sort((a, b) => a.order - b.order);
    const ex = await db.exercises.bulkGet(res.map((r) => r.exerciseId));
    const tpls = await db.setTemplates.where("routineExerciseId").anyOf(res.map((r) => r.id!)).toArray();
    return res.map((re, i) => ({ re, ex: ex[i], tpls: tpls.filter((t) => t.routineExerciseId === re.id).sort((a, b) => a.slotNumber - b.slotNumber) }));
  }, [id]);
  const settings = useLiveQuery(() => getSettings(), []);
  const [picker, setPicker] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  if (routine === undefined || !items || !settings) return null;
  if (!routine) return <div><Header title="Plan" onBack /><Empty>Diesen Plan gibt es nicht mehr.</Empty></div>;

  const add = async (exerciseId: number) => {
    const ex = await db.exercises.get(exerciseId);
    const order = (await db.routineExercises.where("routineId").equals(id).count());
    const reId = (await db.routineExercises.add({ routineId: id, exerciseId, order })) as number;
    const warm = COMPOUND_GROUPS.includes(ex?.muscleGroup ?? "") ? 1 : 0;
    await db.setTemplates.bulkAdd([...Array(warm + 3)].map((_, i) => ({ routineExerciseId: reId, slotNumber: i + 1, type: i < warm ? "warmup" as const : "working" as const })));
  };
  const move = async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    await db.transaction("rw", db.routineExercises, async () => {
      await db.routineExercises.update(items[i].re.id!, { order: j });
      await db.routineExercises.update(items[j].re.id!, { order: i });
    });
  };
  const remove = async (reId: number) => {
    await db.transaction("rw", db.routineExercises, db.setTemplates, async () => {
      await db.setTemplates.where("routineExerciseId").equals(reId).delete();
      await db.routineExercises.delete(reId);
      const rest = (await db.routineExercises.where("routineId").equals(id).toArray()).sort((a, b) => a.order - b.order);
      await Promise.all(rest.map((r, i) => db.routineExercises.update(r.id!, { order: i })));
    });
  };
  const removeRoutine = async () => {
    const inUse = await refInUse({ kind: "routine", id });
    if (!confirm(inUse
      ? `„${routine.name}“ steckt in deiner Woche und wird dort entfernt. Bisherige Trainings bleiben erhalten. Löschen?`
      : `Plan „${routine.name}“ löschen? Deine bisherigen Trainings und Gewichtsvorschläge bleiben erhalten.`)) return;
    await deleteRoutine(id);
    toast("Plan gelöscht");
    navigate("routines", true);
  };

  return (
    <div>
      <Header title={routine.name} onBack />
      <BufferedText label="Name" value={routine.name} onCommit={(v) => v.trim() && db.routines.update(id, { name: v.trim() })} />

      <div className="mt-5 grid gap-3">
        {items.map(({ re, ex, tpls }, i) => (
          <RoutineExerciseCard key={re.id} re={re} name={ex?.name ?? "Gelöschte Übung"} tpls={tpls} settings={settings}
            open={open === re.id} onToggle={() => setOpen(open === re.id ? null : re.id!)}
            onUp={i > 0 ? () => move(i, -1) : undefined} onDown={i < items.length - 1 ? () => move(i, 1) : undefined}
            onRemove={() => remove(re.id!)} />
        ))}
      </div>
      <Button variant="ghost" className="mt-3 w-full" onClick={() => setPicker(true)}>Übung hinzufügen</Button>

      <div className="mt-8 grid gap-2">
        <Button variant="plate" onClick={async () => {
          if (await db.drafts.get("current")) { toast("Es läuft schon ein Training."); navigate("workout"); return; }
          await startWorkout(id); navigate("workout");
        }} disabled={!items.length}>Training mit diesem Plan starten</Button>
        <Button variant="danger" onClick={removeRoutine}>Plan löschen</Button>
      </div>
      <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={add} />
    </div>
  );
}

function RoutineExerciseCard({ re, name, tpls, settings, open, onToggle, onUp, onDown, onRemove }: {
  re: RoutineExercise; name: string; tpls: SetTemplate[]; settings: Settings; open: boolean;
  onToggle: () => void; onUp?: () => void; onDown?: () => void; onRemove: () => void;
}) {
  const warm = tpls.filter((t) => t.type === "warmup").length;
  const work = tpls.length - warm;
  const min = re.repTargetMin ?? settings.repTargetMin, max = re.repTargetMax ?? settings.repTargetMax;
  const incType = re.incrementType ?? settings.incrementType;
  const incVal = re.incrementValue ?? settings.incrementValue;

  const renumber = async (list: Omit<SetTemplate, "id">[]) => {
    await db.transaction("rw", db.setTemplates, async () => {
      await db.setTemplates.where("routineExerciseId").equals(re.id!).delete();
      await db.setTemplates.bulkAdd(list.map((t, i) => ({ ...t, routineExerciseId: re.id!, slotNumber: i + 1 })));
    });
  };
  const strip = (t: SetTemplate) => { const { id: _id, ...rest } = t; void _id; return rest; };
  const addSet = (type: "warmup" | "working") => {
    const list = tpls.map(strip);
    const tpl = { routineExerciseId: re.id!, slotNumber: 0, type };
    // Aufwärmsätze stehen immer vor den Arbeitssätzen
    if (type === "warmup") list.splice(list.filter((t) => t.type === "warmup").length, 0, tpl);
    else list.push(tpl);
    renumber(list);
  };
  const removeSet = (idx: number) => renumber(tpls.filter((_, i) => i !== idx).map(strip));
  const setOverride = (patch: Partial<RoutineExercise>) => db.routineExercises.update(re.id!, patch);

  return (
    <section className="rounded-xl border border-line bg-surface shadow-sm">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 p-3 text-left">
        <span className="flex-1">
          <span className="block font-semibold">{name}</span>
          <span className="text-sm text-soft">
            {warm ? `${warm} Aufwärmen + ` : ""}{work} × {min}–{max} Wdh., +{fmtInput(incVal)} {incType === "fixed" ? "kg" : "%"}
          </span>
        </span>
        <span className="text-soft">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="border-t border-line p-3">
          <h3 className="mb-2 text-sm font-medium text-soft">Sätze</h3>
          <ol className="grid gap-2">
            {tpls.map((t, i) => (
              <li key={t.id} className="flex items-center gap-2">
                <span className="w-24 text-sm">{t.type === "warmup" ? "Aufwärmen" : `Arbeitssatz ${tpls.slice(0, i + 1).filter((x) => x.type === "working").length}`}</span>
                {t.type === "warmup" ? (
                  <div className="flex flex-1 items-center gap-2">
                    <BufferedNumber ariaLabel="Aufwärmgewicht in Prozent" value={t.warmupValue ?? null} placeholder={fmtInput(settings.warmupValue)}
                      onCommit={(v) => db.setTemplates.update(t.id!, { warmupValue: v ?? undefined, warmupScheme: v === null ? undefined : "percent_of_working" })} />
                    <span className="text-sm text-soft">% vom Arbeitsgewicht</span>
                  </div>
                ) : (
                  <div className="flex flex-1 items-center gap-1.5">
                    <BufferedNumber ariaLabel="Wiederholungen von (nur dieser Satz)" value={t.repTargetMin ?? null} placeholder={String(min)} decimal={false}
                      onCommit={(v) => db.setTemplates.update(t.id!, { repTargetMin: v ?? undefined })} />
                    <span className="text-soft">–</span>
                    <BufferedNumber ariaLabel="Wiederholungen bis (nur dieser Satz)" value={t.repTargetMax ?? null} placeholder={String(max)} decimal={false}
                      onCommit={(v) => db.setTemplates.update(t.id!, { repTargetMax: v ?? undefined })} />
                    <span className="text-sm text-soft">Wdh.</span>
                  </div>
                )}
                <button type="button" aria-label="Satz entfernen" onClick={() => removeSet(i)} className="h-10 w-10 text-lg text-soft">✕</button>
              </li>
            ))}
          </ol>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button className="min-h-10 text-sm" onClick={() => addSet("warmup")}>+ Aufwärmsatz</Button>
            <Button className="min-h-10 text-sm" onClick={() => addSet("working")}>+ Arbeitssatz</Button>
          </div>

          <h3 className="mb-2 mt-5 text-sm font-medium text-soft">Progression für diese Übung</h3>
          <p className="mb-2 text-xs text-soft">Leere Felder übernehmen deine Standardwerte aus „Ich“. Werte an einem einzelnen Satz haben Vorrang.</p>
          <div className="flex items-center gap-1.5">
            <BufferedNumber ariaLabel="Wiederholungen von" value={re.repTargetMin ?? null} placeholder={String(settings.repTargetMin)} decimal={false}
              onCommit={(v) => setOverride({ repTargetMin: v ?? undefined })} />
            <span className="text-soft">–</span>
            <BufferedNumber ariaLabel="Wiederholungen bis" value={re.repTargetMax ?? null} placeholder={String(settings.repTargetMax)} decimal={false}
              onCommit={(v) => setOverride({ repTargetMax: v ?? undefined })} />
            <span className="text-sm text-soft">Wdh.</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-sm">Steigerung</span>
            <BufferedNumber ariaLabel="Steigerung" value={re.incrementValue ?? null} placeholder={fmtInput(settings.incrementValue)}
              onCommit={(v) => setOverride({ incrementValue: v ?? undefined })} />
            <div className="w-28">
              <Select aria-label="Art der Steigerung" value={re.incrementType ?? ""} onChange={(v) => setOverride({ incrementType: (v || undefined) as RoutineExercise["incrementType"] })}
                options={[["", settings.incrementType === "fixed" ? "kg (Std.)" : "% (Std.)"], ["fixed", "kg"], ["percent", "%"]]} />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {onUp && <Button className="min-h-10 px-3 text-sm" onClick={onUp}>Nach oben</Button>}
            {onDown && <Button className="min-h-10 px-3 text-sm" onClick={onDown}>Nach unten</Button>}
            <Button variant="danger" className="min-h-10 px-3 text-sm" onClick={onRemove}>Aus Plan entfernen</Button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Zahlenfeld, das erst beim Verlassen speichert (vermeidet Springen des Cursors). Leer = erben. */
export function BufferedNumber({ value, onCommit, placeholder, decimal = true, ariaLabel }: {
  value: number | null; onCommit: (v: number | null) => void; placeholder?: string; decimal?: boolean; ariaLabel: string;
}) {
  const [v, setV] = useState(fmtInput(value));
  useEffect(() => setV(fmtInput(value)), [value]);
  const commit = () => {
    const n = num(v);
    onCommit(v.trim() === "" || !Number.isFinite(n) ? null : n);
  };
  return <NumberInput aria-label={ariaLabel} value={v} onChange={setV} onBlur={commit} placeholder={placeholder} decimal={decimal} className="w-16 text-center tnum" />;
}

export function BufferedText({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <Input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => onCommit(v)} />
    </label>
  );
}
