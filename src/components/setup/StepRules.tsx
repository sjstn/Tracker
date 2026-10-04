import type { ProgressionFields } from "../../db/types";
import { fmt } from "../../lib/format";
import { BufferedNumber } from "../../screens/Routines";
import { Card, Select } from "../ui";

export function StepRules({ value, onChange }: { value: ProgressionFields; onChange: (v: ProgressionFields) => void }) {
  const set = (patch: Partial<ProgressionFields>) => onChange({ ...value, ...patch });
  const next = value.incrementType === "fixed" ? 80 + value.incrementValue : Math.round((80 * (1 + value.incrementValue / 100)) / 2.5) * 2.5;
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Deine Trainingsregeln</h1>
      <p className="mt-1 text-sm text-soft">Erreichst du in einem Satz die obere Wiederholungszahl, schlägt die App beim nächsten Mal mehr Gewicht vor. Gilt für jede Übung, solange ein Plan nichts anderes festlegt.</p>
      <Card className="mt-4 grid gap-3 p-4">
        <div className="flex items-center gap-2">
          <span className="w-28 shrink-0 text-sm">Wiederholungen</span>
          <BufferedNumber ariaLabel="Wiederholungen von" decimal={false} value={value.repTargetMin}
            onCommit={(v) => { if (v && v >= 1 && v <= value.repTargetMax) set({ repTargetMin: v }); }} />
          <span className="text-soft">–</span>
          <BufferedNumber ariaLabel="Wiederholungen bis" decimal={false} value={value.repTargetMax}
            onCommit={(v) => { if (v && v >= value.repTargetMin) set({ repTargetMax: v }); }} />
        </div>
        <div className="flex items-center gap-2">
          <span className="w-28 shrink-0 text-sm">Steigerung</span>
          <BufferedNumber ariaLabel="Steigerung" value={value.incrementValue} onCommit={(v) => { if (v && v > 0) set({ incrementValue: v }); }} />
          <div className="w-24"><Select aria-label="Art der Steigerung" value={value.incrementType}
            onChange={(v) => set({ incrementType: v as ProgressionFields["incrementType"] })} options={[["fixed", "kg"], ["percent", "%"]]} /></div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-28 shrink-0 text-sm">Aufwärmen</span>
          <BufferedNumber ariaLabel="Aufwärmwert" value={value.warmupValue} onCommit={(v) => { if (v && v > 0) set({ warmupValue: v }); }} />
          <div className="flex-1"><Select aria-label="Aufwärm-Schema" value={value.warmupScheme}
            onChange={(v) => set({ warmupScheme: v as ProgressionFields["warmupScheme"] })}
            options={[["percent_of_working", "% vom Arbeitsgewicht"], ["fixed_weight", "kg fest"]]} /></div>
        </div>
      </Card>
      <p className="mt-3 rounded-lg bg-tint p-3 text-sm ring-1 ring-plate/20">
        <b>Beispiel:</b> Bankdrücken 80 kg × {value.repTargetMax} → nächstes Mal {fmt(next, 2)} kg.
        {" "}Bei weniger Wiederholungen bleibt das Gewicht.
      </p>
    </div>
  );
}
