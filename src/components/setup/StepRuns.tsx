import { nameKey } from "../../lib/presets";
import type { RunPlanErrors, RunPlanForm } from "../../lib/runTarget";
import { Card, Input, NumberInput } from "../ui";
import { Marker } from "../plan/Marker";

export function StepRuns({ names, value, onChange, errors }: {
  names: string[]; value: Record<string, RunPlanForm>; onChange: (v: Record<string, RunPlanForm>) => void; errors: Record<string, RunPlanErrors>;
}) {
  const set = (key: string, patch: Partial<RunPlanForm>) => onChange({ ...value, [key]: { ...value[key], ...patch } });
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Deine Laufziele</h1>
      <p className="mt-1 text-sm text-soft">Ziel als Dauer oder Distanz, Pace optional in min/km (6,15 = 6:15).</p>
      <div className="mt-4 grid gap-2">
        {names.map((name) => {
          const key = nameKey(name);
          const f = value[key];
          const e = errors[key] ?? {};
          const message = e.target ?? e.paceFrom ?? e.paceTo;
          return (
            <Card key={key} className="p-3">
              <div className="flex items-center gap-2">
                <Marker kind="runPlan" />
                <span className="flex-1 font-semibold">{name}</span>
                <div className="grid grid-cols-2 gap-0.5 rounded-lg bg-surface-2 p-0.5 text-xs font-medium" role="radiogroup" aria-label={`Ziel für ${name}`}>
                  {([["duration", "Dauer"], ["distance", "Distanz"]] as const).map(([k, l]) => (
                    <button key={k} type="button" role="radio" aria-checked={f.targetKind === k} onClick={() => set(key, { targetKind: k })}
                      className={`min-h-8 rounded-md px-2 ${f.targetKind === k ? "bg-surface shadow-sm" : "text-soft"}`}>{l}</button>
                  ))}
                </div>
              </div>
              <div className="mt-2 grid grid-cols-[1fr_1fr_auto_1fr] items-center gap-1.5">
                <NumberInput aria-label={`${name}: ${f.targetKind === "duration" ? "Dauer in Minuten" : "Distanz in km"}`} value={f.target}
                  onChange={(v) => set(key, { target: v })} decimal={f.targetKind === "distance"} placeholder={f.targetKind === "duration" ? "min" : "km"} className="tnum" />
                <Input aria-label={`${name}: Pace von`} inputMode="decimal" placeholder="6:15" value={f.paceFrom} onChange={(ev) => set(key, { paceFrom: ev.target.value })} className="tnum" />
                <span className="text-soft">–</span>
                <Input aria-label={`${name}: Pace bis`} inputMode="decimal" placeholder="6:45" value={f.paceTo} onChange={(ev) => set(key, { paceTo: ev.target.value })} className="tnum" />
              </div>
              <p className="mt-1 text-xs text-soft">{f.targetKind === "duration" ? "Minuten" : "km"} · Pace von–bis</p>
              {message && <p className="mt-1 text-xs text-danger">{message}</p>}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
