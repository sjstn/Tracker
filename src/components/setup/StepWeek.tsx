import { useState } from "react";
import type { ShiftMode } from "../../db/types";
import type { DraftRef } from "../../lib/presets";
import { Button, Card, Input, Sheet } from "../ui";
import { Marker } from "../plan/Marker";
import { WEEKDAYS, WEEKDAYS_LONG } from "../plan/names";
import { MODES } from "../plan/WeekTemplateEditor";

export function StepWeek({ week, onChange, mode, onMode, routines, runPlans }: {
  week: DraftRef[][]; onChange: (w: DraftRef[][]) => void; mode: ShiftMode; onMode: (m: ShiftMode) => void;
  routines: string[]; runPlans: string[];
}) {
  const [addTo, setAddTo] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const close = () => { setAddTo(null); setNewName(""); };
  const add = (ref: DraftRef) => { onChange(week.map((d, i) => (i === addTo ? [...d, ref] : d))); close(); };
  const remove = (day: number, k: number) => onChange(week.map((d, i) => (i === day ? d.filter((_, j) => j !== k) : d)));
  const groups: [DraftRef["kind"], string, string[]][] = [["routine", "Krafttraining", routines], ["runPlan", "Laufen", runPlans]];

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Deine Woche</h1>
      <p className="mt-1 text-sm text-soft">Tippe auf ein Training, um es zu entfernen. Mit + fügst du eins hinzu.</p>
      <Card className="mt-4">
        <ul className="divide-y divide-line">
          {WEEKDAYS.map((w, day) => (
            <li key={w} className="flex items-center gap-2 px-3 py-2">
              <span className="w-7 text-sm font-medium text-soft">{w}</span>
              <span className="flex flex-1 flex-wrap gap-1.5">
                {week[day].length ? week[day].map((ref, k) => (
                  <button key={k} type="button" onClick={() => remove(day, k)} aria-label={`${ref.name} am ${WEEKDAYS_LONG[day]} entfernen`}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-surface-2 px-2 text-sm ring-1 ring-line">
                    <Marker kind={ref.kind} />{ref.name}<span aria-hidden className="text-soft">✕</span>
                  </button>
                )) : <span className="text-sm text-soft">Pause</span>}
              </span>
              <button type="button" aria-label={`Training am ${WEEKDAYS_LONG[day]} hinzufügen`} onClick={() => setAddTo(day)}
                className="h-10 w-10 rounded-lg text-xl font-semibold text-plate-ink hover:bg-surface-2">+</button>
            </li>
          ))}
        </ul>
      </Card>

      <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2 shadow-sm">
        <span id="setup-shift-label" className="text-sm font-medium">Beim Verschieben</span>
        <div className="grid grid-cols-2 gap-0.5 rounded-lg bg-surface-2 p-0.5 text-xs font-medium" role="radiogroup" aria-labelledby="setup-shift-label">
          {MODES.map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => onMode(k)}
              className={`min-h-9 rounded-md px-2.5 ${mode === k ? "bg-surface shadow-sm" : "text-soft"}`}>{l}</button>
          ))}
        </div>
      </div>
      <p className="mt-1.5 text-xs text-soft">{MODES.find(([k]) => k === mode)![2]}</p>

      <Sheet open={addTo !== null} onClose={close} title={`Training am ${addTo !== null ? WEEKDAYS_LONG[addTo] : ""}`}>
        {groups.map(([kind, title, names]) => names.length > 0 && (
          <div key={kind} className="mb-4">
            <h3 className="mb-1.5 text-sm font-medium text-soft">{title}</h3>
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface shadow-sm">
              {names.map((n) => (
                <li key={n}>
                  <button type="button" onClick={() => add(kind === "routine" ? { kind, name: n } : { kind, name: n })}
                    className="flex min-h-12 w-full items-center gap-2 px-4 text-left text-sm font-medium">
                    <Marker kind={kind} />{n}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="grid gap-2 pb-2">
          <Input placeholder="Neuer Name, z. B. Oberkörper" value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="Name des neuen Trainings" />
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={!newName.trim()} onClick={() => add({ kind: "routine", name: newName.trim() })}>Als Kraftplan</Button>
            <Button disabled={!newName.trim()} onClick={() => add({ kind: "runPlan", name: newName.trim() })}>Als Laufart</Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
