import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { getSettings } from "../../db/db";
import { saveWeekSetup } from "../../db/schedule";
import type { ShiftMode, TrainingRef } from "../../db/types";
import { Card, Section, Sheet, toast } from "../ui";
import { Marker } from "./Marker";
import { usePlanNames, WEEKDAYS, WEEKDAYS_LONG } from "./names";

const MODES: [ShiftMode, string, string][] = [
  ["continuous", "Fortlaufend", "Trainings laufen als Reihenfolge weiter, die Wochentage verschieben sich mit."],
  ["fixedWeek", "Feste Woche", "Jeden Montag beginnt die Musterwoche neu, Ruhetage fangen Verschiebungen auf."],
];

export function WeekTemplateEditor() {
  const settings = useLiveQuery(() => getSettings(), []);
  const names = usePlanNames();
  const [addTo, setAddTo] = useState<number | null>(null);
  if (!settings || !names) return null;
  const tpl = settings.weekTemplate;

  const persist = (patch: Parameters<typeof saveWeekSetup>[0]) => { saveWeekSetup(patch).catch(() => toast("Konnte nicht gespeichert werden.")); };
  const save = (weekTemplate: TrainingRef[][]) => persist({ weekTemplate });
  const add = (ref: TrainingRef) => {
    const next = tpl.map((d) => [...d]);
    next[addTo!].push(ref);
    setAddTo(null);
    save(next);
  };
  const remove = (day: number, k: number) => save(tpl.map((d, i) => (i === day ? d.filter((_, j) => j !== k) : d)));
  const options: [string, TrainingRef[]][] = [
    ["Krafttraining", names.routines.map((r) => ({ kind: "routine" as const, id: r.id! }))],
    ["Laufen", names.runPlans.map((r) => ({ kind: "runPlan" as const, id: r.id! }))],
  ];

  return (
    <Section title="Musterwoche">
      <Card>
        <ul className="divide-y divide-line">
          {WEEKDAYS.map((w, day) => (
            <li key={w} className="flex items-center gap-2 px-3 py-2">
              <span className="w-7 text-sm font-medium text-soft">{w}</span>
              <span className="flex flex-1 flex-wrap gap-1.5">
                {tpl[day].length ? tpl[day].map((ref, k) => (
                  <button key={k} type="button" onClick={() => remove(day, k)} aria-label={`${names.name(ref)} am ${WEEKDAYS_LONG[day]} entfernen`}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-surface-2 px-2 text-sm ring-1 ring-line">
                    <Marker kind={ref.kind} />{names.name(ref)}<span aria-hidden className="text-soft">✕</span>
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
        <span id="shift-label" className="text-sm font-medium">Beim Verschieben</span>
        <div className="grid grid-cols-2 gap-0.5 rounded-lg bg-surface-2 p-0.5 text-xs font-medium" role="radiogroup" aria-labelledby="shift-label">
          {MODES.map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={settings.shiftMode === k} onClick={() => persist({ shiftMode: k })}
              className={`min-h-9 rounded-md px-2.5 ${settings.shiftMode === k ? "bg-surface shadow-sm" : "text-soft"}`}>{l}</button>
          ))}
        </div>
      </div>
      <p className="mt-1.5 text-xs text-soft">{MODES.find(([k]) => k === settings.shiftMode)![2]}</p>

      <Sheet open={addTo !== null} onClose={() => setAddTo(null)} title={`Training am ${addTo !== null ? WEEKDAYS_LONG[addTo] : ""}`}>
        {options.map(([title, refs]) => (
          <div key={title} className="mb-4">
            <h3 className="mb-1.5 text-sm font-medium text-soft">{title}</h3>
            {refs.length ? (
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface shadow-sm">
                {refs.map((ref) => (
                  <li key={`${ref.kind}${ref.id}`}>
                    <button type="button" onClick={() => add(ref)} className="flex min-h-12 w-full items-center gap-2 px-4 text-left text-sm font-medium">
                      <Marker kind={ref.kind} />{names.name(ref)}
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-soft">Noch nichts angelegt. Leg es unten auf der Seite „Pläne“ an.</p>}
          </div>
        ))}
      </Sheet>
    </Section>
  );
}
