import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { db, DEFAULT_SETTINGS, getSettings, requestPersistence } from "../db/db";
import { exportBackup, importBackup } from "../db/repo";
import { clearPlanUndo, ensureHorizon } from "../db/schedule";
import type { Settings } from "../db/types";
import { Button, Card, Field, Header, Input, NumberInput, Section, Select, toast } from "../components/ui";
import { LineChart } from "../components/LineChart";
import { ageFromBirthDate, birthYearFromAge, currentAge } from "../lib/profile";
import { navigate } from "../lib/router";
import { ACCENTS, THEMES } from "../lib/appearance";
import { fmt, isoDate, niceDate, num } from "../lib/format";
import { BufferedNumber, BufferedText } from "./Routines";

export function Profile() {
  const settings = useLiveQuery(() => getSettings(), []);
  const weights = useLiveQuery(() => db.bodyweight.orderBy("recordedAt").toArray(), []);
  const running = useLiveQuery(async () => !!(await db.drafts.get("current")), []);
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

      <Section title="Über dich">
        <Card className="grid gap-3 p-4">
          <BufferedText label="Name" value={settings.name ?? ""} onCommit={(v) => save({ name: v.trim().slice(0, 40) || null })} />
          <div className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-sm">Alter</span>
            <BufferedNumber ariaLabel="Alter in Jahren" decimal={false} value={currentAge(settings)} onCommit={(v) => {
              if (v !== null && (v < 10 || v > 100)) { toast("Trag ein Alter zwischen 10 und 100 ein."); return; }
              // Ein reines Alter ersetzt ein gespeichertes Geburtsdatum
              save({ birthYear: v === null ? null : birthYearFromAge(v), birthDate: null });
            }} />
            <span className="text-sm text-soft">Jahre</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-sm">oder Geburtstag</span>
            <Input type="date" aria-label="Geburtsdatum" max={isoDate()} value={settings.birthDate ?? ""} className="flex-1" onChange={(e) => {
              const v = e.target.value;
              if (!v) { save({ birthDate: null }); return; }
              const age = ageFromBirthDate(v);
              if (v > isoDate() || age < 10 || age > 100) { toast("Das Geburtsdatum passt nicht (Alter 10 bis 100)."); return; }
              save({ birthDate: v, birthYear: Number(v.slice(0, 4)) });
            }} />
          </div>
        </Card>
      </Section>

      <Section title="Darstellung">
        <Card className="divide-y divide-line">
          <div className="p-4">
            <span id="accent-label" className="text-sm font-medium">Akzentfarbe</span>
            <div className="mt-2 grid grid-cols-4 gap-2" role="radiogroup" aria-labelledby="accent-label">
              {ACCENTS.map(([key, label, hex]) => {
                const on = settings.accent === key;
                return (
                  <button key={key} type="button" role="radio" aria-checked={on} onClick={() => save({ accent: key })}
                    className={`flex flex-col items-center gap-1.5 rounded-lg py-2 ${on ? "bg-surface-2 ring-1 ring-line" : ""}`}>
                    <span className="flex h-9 w-9 items-center justify-center rounded-full text-white"
                      style={{ background: hex, boxShadow: on ? `0 0 0 2px var(--surface), 0 0 0 4px ${hex}` : undefined }}>
                      {on && <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0z" clipRule="evenodd" /></svg>}
                    </span>
                    <span className={`text-xs font-medium ${on ? "" : "text-soft"}`}>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="p-4">
            <span id="theme-label" className="text-sm font-medium">Hell / Dunkel</span>
            <div className="mt-2 grid grid-cols-3 gap-0.5 rounded-lg bg-surface-2 p-0.5 text-sm font-medium" role="radiogroup" aria-labelledby="theme-label">
              {THEMES.map(([key, label]) => (
                <button key={key} type="button" role="radio" aria-checked={settings.theme === key} onClick={() => save({ theme: key })}
                  className={`min-h-10 rounded-md ${settings.theme === key ? "bg-surface shadow-sm" : "text-soft"}`}>{label}</button>
              ))}
            </div>
          </div>
        </Card>
      </Section>

      <Section title="Einrichtung">
        <Card className="flex items-center gap-3 p-4">
          <p className="flex-1 text-sm text-soft">Größe, Trainingsregeln und Woche Schritt für Schritt einstellen.</p>
          <Button disabled={!!running} onClick={() => navigate("setup")}>Starten</Button>
        </Card>
        {running && <p className="mt-1.5 text-xs text-soft">Geht, sobald das laufende Training beendet ist.</p>}
        <Card className="mt-2 flex items-center gap-3 p-4">
          <p className="flex-1 text-sm text-soft">Kurz erklärt: Pläne anlegen, Übungen hinzufügen und verschieben, Woche planen.</p>
          <Button onClick={() => navigate("tour?from=profile")}>Einführung</Button>
        </Card>
      </Section>

      <Section title="Körpergewicht">
        <div className="flex gap-2">
          <NumberInput aria-label="Körpergewicht heute in kg" placeholder={latest ? `${fmt(latest.weight)} kg` : "kg"} value={w} onChange={setW} className="tnum" />
          <Button variant="primary" onClick={addWeight}>Eintragen</Button>
        </div>
        {latest && (
          <p className="mt-3 text-sm text-soft">
            Zuletzt <b className="font-semibold text-ink">{fmt(latest.weight)} kg</b> am {niceDate(latest.recordedAt)}
            {bmi ? `, BMI ${fmt(bmi, 1)}` : ""}
          </p>
        )}
        <Card className="mt-3 p-3"><LineChart points={weights.slice(-60).map((e) => ({ date: e.recordedAt, value: e.weight }))} unit="kg" /></Card>
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
        <Card className="grid gap-3 p-4">
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
        </Card>
      </Section>

      <Backup persisted={persisted} onPersist={async () => setPersisted(await requestPersistence())} />
    </div>
  );
}

function Backup({ persisted, onPersist }: { persisted: boolean | null; onPersist: () => void }) {
  const stats = useLiveQuery(async () => ({ sessions: await db.sessions.count(), runs: await db.runs.count() }), []);

  const download = async () => {
    const json = await exportBackup();
    const name = `tracker-${isoDate()}.json`;
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
    try { await importBackup(await f.text()); clearPlanUndo(); await ensureHorizon(); toast("Sicherung eingespielt"); }
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
        <label className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-lg border border-line bg-surface px-4 text-sm font-semibold shadow-sm">
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
