import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { db, getSettings } from "../db/db";
import { buildDraftExercise, effectiveSet, finishWorkout, lastWorkingSet } from "../db/repo";
import type { DraftExercise, DraftSet, Exercise, WorkoutDraft } from "../db/types";
import { ExercisePicker } from "../components/ExercisePicker";
import { Keypad } from "../components/Keypad";
import { Button, Empty, Header, inputCls, toast } from "../components/ui";
import { clock, fmtInput, niceDate } from "../lib/format";
import { pressKey, stepValue } from "../lib/keypad";
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
  // Feld, in das das Zahlenfeld gerade schreibt; fresh = die erste Taste ersetzt den Wert
  const [entry, setEntry] = useState<Entry | null>(null);
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
  // Gewählten Satz über dem Zahlenfeld halten
  useEffect(() => {
    if (entry) document.getElementById(`set-${entry.key}-${entry.si}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [entry?.key, entry?.si]);

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

  /** Hakt einen Satz ab; fehlt etwas, sagt es, welches Feld. */
  const complete = (xi: number, si: number): "weight" | "reps" | null => {
    const s = draft.exercises[xi].sets[si];
    if (s.completed) return null;
    const eff = effectiveSet(s);
    if (!Number.isFinite(eff.weight)) { toast("Trag zuerst das Gewicht ein."); return "weight"; }
    if (!(eff.reps > 0)) { toast("Trag zuerst die Wiederholungen ein."); return "reps"; }
    update((d) => {
      Object.assign(d.exercises[xi].sets[si], { completed: true, weight: fmtInput(eff.weight), reps: fmtInput(eff.reps) });
      if (!s.isWarmup && settings?.restSeconds) d.restEndsAt = Date.now() + settings.restSeconds * 1000;
    });
    return null;
  };
  const toggle = (xi: number, si: number) => {
    if (draft.exercises[xi].sets[si].completed) setField(xi, si, { completed: false });
    else complete(xi, si);
  };

  // Zahlenfeld: tippen, −/+, Weiter (kg → Wdh.), ✓ (Wdh. → Satz abhaken)
  const ei = entry ? draft.exercises.findIndex((x) => x.key === entry.key) : -1;
  const active = entry && ei >= 0 && draft.exercises[ei].sets[entry.si] ? { ...entry, xi: ei, set: draft.exercises[ei].sets[entry.si] } : null;
  const keyIn = (k: string) => {
    if (!active) return;
    setField(active.xi, active.si, { [active.field]: pressKey(active.set[active.field], k, active.fresh, active.field === "weight") });
    setEntry({ ...active, fresh: false });
  };
  const stepIn = (dir: -1 | 1) => {
    if (!active) return;
    const weight = active.field === "weight";
    const delta = weight ? dir * (settings?.weightRounding || 2.5) : dir;
    setField(active.xi, active.si, { [active.field]: stepValue(active.set[active.field], weight ? active.set.targetWeight : active.set.targetReps, delta) });
    setEntry({ ...active, fresh: false });
  };
  const nextIn = () => {
    if (!active) return;
    if (active.field === "weight") { setEntry({ key: active.key, si: active.si, field: "reps", fresh: true }); return; }
    const missing = complete(active.xi, active.si);
    setEntry(missing ? { key: active.key, si: active.si, field: missing, fresh: true } : null);
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
    setEntry(null);
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
      style={draft.restEndsAt || active ? undefined : { paddingBottom: "calc(var(--safe-bottom) + 1rem)" }}>
      <Header title={draft.routineName ?? "Freies Training"} onBack={() => navigate("home")}
        action={<Elapsed since={draft.startedAt} />} />
      {draft.performedOn && <p className="-mt-1 mb-3 text-sm text-soft">Nachtrag für {niceDate(draft.performedOn)}</p>}

      {!draft.exercises.length && <Empty>Füg die erste Übung hinzu.</Empty>}

      {sorting !== null ? (
        <ReorderList exercises={draft.exercises} names={names} onReorder={reorder} onDone={() => setSorting(null)} />
      ) : <>
        {draft.exercises.map((x, xi) => (
          <ExerciseCard key={x.key} x={x} name={names.get(x.exerciseId)?.name ?? "Übung"}
            active={active?.key === x.key ? active : null} onOpen={(si, field) => setEntry({ key: x.key, si, field, fresh: true })}
            onToggle={(si) => toggle(xi, si)}
            onAddSet={() => addSet(xi)} onRemoveSet={() => removeLastSet(xi)} onRemove={() => removeExercise(xi)}
            onSort={draft.exercises.length > 1 ? () => { setEntry(null); setSorting(x.key); } : undefined}
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
      {(draft.restEndsAt || active) && (
        <div data-keypad className="sticky bottom-0 z-30 -mx-4 mt-auto border-t border-line bg-surface/95 shadow-[0_-4px_12px_rgb(0_0_0/0.04)] backdrop-blur"
          style={{ paddingBottom: "calc(var(--safe-bottom) + 0.75rem)" }}>
          {draft.restEndsAt && <RestTimer endsAt={draft.restEndsAt} onChange={(t) => update((d) => { d.restEndsAt = t; })} />}
          {active && <Keypad title={`${names.get(draft.exercises[active.xi].exerciseId)?.name ?? "Übung"} · Satz ${setLabel(draft.exercises[active.xi], active.si)} · ${active.field === "weight" ? "kg" : "Wdh."}`}
            decimal={active.field === "weight"} last={active.field === "reps"}
            onKey={keyIn} onStep={stepIn} onNext={nextIn} onClose={() => setEntry(null)} />}
          <KeypadKeys enabled={!!active} onKey={keyIn} onNext={nextIn} onClose={() => setEntry(null)} />
        </div>
      )}
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

type Entry = { key: string; si: number; field: "weight" | "reps"; fresh: boolean };

/** "A" für Aufwärmsätze, sonst die Nummer unter den Arbeitssätzen. */
const setLabel = (x: DraftExercise, si: number) =>
  x.sets[si].isWarmup ? "A" : String(x.sets.slice(0, si + 1).filter((s) => !s.isWarmup).length);

/** Hardware-Tastatur bedient das Zahlenfeld mit, ein Tipp daneben schließt es. */
function KeypadKeys({ enabled, onKey, onNext, onClose }: { enabled: boolean; onKey: (k: string) => void; onNext: () => void; onClose: () => void }) {
  useEffect(() => {
    if (!enabled) return;
    const onDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey) return;
      const k = /^\d$/.test(e.key) ? e.key : e.key === "," || e.key === "." ? "," : e.key === "Backspace" ? "back" : null;
      if (k) onKey(k);
      else if (e.key === "Enter" || e.key === "Tab") onNext();
      else if (e.key === "Escape") onClose();
      else return;
      e.preventDefault();
    };
    // Tipp daneben schließt wie bei einer Tastatur; click statt pointerdown, damit Scrollen nicht schließt
    const onClick = (e: MouseEvent) => { if (!(e.target as Element).closest?.("[data-keypad],[data-setfield]")) onClose(); };
    window.addEventListener("keydown", onDown);
    document.addEventListener("click", onClick);
    return () => { window.removeEventListener("keydown", onDown); document.removeEventListener("click", onClick); };
  }, [enabled, onKey, onNext, onClose]);
  return null;
}

/** Feld eines Satzes; öffnet das Zahlenfeld statt der iOS-Tastatur. */
function SetField({ id, value, placeholder, label, active, fresh, onOpen }: {
  id?: string; value: string; placeholder: string; label: string; active: boolean; fresh: boolean; onOpen: () => void;
}) {
  return (
    <button type="button" id={id} data-setfield onClick={onOpen} aria-label={`${label}: ${value || placeholder}`} aria-pressed={active}
      className={`${inputCls} flex w-full items-center text-left font-semibold tnum ${active ? "border-plate ring-2 ring-plate/30" : ""}`}>
      {value
        ? <span className={active && fresh ? "rounded bg-plate/25" : ""}>{value}</span>
        : <span className="font-normal text-soft/70">{placeholder}</span>}
      {active && !fresh && <span aria-hidden className="ml-px h-6 w-0.5 animate-pulse bg-plate" />}
    </button>
  );
}

function ExerciseCard({ x, name, active, onOpen, onToggle, onAddSet, onRemoveSet, onRemove, onSort, onInfo }: {
  x: DraftExercise; name: string;
  active: Entry | null; onOpen: (si: number, field: "weight" | "reps") => void; onToggle: (si: number) => void;
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
              <SetField id={`set-${x.key}-${si}`} label={`Gewicht in kg, Satz ${label}`} value={s.weight} placeholder={fmtInput(s.targetWeight) || "kg"}
                active={active?.si === si && active.field === "weight"} fresh={!!active?.fresh} onOpen={() => onOpen(si, "weight")} />
              <SetField label={`Wiederholungen, Satz ${label}`} value={s.reps} placeholder={fmtInput(s.targetReps) || "Wdh."}
                active={active?.si === si && active.field === "reps"} fresh={!!active?.fresh} onOpen={() => onOpen(si, "reps")} />
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
    <div className="px-4 pt-3" role="timer" aria-live="off">
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
