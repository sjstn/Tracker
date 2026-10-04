import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { db } from "../db/db";
import { deleteRunPlan, refInUse } from "../db/schedule";
import { Button, Empty, Field, Header, Input, NumberInput, toast } from "../components/ui";
import { formFromRunPlan, runPlanFromForm, validateRunPlan, type RunPlanForm } from "../lib/runTarget";
import { back, navigate } from "../lib/router";

export function RunPlanEdit({ id }: { id: number }) {
  const plan = useLiveQuery(async () => (await db.runPlans.get(id)) ?? null, [id]);
  const [f, setF] = useState<RunPlanForm | null>(null);
  const [tried, setTried] = useState(false);
  useEffect(() => { if (plan && !f) setF(formFromRunPlan(plan)); }, [plan, f]);

  if (plan === undefined) return null;
  if (!plan) return <div><Header title="Laufart" onBack /><Empty>Diese Laufart gibt es nicht mehr.</Empty></div>;
  if (!f) return null;

  const errors = validateRunPlan(f);
  const shown = tried ? errors : {};
  const set = (patch: Partial<RunPlanForm>) => setF({ ...f, ...patch });
  const save = async () => {
    setTried(true);
    if (Object.keys(errors).length) return;
    await db.runPlans.update(id, runPlanFromForm(f));
    toast("Laufart gespeichert");
    back("routines");
  };
  const remove = async () => {
    const inUse = await refInUse({ kind: "runPlan", id });
    if (!confirm(inUse ? `„${plan.name}“ steckt in deiner Woche und wird dort entfernt. Löschen?` : `„${plan.name}“ löschen?`)) return;
    await deleteRunPlan(id);
    toast("Laufart gelöscht");
    navigate("routines", true);
  };
  const err = (k: keyof RunPlanForm) => shown[k] && <span className="mt-1 block text-xs text-danger">{shown[k]}</span>;

  return (
    <div>
      <Header title={plan.name} onBack />
      <div className="grid gap-4">
        <Field label="Name"><Input value={f.name} onChange={(e) => set({ name: e.target.value })} />{err("name")}</Field>

        <div>
          <span id="kind-label" className="mb-1.5 block text-sm font-medium">Ziel</span>
          <div className="grid grid-cols-2 gap-0.5 rounded-lg bg-surface-2 p-0.5 text-sm font-medium" role="radiogroup" aria-labelledby="kind-label">
            {([["duration", "Dauer"], ["distance", "Distanz"]] as const).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={f.targetKind === k} onClick={() => set({ targetKind: k })}
                className={`min-h-10 rounded-md ${f.targetKind === k ? "bg-surface shadow-sm" : "text-soft"}`}>{l}</button>
            ))}
          </div>
        </div>

        <Field label={f.targetKind === "duration" ? "Dauer in Minuten" : "Distanz in km"}>
          <NumberInput value={f.target} onChange={(v) => set({ target: v })} decimal={f.targetKind === "distance"} placeholder={f.targetKind === "duration" ? "45" : "10"} className="tnum" />
          {err("target")}
        </Field>

        <div>
          <span className="mb-1.5 block text-sm font-medium">Pace in min/km <span className="font-normal text-soft">(optional)</span></span>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <Input aria-label="Pace von" inputMode="decimal" placeholder="6:15" value={f.paceFrom} onChange={(e) => set({ paceFrom: e.target.value })} className="tnum" />
            <span className="text-soft">–</span>
            <Input aria-label="Pace bis" inputMode="decimal" placeholder="6:45" value={f.paceTo} onChange={(e) => set({ paceTo: e.target.value })} className="tnum" />
          </div>
          {err("paceFrom")}{err("paceTo")}
          <span className="mt-1 block text-xs text-soft">Komma oder Punkt geht auch: 6,15 = 6:15 min/km.</span>
        </div>
      </div>
      <div className="mt-8 grid gap-2">
        <Button variant="plate" onClick={save}>Speichern</Button>
        <Button variant="danger" onClick={remove}>Laufart löschen</Button>
      </div>
    </div>
  );
}
