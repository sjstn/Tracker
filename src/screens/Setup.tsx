import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { completeSetup, loadSetupDraft, markSetupSeen, type SetupDraft, type SetupStart } from "../db/setup";
import { Button, toast } from "../components/ui";
import { StepAbout } from "../components/setup/StepAbout";
import { StepDone } from "../components/setup/StepDone";
import { StepPreset } from "../components/setup/StepPreset";
import { StepRules } from "../components/setup/StepRules";
import { StepRuns } from "../components/setup/StepRuns";
import { StepWeek } from "../components/setup/StepWeek";
import { fmtInput } from "../lib/format";
import { defaultRunForm, nameKey, type DraftRef, PRESETS, runPlanNames, uniqueNames } from "../lib/presets";
import { validateAbout, type AboutForm } from "../lib/profile";
import { back, navigate } from "../lib/router";
import { validateRunPlan } from "../lib/runTarget";

type Step = "welcome" | "about" | "rules" | "preset" | "week" | "runs" | "done";
const STEP_NO: Partial<Record<Step, number>> = { about: 1, rules: 2, preset: 3, week: 4, runs: 5 };

const aboutFrom = (d: SetupDraft): AboutForm => ({
  name: d.name ?? "", height: fmtInput(d.heightCm), ageMode: d.birthDate ? "date" : "age",
  age: fmtInput(d.age), birthDate: d.birthDate ?? "", weight: "",
});

export function Setup({ startAt }: { startAt?: string }) {
  const loaded = useLiveQuery(() => loadSetupDraft(), []);
  const [start, setStart] = useState<SetupStart | null>(null); // Stand beim Öffnen, für „Überspringen“
  const [draft, setDraft] = useState<SetupDraft | null>(null);
  const [about, setAbout] = useState<AboutForm>({ name: "", height: "", ageMode: "age", age: "", birthDate: "", weight: "" });
  const [preset, setPreset] = useState("hybrid");
  const [step, setStep] = useState<Step>(startAt === "week" ? "preset" : startAt === "done" ? "done" : "welcome");
  const [presetWeek, setPresetWeek] = useState<DraftRef[][]>([]); // Woche aus dem Preset-Schritt, für „Überspringen“
  const [trail, setTrail] = useState<Step[]>([]);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loaded || start) return;
    setStart(loaded);
    setDraft(loaded.draft);
    setAbout(aboutFrom(loaded.draft));
    setPreset(loaded.hasWeek ? "keep" : "hybrid");
  }, [loaded, start]);
  if (!start || !draft) return null;

  const go = (next: Step) => { setTrail((t) => [...t, step]); setStep(next); setTried(false); };
  const goBack = () => {
    if (!trail.length) { back("home"); return; }
    setStep(trail[trail.length - 1]);
    setTrail((t) => t.slice(0, -1));
  };
  const existingRun = (name: string) => start.runPlans.find((p) => nameKey(p.name) === nameKey(name));
  const withRunTargets = (d: SetupDraft): SetupDraft => {
    const runTargets = { ...d.runTargets };
    for (const name of runPlanNames(d.week)) runTargets[nameKey(name)] ??= defaultRunForm(name, existingRun(name));
    return { ...d, runTargets };
  };
  const finish = async (d: SetupDraft) => {
    setBusy(true);
    try { await completeSetup(d); setDraft(d); go("done"); }
    catch { toast("Konnte nicht gespeichert werden."); }
    finally { setBusy(false); }
  };
  const afterWeek = async (d: SetupDraft) => {
    const full = withRunTargets(d);
    if (runPlanNames(full.week).length) { setDraft(full); go("runs"); } else await finish(full);
  };

  const runNames = runPlanNames(draft.week);
  const aboutCheck = validateAbout(about);
  // Nur im Laufziel-Schritt prüfen: davor fehlen für neu hinzugefügte Laufarten noch die Formulare
  const runErrors = step === "runs"
    ? Object.fromEntries(runNames.map((n) => [nameKey(n), validateRunPlan({ ...draft.runTargets[nameKey(n)], name: n })]))
    : {};
  const hasErrors = (e: object) => Object.keys(e).length > 0;

  const next = async () => {
    if (busy) return;
    if (step === "welcome") go("about");
    else if (step === "about") {
      setTried(true);
      if (hasErrors(aboutCheck.errors)) { toast("Bitte die markierten Felder prüfen."); return; }
      setDraft({ ...draft, ...aboutCheck.values });
      go("rules");
    } else if (step === "rules") go("preset");
    else if (step === "preset") {
      const p = PRESETS.find((x) => x.id === preset);
      const week = (p ? p.week : start.draft.week).map((d) => [...d]);
      setPresetWeek(week);
      setDraft(withRunTargets({ ...draft, week }));
      go("week");
    } else if (step === "week") await afterWeek(draft);
    else if (step === "runs") {
      setTried(true);
      if (Object.values(runErrors).some(hasErrors)) { toast("Bitte die markierten Felder prüfen."); return; }
      await finish(draft);
    } else navigate("home", true);
  };
  const skip = async () => {
    if (busy) return;
    if (step === "about") {
      setAbout(aboutFrom(start.draft));
      setDraft({ ...draft, name: start.draft.name, heightCm: start.draft.heightCm, age: start.draft.age, birthDate: start.draft.birthDate, weightKg: null });
      go("rules");
    } else if (step === "rules") { setDraft({ ...draft, progression: start.draft.progression }); go("preset"); }
    else if (step === "week") await afterWeek({ ...draft, week: presetWeek.map((d) => [...d]), shiftMode: start.draft.shiftMode });
    else if (step === "runs") await finish(withRunTargets({ ...draft, runTargets: start.draft.runTargets }));
  };
  const later = async () => {
    try { await markSetupSeen(); } catch { /* nicht schlimm, Assistent erscheint dann erneut */ }
    navigate("home", true);
  };

  const no = STEP_NO[step];
  const labels: Record<Step, string> = {
    welcome: "Los geht's", about: "Weiter", rules: "Passt so", preset: "Weiter",
    week: runNames.length ? "Weiter" : "Fertig", runs: "Fertig", done: "Zur Startseite",
  };
  const canSkip = step === "about" || step === "rules" || step === "week" || step === "runs";
  const known = {
    routines: uniqueNames([...start.routines.map((r) => r.name), ...draft.week.flat().filter((r) => r.kind === "routine").map((r) => r.name)]),
    runPlans: uniqueNames([...start.runPlans.map((r) => r.name), ...draft.week.flat().filter((r) => r.kind === "runPlan").map((r) => r.name)]),
  };

  return (
    <div className="flex min-h-full flex-col pt-4">
      {step !== "done" && (
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Zurück" disabled={busy} onClick={goBack}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-2xl text-soft hover:bg-surface-2">‹</button>
          {no !== undefined ? (
            <>
              <div className="h-1.5 flex-1 rounded-full bg-surface-2" role="progressbar" aria-label="Fortschritt" aria-valuemin={1} aria-valuemax={5} aria-valuenow={no}>
                <div className="h-1.5 rounded-full bg-plate transition-all" style={{ width: `${no * 20}%` }} />
              </div>
              <span className="w-8 text-right text-xs text-soft tnum">{no}/5</span>
            </>
          ) : <div className="flex-1" />}
        </div>
      )}
      <div className="flex-1 pt-4">
        {step === "welcome" && <Welcome />}
        {step === "about" && <StepAbout value={about} onChange={setAbout} errors={tried ? aboutCheck.errors : {}} lastWeight={start.lastWeight} />}
        {step === "rules" && <StepRules value={draft.progression} onChange={(progression) => setDraft({ ...draft, progression })} />}
        {step === "preset" && <StepPreset value={preset} onChange={setPreset} currentWeek={start.hasWeek ? start.draft.week : null} />}
        {step === "week" && (
          <StepWeek week={draft.week} onChange={(week) => setDraft({ ...draft, week })} mode={draft.shiftMode}
            onMode={(shiftMode) => setDraft({ ...draft, shiftMode })} routines={known.routines} runPlans={known.runPlans} />
        )}
        {step === "runs" && <StepRuns names={runNames} value={draft.runTargets} onChange={(runTargets) => setDraft({ ...draft, runTargets })} errors={tried ? runErrors : {}} />}
        {step === "done" && <StepDone week={draft.week} name={draft.name} />}
      </div>
      <div className="sticky bottom-0 grid gap-1 bg-bg pt-3" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}>
        <Button variant="plate" disabled={busy} onClick={next}>{labels[step]}</Button>
        {step === "welcome" && <button type="button" onClick={later} className="min-h-11 text-sm font-semibold text-soft">Später</button>}
        {canSkip && <button type="button" disabled={busy} onClick={skip} className="min-h-11 text-sm font-semibold text-soft">Überspringen</button>}
      </div>
    </div>
  );
}

function Welcome() {
  return (
    <div className="pt-12 text-center">
      <div aria-hidden className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-tint text-3xl ring-1 ring-plate/30">🏋️</div>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">Willkommen bei Tracker</h1>
      <p className="mt-3 text-sm text-soft">In zwei Minuten eingerichtet: ein paar Angaben zu dir, deine Trainingsregeln und deine Woche. Danach schlägt dir die App jeden Tag das passende Training vor.</p>
      <p className="mt-4 text-xs text-soft">Alle Daten bleiben auf diesem Gerät.</p>
    </div>
  );
}
