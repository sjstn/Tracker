import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { db, MUSCLE_GROUPS } from "../db/db";
import { Button, Input, Select, Sheet } from "./ui";

/** Auswahl aus Bibliothek + eigenen Übungen, mit Suche und Neuanlage. */
export function ExercisePicker({ open, onClose, onPick, multi = true }: { open: boolean; onClose: () => void; onPick: (id: number) => void; multi?: boolean }) {
  const exercises = useLiveQuery(() => db.exercises.toArray(), []) ?? [];
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [newGroup, setNewGroup] = useState<string>(MUSCLE_GROUPS[0]);

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = exercises.filter((e) => !term || e.name.toLowerCase().includes(term)).sort((a, b) => a.name.localeCompare(b.name, "de"));
    return MUSCLE_GROUPS.map((g) => [g, list.filter((e) => e.muscleGroup === g)] as const).filter(([, l]) => l.length);
  }, [exercises, q]);

  const pick = (id: number) => {
    onPick(id);
    setPicked((p) => [...p, id]);
    if (!multi) close();
  };
  const close = () => { setQ(""); setPicked([]); onClose(); };
  const exact = exercises.some((e) => e.name.toLowerCase() === q.trim().toLowerCase());

  const create = async () => {
    const id = (await db.exercises.add({ name: q.trim(), muscleGroup: newGroup, custom: true })) as number;
    pick(id);
    setQ("");
  };

  return (
    <Sheet open={open} onClose={close} title="Übung hinzufügen">
      <Input type="search" placeholder="Suchen oder neue Übung eingeben" value={q} onChange={(e) => setQ(e.target.value)} />
      {q.trim() && !exact && (
        <div className="mt-3 rounded-xl bg-surface p-3">
          <p className="mb-2 text-sm text-soft">„{q.trim()}“ als eigene Übung anlegen</p>
          <div className="flex gap-2">
            <div className="flex-1"><Select value={newGroup} onChange={setNewGroup} options={MUSCLE_GROUPS.map((g) => [g, g])} aria-label="Muskelgruppe" /></div>
            <Button variant="plate" onClick={create}>Anlegen</Button>
          </div>
        </div>
      )}
      {groups.map(([g, list]) => (
        <div key={g} className="mt-4">
          <h3 className="mb-1 font-display text-lg font-semibold text-soft">{g}</h3>
          <ul>
            {list.map((e) => {
              const count = picked.filter((p) => p === e.id).length;
              return (
                <li key={e.id}>
                  <button type="button" onClick={() => pick(e.id!)}
                    className="flex min-h-12 w-full items-center justify-between border-b border-line text-left">
                    <span>{e.name}{e.custom && <span className="ml-2 text-xs text-soft">eigene</span>}</span>
                    <span className={`font-display text-lg font-semibold ${count ? "text-plate-ink" : "text-soft"}`}>{count ? `✓${count > 1 ? " " + count : ""}` : "+"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </Sheet>
  );
}
