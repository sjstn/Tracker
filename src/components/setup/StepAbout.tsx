import { fmt, isoDate } from "../../lib/format";
import type { AboutErrors, AboutForm } from "../../lib/profile";
import { Field, Input, NumberInput } from "../ui";

export function StepAbout({ value, onChange, errors, lastWeight }: {
  value: AboutForm; onChange: (v: AboutForm) => void; errors: AboutErrors; lastWeight: number | null;
}) {
  const set = (patch: Partial<AboutForm>) => onChange({ ...value, ...patch });
  const err = (k: keyof AboutErrors) => errors[k] && <span className="mt-1 block text-xs text-danger">{errors[k]}</span>;
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Über dich</h1>
      <p className="mt-1 text-sm text-soft">Für die Begrüßung, den Gewichtsverlauf und den BMI unter „Ich“. Leere Felder bleiben unverändert.</p>
      <div className="mt-5 grid gap-4">
        <Field label="Wie heißt du?">
          <Input value={value.name} onChange={(e) => set({ name: e.target.value })} placeholder="Vorname" autoComplete="given-name" maxLength={40} />{err("name")}
        </Field>
        <Field label="Körpergröße in cm">
          <NumberInput value={value.height} onChange={(v) => set({ height: v })} decimal={false} placeholder="180" className="tnum" />{err("height")}
        </Field>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span id="age-mode-label" className="text-sm font-medium">{value.ageMode === "age" ? "Alter in Jahren" : "Geburtsdatum"}</span>
            <div className="grid grid-cols-2 gap-0.5 rounded-lg bg-surface-2 p-0.5 text-xs font-medium" role="radiogroup" aria-labelledby="age-mode-label">
              {([["age", "Alter"], ["date", "Geburtsdatum"]] as const).map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={value.ageMode === k} onClick={() => set({ ageMode: k })}
                  className={`min-h-8 rounded-md px-2.5 ${value.ageMode === k ? "bg-surface shadow-sm" : "text-soft"}`}>{l}</button>
              ))}
            </div>
          </div>
          {value.ageMode === "age" ? (
            <NumberInput aria-label="Alter in Jahren" value={value.age} onChange={(v) => set({ age: v })} decimal={false} placeholder="z. B. 22" className="tnum" />
          ) : (
            <Input type="date" aria-label="Geburtsdatum" max={isoDate()} value={value.birthDate} onChange={(e) => set({ birthDate: e.target.value })} />
          )}
          {err(value.ageMode === "age" ? "age" : "birthDate")}
        </div>

        <Field label="Körpergewicht heute in kg" hint={lastWeight ? `Zuletzt ${fmt(lastWeight)} kg. Leer lassen, wenn sich nichts geändert hat.` : undefined}>
          <NumberInput value={value.weight} onChange={(v) => set({ weight: v })} placeholder={lastWeight ? fmt(lastWeight) : "80"} className="tnum" />{err("weight")}
        </Field>
      </div>
    </div>
  );
}
