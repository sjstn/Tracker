import { PRESETS, type DraftRef } from "../../lib/presets";
import { Marker } from "../plan/Marker";
import { WEEKDAYS } from "../plan/names";

function MiniWeek({ week }: { week: DraftRef[][] }) {
  return (
    <span className="mt-2 grid grid-cols-7 gap-0.5 text-center text-[10px] text-soft">
      {week.map((day, i) => (
        <span key={i}>
          <span className="block">{WEEKDAYS[i]}</span>
          <span className="mt-1 flex min-h-2 flex-wrap justify-center gap-0.5">{day.map((r, k) => <Marker key={k} kind={r.kind} />)}</span>
        </span>
      ))}
    </span>
  );
}

export function StepPreset({ value, onChange, currentWeek }: { value: string; onChange: (id: string) => void; currentWeek: DraftRef[][] | null }) {
  const options = [
    ...(currentWeek ? [{ id: "keep", name: "Aktuelle Woche behalten", description: "Deine bisherige Musterwoche", week: currentWeek }] : []),
    ...PRESETS,
  ];
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Wie sieht deine Woche aus?</h1>
      <p className="mt-1 text-sm text-soft">Wähl eine Vorlage, im nächsten Schritt passt du sie an.</p>
      <div className="mt-4 grid gap-2" role="radiogroup" aria-label="Vorlage">
        {options.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}
            className={`block rounded-xl bg-surface p-3 text-left shadow-sm ${value === o.id ? "ring-2 ring-plate" : "border border-line"}`}>
            <span className="flex items-baseline justify-between gap-2">
              <span className="font-semibold">{o.name}</span>
              <span className="text-xs text-soft">{o.description}</span>
            </span>
            <MiniWeek week={o.week} />
          </button>
        ))}
      </div>
    </div>
  );
}
