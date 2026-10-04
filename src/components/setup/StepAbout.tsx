import { fmt } from "../../lib/format";
import type { AboutErrors, AboutForm } from "../../lib/profile";
import { Field, NumberInput } from "../ui";

export function StepAbout({ value, onChange, errors, lastWeight }: {
  value: AboutForm; onChange: (v: AboutForm) => void; errors: AboutErrors; lastWeight: number | null;
}) {
  const set = (patch: Partial<AboutForm>) => onChange({ ...value, ...patch });
  const err = (k: keyof AboutForm) => errors[k] && <span className="mt-1 block text-xs text-danger">{errors[k]}</span>;
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Über dich</h1>
      <p className="mt-1 text-sm text-soft">Für den Gewichtsverlauf und den BMI unter „Ich“. Leere Felder bleiben unverändert.</p>
      <div className="mt-5 grid gap-4">
        <Field label="Körpergröße in cm">
          <NumberInput value={value.height} onChange={(v) => set({ height: v })} decimal={false} placeholder="180" className="tnum" />{err("height")}
        </Field>
        <Field label="Alter in Jahren">
          <NumberInput value={value.age} onChange={(v) => set({ age: v })} decimal={false} placeholder="30" className="tnum" />{err("age")}
        </Field>
        <Field label="Körpergewicht heute in kg" hint={lastWeight ? `Zuletzt ${fmt(lastWeight)} kg. Leer lassen, wenn sich nichts geändert hat.` : undefined}>
          <NumberInput value={value.weight} onChange={(v) => set({ weight: v })} placeholder={lastWeight ? fmt(lastWeight) : "80"} className="tnum" />{err("weight")}
        </Field>
      </div>
    </div>
  );
}
