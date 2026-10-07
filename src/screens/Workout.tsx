import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { db, getSettings } from "../db/db";
import { buildDraftExercise, effectiveSet, finishWorkout, lastWorkingSet } from "../db/repo";
import type { DraftExercise, DraftSet, Exercise, WorkoutDraft } from "../db/types";
import { ExercisePicker } from "../components/ExercisePicker";
import { Button, Empty, Header, NumberInput, toast } from "../components/ui";
import { clock, fmtInput, niceDate } from "../lib/format";
import { progressionDefaults, resolveProgression, suggestWorkingSet } from "../lib/progression";
import { navigate } from "../lib/router";

export function Workout() {
  const stored = useLiveQuery(async () => (await db.drafts.get("current")) ?? null, []);
  const [draft, setDraft] = useState<WorkoutDraft | null>(null);
  const exercises = useLiveQuery(() => db.exercises.toArray(), []) ?? [];
  const settings = useLiveQuery(() => getSettings(), []);
  const [picker, setPicker] = useState(false);
  // Beim Umsortieren klappen die Übungen zu einer kompakten Liste zusammen, gemerkt wird die zuletzt bewegte
  const [sorting, setSorting] = useState<string | null>(null);
  const loaded = useRef(false);

  // Einmal aus der Datenbank laden, danach ist der lokale Zustand führend und wird mitgeschrieben
  useEffect(() => {
    if (stored !== undefined && !loaded.current) { loaded.current = true; setDraft(stored); }
  }, [stored]);
  useEffect(() => { if (draft) db.drafts.put(draft); }, [draft]);
  useWakeLock(!!draft);
  // Nach dem Umsortieren zur zuletzt bewegten Übung zurückspringen
  const lastSorted = useRef<string | null>(null);
  useEffect(() => {
    if (sorting) { lastSorted.current = sorting; return; }
    if (lastSorted.current) document.getElementById(`ex-${lastSorted.current}`)?.scrollIntoView({ block: "center" });
    lastSorted.current = null;
  }, [sorting]);

  if (stored === undefined || (stored && !draft)) return null;
  if (!draft) {
    return (
      <div>
        <Header title="Training" onBack />
        <Empty>
          <p className="mb-3">Gerade läuft kein Training.</p>
          <Button variant="primary" onClick={() => navigate("home", true)}>Zur Übersicht</Button>
        </Empty>
      </div>
    );
  }

  const names = new Map<number, Exercise>(exercises.map((e) => [e.id!, e]));
  const update = (fn: (d: WorkoutDraft) => void) => setDraft((d) => { if (!d) return d; const c = structuredClone(d); fn(c); return c; });
  const setField = (xi: number, si: number, patch: Partial<DraftSet>) => update((d) => Object.assign(d.exercises[xi].sets[si], patch));

  const toggle = (xi: number, si: number) => {
    const s = draft.exercises[xi].sets[si];
    if (s.completed) { setField(xi, si, { completed: false }); return; }
    const eff = effectiveSet(s);
    if (!Number.isFinite(eff.weight)) { toast("Trag zuerst das Gewicht ein."); return; }
    if (!(eff.reps > 0)) { toast("Trag zuerst die Wiederholungen ein."); return; }
    update((d) => {
      Object.assign(d.exercises[xi].sets[si], { completed: true, weight: fmtInput(eff.weight), reps: fmtInput(eff.reps) });
      if (!s.isWarmup && settings?.restSeconds) d.restEndsAt = Date.now() + settings.restSeconds * 1000;
    });
  };

  const addSet = async (xi: number) => {
    const x = draft.exercises[xi];
    const slot = Math.max(0, ...x.sets.map((s) => s.slotNumber)) + 1;
    const st = await getSettings();
    const re = x.routineExerciseId ? await db.routineExercises.get(x.routineExerciseId) : null;
    const p = resolveProgression(progressionDefaults(st), re);
    const prevSet = [...x.sets].reverse().find((s) => !s.isWarmup);
    const sug = suggestWorkingSet(await lastWorkingSet(x.exerciseId, slot), p, st.weightRounding);
    const prevEff = prevSet ? effectiveSet(prevSet) : null;
    update((d) => d.exercises[xi].sets.push({
      slotNumber: slot, isWarmup: false, weight: "", reps: "",
      // Ohne Historie für diesen Slot: Werte des vorherigen Satzes übernehmen
      targetWeight: sug.weight ?? (prevEff && Number.isFinite(prevEff.weight) ? prevEff.weight : null),
      targetReps: sug.weight !== null ? sug.reps : prevEff && prevEff.reps > 0 ? prevEff.reps : sug.reps,
      hint: sug.kind === "first" ? null : sug.hint, completed: false,
    }));
  };

  const removeLastSet = (xi: number) => update((d) => { d.exercises[xi].sets.pop(); });
  const removeExercise = (xi: number) => {
    if (!confirm(`${names.get(draft.exercises[xi].exerciseId)?.name ?? "Übung"} aus diesem Training entfernen?`)) return;
    update((d) => { d.exercises.splice(xi, 1); });
  };
  const reorder = (from: number, to: number) => {
    if (to < 0 || to >= draft.exercises.length || from === to) return;
    setSorting(draft.exercises[from].key);
    update((d) => { d.exercises = arrayMove(d.exercises, from, to); });
  };
  const addExercise = async (id: number) => {
    const x = await buildDraftExercise(id, null, []);
    update((d) => { d.exercises.push(x); });
  };

  const finish = async () => {
    const open = draft.exercises.flatMap((x) => x.sets).filter((s) => !s.completed).length;
    const done = draft.exercises.flatMap((x) => x.sets).filter((s) => s.completed).length;
    if (!done) { toast("Hake mindestens einen Satz ab, um das Training zu speichern."); return; }
    if (open && !confirm(`${open} ${open === 1 ? "Satz ist" : "Sätze sind"} nicht abgehakt und ${open === 1 ? "wird" : "werden"} nicht gespeichert. Training trotzdem beenden?`)) return;
    const id = await finishWorkout(draft);
    loaded.current = false;
    toast("Training gespeichert");
    navigate(id ? `session/${id}` : "home", true);
  };
  const discard = async () => {
    if (!confirm("Training verwerfen? Alle Eingaben dieses Trainings gehen verloren.")) return;
    await db.drafts.delete("current");
    loaded.current = false;
    navigate("home", true);
  };

  return (
    <div className="flex flex-1 flex-col"
      style={draft.restEndsAt ? undefined : { paddingBottom: "calc(var(--safe-bottom) + 1rem)" }}>
      <Header title={draft.routineName ?? "Freies Training"} onBack={() => navigate("home")}
        action={<Elapsed since={draft.startedAt} />} />
      {draft.performedOn && <p className="-mt-1 mb-3 text-sm text-soft">Nachtrag für {niceDate(draft.performedOn)}</p>}

      {!draft.exercises.length && <Empty>Füg die erste Übung hinzu.</Empty>}

      {sorting !== null ? (
        <ReorderList exercises={draft.exercises} names={names} onReorder={reorder} onDone={() => setSorting(null)} />
      ) : <>
        {draft.exercises.map((x, xi) => (
          <ExerciseCard key={x.key} x={x} name={names.get(x.exerciseId)?.name ?? "Übung"}
            onField={(si, p) => setField(xi, si, p)} onToggle={(si) => toggle(xi, si)}
            onAddSet={() => addSet(xi)} onRemoveSet={() => removeLastSet(xi)} onRemove={() => removeExercise(xi)}
            onSort={draft.exercises.length > 1 ? () => setSorting(x.key) : undefined}
            onInfo={() => navigate(`exercise/${x.exerciseId}`)} />
        ))}
        <Button variant="ghost" className="mt-1 w-full" onClick={() => setPicker(true)}>Übung hinzufügen</Button>

        <label className="mt-6 block">
          <span className="mb-1.5 block text-sm font-medium">Notiz</span>
          <textarea value={draft.notes} onChange={(e) => update((d) => { d.notes = e.target.value; })} rows={2}
            placeholder="Wie lief es? Schmerzen, Schlaf, Technik"
            className="w-full rounded-lg border border-line bg-surface p-3 text-ink shadow-sm outline-none placeholder:text-soft/70 focus:border-plate focus:ring-2 focus:ring-plate/30" />
        </label>

        <div className="mt-5 grid gap-2">
          <Button variant="primary" className="text-base" onClick={finish}>Training beenden</Button>
          <Button variant="danger" onClick={discard}>Training verwerfen</Button>
        </div>
      </>}

      <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={addExercise} />
      {draft.restEndsAt && <RestTimer endsAt={draft.restEndsAt}
        onChange={(t) => update((d) => { d.restEndsAt = t; })} />}
    </div>
  );
}

/** Kompakte Liste nur mit Namen: Übungen am Griff ziehen oder per Pfeil eine Position weiter. */
function ReorderList({ exercises, names, onReorder, onDone }: {
  exercises: DraftExercise[]; names: Map<number, Exercise>; onReorder: (from: number, to: number) => void; onDone: () => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollIntoView({ block: "start" }); }, []);
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    onReorder(exercises.findIndex((x) => x.key === active.id), exercises.findIndex((x) => x.key === over.id));
  };
  return (
    <div ref={ref} className="scroll-mt-16">
      <div className="mb-2 flex items-center gap-2">
        <p className="flex-1 text-sm text-soft">Am Griff ⠿ ziehen oder mit den Pfeilen verschieben.</p>
        <Button variant="primary" className="min-h-10 px-4" onClick={onDone}>Fertig</Button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={exercises.map((x) => x.key)} strategy={verticalListSortingStrategy}>
          <div className="grid gap-2">
            {exercises.map((x, i) => (
              <ReorderRow key={x.key} x={x} name={names.get(x.exerciseId)?.name ?? "Übung"}
                onUp={i > 0 ? () => onReorder(i, i - 1) : undefined}
                onDown={i < exercises.length - 1 ? () => onReorder(i, i + 1) : undefined} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function ReorderRow({ x, name, onUp, onDown }: { x: DraftExercise; name: string; onUp?: () => void; onDown?: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: x.key });
  const style = { transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined, transition };
  const done = x.sets.filter((s) => s.completed).length;
  const allDone = x.sets.length > 0 && done === x.sets.length;
  return (
    <div ref={setNodeRef} style={style}
      className={`relative flex items-center rounded-xl border bg-surface ${isDragging ? "z-10 border-plate/40 shadow-lg" : allDone ? "border-ok/60 shadow-sm" : "border-line shadow-sm"}`}>
      <span ref={setActivatorNodeRef} {...listeners} {...attributes} aria-label={`${name} verschieben`}
        className="no-callout flex h-14 w-11 shrink-0 cursor-grab touch-none items-center justify-center text-lg text-soft">⠿</span>
      <span className="min-w-0 flex-1 py-2">
        <span className="block truncate font-semibold">{name}</span>
        <span className={`text-xs tnum ${allDone ? "text-ok" : "text-soft"}`}>{done}/{x.sets.length} Sätze</span>
      </span>
      <button type="button" aria-label={`${name} nach oben`} disabled={!onUp} onClick={onUp} className="h-12 w-11 text-soft disabled:opacity-25">▲</button>
      <button type="button" aria-label={`${name} nach unten`} disabled={!onDown} onClick={onDown} className="mr-1 h-12 w-11 text-soft disabled:opacity-25">▼</button>
    </div>
  );
}

function ExerciseCard({ x, name, onField, onToggle, onAddSet, onRemoveSet, onRemove, onSort, onInfo }: {
  x: DraftExercise; name: string;
  onField: (si: number, p: Partial<DraftSet>) => void; onToggle: (si: number) => void;
  onAddSet: () => void; onRemoveSet: () => void; onRemove: () => void; onSort?: () => void; onInfo: () => void;
}) {
  const [menu, setMenu] = useState(false);
  let working = 0;
  const allDone = x.sets.length > 0 && x.sets.every((s) => s.completed);
  return (
    <section id={`ex-${x.key}`} className={`mb-3 scroll-mt-16 rounded-xl border bg-surface p-3 shadow-sm ${allDone ? "border-ok/60 ring-1 ring-ok/30" : "border-line"}`}>
      <div className="mb-2 flex items-start gap-2">
        <button type="button" onClick={onInfo} className="flex-1 pt-1 text-left text-base font-semibold leading-tight">{name}</button>
        <button type="button" aria-label="Optionen für diese Übung" aria-expanded={menu} onClick={() => setMenu(!menu)}
          className="h-10 w-10 rounded-lg text-xl text-soft hover:bg-surface-2">⋯</button>
      </div>
      {menu && (
        <div className="mb-3 flex flex-wrap gap-2">
          {onSort && <Button className="min-h-10 px-3 text-sm" onClick={() => { setMenu(false); onSort(); }}>Reihenfolge ändern</Button>}
          <Button variant="danger" className="min-h-10 px-3 text-sm" onClick={onRemove}>Übung entfernen</Button>
        </div>
      )}
      <div className="grid grid-cols-[2rem_1fr_1fr_3rem] gap-2 px-0.5 text-xs text-soft">
        <span className="text-center">Satz</span><span>kg</span><span>Wdh.</span><span />
      </div>
      {x.sets.map((s, si) => {
        const label = s.isWarmup ? "A" : String(++working);
        return (
          <div key={si} className="mt-1.5">
            <div className={`grid grid-cols-[2rem_1fr_1fr_3rem] items-center gap-2 ${s.completed ? "opacity-70" : ""}`}>
              <span className={`text-center text-sm font-semibold ${s.isWarmup ? "text-soft" : ""}`}
                title={s.isWarmup ? "Aufwärmsatz" : undefined}>{label}</span>
              <NumberInput aria-label={`Gewicht in kg, Satz ${label}`} value={s.weight} placeholder={fmtInput(s.targetWeight) || "kg"}
                onChange={(v) => onField(si, { weight: v })} className="tnum font-semibold" />
              <NumberInput decimal={false} aria-label={`Wiederholungen, Satz ${label}`} value={s.reps} placeholder={fmtInput(s.targetReps) || "Wdh."}
                onChange={(v) => onField(si, { reps: v })} className="tnum font-semibold" />
              <button type="button" onClick={() => onToggle(si)} aria-pressed={s.completed}
                aria-label={s.completed ? `Satz ${label} wieder öffnen` : `Satz ${label} abhaken`}
                className={`h-12 w-12 rounded-lg border text-xl font-bold ${s.completed ? "border-transparent bg-ok text-white shadow-sm" : "border-line bg-surface text-soft shadow-sm"}`}>✓</button>
            </div>
            {s.hint && !s.completed && <p className={`ml-10 mt-0.5 text-xs ${s.hint.startsWith("Ziel geschafft") ? "font-medium text-plate-ink" : "text-soft"}`}>{s.hint}</p>}
          </div>
        );
      })}
      <div className="mt-3 flex gap-2">
        <Button className="min-h-10 flex-1 text-sm" onClick={onAddSet}>Satz hinzufügen</Button>
        {x.sets.length > 0 && <Button className="min-h-10 px-3 text-sm text-soft" onClick={onRemoveSet} aria-label="Letzten Satz entfernen">Satz entfernen</Button>}
      </div>
    </section>
  );
}

function Elapsed({ since }: { since: string }) {
  const now = useNow(1000);
  return <span className="pr-2 text-base font-semibold text-soft tnum">{clock((now - new Date(since).getTime()) / 1000)}</span>;
}

function RestTimer({ endsAt, onChange }: { endsAt: number; onChange: (t: number | null) => void }) {
  const now = useNow(250);
  const left = Math.ceil((endsAt - now) / 1000);
  const beeped = useRef(false);
  useEffect(() => {
    if (left <= 0 && !beeped.current) { beeped.current = true; beep(); }
    if (left > 0) beeped.current = false;
  }, [left]);
  const done = left <= 0;
  return (
    <div className="sticky bottom-0 z-30 -mx-4 mt-auto border-t border-line bg-surface/95 px-4 pt-3 shadow-[0_-4px_12px_rgb(0_0_0/0.04)] backdrop-blur"
      style={{ paddingBottom: "calc(var(--safe-bottom) + 0.75rem)" }} role="timer" aria-live="off">
      <div className="mx-auto flex max-w-xl items-center gap-3">
        <div className="flex-1">
          <span className="block text-xs text-soft">{done ? "Pause vorbei" : "Pause"}</span>
          <span className={`text-2xl font-semibold leading-none tracking-tight tnum ${done ? "text-ok" : ""}`}>{done ? "Weiter geht's" : clock(left)}</span>
        </div>
        {!done && <Button className="min-h-11 px-3" onClick={() => onChange(endsAt + 30000)}>+30 s</Button>}
        <Button variant={done ? "primary" : "quiet"} className="min-h-11 px-3" onClick={() => onChange(null)}>{done ? "Schließen" : "Überspringen"}</Button>
      </div>
    </div>
  );
}

function useNow(interval: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), interval); return () => clearInterval(t); }, [interval]);
  return now;
}

/** Bildschirm während des Trainings anlassen (iOS ab 16.4). */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const req = async () => { try { lock = await navigator.wakeLock.request("screen"); } catch { /* nicht verfügbar */ } };
    const onVis = () => { if (document.visibilityState === "visible") req(); };
    req();
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); lock?.release().catch(() => {}); };
  }, [active]);
}

let audio: AudioContext | null = null;
function beep() {
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = 880; g.gain.setValueAtTime(0.25, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.6);
    o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.6);
  } catch { /* Ton ist optional */ }
}
// iOS erlaubt Ton nur nach einer Berührung: Audio beim ersten Tippen freischalten
if (typeof window !== "undefined") {
  window.addEventListener("touchend", () => { try { audio ??= new AudioContext(); audio.resume(); } catch { /* */ } }, { once: true });
}
