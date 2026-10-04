import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { db, DEFAULT_SETTINGS, getSettings, requestPersistence } from "../db/db";
import { exportBackup, importBackup } from "../db/repo";
import type { Settings } from "../db/types";
import { Button, Field, Header, NumberInput, Section, Select, toast } from "../components/ui";
import { LineChart } from "../components/LineChart";
import { fmt, isoDate, niceDate, num } from "../lib/format";
import { BufferedNumber } from "./Routines";

export function Profile() {
  const settings = useLiveQuery(() => getSettings(), []);
  const weights = useLiveQuery(() => db.bodyweight.orderBy("recordedAt").toArray(), []);
  const [w, setW] = useState("");
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => { navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null)); }, []);

  if (!settings || !weights) return null;
  const save = (patch: Partial<Settings>) => db.settings.put({ ...settings, ...patch });
  const latest = weights[weights.length - 1];
  const bmi = latest && settings.heightCm ? latest.weight / (settings.heightCm / 100) ** 2 : null;

  const addWeight = async () => {
    const n = num(w);
    if (!(n > 20 && n < 400)) { toast("Trag dein Gewicht in kg ein, z. B. 82,4."); return; }
    await db.bodyweight.add({ weight: n, recordedAt: new Date().toISOString() });
    setW("");
    toast("Gewicht gespeichert");
  };

  return (
    <div>
      <Header title="Ich" />

      <Section title="Körpergewicht">
        <div className="flex gap-2">
          <NumberInput aria-label="Körpergewicht heute in kg" placeholder={latest ? `${fmt(latest.weight)} kg` : "kg"} value={w} onChange={setW} className="tnum" />
          <Button variant="primary" onClick={addWeight}>Eintragen</Button>
        </div>
        {latest && (
          <p className="mt-3 text-soft">
            Zuletzt <b className="font-display text-xl text-ink">{fmt(latest.weight)} kg</b> am {niceDate(latest.recordedAt)}
            {bmi ? `, BMI ${fmt(bmi, 1)}` : ""}
          </p>
        )}
        <div className="mt-3"><LineChart points={weights.slice(-60).map((e) => ({ date: e.recordedAt, value: e.weight }))} unit="kg" color="var(--ink)" /></div>
        {weights.length > 0 && (
          <details className="mt-2">
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-plate-ink">Einträge bearbeiten</summary>
            <ul>
              {[...weights].reverse().slice(0, 30).map((e) => (
                <li key={e.id} className="flex items-center border-b border-line py-1.5">
                  <span className="flex-1 text-sm text-soft">{niceDate(e.recordedAt)}</span>
                  <span className="w-20 tnum">{fmt(e.weight)} kg</span>
                  <button type="button" aria-label={`Eintrag vom ${niceDate(e.recordedAt)} löschen`} className="h-10 w-10 text-soft"
                    onClick={() => db.bodyweight.delete(e.id!)}>✕</button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Section>

      <Section title="Standard-Progression">
        <p className="mb-3 text-sm text-soft">Gilt für jede Übung, solange du im Plan nichts anderes festlegst. Erreichst du in einem Satz die obere Wiederholungszahl, schlägt die App beim nächsten Mal mehr Gewicht vor.</p>
        <div className="grid gap-3">
          <div className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-sm">Wiederholungen</span>
            <BufferedNumber ariaLabel="Wiederholungen von" decimal={false} value={settings.repTargetMin} onCommit={(v) => save({ repTargetMin: v ?? DEFAULT_SETTINGS.repTargetMin })} />
            <span className="text-soft">–</span>
            <BufferedNumber ariaLabel="Wiederholungen bis" decimal={false} value={settings.repTargetMax} onCommit={(v) => save({ repTargetMax: v ?? DEFAULT_SETTINGS.repTargetMax })} />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-sm">Steigerung</span>
            <BufferedNumber ariaLabel="Steigerung" value={settings.incrementValue} onCommit={(v) => save({ incrementValue: v ?? DEFAULT_SETTINGS.incrementValue })} />
            <div className="w-24"><Select aria-label="Art der Steigerung" value={settings.incrementType} onChange={(v) => save({ incrementType: v as Settings["incrementType"] })} options={[["fixed", "kg"], ["percent", "%"]]} /></div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-sm">Aufwärmen</span>
            <BufferedNumber ariaLabel="Aufwärmwert" value={settings.warmupValue} onCommit={(v) => save({ warmupValue: v ?? DEFAULT_SETTINGS.warmupValue })} />
            <div className="flex-1"><Select aria-label="Aufwärm-Schema" value={settings.warmupScheme} onChange={(v) => save({ warmupScheme: v as Settings["warmupScheme"] })}
              options={[["percent_of_working", "% vom Arbeitsgewicht"], ["fixed_weight", "kg fest"]]} /></div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-sm">Runden auf</span>
            <BufferedNumber ariaLabel="Gewichte runden auf" value={settings.weightRounding} onCommit={(v) => save({ weightRounding: v ?? DEFAULT_SETTINGS.weightRounding })} />
            <span className="text-sm text-soft">kg</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-sm">Satzpause</span>
            <BufferedNumber ariaLabel="Satzpause in Sekunden" decimal={false} value={settings.restSeconds} onCommit={(v) => save({ restSeconds: v ?? 0 })} />
            <span className="text-sm text-soft">Sek., 0 = aus</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-sm">Körpergröße</span>
            <BufferedNumber ariaLabel="Körpergröße in cm" value={settings.heightCm} onCommit={(v) => save({ heightCm: v })} />
            <span className="text-sm text-soft">cm</span>
          </div>
        </div>
      </Section>

      <Backup persisted={persisted} onPersist={async () => setPersisted(await requestPersistence())} />
    </div>
  );
}

function Backup({ persisted, onPersist }: { persisted: boolean | null; onPersist: () => void }) {
  const stats = useLiveQuery(async () => ({ sessions: await db.sessions.count(), runs: await db.runs.count() }), []);

  const download = async () => {
    const json = await exportBackup();
    const name = `satz-und-strecke-${isoDate()}.json`;
    const file = new File([json], name, { type: "application/json" });
    // Auf dem iPhone öffnet das Teilen-Menü, dort „In Dateien sichern“ wählen
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "Trainingsdaten sichern" }); return; }
      catch (e) { if ((e as Error).name === "AbortError") return; }
    }
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(file), download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const upload = async (f?: File) => {
    if (!f) return;
    if (!confirm("Die Sicherung ersetzt alle Daten auf diesem Gerät. Fortfahren?")) return;
    try { await importBackup(await f.text()); toast("Sicherung eingespielt"); }
    catch (e) { toast((e as Error).message || "Die Datei konnte nicht gelesen werden."); }
  };
  const wipe = async () => {
    if (!confirm("Wirklich alle Trainings, Pläne, Läufe und Einstellungen löschen? Das lässt sich nicht rückgängig machen.")) return;
    await db.delete();
    location.reload();
  };

  return (
    <Section title="Deine Daten">
      <p className="mb-3 text-sm text-soft">
        Alles ({stats?.sessions ?? 0} Trainings, {stats?.runs ?? 0} Läufe) liegt nur auf diesem Gerät. Sichere regelmäßig eine Datei, zum Beispiel in iCloud Drive, damit ein neues Handy oder gelöschte Website-Daten nichts kosten.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={download}>Sicherung speichern</Button>
        <label className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-lg border border-line bg-surface px-4 font-semibold">
          Sicherung laden
          <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
      </div>
      {persisted === false && (
        <Field label="Speicher" className="mt-4" hint="Fügst du die App zum Home-Bildschirm hinzu, behält iOS die Daten dauerhaft.">
          <Button className="w-full" onClick={onPersist}>Daten dauerhaft speichern</Button>
        </Field>
      )}
      <Button variant="danger" className="mt-6 w-full" onClick={wipe}>Alle Daten löschen</Button>
    </Section>
  );
}
