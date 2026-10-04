# Einrichtungs-Assistent – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Assistent führt neue Nutzer in fünf Schritten durch Größe/Alter/Gewicht, Trainingsregeln und eine Woche aus einer Vorlage; bestehende Installationen ohne Woche bekommen eine Karte, die direkt zur Wochen-Einrichtung führt.

**Architecture:** Vorlagen und die Zuordnung von Namen zu vorhandenen Plänen sind reine Funktionen in `src/lib/presets.ts`; Alters- und Eingabeprüfung in `src/lib/profile.ts`. `src/db/setup.ts` lädt den Ausgangsstand und speichert den fertigen Entwurf in einer Transaktion (`completeSetup`), wobei die Woche über das bestehende `saveWeekSetup` geplant wird. Der Bildschirm `src/screens/Setup.tsx` hält den Entwurf im Arbeitsspeicher und rendert je Schritt eine Komponente aus `src/components/setup/`.

**Tech Stack:** React 19, TypeScript (strict, `noUnusedLocals`), Vite, Tailwind 4, Dexie 4 + dexie-react-hooks, Vitest + fake-indexeddb.

**Spec:** `docs/superpowers/specs/2026-10-04-einrichtungsassistent-design.md`

## Global Constraints

- Lokale PWA für eine Person, kein Server, kein Konto; Hash-Routing; keine neue Dexie-Version.
- Neue `Settings`-Felder: `birthYear: number | null` (Standard `null`), `setupSeen: boolean` (Standard `false`), `weekCardHidden: boolean` (Standard `false`).
- Alter wird als Geburtsjahr gespeichert: `birthYear = aktuelles Jahr − Alter`; angezeigt immer als Alter.
- Gültige Eingaben: Größe 100–250 cm, Alter 10–100, Gewicht 20–400 kg; leere Felder = nicht ändern.
- Namen gelten als gleich ohne Groß-/Kleinschreibung und ohne Leerzeichen am Rand (`nameKey`).
- Gespeichert wird erst bei „Fertig“ in einer Transaktion; Abbrechen ändert nichts (Ausnahme „Später“ setzt `setupSeen`).
- Automatischer Start nur, wenn `setupSeen` falsch ist **und** die App leer ist.
- Laufziele: Dauer in Minuten, Pace in min/km (`m:ss`, Komma/Punkt erlaubt); intern Sekunden.
- Texte auf Deutsch, Stil wie bisher (Karten, `text-soft`, `text-plate-ink`, `Button`/`Card` aus `src/components/ui.tsx`).
- Tests: `npm test`, Typen: `npm run typecheck`, Build: `npm run build`.
- Commit-Nachrichten enden mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nie `tsconfig.tsbuildinfo`, `.idea/`, `.playwright-mcp/`, `.superpowers/` stagen.

## Review Focus

- **Bestehende Daten mit Inhalt:** Der Assistent darf bei einer App mit Trainings/Plänen nicht automatisch starten (Test `isAppEmpty` in Task 3, Browserprüfung in Task 5).
- **Erneuter Durchlauf:** Zweimal „Fertig“ legt keine Pläne oder Laufarten doppelt an, ein vorhandener Kraftplan behält seine Übungen (Test in Task 3).
- **Gleicher Name, andere Schreibweise:** „push“ in der Datenbank und „Push“ in der Vorlage sind derselbe Plan (Test in Task 2 und 3).
- **Ungültiges Laufziel im Entwurf:** fällt beim Speichern auf das Standardziel zurück statt zu scheitern (Test in Task 3).
- **Abbrechen mittendrin:** Zurück aus Schritt 1 nach Eingabe einer Größe speichert nichts (Browserprüfung in Task 5).

---

## Dateiübersicht

| Datei | Aufgabe |
|---|---|
| `src/db/types.ts`, `src/db/db.ts` | neue Settings-Felder, Standardwerte, Absicherung in `getSettings` |
| `src/lib/profile.ts` (neu) | Alter ↔ Geburtsjahr, `validateAbout` |
| `src/lib/presets.ts` (neu) | Vorlagen, Standard-Laufziele, Namensabgleich |
| `src/db/setup.ts` (neu) | `loadSetupDraft`, `completeSetup`, `isAppEmpty`, `markSetupSeen`, `hideWeekCard` |
| `src/components/setup/*.tsx` (neu) | Schritt-Komponenten, Karte „Woche einrichten?“ |
| `src/screens/Setup.tsx` (neu) | Ablauf des Assistenten |
| `src/App.tsx`, `src/screens/Home.tsx`, `src/screens/Profile.tsx`, `src/components/plan/WeekTemplateEditor.tsx` | Einbindung |

---

### Task 1: Settings-Felder, Alter und Eingabeprüfung

**Files:**
- Create: `src/lib/profile.ts`, `src/lib/profile.test.ts`, `src/db/settings.test.ts`
- Modify: `src/db/types.ts`, `src/db/db.ts`

**Interfaces:**
- Produces:

```ts
// src/db/types.ts – Settings
birthYear: number | null;
setupSeen: boolean;
weekCardHidden: boolean;
// src/lib/profile.ts
export function birthYearFromAge(age: number, now?: Date): number;
export function ageFromBirthYear(birthYear: number | null, now?: Date): number | null;
export interface AboutForm { height: string; age: string; weight: string }
export type AboutErrors = Partial<Record<keyof AboutForm, string>>;
export interface AboutValues { heightCm: number | null; age: number | null; weightKg: number | null }
export function validateAbout(f: AboutForm): { values: AboutValues; errors: AboutErrors };
```

- [ ] **Step 1: Failing tests schreiben**

```ts
// src/lib/profile.test.ts
import { describe, expect, it } from "vitest";
import { ageFromBirthYear, birthYearFromAge, validateAbout } from "./profile";

const now = new Date(2026, 9, 4);

describe("Alter", () => {
  it("rechnet zwischen Alter und Geburtsjahr", () => {
    expect(birthYearFromAge(35, now)).toBe(1991);
    expect(ageFromBirthYear(1991, now)).toBe(35);
    expect(ageFromBirthYear(null, now)).toBeNull();
  });
});

describe("validateAbout", () => {
  it("liest gültige Werte mit Komma", () => {
    expect(validateAbout({ height: "182", age: "35", weight: "82,4" })).toEqual({
      values: { heightCm: 182, age: 35, weightKg: 82.4 }, errors: {},
    });
  });

  it("leere Felder bedeuten nicht ändern", () => {
    expect(validateAbout({ height: "", age: " ", weight: "" })).toEqual({
      values: { heightCm: null, age: null, weightKg: null }, errors: {},
    });
  });

  it("erklärt Werte außerhalb der Grenzen", () => {
    const { errors } = validateAbout({ height: "50", age: "5", weight: "500" });
    expect(errors.height).toContain("100");
    expect(errors.age).toContain("10");
    expect(errors.weight).toContain("20");
    expect(validateAbout({ height: "abc", age: "", weight: "" }).errors.height).toBeTruthy();
  });
});
```

```ts
// src/db/settings.test.ts
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { AppDB, DEFAULT_SETTINGS, getSettings } from "./db";

describe("Einstellungen für den Assistenten", () => {
  it("haben Standardwerte, auch bei alten Einträgen", async () => {
    const db = new AppDB("settings-" + Math.random());
    await db.open();
    await db.settings.put({ ...DEFAULT_SETTINGS, birthYear: undefined, setupSeen: undefined, weekCardHidden: "ja" } as never);
    const s = await getSettings(db);
    expect(s.birthYear).toBeNull();
    expect(s.setupSeen).toBe(false);
    expect(s.weekCardHidden).toBe(false);
  });

  it("geben nie das geteilte Standard-Array der Musterwoche zurück", async () => {
    const db = new AppDB("settings-" + Math.random());
    await db.open();
    const s = await getSettings(db);
    s.weekTemplate[0].push({ kind: "routine", id: 1 });
    expect(DEFAULT_SETTINGS.weekTemplate[0]).toEqual([]);
  });
});
```

- [ ] **Step 2: Tests laufen lassen, sie müssen scheitern**

Run: `npx vitest run src/lib/profile.test.ts src/db/settings.test.ts`
Expected: FAIL (`./profile` fehlt; `s.birthYear` ist `undefined`)

- [ ] **Step 3: Umsetzung**

In `src/db/types.ts`, `Settings` nach `shiftMode: ShiftMode;`:

```ts
  /** Aus dem Alter berechnet, damit es nicht veraltet */
  birthYear: number | null;
  /** Assistent wurde mit „Fertig“ oder „Später“ verlassen */
  setupSeen: boolean;
  /** Karte „Woche einrichten?“ wurde weggeklickt */
  weekCardHidden: boolean;
```

In `src/db/db.ts`, `DEFAULT_SETTINGS` nach `shiftMode: "continuous",`:

```ts
  birthYear: null,
  setupSeen: false,
  weekCardHidden: false,
```

`getSettings` ersetzen:

```ts
export async function getSettings(database: AppDB = db): Promise<Settings> {
  const s = { ...DEFAULT_SETTINGS, ...((await database.settings.get("profile")) ?? {}) };
  // Eigene Arrays, damit niemand versehentlich die Standardwerte verändert
  s.weekTemplate = Array.isArray(s.weekTemplate) && s.weekTemplate.length === 7 && s.weekTemplate.every(Array.isArray)
    ? s.weekTemplate.map((d) => [...d])
    : DEFAULT_SETTINGS.weekTemplate.map(() => []);
  if (s.shiftMode !== "fixedWeek") s.shiftMode = "continuous";
  if (typeof s.birthYear !== "number") s.birthYear = null;
  s.setupSeen = s.setupSeen === true;
  s.weekCardHidden = s.weekCardHidden === true;
  return s;
}
```

```ts
// src/lib/profile.ts
import { num } from "./format";

export const birthYearFromAge = (age: number, now = new Date()) => now.getFullYear() - age;
export const ageFromBirthYear = (birthYear: number | null, now = new Date()) =>
  birthYear === null ? null : now.getFullYear() - birthYear;

export interface AboutForm { height: string; age: string; weight: string }
export type AboutErrors = Partial<Record<keyof AboutForm, string>>;
export interface AboutValues { heightCm: number | null; age: number | null; weightKg: number | null }

const RANGES: Record<keyof AboutForm, [number, number, string]> = {
  height: [100, 250, "Größe zwischen 100 und 250 cm, z. B. 180."],
  age: [10, 100, "Alter zwischen 10 und 100 Jahren."],
  weight: [20, 400, "Gewicht zwischen 20 und 400 kg, z. B. 82,4."],
};

/** Leere Felder = nicht ändern; sonst muss der Wert im Bereich liegen. */
export function validateAbout(f: AboutForm): { values: AboutValues; errors: AboutErrors } {
  const errors: AboutErrors = {};
  const read = (k: keyof AboutForm): number | null => {
    if (!f[k].trim()) return null;
    const n = num(f[k]);
    const [min, max, msg] = RANGES[k];
    if (!(n >= min && n <= max)) { errors[k] = msg; return null; }
    return n;
  };
  const values = { heightCm: read("height"), age: read("age"), weightKg: read("weight") };
  if (values.age !== null) values.age = Math.round(values.age);
  return { values, errors };
}
```

- [ ] **Step 4: Alle Tests und Typen prüfen**

Run: `npm test && npm run typecheck`
Expected: alle Tests PASS (inkl. 5 neue), Typecheck ohne Fehler

- [ ] **Step 5: Commit**

```bash
git add src/db/types.ts src/db/db.ts src/lib/profile.ts src/lib/profile.test.ts src/db/settings.test.ts
git commit -m "Einstellungen für den Assistenten, Alter und Eingabeprüfung

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Vorlagen und Namensabgleich

**Files:**
- Create: `src/lib/presets.ts`, `src/lib/presets.test.ts`

**Interfaces:**
- Consumes: `formFromRunPlan`, `RunPlanForm` (`src/lib/runTarget.ts`); `RunPlan`, `TrainingRef` (`src/db/types.ts`)
- Produces:

```ts
export type DraftRef = { kind: "routine"; name: string } | { kind: "runPlan"; name: string };
export interface Preset { id: string; name: string; description: string; week: DraftRef[][] }
export const PRESETS: Preset[];                       // ids: hybrid, ppl, fullbody, running, empty
export const RUN_DEFAULTS: Record<string, Pick<RunPlan, "targetKind" | "targetValue" | "paceMin" | "paceMax">>; // Schlüssel = nameKey
export const nameKey: (s: string) => string;
export function uniqueNames(names: string[]): string[];
export function missingNames(week: DraftRef[][], routines: { name: string }[], runPlans: { name: string }[]): { routines: string[]; runPlans: string[] };
export function runPlanNames(week: DraftRef[][]): string[];
export function toTemplate(week: DraftRef[][], routineIds: Map<string, number>, runPlanIds: Map<string, number>): TrainingRef[][];
export function weekFromTemplate(template: TrainingRef[][], routines: { id?: number; name: string }[], runPlans: { id?: number; name: string }[]): DraftRef[][];
export function defaultRunForm(name: string, existing?: RunPlan): RunPlanForm;
```

- [ ] **Step 1: Failing test schreiben**

```ts
// src/lib/presets.test.ts
import { describe, expect, it } from "vitest";
import {
  defaultRunForm, missingNames, nameKey, PRESETS, RUN_DEFAULTS, runPlanNames, toTemplate, weekFromTemplate, type DraftRef,
} from "./presets";

const R = (name: string): DraftRef => ({ kind: "routine", name });
const L = (name: string): DraftRef => ({ kind: "runPlan", name });
const hybrid = PRESETS.find((p) => p.id === "hybrid")!.week;

describe("Vorlagen", () => {
  it("haben je sieben Tage und eindeutige IDs", () => {
    expect(PRESETS.map((p) => p.id)).toEqual(["hybrid", "ppl", "fullbody", "running", "empty"]);
    PRESETS.forEach((p) => expect(p.week).toHaveLength(7));
  });

  it("jede Laufart in einer Vorlage hat ein Standardziel", () => {
    PRESETS.flatMap((p) => p.week.flat()).filter((r) => r.kind === "runPlan")
      .forEach((r) => expect(RUN_DEFAULTS[nameKey(r.name)]).toBeTruthy());
  });

  it("Hybrid entspricht der Beispielwoche", () => {
    expect(hybrid).toEqual([[L("Zone 2")], [R("Push")], [L("Longrun")], [R("Pull"), L("Z2 kurz")], [], [L("Intervall")], [R("Beine")]]);
  });
});

describe("Namensabgleich", () => {
  it("verwendet vorhandene Namen ohne Rücksicht auf Schreibweise", () => {
    expect(missingNames(hybrid, [{ name: " push " }], [{ name: "ZONE 2" }])).toEqual({
      routines: ["Pull", "Beine"], runPlans: ["Longrun", "Z2 kurz", "Intervall"],
    });
  });

  it("listet Laufarten der Woche einmal in Reihenfolge", () => {
    expect(runPlanNames([[L("Zone 2")], [L("zone 2")], [L("Longrun")], [], [], [], []])).toEqual(["Zone 2", "Longrun"]);
  });

  it("toTemplate setzt IDs ein und lässt Unbekanntes weg", () => {
    expect(toTemplate([[R("Push")], [L("x")], [], [], [], [], []], new Map([["push", 1]]), new Map()))
      .toEqual([[{ kind: "routine", id: 1 }], [], [], [], [], [], []]);
  });

  it("weekFromTemplate übersetzt IDs in Namen", () => {
    const tpl = [[{ kind: "routine" as const, id: 1 }], [{ kind: "runPlan" as const, id: 5 }, { kind: "routine" as const, id: 9 }], [], [], [], [], []];
    expect(weekFromTemplate(tpl, [{ id: 1, name: "Push" }], [{ id: 5, name: "Zone 2" }]))
      .toEqual([[R("Push")], [L("Zone 2")], [], [], [], [], []]);
  });
});

describe("defaultRunForm", () => {
  it("nimmt bestehende Laufart, sonst Standardziel, sonst 45 min", () => {
    expect(defaultRunForm("Longrun")).toEqual({ name: "Longrun", targetKind: "distance", target: "15", paceFrom: "6:15", paceTo: "6:45" });
    expect(defaultRunForm("Bergläufe")).toEqual({ name: "Bergläufe", targetKind: "duration", target: "45", paceFrom: "", paceTo: "" });
    expect(defaultRunForm("Zone 2", { id: 3, name: "Zone 2", targetKind: "duration", targetValue: 3600, paceMin: null, paceMax: null, order: 0 }))
      .toMatchObject({ target: "60", paceFrom: "" });
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss scheitern**

Run: `npx vitest run src/lib/presets.test.ts`
Expected: FAIL, `Failed to resolve import "./presets"`

- [ ] **Step 3: Umsetzung**

```ts
// src/lib/presets.ts
import type { RunPlan, TrainingRef } from "../db/types";
import { formFromRunPlan, type RunPlanForm } from "./runTarget";

/** Training im Entwurf des Assistenten, über den Namen statt über eine ID. */
export type DraftRef = { kind: "routine"; name: string } | { kind: "runPlan"; name: string };
export interface Preset { id: string; name: string; description: string; week: DraftRef[][] }

const R = (name: string): DraftRef => ({ kind: "routine", name });
const L = (name: string): DraftRef => ({ kind: "runPlan", name });

export const PRESETS: Preset[] = [
  { id: "hybrid", name: "Hybrid", description: "Kraft und Laufen im Wechsel",
    week: [[L("Zone 2")], [R("Push")], [L("Longrun")], [R("Pull"), L("Z2 kurz")], [], [L("Intervall")], [R("Beine")]] },
  { id: "ppl", name: "Push / Pull / Beine", description: "3× Kraft",
    week: [[R("Push")], [], [R("Pull")], [], [R("Beine")], [], []] },
  { id: "fullbody", name: "Ganzkörper + Laufen", description: "3× Kraft, 2× locker laufen",
    week: [[R("Ganzkörper A")], [L("Zone 2")], [R("Ganzkörper B")], [], [R("Ganzkörper A")], [L("Zone 2")], []] },
  { id: "running", name: "Nur Laufen", description: "4 Läufe pro Woche",
    week: [[L("Zone 2")], [], [L("Intervall")], [], [L("Zone 2")], [], [L("Longrun")]] },
  { id: "empty", name: "Leer", description: "Selbst zusammenstellen", week: [[], [], [], [], [], [], []] },
];

export const nameKey = (s: string) => s.trim().toLocaleLowerCase("de-DE");

export const RUN_DEFAULTS: Record<string, Pick<RunPlan, "targetKind" | "targetValue" | "paceMin" | "paceMax">> = {
  "zone 2": { targetKind: "duration", targetValue: 45 * 60, paceMin: 390, paceMax: 420 },
  "z2 kurz": { targetKind: "duration", targetValue: 20 * 60, paceMin: 390, paceMax: 420 },
  longrun: { targetKind: "distance", targetValue: 15, paceMin: 375, paceMax: 405 },
  intervall: { targetKind: "distance", targetValue: 8, paceMin: 270, paceMax: 290 },
};

/** Entfernt doppelte Namen (Schreibweise egal), die erste Schreibweise gewinnt. */
export function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.filter((n) => { const k = nameKey(n); if (!k || seen.has(k)) return false; seen.add(k); return true; });
}

const namesOf = (week: DraftRef[][], kind: DraftRef["kind"]) => uniqueNames(week.flat().filter((r) => r.kind === kind).map((r) => r.name));

export const runPlanNames = (week: DraftRef[][]) => namesOf(week, "runPlan");

/** Namen aus der Woche, die es als Kraftplan bzw. Laufart noch nicht gibt. */
export function missingNames(week: DraftRef[][], routines: { name: string }[], runPlans: { name: string }[]) {
  const have = (list: { name: string }[]) => new Set(list.map((x) => nameKey(x.name)));
  const r = have(routines), l = have(runPlans);
  return {
    routines: namesOf(week, "routine").filter((n) => !r.has(nameKey(n))),
    runPlans: namesOf(week, "runPlan").filter((n) => !l.has(nameKey(n))),
  };
}

export function toTemplate(week: DraftRef[][], routineIds: Map<string, number>, runPlanIds: Map<string, number>): TrainingRef[][] {
  return week.map((day) => day.flatMap((r): TrainingRef[] => {
    const id = (r.kind === "routine" ? routineIds : runPlanIds).get(nameKey(r.name));
    return id === undefined ? [] : [{ kind: r.kind, id }];
  }));
}

export function weekFromTemplate(template: TrainingRef[][], routines: { id?: number; name: string }[], runPlans: { id?: number; name: string }[]): DraftRef[][] {
  const r = new Map(routines.map((x) => [x.id, x.name]));
  const l = new Map(runPlans.map((x) => [x.id, x.name]));
  return template.map((day) => day.flatMap((ref): DraftRef[] => {
    const name = (ref.kind === "routine" ? r : l).get(ref.id);
    return name === undefined ? [] : [{ kind: ref.kind, name }];
  }));
}

/** Formular für eine Laufart: vorhandene Werte, sonst Standardziel, sonst 45 min ohne Pace. */
export function defaultRunForm(name: string, existing?: RunPlan): RunPlanForm {
  if (existing) return formFromRunPlan(existing);
  const d = RUN_DEFAULTS[nameKey(name)];
  if (d) return formFromRunPlan({ ...d, name, order: 0 });
  return { name, targetKind: "duration", target: "45", paceFrom: "", paceTo: "" };
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test && npm run typecheck`
Expected: PASS (8 neue Tests), Typecheck ohne Fehler

- [ ] **Step 5: Commit**

```bash
git add src/lib/presets.ts src/lib/presets.test.ts
git commit -m "Vorlagen für die Woche und Namensabgleich

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Ausgangsstand laden und Einrichtung speichern

**Files:**
- Create: `src/db/setup.ts`, `src/db/setup.test.ts`

**Interfaces:**
- Consumes: Task 1, Task 2; `saveWeekSetup` (`src/db/schedule.ts`); `progressionDefaults` (`src/lib/progression.ts`); `validateRunPlan`, `runPlanFromForm`, `formFromRunPlan` (`src/lib/runTarget.ts`)
- Produces:

```ts
export interface SetupDraft {
  heightCm: number | null; age: number | null; weightKg: number | null;
  progression: ProgressionFields; week: DraftRef[][]; shiftMode: ShiftMode;
  runTargets: Record<string, RunPlanForm>; // Schlüssel = nameKey
}
export interface SetupStart { draft: SetupDraft; routines: Routine[]; runPlans: RunPlan[]; hasWeek: boolean; lastWeight: number | null }
export async function loadSetupDraft(database?: AppDB): Promise<SetupStart>;
export async function completeSetup(draft: SetupDraft, today?: string, database?: AppDB): Promise<void>;
export async function isAppEmpty(database?: AppDB): Promise<boolean>;
export async function markSetupSeen(database?: AppDB): Promise<void>;
export async function hideWeekCard(database?: AppDB): Promise<void>;
```

- [ ] **Step 1: Failing test schreiben**

```ts
// src/db/setup.test.ts
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { AppDB, getSettings } from "./db";
import { completeSetup, hideWeekCard, isAppEmpty, loadSetupDraft, markSetupSeen, type SetupDraft } from "./setup";
import { PRESETS } from "../lib/presets";
import { addDays } from "../lib/days";
import { isoDate } from "../lib/format";

async function freshDb() { const d = new AppDB("setup-" + Math.random()); await d.open(); return d; }
const hybrid = PRESETS.find((p) => p.id === "hybrid")!.week;
async function draftFor(db: AppDB, patch: Partial<SetupDraft> = {}): Promise<SetupDraft> {
  return { ...(await loadSetupDraft(db)).draft, ...patch };
}

describe("Assistent speichern", () => {
  it("isAppEmpty erkennt eine frische App", async () => {
    const db = await freshDb();
    expect(await isAppEmpty(db)).toBe(true);
    await db.bodyweight.add({ weight: 80, recordedAt: new Date().toISOString() });
    expect(await isAppEmpty(db)).toBe(false);
  });

  it("legt Einstellungen, Gewicht, Pläne, Laufarten und 14 Plan-Tage an", async () => {
    const db = await freshDb();
    await completeSetup(await draftFor(db, { heightCm: 182, age: 35, weightKg: 82.4, week: hybrid }), isoDate(), db);
    const s = await getSettings(db);
    expect(s).toMatchObject({ heightCm: 182, birthYear: new Date().getFullYear() - 35, setupSeen: true });
    expect((await db.bodyweight.toArray()).map((b) => b.weight)).toEqual([82.4]);
    expect((await db.routines.toArray()).map((r) => r.name).sort()).toEqual(["Beine", "Pull", "Push"]);
    const longrun = (await db.runPlans.toArray()).find((p) => p.name === "Longrun")!;
    expect(longrun).toMatchObject({ targetKind: "distance", targetValue: 15, paceMin: 375, paceMax: 405 });
    expect(await db.runPlans.count()).toBe(4);
    const days = await db.planDays.orderBy("date").toArray();
    expect(days).toHaveLength(14);
    expect(days[13].date).toBe(addDays(isoDate(), 13));
    const push = (await db.routines.toArray()).find((r) => r.name === "Push")!;
    expect(s.weekTemplate[1]).toEqual([{ kind: "routine", id: push.id }]);
  });

  it("zweimal ausführen legt nichts doppelt an, vorhandener Plan behält seine Übungen", async () => {
    const db = await freshDb();
    const pushId = (await db.routines.add({ name: "push", order: 0 })) as number;
    await db.routineExercises.add({ routineId: pushId, exerciseId: 1, order: 0 });
    const draft = await draftFor(db, { week: hybrid });
    await completeSetup(draft, isoDate(), db);
    await completeSetup(draft, isoDate(), db);
    expect(await db.routines.count()).toBe(3);
    expect(await db.runPlans.count()).toBe(4);
    expect(await db.routineExercises.count()).toBe(1);
    expect((await getSettings(db)).weekTemplate[1]).toEqual([{ kind: "routine", id: pushId }]);
  });

  it("übernimmt Laufziele aus dem Entwurf, ungültige fallen auf den Standard zurück", async () => {
    const db = await freshDb();
    await db.runPlans.add({ name: "Zone 2", targetKind: "duration", targetValue: 2700, paceMin: null, paceMax: null, order: 0 });
    await completeSetup(await draftFor(db, {
      week: hybrid,
      runTargets: {
        "zone 2": { name: "Zone 2", targetKind: "duration", target: "60", paceFrom: "", paceTo: "" },
        longrun: { name: "Longrun", targetKind: "distance", target: "", paceFrom: "", paceTo: "" },
      },
    }), isoDate(), db);
    const plans = await db.runPlans.toArray();
    expect(plans.find((p) => p.name === "Zone 2")).toMatchObject({ targetValue: 3600, paceMin: null });
    expect(plans.find((p) => p.name === "Longrun")).toMatchObject({ targetValue: 15 });
    expect(plans.filter((p) => p.name === "Zone 2")).toHaveLength(1);
  });

  it("leere Felder lassen bestehende Werte stehen", async () => {
    const db = await freshDb();
    await db.settings.put({ ...(await getSettings(db)), heightCm: 175, birthYear: 1980 });
    await completeSetup(await draftFor(db, { heightCm: null, age: null, weightKg: null }), isoDate(), db);
    expect(await getSettings(db)).toMatchObject({ heightCm: 175, birthYear: 1980 });
    expect(await db.bodyweight.count()).toBe(0);
  });

  it("loadSetupDraft füllt aus dem Bestand vor", async () => {
    const db = await freshDb();
    await db.settings.put({ ...(await getSettings(db)), heightCm: 180, birthYear: new Date().getFullYear() - 40 });
    await db.bodyweight.add({ weight: 81, recordedAt: new Date().toISOString() });
    const start = await loadSetupDraft(db);
    expect(start.draft).toMatchObject({ heightCm: 180, age: 40, weightKg: null, shiftMode: "continuous" });
    expect(start.draft.progression.repTargetMin).toBe(5);
    expect(start).toMatchObject({ hasWeek: false, lastWeight: 81 });
  });

  it("„Später“ und die Karte merken sich ihren Zustand", async () => {
    const db = await freshDb();
    await markSetupSeen(db);
    await hideWeekCard(db);
    expect(await getSettings(db)).toMatchObject({ setupSeen: true, weekCardHidden: true });
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss scheitern**

Run: `npx vitest run src/db/setup.test.ts`
Expected: FAIL, `Failed to resolve import "./setup"`

- [ ] **Step 3: Umsetzung**

```ts
// src/db/setup.ts
import { db, getSettings, type AppDB } from "./db";
import { saveWeekSetup } from "./schedule";
import type { ProgressionFields, Routine, RunPlan, Settings, ShiftMode } from "./types";
import { isoDate } from "../lib/format";
import { progressionDefaults } from "../lib/progression";
import { defaultRunForm, missingNames, nameKey, runPlanNames, toTemplate, weekFromTemplate, type DraftRef } from "../lib/presets";
import { ageFromBirthYear, birthYearFromAge } from "../lib/profile";
import { formFromRunPlan, runPlanFromForm, validateRunPlan, type RunPlanForm } from "../lib/runTarget";

/** Alles, was der Assistent sammelt; gespeichert wird erst mit completeSetup. */
export interface SetupDraft {
  heightCm: number | null;
  age: number | null;
  weightKg: number | null; // null = kein neuer Gewichtseintrag
  progression: ProgressionFields;
  week: DraftRef[][];
  shiftMode: ShiftMode;
  runTargets: Record<string, RunPlanForm>; // Schlüssel = nameKey
}
export interface SetupStart { draft: SetupDraft; routines: Routine[]; runPlans: RunPlan[]; hasWeek: boolean; lastWeight: number | null }

export async function loadSetupDraft(database: AppDB = db): Promise<SetupStart> {
  const [s, routines, runPlans, last] = await Promise.all([
    getSettings(database),
    database.routines.orderBy("order").toArray(),
    database.runPlans.orderBy("order").toArray(),
    database.bodyweight.orderBy("recordedAt").last(),
  ]);
  const week = weekFromTemplate(s.weekTemplate, routines, runPlans);
  return {
    draft: {
      heightCm: s.heightCm, age: ageFromBirthYear(s.birthYear), weightKg: null,
      progression: progressionDefaults(s), week, shiftMode: s.shiftMode,
      runTargets: Object.fromEntries(runPlans.map((p) => [nameKey(p.name), formFromRunPlan(p)])),
    },
    routines, runPlans, hasWeek: week.some((d) => d.length > 0), lastWeight: last?.weight ?? null,
  };
}

/** Speichert den Entwurf in einer Transaktion; mehrfach ausgeführt entstehen keine Doppel. */
export async function completeSetup(draft: SetupDraft, today = isoDate(), database: AppDB = db) {
  const tables = [database.settings, database.bodyweight, database.routines, database.runPlans, database.planDays];
  await database.transaction("rw", tables, async () => {
    const s = await getSettings(database);
    await database.settings.put({
      ...s, ...draft.progression, shiftMode: draft.shiftMode, setupSeen: true,
      ...(draft.heightCm !== null ? { heightCm: draft.heightCm } : {}),
      ...(draft.age !== null ? { birthYear: birthYearFromAge(draft.age) } : {}),
    });
    if (draft.weightKg !== null) await database.bodyweight.add({ weight: draft.weightKg, recordedAt: new Date().toISOString() });

    const routines = await database.routines.toArray();
    const runPlans = await database.runPlans.toArray();
    const missing = missingNames(draft.week, routines, runPlans);
    for (const [i, name] of missing.routines.entries()) await database.routines.add({ name, order: routines.length + i });

    const existingRun = new Map(runPlans.map((p) => [nameKey(p.name), p]));
    for (const name of runPlanNames(draft.week)) {
      const existing = existingRun.get(nameKey(name));
      let form = draft.runTargets[nameKey(name)] ?? defaultRunForm(name, existing);
      if (Object.keys(validateRunPlan({ ...form, name })).length) form = defaultRunForm(name, existing);
      const { targetKind, targetValue, paceMin, paceMax } = runPlanFromForm({ ...form, name });
      if (existing) await database.runPlans.update(existing.id!, { targetKind, targetValue, paceMin, paceMax });
      else await database.runPlans.add({ name, targetKind, targetValue, paceMin, paceMax, order: runPlans.length + missing.runPlans.indexOf(name) });
    }

    const routineIds = new Map((await database.routines.toArray()).map((r) => [nameKey(r.name), r.id!] as [string, number]));
    const runPlanIds = new Map((await database.runPlans.toArray()).map((r) => [nameKey(r.name), r.id!] as [string, number]));
    await saveWeekSetup({ weekTemplate: toTemplate(draft.week, routineIds, runPlanIds), shiftMode: draft.shiftMode }, today, database);
  });
}

/** Noch nichts eingetragen und keine Woche: dann startet der Assistent von selbst. */
export async function isAppEmpty(database: AppDB = db): Promise<boolean> {
  const counts = await Promise.all([
    database.sessions.count(), database.runs.count(), database.routines.count(),
    database.runPlans.count(), database.bodyweight.count(), database.planDays.count(),
  ]);
  if (counts.some((c) => c > 0)) return false;
  return !(await getSettings(database)).weekTemplate.some((d) => d.length > 0);
}

async function patchSettings(patch: Partial<Settings>, database: AppDB) {
  await database.transaction("rw", database.settings, async () => {
    await database.settings.put({ ...(await getSettings(database)), ...patch });
  });
}
export const markSetupSeen = (database: AppDB = db) => patchSettings({ setupSeen: true }, database);
export const hideWeekCard = (database: AppDB = db) => patchSettings({ weekCardHidden: true }, database);
```

Hinweis: `saveWeekSetup` öffnet eine eigene Transaktion über `planDays, settings, routines, runPlans`. Das ist eine Teilmenge der äußeren Transaktion, Dexie verschachtelt sie.

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test && npm run typecheck`
Expected: PASS (7 neue Tests), Typecheck ohne Fehler

- [ ] **Step 5: Commit**

```bash
git add src/db/setup.ts src/db/setup.test.ts
git commit -m "Einrichtung laden und in einer Transaktion speichern

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Schritt-Komponenten

**Files:**
- Create: `src/components/setup/StepAbout.tsx`, `StepRules.tsx`, `StepPreset.tsx`, `StepWeek.tsx`, `StepRuns.tsx`, `StepDone.tsx`
- Modify: `src/components/plan/WeekTemplateEditor.tsx` (nur `MODES` exportieren)

**Interfaces:**
- Consumes: Task 1–3; `Marker` (`src/components/plan/Marker.tsx`); `itemName, usePlanNames, WEEKDAYS, WEEKDAYS_LONG` (`src/components/plan/names.ts`); `BufferedNumber` (`src/screens/Routines.tsx`); `useToday` (`src/lib/useToday.ts`)
- Produces (Props genau so, Task 5 nutzt sie):

```ts
StepAbout({ value: AboutForm, onChange: (v: AboutForm) => void, errors: AboutErrors, lastWeight: number | null })
StepRules({ value: ProgressionFields, onChange: (v: ProgressionFields) => void })
StepPreset({ value: string, onChange: (id: string) => void, currentWeek: DraftRef[][] | null })
StepWeek({ week: DraftRef[][], onChange: (w: DraftRef[][]) => void, mode: ShiftMode, onMode: (m: ShiftMode) => void, routines: string[], runPlans: string[] })
StepRuns({ names: string[], value: Record<string, RunPlanForm>, onChange: (v: Record<string, RunPlanForm>) => void, errors: Record<string, RunPlanErrors> })
StepDone({ week: DraftRef[][] })
```

- [ ] **Step 1: `MODES` exportieren**

In `src/components/plan/WeekTemplateEditor.tsx` `const MODES` zu `export const MODES` ändern.

- [ ] **Step 2: Über dich**

```tsx
// src/components/setup/StepAbout.tsx
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
```

- [ ] **Step 3: Trainingsregeln**

```tsx
// src/components/setup/StepRules.tsx
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
```

- [ ] **Step 4: Vorlage wählen**

```tsx
// src/components/setup/StepPreset.tsx
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
```

- [ ] **Step 5: Woche anpassen**

```tsx
// src/components/setup/StepWeek.tsx
import { useState } from "react";
import type { ShiftMode } from "../../db/types";
import type { DraftRef } from "../../lib/presets";
import { Button, Card, Input, Sheet } from "../ui";
import { Marker } from "../plan/Marker";
import { WEEKDAYS, WEEKDAYS_LONG } from "../plan/names";
import { MODES } from "../plan/WeekTemplateEditor";

export function StepWeek({ week, onChange, mode, onMode, routines, runPlans }: {
  week: DraftRef[][]; onChange: (w: DraftRef[][]) => void; mode: ShiftMode; onMode: (m: ShiftMode) => void;
  routines: string[]; runPlans: string[];
}) {
  const [addTo, setAddTo] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const close = () => { setAddTo(null); setNewName(""); };
  const add = (ref: DraftRef) => { onChange(week.map((d, i) => (i === addTo ? [...d, ref] : d))); close(); };
  const remove = (day: number, k: number) => onChange(week.map((d, i) => (i === day ? d.filter((_, j) => j !== k) : d)));
  const groups: [DraftRef["kind"], string, string[]][] = [["routine", "Krafttraining", routines], ["runPlan", "Laufen", runPlans]];

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Deine Woche</h1>
      <p className="mt-1 text-sm text-soft">Tippe auf ein Training, um es zu entfernen. Mit + fügst du eins hinzu.</p>
      <Card className="mt-4">
        <ul className="divide-y divide-line">
          {WEEKDAYS.map((w, day) => (
            <li key={w} className="flex items-center gap-2 px-3 py-2">
              <span className="w-7 text-sm font-medium text-soft">{w}</span>
              <span className="flex flex-1 flex-wrap gap-1.5">
                {week[day].length ? week[day].map((ref, k) => (
                  <button key={k} type="button" onClick={() => remove(day, k)} aria-label={`${ref.name} am ${WEEKDAYS_LONG[day]} entfernen`}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-surface-2 px-2 text-sm ring-1 ring-line">
                    <Marker kind={ref.kind} />{ref.name}<span aria-hidden className="text-soft">✕</span>
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
        <span id="setup-shift-label" className="text-sm font-medium">Beim Verschieben</span>
        <div className="grid grid-cols-2 gap-0.5 rounded-lg bg-surface-2 p-0.5 text-xs font-medium" role="radiogroup" aria-labelledby="setup-shift-label">
          {MODES.map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => onMode(k)}
              className={`min-h-9 rounded-md px-2.5 ${mode === k ? "bg-surface shadow-sm" : "text-soft"}`}>{l}</button>
          ))}
        </div>
      </div>
      <p className="mt-1.5 text-xs text-soft">{MODES.find(([k]) => k === mode)![2]}</p>

      <Sheet open={addTo !== null} onClose={close} title={`Training am ${addTo !== null ? WEEKDAYS_LONG[addTo] : ""}`}>
        {groups.map(([kind, title, names]) => names.length > 0 && (
          <div key={kind} className="mb-4">
            <h3 className="mb-1.5 text-sm font-medium text-soft">{title}</h3>
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface shadow-sm">
              {names.map((n) => (
                <li key={n}>
                  <button type="button" onClick={() => add(kind === "routine" ? { kind, name: n } : { kind, name: n })}
                    className="flex min-h-12 w-full items-center gap-2 px-4 text-left text-sm font-medium">
                    <Marker kind={kind} />{n}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="grid gap-2 pb-2">
          <Input placeholder="Neuer Name, z. B. Oberkörper" value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="Name des neuen Trainings" />
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={!newName.trim()} onClick={() => add({ kind: "routine", name: newName.trim() })}>Als Kraftplan</Button>
            <Button disabled={!newName.trim()} onClick={() => add({ kind: "runPlan", name: newName.trim() })}>Als Laufart</Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
```

- [ ] **Step 6: Laufziele**

```tsx
// src/components/setup/StepRuns.tsx
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
```

- [ ] **Step 7: Fertig**

```tsx
// src/components/setup/StepDone.tsx
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db/db";
import type { Routine } from "../../db/types";
import { nameKey, type DraftRef } from "../../lib/presets";
import { navigate } from "../../lib/router";
import { useToday } from "../../lib/useToday";
import { Card } from "../ui";
import { Marker } from "../plan/Marker";
import { itemName, usePlanNames } from "../plan/names";

export function StepDone({ week }: { week: DraftRef[][] }) {
  const today = useToday();
  const names = usePlanNames();
  const data = useLiveQuery(async () => {
    const day = await db.planDays.get(today);
    const inWeek = new Set(week.flat().filter((r) => r.kind === "routine").map((r) => nameKey(r.name)));
    const empty: Routine[] = [];
    for (const r of await db.routines.orderBy("order").toArray()) {
      if (inWeek.has(nameKey(r.name)) && !(await db.routineExercises.where("routineId").equals(r.id!).count())) empty.push(r);
    }
    return { day, empty };
  }, [today, week]);
  if (!data || !names) return null;

  const todays = data.day?.items.filter((i) => i.status === "planned") ?? [];
  const hasWeek = week.some((d) => d.length > 0);
  return (
    <div className="pt-6 text-center">
      <div aria-hidden className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-tint text-2xl text-ok ring-1 ring-ok/30">✓</div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Alles eingerichtet</h1>
      <p className="mt-1 text-sm text-soft">
        {!hasWeek ? "Deine Woche kannst du später unter „Pläne“ anlegen."
          : todays.length ? <>Heute ist <b className="text-ink">{todays.map((i) => itemName(names, i)).join(" + ")}</b> dran.</>
          : "Heute ist Ruhetag."}
      </p>
      {data.empty.length > 0 && (
        <div className="mt-6 text-left">
          <p className="mb-1.5 text-sm font-medium text-soft">Noch ohne Übungen – jetzt zusammenstellen?</p>
          <Card>
            <ul className="divide-y divide-line">
              {data.empty.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => navigate(`routine/${r.id}`)} className="flex min-h-12 w-full items-center gap-2 px-4 text-left text-sm">
                    <Marker kind="routine" /><span className="flex-1 font-medium">{r.name}</span>
                    <span className="text-xs font-semibold text-plate-ink">Übungen ›</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Prüfen**

Run: `npm test && npm run typecheck`
Expected: PASS, keine Typfehler. (Die Komponenten werden erst in Task 5 eingebunden; im Browser ist hier noch nichts zu sehen.)

- [ ] **Step 9: Commit**

```bash
git add src/components/setup src/components/plan/WeekTemplateEditor.tsx
git commit -m "Schritte des Einrichtungs-Assistenten

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Ablauf des Assistenten und automatischer Start

**Files:**
- Create: `src/screens/Setup.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: Task 1–4; `back`, `navigate` (`src/lib/router.ts`)
- Produces: Route `setup` und `setup?step=week`; Tab-Leiste auf `setup` ausgeblendet

- [ ] **Step 1: Bildschirm schreiben**

```tsx
// src/screens/Setup.tsx
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
import { defaultRunForm, nameKey, PRESETS, runPlanNames, uniqueNames } from "../lib/presets";
import { validateAbout, type AboutForm } from "../lib/profile";
import { back, navigate } from "../lib/router";
import { validateRunPlan } from "../lib/runTarget";

type Step = "welcome" | "about" | "rules" | "preset" | "week" | "runs" | "done";
const STEP_NO: Partial<Record<Step, number>> = { about: 1, rules: 2, preset: 3, week: 4, runs: 5 };

const aboutFrom = (d: SetupDraft): AboutForm => ({ height: fmtInput(d.heightCm), age: fmtInput(d.age), weight: "" });

export function Setup({ startAt }: { startAt?: string }) {
  const loaded = useLiveQuery(() => loadSetupDraft(), []);
  const [start, setStart] = useState<SetupStart | null>(null); // Stand beim Öffnen, für „Überspringen“
  const [draft, setDraft] = useState<SetupDraft | null>(null);
  const [about, setAbout] = useState<AboutForm>({ height: "", age: "", weight: "" });
  const [preset, setPreset] = useState("hybrid");
  const [step, setStep] = useState<Step>(startAt === "week" ? "preset" : "welcome");
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
      setDraft(withRunTargets({ ...draft, week: (p ? p.week : start.draft.week).map((d) => [...d]) }));
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
      setDraft({ ...draft, heightCm: start.draft.heightCm, age: start.draft.age, weightKg: null });
      go("rules");
    } else if (step === "rules") { setDraft({ ...draft, progression: start.draft.progression }); go("preset"); }
    else if (step === "week") await afterWeek(draft);
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
    <div className="flex min-h-[calc(100dvh-1.5rem)] flex-col pt-4">
      {no !== undefined && (
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Zurück" onClick={goBack}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-2xl text-soft hover:bg-surface-2">‹</button>
          <div className="h-1.5 flex-1 rounded-full bg-surface-2" role="progressbar" aria-label="Fortschritt" aria-valuemin={1} aria-valuemax={5} aria-valuenow={no}>
            <div className="h-1.5 rounded-full bg-plate transition-all" style={{ width: `${no * 20}%` }} />
          </div>
          <span className="w-8 text-right text-xs text-soft tnum">{no}/5</span>
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
        {step === "done" && <StepDone week={draft.week} />}
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
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">Willkommen bei<br />Satz & Strecke</h1>
      <p className="mt-3 text-sm text-soft">In zwei Minuten eingerichtet: ein paar Angaben zu dir, deine Trainingsregeln und deine Woche. Danach schlägt dir die App jeden Tag das passende Training vor.</p>
      <p className="mt-4 text-xs text-soft">Alle Daten bleiben auf diesem Gerät.</p>
    </div>
  );
}
```

- [ ] **Step 2: In `App.tsx` einbinden**

1. Imports ergänzen: `useRef` zu `import { useEffect } from "react"`, außerdem

```tsx
import { isAppEmpty } from "./db/setup";
import { Setup } from "./screens/Setup";
```

2. Nach dem `ensureHorizon`-Effekt:

```tsx
  // Leere App: Assistent einmal automatisch öffnen
  const setupChecked = useRef(false);
  useEffect(() => {
    if (!settings || setupChecked.current) return;
    setupChecked.current = true;
    if (settings.setupSeen || name === "setup") return;
    isAppEmpty().then((empty) => { if (empty) navigate("setup", true); }).catch(() => {});
  }, [settings, name]);
```

3. Im `switch`:

```tsx
    case "setup": screen = <Setup startAt={params.step} key={params.step ?? "all"} />; break;
```

4. `const inWorkout = name === "workout";` ersetzen durch `const hideNav = name === "workout" || name === "setup";`, `{!inWorkout && (` durch `{!hideNav && (` und die `main`-Zeile durch

```tsx
      <main className={`mx-auto max-w-xl px-4 ${hideNav ? "pb-4" : "pb-28"}`}>{screen}</main>
```

- [ ] **Step 3: Prüfen im Browser**

Run: `npm test && npm run typecheck && npm run build`, Dev-Server läuft auf http://localhost:5173 (Playwright, 390 px).
1. **Leere App:** In der Konsole `indexedDB.deleteDatabase("satz-und-strecke")` und `localStorage.clear()`, neu laden → Willkommen erscheint ohne Tab-Leiste.
2. „Los geht's“ → Größe „182“, Alter „35“, Gewicht „82,4“ → Weiter → Regeln → „Passt so“ → Vorlage „Hybrid“ → Weiter → Woche zeigt die Beispielwoche; bei Fr „+“ → „Als Kraftplan“ mit Namen „Oberkörper“ → Weiter → Laufziele zeigen Zone 2, Longrun, Z2 kurz, Intervall vorausgefüllt → Longrun Distanz leeren → „Fertig“ zeigt Fehler am Feld → „15“ eintragen → Fertig.
3. Fertig-Bildschirm nennt das heutige Training und listet Push, Pull, Oberkörper, Beine mit „Übungen ›“ → „Zur Startseite“ → Startseite zeigt „Heute“ mit dem Training; „Ich“ zeigt Größe 182 und Gewicht 82,4.
4. **Abbrechen:** `#/setup` öffnen → Los geht's → Größe „199“ → Zurück-Pfeil zweimal (zu Willkommen, dann aus dem Assistenten) → „Ich“ zeigt weiter 182.
5. **Kein Auto-Start bei Daten:** Neu laden → Startseite, kein Assistent.
6. **Später:** Datenbank löschen, neu laden → „Später“ → Startseite; neu laden → kein Assistent.
Expected: alles wie beschrieben, keine Konsolenfehler.

- [ ] **Step 4: Commit**

```bash
git add src/screens/Setup.tsx src/App.tsx
git commit -m "Einrichtungs-Assistent mit automatischem Start bei leerer App

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Karte auf der Startseite und Einstellungen unter „Ich“

**Files:**
- Create: `src/components/setup/WeekSetupCard.tsx`
- Modify: `src/screens/Home.tsx`, `src/screens/Profile.tsx`

**Interfaces:**
- Consumes: `hideWeekCard` (Task 3); `ageFromBirthYear`, `birthYearFromAge` (Task 1); Route `setup?step=week` (Task 5)

- [ ] **Step 1: Karte**

```tsx
// src/components/setup/WeekSetupCard.tsx
import { hideWeekCard } from "../../db/setup";
import { navigate } from "../../lib/router";
import { Button, Card, toast } from "../ui";

/** Für bestehende Apps ohne Musterwoche: führt direkt zur Vorlagen-Auswahl. */
export function WeekSetupCard() {
  return (
    <Card className="mt-5 border-plate/40 p-4">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <p className="font-semibold">Woche einrichten?</p>
          <p className="mt-0.5 text-sm text-soft">Wähl eine Vorlage, dann schlägt dir die App jeden Tag das passende Training vor.</p>
        </div>
        <button type="button" aria-label="Hinweis ausblenden" onClick={() => hideWeekCard().catch(() => toast("Konnte nicht gespeichert werden."))}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-soft hover:bg-surface-2">✕</button>
      </div>
      <Button variant="plate" className="mt-3 w-full" onClick={() => navigate("setup?step=week")}>Einrichten</Button>
    </Card>
  );
}
```

- [ ] **Step 2: Startseite**

In `src/screens/Home.tsx`:
1. `import { WeekSetupCard } from "../components/setup/WeekSetupCard";`
2. Im Zweig ohne aktive Woche (`) : (` vor `<Section title="Training starten">`) die Section in ein Fragment packen und davor die Karte setzen:

```tsx
      ) : (
        <>
          {!settings.weekCardHidden && <WeekSetupCard />}
          <Section title="Training starten">
            {/* bisheriger Inhalt der Section unverändert */}
          </Section>
        </>
      )}
```

3. Innerhalb dieser Section den Absatz `<p className="mt-2 text-sm text-soft">Tipp: Unter „Pläne“ legst du deine Musterwoche an, …</p>` löschen (die Karte ersetzt ihn). Alles andere in der Section bleibt.

- [ ] **Step 3: „Ich“**

In `src/screens/Profile.tsx`:
1. Imports: `ageFromBirthYear, birthYearFromAge` aus `../lib/profile`; `navigate` aus `../lib/router` (falls noch nicht importiert); `Card` ist bereits importiert.
2. In `Profile()` neben den anderen Abfragen:

```tsx
  const running = useLiveQuery(async () => !!(await db.drafts.get("current")), []);
```

3. Direkt nach der Section „Darstellung“:

```tsx
      <Section title="Einrichtung">
        <Card className="flex items-center gap-3 p-4">
          <p className="flex-1 text-sm text-soft">Größe, Trainingsregeln und Woche Schritt für Schritt einstellen.</p>
          <Button disabled={!!running} onClick={() => navigate("setup")}>Starten</Button>
        </Card>
        {running && <p className="mt-1.5 text-xs text-soft">Geht, sobald das laufende Training beendet ist.</p>}
      </Section>
```

4. In der Karte „Standard-Progression“ direkt nach der Zeile „Körpergröße“:

```tsx
          <div className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-sm">Alter</span>
            <BufferedNumber ariaLabel="Alter in Jahren" decimal={false} value={ageFromBirthYear(settings.birthYear)} onCommit={(v) => {
              if (v !== null && (v < 10 || v > 100)) { toast("Trag ein Alter zwischen 10 und 100 ein."); return; }
              save({ birthYear: v === null ? null : birthYearFromAge(v) });
            }} />
            <span className="text-sm text-soft">Jahre</span>
          </div>
```

- [ ] **Step 4: Prüfen im Browser**

Run: `npm test && npm run typecheck && npm run build`, Browser 390 px, hell und dunkel.
1. **Bestehende App ohne Woche:** In der Konsole die Musterwoche leeren (`indexedDB` → `settings` → `weekTemplate` auf sieben leere Arrays, `weekCardHidden: false`) und neu laden → Startseite zeigt Karte „Woche einrichten?“ statt Tipp-Zeile.
2. „Einrichten“ → Assistent startet bei Vorlage (3/5); Zurück-Pfeil verlässt ihn zur Startseite.
3. „Einrichten“ → „Push / Pull / Beine“ → Weiter → Fertig (keine Laufziele) → Startseite zeigt Wochenplan, Karte ist weg.
4. Woche wieder leeren → Karte → ✕ → neu laden → Karte bleibt weg.
5. „Ich“: Alter „35“ eintragen, Feld verlassen, neu laden → 35 steht da; „Einrichtung“ → „Starten“ → Größe und Alter sind vorausgefüllt; in Schritt 3 ist „Aktuelle Woche behalten“ ausgewählt; durchklicken bis „Fertig“ → Woche unverändert, keine doppelten Pläne unter „Pläne“.
6. Laufendes Training (Freies Training starten) → „Ich“ → „Starten“ ist deaktiviert mit Hinweis.
Expected: alles wie beschrieben, keine Konsolenfehler.

- [ ] **Step 5: Commit**

```bash
git add src/components/setup/WeekSetupCard.tsx src/screens/Home.tsx src/screens/Profile.tsx
git commit -m "Karte „Woche einrichten?“ und Einrichtung unter „Ich“

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
