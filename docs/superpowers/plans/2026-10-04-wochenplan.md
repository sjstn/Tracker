# Wochenplan mit smarter Verschiebung – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Musterwoche aus Kraftplänen und Laufarten, aus der die App konkrete Plan-Tage erzeugt, das heutige Training vorschlägt und spontane Pausen, Tausch und Verschieben nach festen Regeln umsetzt.

**Architecture:** Reine Planungsfunktionen in `src/lib/schedule.ts` arbeiten auf einer Liste von Plan-Tagen (`PlanDay[]`) und geben eine neue Liste zurück. `src/db/schedule.ts` liest und schreibt diese Tage in Dexie, hält 14 Tage Vorrat und merkt sich den letzten Stand für „Rückgängig“. Die Oberfläche (Start, Woche ändern, Pläne, Laufart, Lauf eintragen, Verlauf) ruft nur diese beiden Schichten auf.

**Tech Stack:** React 19, TypeScript (strict, `noUnusedLocals`), Vite, Tailwind 4, Dexie 4 + dexie-react-hooks, Vitest + fake-indexeddb, neu: `@dnd-kit/core` 6.

**Spec:** `docs/superpowers/specs/2026-10-04-wochenplan-design.md`

## Global Constraints

- Lokale PWA für eine Person, kein Server, kein Konto, statisch auf GitHub Pages; Hash-Routing bleibt.
- Dexie-Version 2; bestehende Tabellen und Daten bleiben unverändert.
- Vorrat: Plan-Tage von heute bis heute + 13 (`HORIZON_DAYS = 14`).
- Datum immer als lokaler Tag `YYYY-MM-DD`, Rechnen ohne Uhrzeit.
- Musterwoche: Index 0 = Montag … 6 = Sonntag; `[]` = Ruhetag.
- Modus `"continuous"` (Fortlaufend, Standard) oder `"fixedWeek"` (Feste Woche).
- Laufarten: Dauer in der Oberfläche in **Minuten**, Pace in **min/km** (`m:ss`); intern Sekunden bzw. Sekunden pro km.
- Keine Regel bewegt erledigte (`done`) oder ausgelassene (`skipped`) Items.
- Alle Texte der Oberfläche auf Deutsch, Stil wie bisher (Karten, `text-soft`, `text-plate-ink`).
- Tests: `npm test` (Vitest), Typen: `npm run typecheck`, Build: `npm run build`.
- Commit-Nachrichten enden mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **Pace-Eingabe mit Komma oder Punkt:** Die iPhone-Zahlentastatur hat keinen Doppelpunkt. „6,15“ und „6.15“ müssen als 6:15 min/km gelten (Test in Task 1).
- **Knapp verfehltes Ziel:** 44:50 bei 45 min oder 9,95 km bei 10 km soll als geschafft zählen (Toleranz 60 s bzw. 0,1 km, Test in Task 6).
- **Pause an einem Tag mit teils erledigten Trainings:** Pull erledigt, Z2 offen → nur Z2 wandert, Pull bleibt erledigt (Test in Task 4).
- **Leeres Training beenden:** Kein abgehakter Satz → kein Training gespeichert, Termin bleibt offen (Test in Task 8).
- **Plan löschen, der in der Woche steckt:** verschwindet aus Musterwoche und offenen Terminen, erledigte Termine behalten ihren Namen (Test in Task 8).

---

## Dateiübersicht

| Datei | Aufgabe |
|---|---|
| `src/lib/days.ts` (neu) | Tagesarithmetik auf `YYYY-MM-DD` |
| `src/lib/format.ts` | + `parsePace`, `fmtPace`, `fmtMinutes` |
| `src/db/types.ts` | + `TrainingRef`, `ShiftMode`, `PlanItem`, `PlanDay`, `RunPlan`; Felder an `Settings`, `Run`, `WorkoutSession`, `WorkoutDraft` |
| `src/db/db.ts` | Dexie v2, Standardwerte, `SCHEMA_V1` |
| `src/lib/schedule.ts` (neu) | reine Planungsregeln |
| `src/lib/runTarget.ts` (neu) | Laufziel prüfen, beschreiben, Formular validieren |
| `src/db/schedule.ts` (neu) | Plan-Tage speichern, Vorrat, Rückgängig, Termine erledigen |
| `src/db/repo.ts` | Training/Lauf mit Termin verknüpfen, Löschen räumt auf, Sicherung |
| `src/components/ui.tsx` | Toast mit „Rückgängig“-Knopf |
| `src/components/plan/*` (neu) | `Marker`, `usePlanNames`, `WeekTemplateEditor`, `TodayPlan`, `OverdueBanner`, `WeekPreview` |
| `src/lib/useToday.ts` (neu) | „heute“, aktualisiert beim Zurückkehren in die App |
| `src/screens/Week.tsx` (neu) | Woche ändern (Ziehen/Antippen) |
| `src/screens/RunPlanEdit.tsx` (neu) | Laufart bearbeiten |
| `src/screens/Home.tsx`, `Routines.tsx`, `RunForm.tsx`, `History.tsx`, `Workout.tsx`, `src/App.tsx` | Einbindung |

---

### Task 1: Tagesrechnung und Pace/Dauer-Format

**Files:**
- Create: `src/lib/days.ts`
- Modify: `src/lib/format.ts` (am Ende ergänzen)
- Test: `src/lib/days.test.ts`

**Interfaces:**
- Produces:
  - `addDays(iso: string, n: number): string`
  - `daysBetween(from: string, to: string): number` (ganze Tage, `to − from`)
  - `weekdayIndex(iso: string): number` (Mo = 0 … So = 6)
  - `sundayOf(iso: string): string`
  - `parsePace(v: string): number` (Sekunden/km, ungültig → `NaN`)
  - `fmtPace(secPerKm: number): string` (`"6:15"`)
  - `fmtMinutes(sec: number): string` (`"45 min"`)

- [ ] **Step 1: Failing test schreiben**

```ts
// src/lib/days.test.ts
process.env.TZ = "Europe/Berlin"; // Zeitumstellung realistisch testen
import { describe, expect, it } from "vitest";
import { addDays, daysBetween, sundayOf, weekdayIndex } from "./days";
import { fmtMinutes, fmtPace, parsePace } from "./format";

describe("Tagesrechnung", () => {
  it("zählt Tage über Zeitumstellung und Jahreswechsel", () => {
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-10-06", -1)).toBe("2026-10-05");
    expect(daysBetween("2026-10-24", "2026-10-27")).toBe(3);
    expect(daysBetween("2026-10-08", "2026-10-06")).toBe(-2);
  });

  it("kennt Wochentage ab Montag", () => {
    expect(weekdayIndex("2026-10-05")).toBe(0);
    expect(weekdayIndex("2026-10-11")).toBe(6);
    expect(sundayOf("2026-10-07")).toBe("2026-10-11");
    expect(sundayOf("2026-10-11")).toBe("2026-10-11");
  });
});

describe("Pace und Dauer", () => {
  it("liest Pace mit Doppelpunkt, Komma oder Punkt", () => {
    expect(parsePace("6:15")).toBe(375);
    expect(parsePace("6,15")).toBe(375);
    expect(parsePace("6.15")).toBe(375);
    expect(parsePace(" 5:05 ")).toBe(305);
    expect(parsePace("6")).toBe(360);
    expect(parsePace("6:75")).toBeNaN();
    expect(parsePace("abc")).toBeNaN();
    expect(parsePace("")).toBeNaN();
  });

  it("zeigt Pace und Minuten", () => {
    expect(fmtPace(375)).toBe("6:15");
    expect(fmtPace(359.6)).toBe("6:00");
    expect(fmtMinutes(2700)).toBe("45 min");
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss scheitern**

Run: `npx vitest run src/lib/days.test.ts`
Expected: FAIL, `Failed to resolve import "./days"`

- [ ] **Step 3: Umsetzung**

```ts
// src/lib/days.ts
import { isoDate, parseDay } from "./format";

/** Rechnen mit lokalen Tagen "YYYY-MM-DD" – ohne Uhrzeit, sicher über Zeitumstellungen. */
export function addDays(iso: string, n: number): string {
  const d = parseDay(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000);
}

/** Montag = 0 … Sonntag = 6 */
export const weekdayIndex = (iso: string) => (parseDay(iso).getDay() + 6) % 7;

export const sundayOf = (iso: string) => addDays(iso, 6 - weekdayIndex(iso));
```

Am Ende von `src/lib/format.ts` ergänzen:

```ts
/** "6:15", "6,15" oder "6.15" → 375 Sekunden pro km; "6" → 360. Ungültig → NaN. */
export function parsePace(v: string): number {
  const m = v.trim().match(/^(\d{1,2})(?:[:.,](\d{2}))?$/);
  if (!m) return NaN;
  const sec = m[2] === undefined ? 0 : Number(m[2]);
  return sec < 60 ? Number(m[1]) * 60 + sec : NaN;
}
export function fmtPace(secPerKm: number): string {
  const s = Math.round(secPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export const fmtMinutes = (sec: number) => `${fmt(sec / 60, 0)} min`;
```

- [ ] **Step 4: Test laufen lassen**

Run: `npx vitest run src/lib/days.test.ts`
Expected: PASS (4 Tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/days.ts src/lib/days.test.ts src/lib/format.ts
git commit -m "Tagesrechnung und Pace-Format für den Wochenplan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Datenmodell Version 2

**Files:**
- Modify: `src/db/types.ts`, `src/db/db.ts`, `src/db/repo.ts` (nur `BACKUP_TABLES`)
- Test: `src/db/schedule.test.ts` (neu, wird in Task 7/8 erweitert)

**Interfaces:**
- Produces (in `src/db/types.ts`):

```ts
export type TrainingRef = { kind: "routine"; id: number } | { kind: "runPlan"; id: number };
export type ShiftMode = "continuous" | "fixedWeek";
export type PlanItemStatus = "planned" | "done" | "skipped";
export interface PlanItem { id: string; ref: TrainingRef; status: PlanItemStatus; label: string }
export interface PlanDay { date: string; seq: number | null; items: PlanItem[] }
export interface RunPlan {
  id?: number; name: string; targetKind: "duration" | "distance";
  targetValue: number; paceMin: number | null; paceMax: number | null; order: number;
}
```

- `Settings` + `weekTemplate: TrainingRef[][]`, `shiftMode: ShiftMode`
- `Run` + `planItemId?: string`, `runPlanId?: number`
- `WorkoutSession` + `planItemId?: string`
- `WorkoutDraft` + `planItemId?: string | null`, `performedOn?: string | null`
- `AppDB` + `runPlans: EntityTable<RunPlan, "id">`, `planDays: EntityTable<PlanDay, "date">`
- `SCHEMA_V1` (exportiert, für den Upgrade-Test)

- [ ] **Step 1: Failing test schreiben**

```ts
// src/db/schedule.test.ts
import "fake-indexeddb/auto";
import Dexie from "dexie";
import { describe, expect, it } from "vitest";
import { AppDB, DEFAULT_SETTINGS, SCHEMA_V1, getSettings } from "./db";
import { exportBackup, importBackup } from "./repo";

describe("Datenbank Version 2", () => {
  it("rüstet eine Version-1-Datenbank ohne Datenverlust auf", async () => {
    const name = "upgrade-" + Math.random();
    const old = new Dexie(name);
    old.version(1).stores(SCHEMA_V1);
    await old.table("runs").add({ date: "2026-09-30", km: 5, seconds: 1500, note: null });
    await old.table("settings").add({ ...DEFAULT_SETTINGS, weekTemplate: undefined, shiftMode: undefined });
    old.close();

    const db = new AppDB(name);
    await db.open();
    expect(db.verno).toBe(2);
    expect(await db.runs.count()).toBe(1);
    expect(await db.planDays.count()).toBe(0);
    expect(await db.runPlans.count()).toBe(0);
    const s = await getSettings(db);
    expect(s.weekTemplate).toEqual([[], [], [], [], [], [], []]);
    expect(s.shiftMode).toBe("continuous");
  });

  it("sichert Laufarten und Plan-Tage mit und spielt alte Sicherungen weiter ein", async () => {
    const db = new AppDB("backup-" + Math.random());
    await db.open();
    await db.runPlans.add({ name: "Longrun", targetKind: "distance", targetValue: 15, paceMin: 375, paceMax: 405, order: 0 });
    await db.planDays.add({ date: "2026-10-06", seq: 1, items: [] });
    const json = await exportBackup(db);
    await db.runPlans.clear();
    await db.planDays.clear();
    await importBackup(json, db);
    expect(await db.runPlans.count()).toBe(1);
    expect(await db.planDays.count()).toBe(1);

    const old = JSON.parse(json);
    delete old.data.runPlans;
    delete old.data.planDays;
    await importBackup(JSON.stringify(old), db);
    expect(await db.planDays.count()).toBe(0);
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss scheitern**

Run: `npx vitest run src/db/schedule.test.ts`
Expected: FAIL, `SCHEMA_V1` ist kein Export von `./db`

- [ ] **Step 3: Typen ergänzen**

In `src/db/types.ts` nach `export type ThemeMode …` einfügen:

```ts
/** Verweis auf ein planbares Training: Kraftplan oder Laufart. */
export type TrainingRef = { kind: "routine"; id: number } | { kind: "runPlan"; id: number };
export type ShiftMode = "continuous" | "fixedWeek";
export type PlanItemStatus = "planned" | "done" | "skipped";
export interface PlanItem {
  id: string;
  ref: TrainingRef;
  status: PlanItemStatus;
  /** Name zum Zeitpunkt der Planung, falls der Plan später gelöscht wird */
  label: string;
}
export interface PlanDay {
  date: string; // YYYY-MM-DD, lokaler Tag
  /** Wochentag der Musterwoche (0 = Mo), aus dem der Tag stammt; null = eingefügte Pause */
  seq: number | null;
  items: PlanItem[];
}
/** Laufart mit Ziel. Dauer in Sekunden, Pace in Sekunden pro km. */
export interface RunPlan {
  id?: number;
  name: string;
  targetKind: "duration" | "distance";
  targetValue: number;
  paceMin: number | null; // schnelleres Ende
  paceMax: number | null; // langsameres Ende
  order: number;
}
```

In `Settings` nach `theme: ThemeMode;`:

```ts
  /** Musterwoche: 7 Einträge ab Montag, [] = Ruhetag */
  weekTemplate: TrainingRef[][];
  shiftMode: ShiftMode;
```

In `WorkoutSession` nach `durationSeconds`:

```ts
  /** Termin aus dem Wochenplan, der mit diesem Training erledigt wurde */
  planItemId?: string;
```

In `Run` nach `note`:

```ts
  planItemId?: string;
  runPlanId?: number;
```

In `WorkoutDraft` nach `restEndsAt`:

```ts
  planItemId?: string | null;
  /** Nachtrag für einen vergangenen Tag (YYYY-MM-DD) */
  performedOn?: string | null;
```

- [ ] **Step 4: Datenbank auf Version 2**

In `src/db/db.ts`:
1. Import um `PlanDay, RunPlan` ergänzen.
2. In `DEFAULT_SETTINGS` nach `theme: "system",`:

```ts
  weekTemplate: [[], [], [], [], [], [], []],
  shiftMode: "continuous",
```

3. Vor `export class AppDB` einfügen und im Konstruktor verwenden:

```ts
export const SCHEMA_V1 = {
  settings: "key",
  exercises: "++id, name, muscleGroup",
  routines: "++id, order",
  routineExercises: "++id, routineId, exerciseId",
  setTemplates: "++id, routineExerciseId",
  sessions: "++id, performedAt, routineId",
  loggedExercises: "++id, workoutSessionId, exerciseId",
  loggedSets: "++id, loggedExerciseId, workoutSessionId, exerciseId, [exerciseId+slotNumber], performedAt",
  bodyweight: "++id, recordedAt",
  runs: "++id, date",
  drafts: "key",
};
```

4. Felder in der Klasse ergänzen:

```ts
  runPlans!: EntityTable<RunPlan, "id">;
  planDays!: EntityTable<PlanDay, "date">;
```

5. Im Konstruktor `this.version(1).stores({...})` ersetzen durch:

```ts
    this.version(1).stores(SCHEMA_V1);
    this.version(2).stores({ runPlans: "++id, order", planDays: "date" });
```

6. In `getSettings` die Musterwoche absichern (alte Sicherungen können kaputte Werte enthalten):

```ts
export async function getSettings(database: AppDB = db): Promise<Settings> {
  const s = { ...DEFAULT_SETTINGS, ...((await database.settings.get("profile")) ?? {}) };
  if (!Array.isArray(s.weekTemplate) || s.weekTemplate.length !== 7) s.weekTemplate = DEFAULT_SETTINGS.weekTemplate;
  if (s.shiftMode !== "fixedWeek") s.shiftMode = "continuous";
  return s;
}
```

In `src/db/repo.ts` die Sicherungstabellen erweitern:

```ts
const BACKUP_TABLES = ["settings", "exercises", "routines", "routineExercises", "setTemplates", "sessions", "loggedExercises", "loggedSets", "bodyweight", "runs", "runPlans", "planDays"] as const;
```

- [ ] **Step 5: Tests laufen lassen**

Run: `npm test && npm run typecheck`
Expected: alle Tests PASS (inkl. der 2 neuen), Typecheck ohne Fehler

- [ ] **Step 6: Commit**

```bash
git add src/db/types.ts src/db/db.ts src/db/repo.ts src/db/schedule.test.ts
git commit -m "Datenbank Version 2: Laufarten und Plan-Tage

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Planungsregeln I – Erzeugen, Ausfallen, Neu aufbauen

**Files:**
- Create: `src/lib/schedule.ts`
- Test: `src/lib/schedule.test.ts`

**Interfaces:**
- Consumes: `addDays`, `daysBetween`, `sundayOf`, `weekdayIndex` (Task 1); Typen aus Task 2
- Produces:

```ts
export const HORIZON_DAYS = 14;
export interface PlanCtx { template: TrainingRef[][]; mode: ShiftMode; label: (ref: TrainingRef) => string; newId: () => string }
export const refKey: (r: TrainingRef) => string;            // "routine:3"
export const sameRef: (a: TrainingRef, b: TrainingRef) => boolean;
export const openItems: (d: PlanDay | undefined) => PlanItem[];
export function generate(days: PlanDay[], from: string, until: string, ctx: PlanCtx): PlanDay[];
export function overdue(days: PlanDay[], today: string): PlanDay[];
export function skipDay(days: PlanDay[], date: string): PlanDay[];
export function skipOverdue(days: PlanDay[], today: string): PlanDay[];
export function rebuildFrom(days: PlanDay[], from: string, ctx: PlanCtx): PlanDay[];
```

Alle Funktionen verändern ihre Eingabe nicht und geben die Tage nach Datum sortiert zurück.

- [ ] **Step 1: Failing test schreiben**

```ts
// src/lib/schedule.test.ts
process.env.TZ = "Europe/Berlin";
import { describe, expect, it } from "vitest";
import type { PlanDay, ShiftMode, TrainingRef } from "../db/types";
import { generate, overdue, rebuildFrom, skipDay, skipOverdue, type PlanCtx } from "./schedule";

const R = (id: number): TrainingRef => ({ kind: "routine", id });
const L = (id: number): TrainingRef => ({ kind: "runPlan", id });
// Musterwoche aus dem Konzept: Mo Zone 2, Di Push, Mi Longrun, Do Pull + Z2 kurz, Fr Pause, Sa Intervall, So Beine
export const TEMPLATE: TrainingRef[][] = [[L(1)], [R(1)], [L(2)], [R(2), L(3)], [], [L(4)], [R(3)]];
const NAMES: Record<string, string> = {
  "runPlan:1": "Zone 2", "routine:1": "Push", "runPlan:2": "Longrun", "routine:2": "Pull",
  "runPlan:3": "Z2 kurz", "runPlan:4": "Intervall", "routine:3": "Beine",
};
export function ctx(mode: ShiftMode = "continuous", template = TEMPLATE): PlanCtx {
  let n = 0;
  return { template, mode, label: (r) => NAMES[`${r.kind}:${r.id}`], newId: () => `i${++n}` };
}
/** Kurzansicht: "06 Push", "08 Pull+Z2 kurz", "09 –"; ✓ = erledigt, ✗ = ausgelassen */
export function view(days: PlanDay[], from: string, to: string): string[] {
  return days.filter((d) => d.date >= from && d.date <= to).map((d) =>
    `${d.date.slice(8)} ${d.items.map((i) => i.label + (i.status === "done" ? "✓" : i.status === "skipped" ? "✗" : "")).join("+") || "–"}`);
}
export const MON = "2026-10-05";
export const twoWeeks = (c = ctx()) => generate([], MON, "2026-10-18", c);
export const markDone = (days: PlanDay[], date: string, label: string) =>
  days.map((d) => d.date !== date ? d : { ...d, items: d.items.map((i) => i.label === label ? { ...i, status: "done" as const } : i) });

describe("generate", () => {
  it("legt die Musterwoche ab Montag an", () => {
    expect(view(twoWeeks(), MON, "2026-10-11")).toEqual([
      "05 Zone 2", "06 Push", "07 Longrun", "08 Pull+Z2 kurz", "09 –", "10 Intervall", "11 Beine",
    ]);
  });

  it("startet beim heutigen Wochentag, wenn noch nichts geplant ist", () => {
    expect(view(generate([], "2026-10-07", "2026-10-08", ctx()), "2026-10-07", "2026-10-08")).toEqual(["07 Longrun", "08 Pull+Z2 kurz"]);
  });

  it("ergänzt nur fehlende Tage und setzt die Reihenfolge fort", () => {
    const first = generate([], MON, "2026-10-07", ctx());
    const more = generate(first, MON, "2026-10-09", ctx());
    expect(more.length).toBe(5);
    expect(more[0].items[0].id).toBe(first[0].items[0].id);
    expect(view(more, "2026-10-08", "2026-10-09")).toEqual(["08 Pull+Z2 kurz", "09 –"]);
  });

  it("zählt über Zeitumstellung und Jahreswechsel richtig", () => {
    const dst = generate([], "2026-10-24", "2026-10-27", ctx("fixedWeek"));
    expect(dst.map((d) => d.date)).toEqual(["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"]);
    expect(view(dst, "2026-10-26", "2026-10-26")).toEqual(["26 Zone 2"]);
    const year = generate([], "2026-12-28", "2027-01-10", ctx());
    expect(year.length).toBe(14);
    expect(view(year, "2027-01-04", "2027-01-04")).toEqual(["04 Zone 2"]);
  });

  it("gibt die Eingabe unverändert zurück", () => {
    const days = twoWeeks();
    const before = JSON.stringify(days);
    generate(days, MON, "2026-10-25", ctx());
    expect(JSON.stringify(days)).toBe(before);
  });
});

describe("Ausfallen und vergessene Tage", () => {
  it("skipDay markiert nur die offenen Trainings des Tages", () => {
    const days = skipDay(markDone(twoWeeks(), "2026-10-08", "Pull"), "2026-10-08");
    expect(view(days, "2026-10-08", "2026-10-09")).toEqual(["08 Pull✓+Z2 kurz✗", "09 –"]);
  });

  it("overdue findet vergangene Tage mit offenen Trainings", () => {
    const days = markDone(twoWeeks(), MON, "Zone 2");
    expect(overdue(days, "2026-10-07").map((d) => d.date)).toEqual(["2026-10-06"]);
    expect(overdue(days, MON)).toEqual([]);
  });

  it("skipOverdue markiert alle vergessenen Tage als ausgelassen", () => {
    const days = skipOverdue(twoWeeks(), "2026-10-07");
    expect(view(days, MON, "2026-10-07")).toEqual(["05 Zone 2✗", "06 Push✗", "07 Longrun"]);
  });
});

describe("rebuildFrom", () => {
  it("baut ab dem Stichtag neu auf und lässt Erledigtes stehen", () => {
    const days = markDone(twoWeeks(), "2026-10-06", "Push");
    const pullOnTuesday = TEMPLATE.map((d, i) => (i === 1 ? [R(2)] : d));
    const rebuilt = rebuildFrom(days, "2026-10-07", ctx("continuous", pullOnTuesday));
    expect(view(rebuilt, "2026-10-06", "2026-10-07")).toEqual(["06 Push✓", "07 Longrun"]);
    expect(view(rebuilt, "2026-10-13", "2026-10-13")).toEqual(["13 Pull"]);
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss scheitern**

Run: `npx vitest run src/lib/schedule.test.ts`
Expected: FAIL, `Failed to resolve import "./schedule"`

- [ ] **Step 3: Umsetzung**

```ts
// src/lib/schedule.ts
import type { PlanDay, PlanItem, ShiftMode, TrainingRef } from "../db/types";
import { addDays, weekdayIndex } from "./days";

/* Regeln des Wochenplans als reine Funktionen: Plan-Tage rein, neue Plan-Tage raus.
   Erledigte und ausgelassene Items bewegt keine Regel. */

export const HORIZON_DAYS = 14;

export interface PlanCtx {
  template: TrainingRef[][];
  mode: ShiftMode;
  label: (ref: TrainingRef) => string;
  newId: () => string;
}

export const refKey = (r: TrainingRef) => `${r.kind}:${r.id}`;
export const sameRef = (a: TrainingRef, b: TrainingRef) => a.kind === b.kind && a.id === b.id;

const isOpen = (i: PlanItem) => i.status === "planned";
export const openItems = (d: PlanDay | undefined): PlanItem[] => (d ? d.items.filter(isOpen) : []);
const keptItems = (d: PlanDay | undefined): PlanItem[] => (d ? d.items.filter((i) => !isOpen(i)) : []);

const byDate = (a: PlanDay, b: PlanDay) => a.date.localeCompare(b.date);
const copy = (days: PlanDay[]): PlanDay[] => days.map((d) => ({ ...d, items: d.items.map((i) => ({ ...i })) })).sort(byDate);

function itemsFor(seq: number, ctx: PlanCtx): PlanItem[] {
  return (ctx.template[seq] ?? []).map((ref) => ({ id: ctx.newId(), ref, status: "planned" as const, label: ctx.label(ref) }));
}

/** Welcher Musterwochentag ist am Datum dran? Fortlaufend: nach dem letzten geplanten Tag davor. */
function nextSeq(sorted: PlanDay[], date: string, ctx: PlanCtx): number {
  if (ctx.mode === "fixedWeek") return weekdayIndex(date);
  for (let i = sorted.length - 1; i >= 0; i--) {
    const d = sorted[i];
    if (d.date < date && d.seq !== null) return (d.seq + 1) % 7;
  }
  return weekdayIndex(date);
}

/** Legt fehlende Tage von `from` bis `until` (inklusive) aus der Musterwoche an. */
export function generate(days: PlanDay[], from: string, until: string, ctx: PlanCtx): PlanDay[] {
  const out = copy(days);
  const have = new Set(out.map((d) => d.date));
  for (let date = from; date <= until; date = addDays(date, 1)) {
    if (have.has(date)) continue;
    const seq = nextSeq(out, date, ctx);
    out.push({ date, seq, items: itemsFor(seq, ctx) });
    out.sort(byDate);
  }
  return out;
}

/** Vergangene Tage mit offenen Trainings. */
export function overdue(days: PlanDay[], today: string): PlanDay[] {
  return copy(days).filter((d) => d.date < today && d.items.some(isOpen));
}

const skipOpen = (d: PlanDay): PlanDay => ({ ...d, items: d.items.map((i) => (isOpen(i) ? { ...i, status: "skipped" as const } : i)) });

export function skipDay(days: PlanDay[], date: string): PlanDay[] {
  return copy(days).map((d) => (d.date === date ? skipOpen(d) : d));
}

export function skipOverdue(days: PlanDay[], today: string): PlanDay[] {
  return copy(days).map((d) => (d.date < today ? skipOpen(d) : d));
}

/** Musterwoche oder Modus geändert: offene Trainings ab `from` neu erzeugen. */
export function rebuildFrom(days: PlanDay[], from: string, ctx: PlanCtx): PlanDay[] {
  const all = copy(days);
  const out = all.filter((d) => d.date < from);
  for (const d of all.filter((x) => x.date >= from)) {
    const seq = nextSeq(out, d.date, ctx);
    out.push({ date: d.date, seq, items: [...keptItems(d), ...itemsFor(seq, ctx)] });
  }
  return out;
}
```

- [ ] **Step 4: Test laufen lassen**

Run: `npx vitest run src/lib/schedule.test.ts && npm run typecheck`
Expected: PASS (9 Tests), Typecheck ohne Fehler

- [ ] **Step 5: Commit**

```bash
git add src/lib/schedule.ts src/lib/schedule.test.ts
git commit -m "Wochenplan: Tage erzeugen, ausfallen lassen, neu aufbauen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Planungsregeln II – Verschieben in beiden Modi

**Files:**
- Modify: `src/lib/schedule.ts`
- Test: `src/lib/schedule.test.ts`

**Interfaces:**
- Consumes: alles aus Task 3
- Produces:

```ts
/** Offene Trainings ab `from` nach hinten schieben; sie landen frühestens `today`, mindestens einen Tag später. */
export function postponeFrom(days: PlanDay[], from: string, today: string, ctx: PlanCtx): PlanDay[];
/** Alle vergessenen Tage verschieben, bis kein Tag vor `today` offene Trainings hat. */
export function postponeOverdue(days: PlanDay[], today: string, ctx: PlanCtx): PlanDay[];
```

„Heute Pause → Verschieben“ ist `postponeFrom(days, today, today, ctx)`.

- [ ] **Step 1: Failing tests anhängen**

Import in `src/lib/schedule.test.ts` erweitern um `postponeFrom, postponeOverdue`, dann anhängen:

```ts
describe("postponeFrom – Fortlaufend", () => {
  it("Pause am Dienstag schiebt alles einen Tag, auch den Ruhetag", () => {
    const days = postponeFrom(twoWeeks(), "2026-10-06", "2026-10-06", ctx());
    expect(view(days, MON, "2026-10-12")).toEqual([
      "05 Zone 2", "06 –", "07 Push", "08 Longrun", "09 Pull+Z2 kurz", "10 –", "11 Intervall", "12 Beine",
    ]);
    expect(days.find((d) => d.date === "2026-10-06")!.seq).toBeNull();
  });

  it("hängt den Überlauf hinten an und setzt die Reihenfolge danach fort", () => {
    const c = ctx();
    const days = postponeFrom(twoWeeks(c), "2026-10-06", "2026-10-06", c);
    expect(view(days, "2026-10-19", "2026-10-19")).toEqual(["19 Beine"]);
    expect(view(generate(days, "2026-10-20", "2026-10-20", c), "2026-10-20", "2026-10-20")).toEqual(["20 Zone 2"]);
  });

  it("lässt erledigte Trainings des Tages stehen", () => {
    const days = postponeFrom(markDone(twoWeeks(), "2026-10-08", "Pull"), "2026-10-08", "2026-10-08", ctx());
    expect(view(days, "2026-10-08", "2026-10-11")).toEqual(["08 Pull✓", "09 Z2 kurz", "10 –", "11 Intervall"]);
  });
});

describe("postponeFrom – Feste Woche", () => {
  it("der nächste Ruhetag fängt die Verschiebung auf", () => {
    const c = ctx("fixedWeek");
    const days = postponeFrom(twoWeeks(c), "2026-10-06", "2026-10-06", c);
    expect(view(days, "2026-10-06", "2026-10-12")).toEqual([
      "06 –", "07 Push", "08 Longrun", "09 Pull+Z2 kurz", "10 Intervall", "11 Beine", "12 Zone 2",
    ]);
  });

  it("was über Sonntag hinausfällt, wird am alten Tag ausgelassen", () => {
    const c = ctx("fixedWeek");
    const days = postponeFrom(twoWeeks(c), "2026-10-10", "2026-10-10", c);
    expect(view(days, "2026-10-10", "2026-10-12")).toEqual(["10 –", "11 Intervall+Beine✗", "12 Zone 2"]);
  });
});

describe("postponeOverdue", () => {
  it("Fortlaufend: vergessene Tage landen in ihrer Reihenfolge ab heute", () => {
    const days = postponeOverdue(markDone(twoWeeks(), MON, "Zone 2"), "2026-10-08", ctx());
    expect(view(days, "2026-10-06", "2026-10-11")).toEqual([
      "06 –", "07 –", "08 Push", "09 Longrun", "10 Pull+Z2 kurz", "11 –",
    ]);
  });

  it("Feste Woche: Vorwoche fällt weg, diese Woche rückt ab heute nach", () => {
    const c = ctx("fixedWeek");
    const days = postponeOverdue(twoWeeks(c), "2026-10-13", c);
    expect(view(days, MON, MON)).toEqual(["05 Zone 2✗"]);
    expect(view(days, "2026-10-11", "2026-10-16")).toEqual([
      "11 Beine✗", "12 –", "13 Zone 2", "14 Push", "15 Longrun", "16 Pull+Z2 kurz",
    ]);
    expect(overdue(days, "2026-10-13")).toEqual([]);
  });
});

describe("Moduswechsel", () => {
  it("Feste Woche richtet verschobene Tage wieder am Wochentag aus", () => {
    const shifted = postponeFrom(twoWeeks(), "2026-10-06", "2026-10-06", ctx()); // Fortlaufend: Mo 12. wäre Beine
    expect(view(shifted, "2026-10-12", "2026-10-12")).toEqual(["12 Beine"]);
    const fixed = rebuildFrom(shifted, "2026-10-12", ctx("fixedWeek"));
    expect(view(fixed, "2026-10-12", "2026-10-13")).toEqual(["12 Zone 2", "13 Push"]);
  });
});
```

- [ ] **Step 2: Tests laufen lassen, sie müssen scheitern**

Run: `npx vitest run src/lib/schedule.test.ts`
Expected: FAIL, `postponeFrom is not a function` bzw. Import-Fehler

- [ ] **Step 3: Umsetzung**

In `src/lib/schedule.ts` den Import erweitern auf `import { addDays, daysBetween, sundayOf, weekdayIndex } from "./days";`, unter `copy` den Helfer

```ts
const index = (days: PlanDay[]) => new Map(days.map((d) => [d.date, d]));
```

ergänzen und anhängen:

```ts
/** Offene Trainings ab `from` nach hinten schieben; sie landen frühestens `today`, mindestens einen Tag später. */
export function postponeFrom(days: PlanDay[], from: string, today: string, ctx: PlanCtx): PlanDay[] {
  const n = Math.max(1, daysBetween(from, today));
  return ctx.mode === "continuous" ? shiftContinuous(days, from, n) : shiftFixedWeek(days, from, n);
}

/** Fortlaufend: Ab `from` rückt jeder Tag samt Musterwochentag um n Tage weiter, davor entstehen Pausentage. */
function shiftContinuous(days: PlanDay[], from: string, n: number): PlanDay[] {
  const out = copy(days);
  const src = new Map(out.filter((d) => d.date >= from).map((d) => [d.date, { seq: d.seq, items: openItems(d) }]));
  if (!src.size) return out;
  const last = out[out.length - 1].date;
  for (let k = 1; k <= n; k++) out.push({ date: addDays(last, k), seq: null, items: [] });
  for (const d of out) {
    if (d.date < from) continue;
    const s = src.get(addDays(d.date, -n));
    d.items = [...keptItems(d), ...(s ? s.items : [])];
    d.seq = s ? s.seq : null;
  }
  return out;
}

/** Feste Woche: Trainings rücken nach, bis ein Tag ohne offene Trainings sie aufnimmt; nach Sonntag fallen sie weg. */
function shiftFixedWeek(days: PlanDay[], from: string, n: number): PlanDay[] {
  const out = copy(days);
  const map = index(out);
  const start = addDays(from, n);
  const queue: { origin: string; items: PlanItem[] }[] = [];
  for (let date = from; date <= sundayOf(from); date = addDays(date, 1)) {
    const d = map.get(date);
    if (!d) continue;
    const incoming = openItems(d);
    d.items = keptItems(d);
    if (incoming.length) queue.push({ origin: date, items: incoming });
    if (date >= start && queue.length) d.items.push(...queue.shift()!.items);
  }
  for (const g of queue) map.get(g.origin)!.items.push(...g.items.map((i) => ({ ...i, status: "skipped" as const })));
  return out;
}

/** Alle vergessenen Tage verschieben, bis kein Tag vor `today` offene Trainings hat. */
export function postponeOverdue(days: PlanDay[], today: string, ctx: PlanCtx): PlanDay[] {
  let out = copy(days);
  // Fortlaufend reicht ein Durchgang; Feste Woche braucht einen pro betroffener Woche
  for (let guard = 0; guard < 520; guard++) {
    const first = overdue(out, today)[0];
    if (!first) break;
    out = postponeFrom(out, first.date, today, ctx);
  }
  return out;
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run src/lib/schedule.test.ts && npm run typecheck`
Expected: PASS (17 Tests), Typecheck ohne Fehler

- [ ] **Step 5: Commit**

```bash
git add src/lib/schedule.ts src/lib/schedule.test.ts
git commit -m "Wochenplan: Verschieben fortlaufend und in fester Woche

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Planungsregeln III – Tauschen, Nachrücken, Ziehen, Entfernen

**Files:**
- Modify: `src/lib/schedule.ts`
- Test: `src/lib/schedule.test.ts`

**Interfaces:**
- Produces:

```ts
export function swapDays(days: PlanDay[], a: string, b: string): PlanDay[];
/** Offene Trainings von `target` kommen auf `today`, alles dazwischen rückt einen Tag weiter. */
export function pullForward(days: PlanDay[], today: string, target: string): PlanDay[];
/** "add": Item zusätzlich auf den Zieltag (oder auf einen leeren Tag verschieben). "swap": tauscht mit den offenen Items des Zieltags. */
export function moveItem(days: PlanDay[], itemId: string, target: string, how: "add" | "swap", today: string): PlanDay[];
/** Entfernt offene Items mit diesem Verweis ab `from`. */
export function removeRef(days: PlanDay[], ref: TrainingRef, from: string): PlanDay[];
```

- [ ] **Step 1: Failing tests anhängen**

Import erweitern um `moveItem, pullForward, removeRef, swapDays`, dann:

```ts
const idOf = (days: PlanDay[], date: string, label: string) => days.find((d) => d.date === date)!.items.find((i) => i.label === label)!.id;

describe("Tauschen und Ziehen", () => {
  it("swapDays tauscht die offenen Trainings zweier Tage", () => {
    expect(view(swapDays(twoWeeks(), "2026-10-06", "2026-10-07"), "2026-10-06", "2026-10-07")).toEqual(["06 Longrun", "07 Push"]);
  });

  it("swapDays lässt erledigte Trainings am Tag", () => {
    const days = swapDays(markDone(twoWeeks(), "2026-10-08", "Pull"), "2026-10-08", "2026-10-10");
    expect(view(days, "2026-10-08", "2026-10-10")).toEqual(["08 Pull✓+Intervall", "09 –", "10 Z2 kurz"]);
  });

  it("pullForward holt ein Training auf heute und rückt den Rest nach", () => {
    expect(view(pullForward(twoWeeks(), "2026-10-06", "2026-10-08"), "2026-10-06", "2026-10-09")).toEqual([
      "06 Pull+Z2 kurz", "07 Push", "08 Longrun", "09 –",
    ]);
  });

  it("moveItem verschiebt auf einen Ruhetag", () => {
    const days = twoWeeks();
    const out = moveItem(days, idOf(days, "2026-10-07", "Longrun"), "2026-10-09", "add", "2026-10-06");
    expect(view(out, "2026-10-07", "2026-10-09")).toEqual(["07 –", "08 Pull+Z2 kurz", "09 Longrun"]);
  });

  it("moveItem legt dazu oder tauscht mit dem belegten Tag", () => {
    const days = twoWeeks();
    const id = idOf(days, "2026-10-07", "Longrun");
    expect(view(moveItem(days, id, "2026-10-08", "add", "2026-10-06"), "2026-10-07", "2026-10-08")).toEqual(["07 –", "08 Pull+Z2 kurz+Longrun"]);
    expect(view(moveItem(days, id, "2026-10-08", "swap", "2026-10-06"), "2026-10-07", "2026-10-08")).toEqual(["07 Pull+Z2 kurz", "08 Longrun"]);
  });

  it("moveItem ignoriert vergangene Zieltage und erledigte Items", () => {
    const days = markDone(twoWeeks(), "2026-10-06", "Push");
    expect(moveItem(days, idOf(days, "2026-10-07", "Longrun"), MON, "add", "2026-10-06")).toEqual(days);
    expect(moveItem(days, idOf(days, "2026-10-06", "Push"), "2026-10-09", "add", "2026-10-06")).toEqual(days);
  });

  it("removeRef entfernt offene Termine ab dem Stichtag, Erledigtes bleibt", () => {
    const days = removeRef(markDone(twoWeeks(), "2026-10-06", "Push"), { kind: "routine", id: 1 }, "2026-10-06");
    expect(view(days, "2026-10-06", "2026-10-06")).toEqual(["06 Push✓"]);
    expect(view(days, "2026-10-13", "2026-10-13")).toEqual(["13 –"]);
  });
});
```

- [ ] **Step 2: Tests laufen lassen, sie müssen scheitern**

Run: `npx vitest run src/lib/schedule.test.ts`
Expected: FAIL, Import-Fehler für `swapDays`

- [ ] **Step 3: Umsetzung**

An `src/lib/schedule.ts` anhängen:

```ts
export function swapDays(days: PlanDay[], a: string, b: string): PlanDay[] {
  const out = copy(days);
  const map = index(out);
  const A = map.get(a), B = map.get(b);
  if (!A || !B || a === b) return out;
  const oa = openItems(A), ob = openItems(B);
  A.items = [...keptItems(A), ...ob];
  B.items = [...keptItems(B), ...oa];
  return out;
}

/** Offene Trainings von `target` kommen auf `today`, alles dazwischen rückt einen Tag weiter. */
export function pullForward(days: PlanDay[], today: string, target: string): PlanDay[] {
  const out = copy(days);
  const map = index(out);
  const dates: string[] = [];
  for (let d = today; d <= target; d = addDays(d, 1)) dates.push(d);
  const groups = dates.map((d) => openItems(map.get(d)));
  dates.forEach((date, k) => {
    const day = map.get(date);
    if (day) day.items = [...keptItems(day), ...(k === 0 ? groups[groups.length - 1] : groups[k - 1])];
  });
  return out;
}

export function moveItem(days: PlanDay[], itemId: string, target: string, how: "add" | "swap", today: string): PlanDay[] {
  const out = copy(days);
  const src = out.find((d) => d.items.some((i) => i.id === itemId && isOpen(i)));
  const dst = index(out).get(target);
  if (!src || !dst || src.date === target || target < today || src.date < today) return copy(days);
  const item = src.items.find((i) => i.id === itemId)!;
  src.items = src.items.filter((i) => i.id !== itemId);
  if (how === "swap") {
    src.items.push(...openItems(dst));
    dst.items = keptItems(dst);
  }
  dst.items.push(item);
  return out;
}

export function removeRef(days: PlanDay[], ref: TrainingRef, from: string): PlanDay[] {
  return copy(days).map((d) => (d.date < from ? d : { ...d, items: d.items.filter((i) => !(isOpen(i) && sameRef(i.ref, ref))) }));
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run src/lib/schedule.test.ts && npm run typecheck`
Expected: PASS (24 Tests), Typecheck ohne Fehler

- [ ] **Step 5: Commit**

```bash
git add src/lib/schedule.ts src/lib/schedule.test.ts
git commit -m "Wochenplan: tauschen, nachrücken, ziehen, entfernen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Laufziele prüfen und Laufart-Formular

**Files:**
- Create: `src/lib/runTarget.ts`
- Test: `src/lib/runTarget.test.ts`

**Interfaces:**
- Consumes: `parsePace`, `fmtPace`, `fmtMinutes`, `fmt`, `fmtInput`, `num` (format.ts), `RunPlan` (Task 2)
- Produces:

```ts
export type RunTarget = Pick<RunPlan, "targetKind" | "targetValue" | "paceMin" | "paceMax">;
export interface RunCheck { reached: boolean; pace: "in" | "fast" | "slow" | null; paceSec: number }
export function checkRun(plan: RunTarget, km: number, seconds: number): RunCheck;
export function describeTarget(plan: RunTarget): string;   // "45 min · 6:30–7:00 /km"
export interface RunPlanForm { name: string; targetKind: "duration" | "distance"; target: string; paceFrom: string; paceTo: string }
export type RunPlanErrors = Partial<Record<keyof RunPlanForm, string>>;
export function validateRunPlan(f: RunPlanForm): RunPlanErrors;
export function runPlanFromForm(f: RunPlanForm): Omit<RunPlan, "id" | "order">;
export function formFromRunPlan(p: RunPlan): RunPlanForm;
```

- [ ] **Step 1: Failing test schreiben**

```ts
// src/lib/runTarget.test.ts
import { describe, expect, it } from "vitest";
import { checkRun, describeTarget, formFromRunPlan, runPlanFromForm, validateRunPlan, type RunPlanForm } from "./runTarget";

const z2 = { targetKind: "duration" as const, targetValue: 45 * 60, paceMin: 390, paceMax: 420 };
const longrun = { targetKind: "distance" as const, targetValue: 15, paceMin: 375, paceMax: 405 };

describe("checkRun", () => {
  it("prüft Dauer und Pace", () => {
    expect(checkRun(z2, 7, 47 * 60)).toEqual({ reached: true, pace: "in", paceSec: 403 });
    expect(checkRun(z2, 8, 45 * 60).pace).toBe("fast");
    expect(checkRun(z2, 5, 40 * 60)).toMatchObject({ reached: false, pace: "slow" });
  });

  it("zählt knapp verfehlte Ziele als geschafft", () => {
    expect(checkRun(z2, 6.8, 44 * 60 + 50).reached).toBe(true);
    expect(checkRun(z2, 6.8, 43 * 60 + 59).reached).toBe(false);
    expect(checkRun(longrun, 14.95, 5600).reached).toBe(true);
    expect(checkRun(longrun, 14.8, 5600).reached).toBe(false);
  });

  it("ohne Pace-Bereich gibt es kein Pace-Urteil", () => {
    expect(checkRun({ ...longrun, paceMin: null, paceMax: null }, 15, 5600).pace).toBeNull();
    expect(checkRun({ ...longrun, paceMin: null }, 15, 15 * 300).pace).toBe("in");
  });
});

describe("describeTarget", () => {
  it("beschreibt Ziel und Pace", () => {
    expect(describeTarget(z2)).toBe("45 min · 6:30–7:00 /km");
    expect(describeTarget({ ...longrun, paceMin: null, paceMax: null })).toBe("15 km");
    expect(describeTarget({ ...longrun, paceMax: null })).toBe("15 km · nicht schneller als 6:15 /km");
    expect(describeTarget({ ...longrun, paceMin: null })).toBe("15 km · nicht langsamer als 6:45 /km");
  });
});

describe("Laufart-Formular", () => {
  const ok: RunPlanForm = { name: "Zone 2", targetKind: "duration", target: "45", paceFrom: "6,30", paceTo: "7:00" };

  it("wandelt Minuten und Pace in Sekunden und zurück", () => {
    expect(validateRunPlan(ok)).toEqual({});
    const p = runPlanFromForm(ok);
    expect(p).toEqual({ name: "Zone 2", targetKind: "duration", targetValue: 2700, paceMin: 390, paceMax: 420 });
    expect(formFromRunPlan({ ...p, id: 1, order: 0 })).toEqual({ ...ok, paceFrom: "6:30" });
  });

  it("erklärt Fehler am Feld", () => {
    expect(validateRunPlan({ ...ok, name: " " }).name).toBeTruthy();
    expect(validateRunPlan({ ...ok, target: "" }).target).toContain("Minuten");
    expect(validateRunPlan({ ...ok, targetKind: "distance", target: "0" }).target).toContain("km");
    expect(validateRunPlan({ ...ok, paceFrom: "6:99" }).paceFrom).toBeTruthy();
    expect(validateRunPlan({ ...ok, paceFrom: "7:10" }).paceTo).toBeTruthy();
    expect(validateRunPlan({ ...ok, paceFrom: "", paceTo: "" })).toEqual({});
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss scheitern**

Run: `npx vitest run src/lib/runTarget.test.ts`
Expected: FAIL, `Failed to resolve import "./runTarget"`

- [ ] **Step 3: Umsetzung**

```ts
// src/lib/runTarget.ts
import type { RunPlan } from "../db/types";
import { fmt, fmtInput, fmtMinutes, fmtPace, num, parsePace } from "./format";

export type RunTarget = Pick<RunPlan, "targetKind" | "targetValue" | "paceMin" | "paceMax">;
export interface RunCheck { reached: boolean; pace: "in" | "fast" | "slow" | null; paceSec: number }

// Kleine Toleranz, damit 44:50 bei 45 min nicht als verfehlt gilt
const TOLERANCE_SECONDS = 60;
const TOLERANCE_KM = 0.1;

export function checkRun(plan: RunTarget, km: number, seconds: number): RunCheck {
  const reached = plan.targetKind === "duration"
    ? seconds >= plan.targetValue - TOLERANCE_SECONDS
    : km >= plan.targetValue - TOLERANCE_KM - 1e-9;
  const paceSec = Math.round(seconds / km);
  let pace: RunCheck["pace"] = null;
  if (plan.paceMin !== null || plan.paceMax !== null) {
    pace = plan.paceMin !== null && paceSec < plan.paceMin ? "fast" : plan.paceMax !== null && paceSec > plan.paceMax ? "slow" : "in";
  }
  return { reached, pace, paceSec };
}

export function describeTarget(plan: RunTarget): string {
  const goal = plan.targetKind === "duration" ? fmtMinutes(plan.targetValue) : `${fmt(plan.targetValue, 1)} km`;
  const { paceMin: a, paceMax: b } = plan;
  if (a !== null && b !== null) return `${goal} · ${fmtPace(a)}–${fmtPace(b)} /km`;
  if (a !== null) return `${goal} · nicht schneller als ${fmtPace(a)} /km`;
  if (b !== null) return `${goal} · nicht langsamer als ${fmtPace(b)} /km`;
  return goal;
}

export interface RunPlanForm { name: string; targetKind: "duration" | "distance"; target: string; paceFrom: string; paceTo: string }
export type RunPlanErrors = Partial<Record<keyof RunPlanForm, string>>;

const optPace = (v: string) => (v.trim() ? parsePace(v) : null);

export function validateRunPlan(f: RunPlanForm): RunPlanErrors {
  const e: RunPlanErrors = {};
  if (!f.name.trim()) e.name = "Gib der Laufart einen Namen, z. B. Longrun.";
  if (!(num(f.target) > 0)) e.target = f.targetKind === "duration" ? "Trag die Dauer in Minuten ein, z. B. 45." : "Trag die Distanz in km ein, z. B. 10.";
  const a = optPace(f.paceFrom), b = optPace(f.paceTo);
  if (Number.isNaN(a)) e.paceFrom = "Pace als Minuten:Sekunden, z. B. 6:15.";
  if (Number.isNaN(b)) e.paceTo = "Pace als Minuten:Sekunden, z. B. 6:45.";
  if (a !== null && b !== null && !Number.isNaN(a) && !Number.isNaN(b) && a > b) e.paceTo = "„bis“ darf nicht schneller sein als „von“.";
  return e;
}

export function runPlanFromForm(f: RunPlanForm): Omit<RunPlan, "id" | "order"> {
  const t = num(f.target);
  return {
    name: f.name.trim(),
    targetKind: f.targetKind,
    targetValue: f.targetKind === "duration" ? Math.round(t * 60) : t,
    paceMin: optPace(f.paceFrom),
    paceMax: optPace(f.paceTo),
  };
}

export function formFromRunPlan(p: RunPlan): RunPlanForm {
  return {
    name: p.name,
    targetKind: p.targetKind,
    target: fmtInput(p.targetKind === "duration" ? p.targetValue / 60 : p.targetValue),
    paceFrom: p.paceMin !== null ? fmtPace(p.paceMin) : "",
    paceTo: p.paceMax !== null ? fmtPace(p.paceMax) : "",
  };
}
```

- [ ] **Step 4: Test laufen lassen**

Run: `npx vitest run src/lib/runTarget.test.ts && npm run typecheck`
Expected: PASS (6 Tests), Typecheck ohne Fehler

- [ ] **Step 5: Commit**

```bash
git add src/lib/runTarget.ts src/lib/runTarget.test.ts
git commit -m "Laufziele prüfen und Laufart-Formular validieren

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Plan-Tage speichern, Vorrat, Rückgängig

**Files:**
- Create: `src/db/schedule.ts`
- Test: `src/db/schedule.test.ts` (erweitern)

**Interfaces:**
- Consumes: Task 2–5
- Produces:

```ts
export async function planCtx(database?: AppDB): Promise<PlanCtx>;
export async function ensureHorizon(today?: string, database?: AppDB): Promise<void>;
export async function saveWeekSetup(patch: { weekTemplate?: TrainingRef[][]; shiftMode?: ShiftMode }, today?: string, database?: AppDB): Promise<void>;
export async function changePlan(fn: (days: PlanDay[], ctx: PlanCtx) => PlanDay[], database?: AppDB): Promise<void>;
export async function undoPlanChange(database?: AppDB): Promise<boolean>;
export async function findItem(itemId: string, database?: AppDB): Promise<{ day: PlanDay; item: PlanItem } | undefined>;
export async function openItemToday(ref: TrainingRef, today?: string, database?: AppDB): Promise<PlanItem | undefined>;
/** Nur innerhalb einer Transaktion aufrufen, die planDays einschließt. */
export async function setItemStatus(itemId: string, status: PlanItemStatus, database: AppDB): Promise<void>;
export async function refInUse(ref: TrainingRef, today?: string, database?: AppDB): Promise<boolean>;
/** Nur innerhalb einer Transaktion über settings + planDays aufrufen. */
export async function removeRefEverywhere(ref: TrainingRef, today: string, database: AppDB): Promise<void>;
export async function deleteRunPlan(id: number, today?: string, database?: AppDB): Promise<void>;
```

Standard für `today` ist `isoDate()`, für `database` das globale `db`.

- [ ] **Step 1: Failing tests anhängen**

In `src/db/schedule.test.ts` Imports ergänzen und anhängen:

```ts
import { isoDate } from "../lib/format";
import { addDays } from "../lib/days";
import { changePlan, deleteRunPlan, ensureHorizon, findItem, refInUse, saveWeekSetup, undoPlanChange } from "./schedule";
import { postponeFrom } from "../lib/schedule";
import type { TrainingRef } from "./types";

async function freshDb() { const d = new AppDB("plan-" + Math.random()); await d.open(); return d; }
async function withWeek(db: AppDB) {
  const push = (await db.routines.add({ name: "Push", order: 0 })) as number;
  const z2 = (await db.runPlans.add({ name: "Zone 2", targetKind: "duration", targetValue: 2700, paceMin: null, paceMax: null, order: 0 })) as number;
  const day: TrainingRef[] = [{ kind: "routine", id: push }, { kind: "runPlan", id: z2 }];
  await saveWeekSetup({ weekTemplate: [day, day, day, day, day, day, day] }, isoDate(), db);
  return { push, z2 };
}

describe("Plan-Speicher", () => {
  it("legt ohne Musterwoche keine Tage an", async () => {
    const db = await freshDb();
    await ensureHorizon(isoDate(), db);
    expect(await db.planDays.count()).toBe(0);
  });

  it("hält 14 Tage ab heute vor und benennt die Trainings", async () => {
    const db = await freshDb();
    await withWeek(db);
    await ensureHorizon(isoDate(), db);
    const days = await db.planDays.orderBy("date").toArray();
    expect(days.length).toBe(14);
    expect(days[0].date).toBe(isoDate());
    expect(days[13].date).toBe(addDays(isoDate(), 13));
    expect(days[0].items.map((i) => i.label)).toEqual(["Push", "Zone 2"]);
  });

  it("macht die letzte Plan-Änderung rückgängig", async () => {
    const db = await freshDb();
    await withWeek(db);
    const today = isoDate();
    await changePlan((d, c) => postponeFrom(d, today, today, c), db);
    expect((await db.planDays.get(today))!.items).toEqual([]);
    expect(await undoPlanChange(db)).toBe(true);
    expect((await db.planDays.get(today))!.items.length).toBe(2);
    expect(await undoPlanChange(db)).toBe(false);
  });

  it("Laufart löschen räumt Musterwoche und offene Termine auf", async () => {
    const db = await freshDb();
    const { z2 } = await withWeek(db);
    const ref: TrainingRef = { kind: "runPlan", id: z2 };
    expect(await refInUse(ref, isoDate(), db)).toBe(true);
    await deleteRunPlan(z2, isoDate(), db);
    expect(await refInUse(ref, isoDate(), db)).toBe(false);
    expect((await getSettings(db)).weekTemplate[0].map((r) => r.kind)).toEqual(["routine"]);
    expect(await findItem((await db.planDays.get(isoDate()))!.items[0].id, db)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Tests laufen lassen, sie müssen scheitern**

Run: `npx vitest run src/db/schedule.test.ts`
Expected: FAIL, `Failed to resolve import "./schedule"`

- [ ] **Step 3: Umsetzung**

```ts
// src/db/schedule.ts
import { db, getSettings, type AppDB } from "./db";
import type { PlanDay, PlanItem, PlanItemStatus, ShiftMode, TrainingRef } from "./types";
import { addDays } from "../lib/days";
import { isoDate } from "../lib/format";
import { generate, HORIZON_DAYS, rebuildFrom, refKey, removeRef, sameRef, type PlanCtx } from "../lib/schedule";

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

// Stand vor der letzten Plan-Änderung, solange die Meldung mit "Rückgängig" sichtbar ist
let undoSnapshot: PlanDay[] | null = null;

const planTables = (database: AppDB) => [database.planDays, database.settings, database.routines, database.runPlans];

export async function planCtx(database: AppDB = db): Promise<PlanCtx> {
  const [s, routines, runPlans] = await Promise.all([getSettings(database), database.routines.toArray(), database.runPlans.toArray()]);
  const names = new Map<string, string>([
    ...routines.map((r) => [refKey({ kind: "routine", id: r.id! }), r.name] as [string, string]),
    ...runPlans.map((r) => [refKey({ kind: "runPlan", id: r.id! }), r.name] as [string, string]),
  ]);
  return { template: s.weekTemplate, mode: s.shiftMode, label: (ref) => names.get(refKey(ref)) ?? "Training", newId: uid };
}

const hasTemplate = (ctx: PlanCtx) => ctx.template.some((d) => d.length > 0);

/** Füllt den Vorrat auf heute bis heute + 13 auf. Ohne Musterwoche passiert nichts. */
export async function ensureHorizon(today = isoDate(), database: AppDB = db) {
  await database.transaction("rw", planTables(database), async () => {
    const ctx = await planCtx(database);
    if (!hasTemplate(ctx)) return;
    const days = await database.planDays.toArray();
    const have = new Set(days.map((d) => d.date));
    const added = generate(days, today, addDays(today, HORIZON_DAYS - 1), ctx).filter((d) => !have.has(d.date));
    if (added.length) await database.planDays.bulkPut(added);
  });
}

/** Musterwoche oder Modus speichern; ab morgen wird neu geplant, heute bleibt. */
export async function saveWeekSetup(patch: { weekTemplate?: TrainingRef[][]; shiftMode?: ShiftMode }, today = isoDate(), database: AppDB = db) {
  await database.transaction("rw", planTables(database), async () => {
    await database.settings.put({ ...(await getSettings(database)), ...patch });
    const ctx = await planCtx(database);
    let days = rebuildFrom(await database.planDays.toArray(), addDays(today, 1), ctx);
    if (hasTemplate(ctx)) days = generate(days, today, addDays(today, HORIZON_DAYS - 1), ctx);
    await database.planDays.bulkPut(days);
    undoSnapshot = null;
  });
}

/** Führt eine Planungsregel aus und merkt sich den Stand davor für "Rückgängig". */
export async function changePlan(fn: (days: PlanDay[], ctx: PlanCtx) => PlanDay[], database: AppDB = db) {
  await database.transaction("rw", planTables(database), async () => {
    const days = await database.planDays.toArray();
    const next = fn(days, await planCtx(database));
    await database.planDays.bulkPut(next);
    undoSnapshot = days;
  });
}

export async function undoPlanChange(database: AppDB = db): Promise<boolean> {
  if (!undoSnapshot) return false;
  const snap = undoSnapshot;
  undoSnapshot = null;
  await database.transaction("rw", database.planDays, async () => {
    await database.planDays.clear();
    await database.planDays.bulkAdd(snap);
  });
  return true;
}

export async function findItem(itemId: string, database: AppDB = db): Promise<{ day: PlanDay; item: PlanItem } | undefined> {
  const day = await database.planDays.filter((d) => d.items.some((i) => i.id === itemId)).first();
  const item = day?.items.find((i) => i.id === itemId);
  return day && item ? { day, item } : undefined;
}

export async function openItemToday(ref: TrainingRef, today = isoDate(), database: AppDB = db): Promise<PlanItem | undefined> {
  const day = await database.planDays.get(today);
  return day?.items.find((i) => i.status === "planned" && sameRef(i.ref, ref));
}

export async function setItemStatus(itemId: string, status: PlanItemStatus, database: AppDB) {
  const found = await findItem(itemId, database);
  if (!found) return;
  found.day.items = found.day.items.map((i) => (i.id === itemId ? { ...i, status } : i));
  await database.planDays.put(found.day);
  undoSnapshot = null; // Ein erledigtes Training soll ein altes "Rückgängig" nicht zurückdrehen
}

export async function refInUse(ref: TrainingRef, today = isoDate(), database: AppDB = db): Promise<boolean> {
  const s = await getSettings(database);
  if (s.weekTemplate.some((d) => d.some((r) => sameRef(r, ref)))) return true;
  return (await database.planDays.where("date").aboveOrEqual(today).toArray())
    .some((d) => d.items.some((i) => i.status === "planned" && sameRef(i.ref, ref)));
}

export async function removeRefEverywhere(ref: TrainingRef, today: string, database: AppDB) {
  const s = await getSettings(database);
  await database.settings.put({ ...s, weekTemplate: s.weekTemplate.map((d) => d.filter((r) => !sameRef(r, ref))) });
  await database.planDays.bulkPut(removeRef(await database.planDays.toArray(), ref, today));
  undoSnapshot = null;
}

export async function deleteRunPlan(id: number, today = isoDate(), database: AppDB = db) {
  await database.transaction("rw", [database.runPlans, database.settings, database.planDays], async () => {
    await removeRefEverywhere({ kind: "runPlan", id }, today, database);
    await database.runPlans.delete(id);
  });
}
```

Hinweis: `withWeek` im Test ruft `saveWeekSetup`, das bereits den Vorrat anlegt. Der „Rückgängig“-Test braucht deshalb kein eigenes `ensureHorizon`.

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run src/db/schedule.test.ts && npm run typecheck`
Expected: PASS (6 Tests), Typecheck ohne Fehler

- [ ] **Step 5: Commit**

```bash
git add src/db/schedule.ts src/db/schedule.test.ts
git commit -m "Plan-Tage speichern, Vorrat auffüllen, Rückgängig

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Termine erledigen und freigeben

**Files:**
- Modify: `src/db/repo.ts`
- Test: `src/db/schedule.test.ts` (erweitern)

**Interfaces:**
- Consumes: `openItemToday`, `setItemStatus`, `removeRefEverywhere` (Task 7)
- Produces:

```ts
export async function startWorkout(routineId: number | null, database?: AppDB, opts?: { planItemId?: string | null; performedOn?: string | null }): Promise<WorkoutDraft>;
// finishWorkout: speichert planItemId an der Session und setzt den Termin auf "done"; mit performedOn: Datum 12:00, Dauer null
// deleteSession: Termin zurück auf "planned"
// deleteRoutine: entfernt den Plan aus Musterwoche und offenen Terminen
export async function saveRun(run: Omit<Run, "id">, id?: number, database?: AppDB): Promise<number>;
export async function deleteRun(id: number, database?: AppDB): Promise<void>;
```

Bestehende Aufrufe `startWorkout(id)` und `startWorkout(id, db)` funktionieren unverändert.

- [ ] **Step 1: Failing tests anhängen**

```ts
import { deleteRoutine, deleteRun, deleteSession, finishWorkout, saveRun, startWorkout } from "./repo";
import { setItemStatus } from "./schedule";

describe("Termine erledigen", () => {
  it("Kraftplan von heute wird beim Start zugeordnet und beim Beenden erledigt", async () => {
    const db = await freshDb();
    const { push } = await withWeek(db);
    const today = isoDate();
    const draft = await startWorkout(push, db);
    const itemId = (await db.planDays.get(today))!.items[0].id;
    expect(draft.planItemId).toBe(itemId);

    await db.routineExercises.add({ routineId: push, exerciseId: 1, order: 0 });
    const d = await startWorkout(push, db);
    d.exercises = [{ key: "x", exerciseId: 1, routineExerciseId: null, sets: [{ slotNumber: 1, isWarmup: false, weight: "60", reps: "8", targetWeight: null, targetReps: null, hint: null, completed: true }] }];
    const sessionId = (await finishWorkout(d, db))!;
    expect((await db.sessions.get(sessionId))!.planItemId).toBe(itemId);
    expect((await findItem(itemId, db))!.item.status).toBe("done");

    await deleteSession(sessionId, db);
    expect((await findItem(itemId, db))!.item.status).toBe("planned");
  });

  it("ein leeres Training erledigt den Termin nicht", async () => {
    const db = await freshDb();
    const { push } = await withWeek(db);
    const d = await startWorkout(push, db);
    expect(await finishWorkout(d, db)).toBeNull();
    expect((await findItem(d.planItemId!, db))!.item.status).toBe("planned");
  });

  it("Nachtrag speichert das Datum des Termins ohne Dauer", async () => {
    const db = await freshDb();
    const { push } = await withWeek(db);
    const d = await startWorkout(push, db, { planItemId: null, performedOn: "2026-10-06" });
    d.exercises = [{ key: "x", exerciseId: 1, routineExerciseId: null, sets: [{ slotNumber: 1, isWarmup: false, weight: "60", reps: "8", targetWeight: null, targetReps: null, hint: null, completed: true }] }];
    const s = (await db.sessions.get((await finishWorkout(d, db))!))!;
    expect(isoDate(new Date(s.performedAt))).toBe("2026-10-06");
    expect(s.durationSeconds).toBeNull();
    expect(s.planItemId).toBeUndefined();
  });

  it("Lauf mit Termin erledigt ihn, Löschen gibt ihn frei", async () => {
    const db = await freshDb();
    const { z2 } = await withWeek(db);
    const itemId = (await db.planDays.get(isoDate()))!.items[1].id;
    const runId = await saveRun({ date: isoDate(), km: 7, seconds: 2820, note: null, planItemId: itemId, runPlanId: z2 }, undefined, db);
    expect((await findItem(itemId, db))!.item.status).toBe("done");
    await deleteRun(runId, db);
    expect((await findItem(itemId, db))!.item.status).toBe("planned");
  });

  it("Kraftplan löschen räumt die Woche auf, erledigte Termine behalten den Namen", async () => {
    const db = await freshDb();
    const { push } = await withWeek(db);
    const today = isoDate();
    const tomorrow = addDays(today, 1);
    const itemId = (await db.planDays.get(today))!.items[0].id;
    await db.transaction("rw", db.planDays, () => setItemStatus(itemId, "done", db));
    await deleteRoutine(push, db);
    expect((await getSettings(db)).weekTemplate[0].map((r) => r.kind)).toEqual(["runPlan"]);
    expect((await db.planDays.get(tomorrow))!.items.map((i) => i.label)).toEqual(["Zone 2"]);
    expect((await findItem(itemId, db))!.item).toMatchObject({ status: "done", label: "Push" });
  });
});
```

- [ ] **Step 2: Tests laufen lassen, sie müssen scheitern**

Run: `npx vitest run src/db/schedule.test.ts`
Expected: FAIL, `saveRun` ist kein Export von `./repo`

- [ ] **Step 3: Umsetzung in `src/db/repo.ts`**

Imports ergänzen:

```ts
import type { DraftExercise, DraftSet, LoggedSet, RoutineExercise, Run, SetTemplate, WorkoutDraft } from "./types";
import { openItemToday, removeRefEverywhere, setItemStatus } from "./schedule";
import { isoDate, parseDay } from "../lib/format";
```

`startWorkout` ersetzen:

```ts
export async function startWorkout(
  routineId: number | null,
  database: AppDB = db,
  opts: { planItemId?: string | null; performedOn?: string | null } = {},
): Promise<WorkoutDraft> {
  // Steht der Plan heute an, wird das Training automatisch diesem Termin zugeordnet
  const planItemId = opts.planItemId !== undefined
    ? opts.planItemId
    : routineId !== null ? (await openItemToday({ kind: "routine", id: routineId }, isoDate(), database))?.id ?? null : null;
  const draft: WorkoutDraft = {
    key: "current", startedAt: new Date().toISOString(), routineId, routineName: null,
    notes: "", exercises: [], restEndsAt: null, planItemId, performedOn: opts.performedOn ?? null,
  };
  if (routineId !== null) {
    const routine = await database.routines.get(routineId);
    draft.routineName = routine?.name ?? null;
    const res = (await database.routineExercises.where("routineId").equals(routineId).toArray()).sort((a, b) => a.order - b.order);
    for (const re of res) {
      const templates = await database.setTemplates.where("routineExerciseId").equals(re.id!).toArray();
      draft.exercises.push(await buildDraftExercise(re.exerciseId, re, templates, database));
    }
  }
  await database.drafts.put(draft);
  return draft;
}
```

In `finishWorkout` die ersten beiden Zeilen und die Transaktion anpassen:

```ts
  // Nachtrag: Mittag des Termintags, keine Dauer
  const performedAt = draft.performedOn ? new Date(parseDay(draft.performedOn).setHours(12)).toISOString() : draft.startedAt;
  const durationSeconds = draft.performedOn ? null : Math.max(0, Math.round((Date.now() - new Date(draft.startedAt).getTime()) / 1000));
```

```ts
  return database.transaction("rw", [database.sessions, database.loggedExercises, database.loggedSets, database.drafts, database.planDays], async () => {
    if (!exercises.length) { await database.drafts.delete("current"); return null; }
    const sessionId = (await database.sessions.add({
      routineId: draft.routineId, routineName: draft.routineName, performedAt,
      notes: draft.notes.trim() || null, durationSeconds, ...(draft.planItemId ? { planItemId: draft.planItemId } : {}),
    })) as number;
    // … Schleife über exercises unverändert …
    if (draft.planItemId) await setItemStatus(draft.planItemId, "done", database);
    await database.drafts.delete("current");
    return sessionId;
  });
```

`deleteSession` ersetzen:

```ts
export async function deleteSession(id: number, database: AppDB = db) {
  await database.transaction("rw", [database.sessions, database.loggedExercises, database.loggedSets, database.planDays], async () => {
    const planItemId = (await database.sessions.get(id))?.planItemId;
    await database.loggedSets.where("workoutSessionId").equals(id).delete();
    await database.loggedExercises.where("workoutSessionId").equals(id).delete();
    await database.sessions.delete(id);
    if (planItemId) await setItemStatus(planItemId, "planned", database);
  });
}
```

`deleteRoutine`: Tabellenliste um `database.settings, database.planDays` erweitern und vor `await database.routines.delete(id);` einfügen:

```ts
    await removeRefEverywhere({ kind: "routine", id }, isoDate(), database);
```

Neue Funktionen anhängen (vor dem Sicherungsblock):

```ts
/** Lauf speichern; mit Termin wird dieser erledigt. Gibt die Lauf-ID zurück. */
export async function saveRun(run: Omit<Run, "id">, id?: number, database: AppDB = db): Promise<number> {
  return database.transaction("rw", [database.runs, database.planDays], async () => {
    let runId = id;
    if (id) await database.runs.update(id, run);
    else runId = (await database.runs.add(run)) as number;
    if (run.planItemId) await setItemStatus(run.planItemId, "done", database);
    return runId!;
  });
}

export async function deleteRun(id: number, database: AppDB = db) {
  await database.transaction("rw", [database.runs, database.planDays], async () => {
    const planItemId = (await database.runs.get(id))?.planItemId;
    await database.runs.delete(id);
    if (planItemId) await setItemStatus(planItemId, "planned", database);
  });
}
```

- [ ] **Step 4: Alle Tests laufen lassen**

Run: `npm test && npm run typecheck`
Expected: alle PASS (inkl. bestehender `repo.test.ts`), Typecheck ohne Fehler

- [ ] **Step 5: Commit**

```bash
git add src/db/repo.ts src/db/schedule.test.ts
git commit -m "Trainings und Läufe erledigen ihre Termine

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Grundlagen der Oberfläche

**Files:**
- Create: `src/lib/useToday.ts`, `src/components/plan/Marker.tsx`, `src/components/plan/names.ts`, `src/components/plan/actions.ts`
- Modify: `src/components/ui.tsx` (Toast), `src/App.tsx`

**Interfaces:**
- Produces:

```ts
export function useToday(): string;
export function Marker(p: { kind: "routine" | "runPlan"; status?: PlanItemStatus }): JSX.Element;
export interface PlanNames { routines: Routine[]; runPlans: RunPlan[]; name: (ref: TrainingRef, fallback?: string) => string; runPlan: (id: number) => RunPlan | undefined }
export function usePlanNames(): PlanNames | undefined;
export const itemName: (n: PlanNames, i: PlanItem) => string;
export function toast(msg: string, action?: { label: string; run: () => void }): void;
export const WEEKDAYS: string[];       // ["Mo", …, "So"]
export const WEEKDAYS_LONG: string[];  // ["Montag", …]
/** Plan-Änderung mit Meldung + "Rückgängig"; bei Fehler "Konnte nicht gespeichert werden." */
export async function planAction(fn: (days: PlanDay[], ctx: PlanCtx) => PlanDay[], msg: string): Promise<boolean>;
```

Die Routen `week` und `runplan/:id` kommen erst in Task 13 bzw. 10 dazu.

- [ ] **Step 1: `useToday`**

```ts
// src/lib/useToday.ts
import { useEffect, useState } from "react";
import { isoDate } from "./format";

/** Heutiges Datum; wird neu bestimmt, wenn die App wieder in den Vordergrund kommt (z. B. nach Mitternacht). */
export function useToday(): string {
  const [today, setToday] = useState(isoDate);
  useEffect(() => {
    const on = () => { if (document.visibilityState === "visible") setToday(isoDate()); };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return today;
}
```

- [ ] **Step 2: Marker und Namen**

```tsx
// src/components/plan/Marker.tsx
import type { PlanItemStatus } from "../../db/types";

/** Punkt (Kraft) oder Balken (Lauf). Gefüllt = gemacht, Ring = geplant, grau = ausgelassen. */
// Vollständige Klassennamen, damit Tailwind sie findet
const LOOK = {
  routine: { size: "h-2 w-2", planned: "ring-[1.5px] ring-inset ring-plate", done: "bg-plate" },
  runPlan: { size: "h-2 w-4", planned: "ring-[1.5px] ring-inset ring-track", done: "bg-track" },
};

export function Marker({ kind, status = "done" }: { kind: "routine" | "runPlan"; status?: PlanItemStatus }) {
  const l = LOOK[kind];
  const look = status === "skipped" ? "bg-line" : status === "planned" ? l.planned : l.done;
  return <span aria-hidden className={`inline-block shrink-0 rounded-full ${l.size} ${look}`} />;
}
```

```ts
// src/components/plan/names.ts
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db/db";
import type { PlanItem, Routine, RunPlan, TrainingRef } from "../../db/types";
import { refKey } from "../../lib/schedule";

export const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
export const WEEKDAYS_LONG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

export interface PlanNames {
  routines: Routine[];
  runPlans: RunPlan[];
  name: (ref: TrainingRef, fallback?: string) => string;
  runPlan: (id: number) => RunPlan | undefined;
}

/** Aktuelle Namen von Kraftplänen und Laufarten; gelöschte fallen auf den gespeicherten Namen zurück. */
export function usePlanNames(): PlanNames | undefined {
  return useLiveQuery(async () => {
    const [routines, runPlans] = await Promise.all([db.routines.orderBy("order").toArray(), db.runPlans.orderBy("order").toArray()]);
    const names = new Map<string, string>([
      ...routines.map((r) => [refKey({ kind: "routine", id: r.id! }), r.name] as [string, string]),
      ...runPlans.map((r) => [refKey({ kind: "runPlan", id: r.id! }), r.name] as [string, string]),
    ]);
    const plans = new Map(runPlans.map((r) => [r.id!, r]));
    return {
      routines, runPlans,
      name: (ref: TrainingRef, fallback = "Gelöschtes Training") => names.get(refKey(ref)) ?? fallback,
      runPlan: (id: number) => plans.get(id),
    };
  }, []);
}

export const itemName = (n: PlanNames, i: PlanItem) => n.name(i.ref, i.label);
```

Plan-Aktionen mit Fehlermeldung:

```ts
// src/components/plan/actions.ts
import { changePlan, undoPlanChange } from "../../db/schedule";
import type { PlanDay } from "../../db/types";
import type { PlanCtx } from "../../lib/schedule";
import { toast } from "../ui";

/** Führt eine Planungsregel aus und bietet "Rückgängig" an. Schlägt sie fehl, bleibt der alte Stand. */
export async function planAction(fn: (days: PlanDay[], ctx: PlanCtx) => PlanDay[], msg: string): Promise<boolean> {
  try {
    await changePlan(fn);
    toast(msg, { label: "Rückgängig", run: () => { undoPlanChange().catch(() => toast("Konnte nicht rückgängig machen.")); } });
    return true;
  } catch {
    toast("Konnte nicht gespeichert werden.");
    return false;
  }
}
```

- [ ] **Step 3: Toast mit Aktion**

In `src/components/ui.tsx` den Toast-Block ersetzen:

```tsx
type ToastMsg = { text: string; action?: { label: string; run: () => void } };
let toastSetter: ((m: ToastMsg | null) => void) | null = null;
export function toast(text: string, action?: ToastMsg["action"]) { toastSetter?.({ text, action }); }
export function Toaster() {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  useEffect(() => {
    toastSetter = setMsg;
    return () => { toastSetter = null; };
  }, []);
  useEffect(() => {
    if (!msg) return;
    // Mit "Rückgängig" etwas länger stehen lassen
    const t = setTimeout(() => setMsg(null), msg.action ? 5000 : 2400);
    return () => clearTimeout(t);
  }, [msg]);
  return (
    <div role="status" aria-live="polite"
      className={`fixed left-1/2 z-50 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-4 rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white shadow-lg ring-1 ring-white/10 transition-opacity ${msg ? "opacity-100" : "pointer-events-none opacity-0"}`}
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 5.5rem)" }}>
      <span>{msg?.text}</span>
      {msg?.action && (
        <button type="button" className="font-semibold text-plate" onClick={() => { msg.action!.run(); setMsg(null); }}>
          {msg.action.label}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Vorrat beim Start und bei Tageswechsel**

In `src/App.tsx`:

```tsx
import { ensureHorizon } from "./db/schedule";
import { useToday } from "./lib/useToday";
```

In `App()` nach dem Appearance-Effekt:

```tsx
  const today = useToday();
  useEffect(() => { ensureHorizon(today).catch(() => toast("Wochenplan konnte nicht geladen werden.")); }, [today]);
```

`toast` aus `./components/ui` mit importieren.

- [ ] **Step 5: Prüfen**

Run: `npm test && npm run typecheck`
Expected: PASS, keine Typfehler. Dann `npm run dev`, Startseite öffnen: keine Fehler in der Konsole, Toasts wie „Gewicht gespeichert“ (unter „Ich“) erscheinen weiter.

- [ ] **Step 6: Commit**

```bash
git add src/lib/useToday.ts src/components/plan src/components/ui.tsx src/App.tsx
git commit -m "Grundlagen für den Wochenplan in der Oberfläche

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Pläne-Tab – Musterwoche und Laufarten

**Files:**
- Create: `src/components/plan/WeekTemplateEditor.tsx`, `src/screens/RunPlanEdit.tsx`
- Modify: `src/screens/Routines.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: `saveWeekSetup`, `deleteRunPlan`, `refInUse` (Task 7); `usePlanNames`, `Marker`, `WEEKDAYS(_LONG)` (Task 9); `validateRunPlan`, `runPlanFromForm`, `formFromRunPlan`, `describeTarget` (Task 6)
- Produces: Route `runplan/:id`; Komponente `WeekTemplateEditor`

- [ ] **Step 1: Musterwoche-Editor**

```tsx
// src/components/plan/WeekTemplateEditor.tsx
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { getSettings } from "../../db/db";
import { saveWeekSetup } from "../../db/schedule";
import type { ShiftMode, TrainingRef } from "../../db/types";
import { Card, Section, Sheet } from "../ui";
import { Marker } from "./Marker";
import { usePlanNames, WEEKDAYS, WEEKDAYS_LONG } from "./names";

const MODES: [ShiftMode, string, string][] = [
  ["continuous", "Fortlaufend", "Trainings laufen als Reihenfolge weiter, die Wochentage verschieben sich mit."],
  ["fixedWeek", "Feste Woche", "Jeden Montag beginnt die Musterwoche neu, Ruhetage fangen Verschiebungen auf."],
];

export function WeekTemplateEditor() {
  const settings = useLiveQuery(() => getSettings(), []);
  const names = usePlanNames();
  const [addTo, setAddTo] = useState<number | null>(null);
  if (!settings || !names) return null;
  const tpl = settings.weekTemplate;

  const save = (weekTemplate: TrainingRef[][]) => saveWeekSetup({ weekTemplate });
  const add = (ref: TrainingRef) => {
    const next = tpl.map((d) => [...d]);
    next[addTo!].push(ref);
    setAddTo(null);
    save(next);
  };
  const remove = (day: number, k: number) => save(tpl.map((d, i) => (i === day ? d.filter((_, j) => j !== k) : d)));
  const options: [string, TrainingRef[]][] = [
    ["Krafttraining", names.routines.map((r) => ({ kind: "routine" as const, id: r.id! }))],
    ["Laufen", names.runPlans.map((r) => ({ kind: "runPlan" as const, id: r.id! }))],
  ];

  return (
    <Section title="Musterwoche">
      <Card>
        <ul className="divide-y divide-line">
          {WEEKDAYS.map((w, day) => (
            <li key={w} className="flex items-center gap-2 px-3 py-2">
              <span className="w-7 text-sm font-medium text-soft">{w}</span>
              <span className="flex flex-1 flex-wrap gap-1.5">
                {tpl[day].length ? tpl[day].map((ref, k) => (
                  <button key={k} type="button" onClick={() => remove(day, k)} aria-label={`${names.name(ref)} am ${WEEKDAYS_LONG[day]} entfernen`}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-surface-2 px-2 text-sm ring-1 ring-line">
                    <Marker kind={ref.kind} />{names.name(ref)}<span aria-hidden className="text-soft">✕</span>
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
        <span id="shift-label" className="text-sm font-medium">Beim Verschieben</span>
        <div className="grid grid-cols-2 gap-0.5 rounded-lg bg-surface-2 p-0.5 text-xs font-medium" role="radiogroup" aria-labelledby="shift-label">
          {MODES.map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={settings.shiftMode === k} onClick={() => saveWeekSetup({ shiftMode: k })}
              className={`min-h-9 rounded-md px-2.5 ${settings.shiftMode === k ? "bg-surface shadow-sm" : "text-soft"}`}>{l}</button>
          ))}
        </div>
      </div>
      <p className="mt-1.5 text-xs text-soft">{MODES.find(([k]) => k === settings.shiftMode)![2]}</p>

      <Sheet open={addTo !== null} onClose={() => setAddTo(null)} title={`Training am ${addTo !== null ? WEEKDAYS_LONG[addTo] : ""}`}>
        {options.map(([title, refs]) => (
          <div key={title} className="mb-4">
            <h3 className="mb-1.5 text-sm font-medium text-soft">{title}</h3>
            {refs.length ? (
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface shadow-sm">
                {refs.map((ref) => (
                  <li key={`${ref.kind}${ref.id}`}>
                    <button type="button" onClick={() => add(ref)} className="flex min-h-12 w-full items-center gap-2 px-4 text-left text-sm font-medium">
                      <Marker kind={ref.kind} />{names.name(ref)}
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-soft">Noch nichts angelegt. Leg es unten auf der Seite „Pläne“ an.</p>}
          </div>
        ))}
      </Sheet>
    </Section>
  );
}
```

- [ ] **Step 2: Pläne-Seite erweitern**

In `src/screens/Routines.tsx`, Funktion `Routines()`:
1. Imports: `WeekTemplateEditor`, `Marker`, `describeTarget`, `Section`, `Card`.
2. Laufarten laden: `const runPlans = useLiveQuery(() => db.runPlans.orderBy("order").toArray(), []);` und `if (!routines || !runPlans) return null;`
3. Zustand für neue Laufart: `const [runName, setRunName] = useState("");`
4. Anlegen:

```tsx
  const createRunPlan = async () => {
    const n = runName.trim();
    if (!n) { toast("Gib der Laufart einen Namen, z. B. Longrun."); return; }
    const id = await db.runPlans.add({ name: n, targetKind: "duration", targetValue: 45 * 60, paceMin: null, paceMax: null, order: runPlans.length });
    setRunName("");
    navigate(`runplan/${id}`);
  };
```

5. JSX: nach `<Header title="Pläne" />` den Einleitungstext ersetzen durch

```tsx
      <p className="mb-2 text-sm text-soft">Leg fest, an welchem Tag welches Training dran ist. Die App schlägt dir jeden Tag das passende vor und hilft beim Verschieben.</p>
      <WeekTemplateEditor />
      <Section title="Krafttraining">
```

   und den bisherigen Inhalt (Liste der Pläne + Eingabe „Neuer Plan“) in diese Section packen (schließendes `</Section>` danach).
6. Danach:

```tsx
      <Section title="Laufen">
        {!runPlans.length && <Empty>Noch keine Laufart. Leg unten z. B. „Zone 2“ oder „Longrun“ an.</Empty>}
        {runPlans.length > 0 && (
          <Card>
            <ul className="divide-y divide-line">
              {runPlans.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => navigate(`runplan/${p.id}`)} className="flex min-h-13 w-full items-center gap-3 px-4 py-2 text-left">
                    <Marker kind="runPlan" />
                    <span className="flex-1 text-sm font-medium">{p.name}</span>
                    <span className="text-xs text-soft">{describeTarget(p)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <div className="mt-3 flex gap-2">
          <Input placeholder="Neue Laufart, z. B. Longrun" value={runName} onChange={(e) => setRunName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createRunPlan()} aria-label="Name der neuen Laufart" />
          <Button variant="primary" onClick={createRunPlan}>Anlegen</Button>
        </div>
      </Section>
```

7. `RoutineEdit.removeRoutine`: Rückfrage erweitern:

```tsx
    const inUse = await refInUse({ kind: "routine", id });
    if (!confirm(inUse
      ? `„${routine.name}“ steckt in deiner Woche und wird dort entfernt. Bisherige Trainings bleiben erhalten. Löschen?`
      : `Plan „${routine.name}“ löschen? Deine bisherigen Trainings und Gewichtsvorschläge bleiben erhalten.`)) return;
```

- [ ] **Step 3: Laufart bearbeiten**

```tsx
// src/screens/RunPlanEdit.tsx
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
```

- [ ] **Step 4: Route ergänzen**

In `src/App.tsx`: `import { RunPlanEdit } from "./screens/RunPlanEdit";`, im `switch`:

```tsx
    case "runplan": screen = <RunPlanEdit id={id!} key={id} />; break;
```

und `PARENT` um `runplan: "routines"` ergänzen.

- [ ] **Step 5: Prüfen im Browser**

Run: `npm run typecheck && npm run dev`
Im Browser (Handybreite, z. B. 400 px):
1. Pläne → Laufen → „Zone 2“ anlegen → Dauer 45, Pace „6,30“ bis „7:00“ → Speichern. Liste zeigt „45 min · 6:30–7:00 /km“.
2. Pace „7:10“ bis „7:00“ → Speichern zeigt „„bis“ darf nicht schneller sein als „von““.
3. Musterwoche: Mo „+“ → Zone 2, Di „+“ → ein Kraftplan. Chips erscheinen.
4. Modus auf „Feste Woche“ und zurück; Erklärtext wechselt.
Expected: alles wie beschrieben, keine Konsolenfehler.

- [ ] **Step 6: Commit**

```bash
git add src/components/plan/WeekTemplateEditor.tsx src/screens/RunPlanEdit.tsx src/screens/Routines.tsx src/App.tsx
git commit -m "Pläne: Musterwoche, Verschiebe-Modus und Laufarten

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Lauf eintragen mit Ziel und Soll/Ist

**Files:**
- Modify: `src/screens/RunForm.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: `findItem` (Task 7), `saveRun`, `deleteRun` (Task 8), `checkRun`, `describeTarget` (Task 6)
- Produces: Route `run?item=<planItemId>` öffnet das Formular für einen Termin

- [ ] **Step 1: Route übergibt den Termin**

In `src/App.tsx` die Zeile für `run` ersetzen:

```tsx
    case "run": screen = <RunForm id={id} itemId={params.item} key={id ?? params.item ?? "new"} />; break;
```

- [ ] **Step 2: Formular erweitern**

In `src/screens/RunForm.tsx`:

Imports:

```tsx
import { deleteRun, saveRun } from "../db/repo";
import { findItem } from "../db/schedule";
import { checkRun, describeTarget } from "../lib/runTarget";
```

`Card` in die bestehende Importzeile aus `../components/ui` aufnehmen, `fmtPace` in die aus `../lib/format`.

Signatur und Laden:

```tsx
export function RunForm({ id, itemId }: { id?: number; itemId?: string }) {
  const existing = useLiveQuery(async () => (id ? (await db.runs.get(id)) ?? null : null), [id]);
  // Termin aus dem Wochenplan (neu) oder vom gespeicherten Lauf (bearbeiten)
  const planned = useLiveQuery(async () => {
    const found = itemId ? await findItem(itemId) : undefined;
    const runPlanId = existing?.runPlanId ?? (found?.item.ref.kind === "runPlan" ? found.item.ref.id : undefined);
    const plan = runPlanId ? await db.runPlans.get(runPlanId) : undefined;
    return { date: found?.day.date ?? null, label: found?.item.label ?? null, plan: plan ?? null };
  }, [itemId, existing?.runPlanId]);
```

Nach dem bestehenden `useEffect` für `existing`:

```tsx
  useEffect(() => { if (!id && planned?.date) setDate(planned.date); }, [id, planned?.date]);
```

`save` und `remove` ersetzen:

```tsx
  const save = async () => {
    if (!(distance > 0) || !(seconds > 0)) { toast("Trag Distanz und Zeit ein."); return; }
    const planItemId = existing?.planItemId ?? itemId;
    const runPlanId = existing?.runPlanId ?? planned?.plan?.id;
    await saveRun({
      date: date || isoDate(), km: distance, seconds: Math.round(seconds), note: note.trim() || null,
      ...(planItemId ? { planItemId } : {}), ...(runPlanId ? { runPlanId } : {}),
    }, id);
    toast("Lauf gespeichert");
    back("home");
  };
  const remove = async () => {
    if (!id || !confirm("Diesen Lauf endgültig löschen?")) return;
    await deleteRun(id);
    toast("Lauf gelöscht");
    navigate("history", true);
  };
```

Vor `if (id && existing === undefined) return null;` nichts ändern; danach ergänzen:

```tsx
  const plan = planned?.plan ?? null;
  const check = plan && distance > 0 && seconds > 0 ? checkRun(plan, distance, seconds) : null;
  const title = id ? "Lauf bearbeiten" : plan?.name ?? planned?.label ?? "Lauf";
```

JSX: `<Header title={…} onBack />` → `<Header title={title} onBack />`; direkt danach:

```tsx
      {plan && (
        <Card className="mb-4 p-3">
          <span className="block text-xs font-medium text-soft">{id ? "Geplant war" : "Heute geplant"}</span>
          <span className="mt-0.5 block text-lg font-semibold tracking-tight">{describeTarget(plan)}</span>
        </Card>
      )}
```

Nach dem Pace-Absatz (`<p className="mt-5 … aria-live="polite">…</p>`):

```tsx
      {check && plan && (
        <Card className="mt-3 divide-y divide-line">
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
            <span className="text-soft">{plan.targetKind === "duration" ? "Dauer" : "Distanz"}</span>
            <span className={`font-medium ${check.reached ? "text-ok" : "text-soft"}`}>{check.reached ? "✓ Ziel geschafft" : "Ziel nicht ganz erreicht"}</span>
          </div>
          {check.pace && (
            <div className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
              <span className="text-soft">Pace {fmtPace(check.paceSec)} /km</span>
              <span className={`font-medium ${check.pace === "in" ? "text-ok" : "text-plate-ink"}`}>
                {check.pace === "in" ? "✓ im Bereich" : check.pace === "fast" ? "schneller als geplant" : "langsamer als geplant"}
              </span>
            </div>
          )}
        </Card>
      )}
```

Die Imports `db` bleiben (für `useLiveQuery`), direkte Aufrufe `db.runs.add/update/delete` entfallen.

- [ ] **Step 3: Prüfen**

Run: `npm test && npm run typecheck && npm run dev`
Im Browser `#/run` öffnen: Lauf ohne Termin eintragen, speichern, im Verlauf öffnen, löschen.
Expected: Typecheck grün, Formular ohne Termin verhält sich wie bisher. Der Weg mit Termin (Ziel oben, Soll/Ist) wird in Task 12, Step 6 geprüft, weil erst dort die Startseite den Termin öffnet.

- [ ] **Step 4: Commit**

```bash
git add src/screens/RunForm.tsx src/App.tsx
git commit -m "Lauf eintragen mit Ziel und Soll/Ist-Vergleich

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Startseite – Heute, vergessene Tage, Pause, Was anderes

**Files:**
- Create: `src/components/plan/TodayPlan.tsx`, `src/components/plan/OverdueBanner.tsx`, `src/components/plan/WeekPreview.tsx`
- Modify: `src/screens/Home.tsx`, `src/screens/Workout.tsx`

**Interfaces:**
- Consumes: Task 3–9
- Produces: `TodayPlan({ today })`, `OverdueBanner({ days, today, names })`, `WeekPreview({ before, after, from, names })`

- [ ] **Step 1: Vorschau der Woche**

```tsx
// src/components/plan/WeekPreview.tsx
import type { PlanDay } from "../../db/types";
import { addDays, weekdayIndex } from "../../lib/days";
import { Marker } from "./Marker";
import { itemName, WEEKDAYS, type PlanNames } from "./names";

const sig = (d: PlanDay | undefined) => JSON.stringify(d?.items.map((i) => [i.id, i.status]) ?? []);

/** 7 Tage ab `from` nach der Änderung; geänderte Tage sind hervorgehoben. */
export function WeekPreview({ before, after, from, names }: { before: PlanDay[]; after: PlanDay[]; from: string; names: PlanNames }) {
  const dates = [...Array(7)].map((_, k) => addDays(from, k));
  const b = new Map(before.map((d) => [d.date, d]));
  const a = new Map(after.map((d) => [d.date, d]));
  return (
    <div className="grid grid-cols-7 gap-0.5 text-center text-[11px]">
      {dates.map((date) => {
        const day = a.get(date);
        const changed = sig(day) !== sig(b.get(date));
        const items = day?.items ?? [];
        return (
          <div key={date} className={`rounded-md px-0.5 py-1 ${changed ? "bg-tint ring-1 ring-plate/30" : "bg-surface-2"}`}>
            <div className="font-medium text-soft">{WEEKDAYS[weekdayIndex(date)]}</div>
            <div className="mt-1 flex min-h-2 flex-wrap justify-center gap-0.5">{items.map((i) => <Marker key={i.id} kind={i.ref.kind} status={i.status} />)}</div>
            <div className="mt-0.5 truncate font-medium">{items.length ? items.map((i) => itemName(names, i)).join(" + ") : "Pause"}</div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Hinweis auf vergessene Tage**

```tsx
// src/components/plan/OverdueBanner.tsx
import { db } from "../../db/db";
import { startWorkout } from "../../db/repo";
import type { PlanDay, PlanItem } from "../../db/types";
import { parseDay } from "../../lib/format";
import { navigate } from "../../lib/router";
import { openItems, postponeOverdue, skipOverdue } from "../../lib/schedule";
import { Button, Card, toast } from "../ui";
import { planAction } from "./actions";
import { itemName, type PlanNames } from "./names";

const longDay = (iso: string) => parseDay(iso).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "numeric" });

export function OverdueBanner({ days, today, names }: { days: PlanDay[]; today: string; names: PlanNames }) {
  const total = days.reduce((t, d) => t + openItems(d).length, 0);
  const single = days.length === 1 ? days[0] : null;

  const catchUp = async (item: PlanItem, date: string) => {
    if (item.ref.kind === "runPlan") { navigate(`run?item=${item.id}`); return; }
    if (await db.drafts.get("current")) { toast("Es läuft schon ein Training."); navigate("workout"); return; }
    await startWorkout(item.ref.id, db, { planItemId: item.id, performedOn: date });
    navigate("workout");
  };

  return (
    <Card className="mt-5 border-plate/40 p-4">
      <p className="text-sm font-semibold">
        {single
          ? `${longDay(single.date)}: ${openItems(single).map((i) => itemName(names, i)).join(" + ")} nicht eingetragen`
          : `${total} Termine aus den letzten Tagen sind offen`}
      </p>
      <p className="mt-0.5 text-xs text-soft">Hast du trainiert, trag es nach. Sonst verschieben oder als ausgelassen markieren.</p>
      <div className="mt-3 grid gap-2">
        {single && openItems(single).map((i) => (
          <Button key={i.id} onClick={() => catchUp(i, single.date)}>{itemName(names, i)} nachtragen</Button>
        ))}
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => planAction((d, c) => postponeOverdue(d, today, c), "Verschoben")}>{single ? "Verschieben" : "Alle verschieben"}</Button>
          <Button onClick={() => planAction((d) => skipOverdue(d, today), "Als ausgelassen markiert")}>{single ? "Ausgelassen" : "Alle ausgelassen"}</Button>
        </div>
      </div>
    </Card>
  );
}
```

- [ ] **Step 3: Heute-Bereich mit Auswahlfenstern**

```tsx
// src/components/plan/TodayPlan.tsx
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db } from "../../db/db";
import { startWorkout } from "../../db/repo";
import { planCtx } from "../../db/schedule";
import type { PlanDay, PlanItem } from "../../db/types";
import { addDays } from "../../lib/days";
import { niceDate } from "../../lib/format";
import { navigate } from "../../lib/router";
import { describeTarget } from "../../lib/runTarget";
import { HORIZON_DAYS, openItems, overdue, postponeFrom, pullForward, skipDay, swapDays } from "../../lib/schedule";
import { Button, Card, Empty, Section, Sheet } from "../ui";
import { planAction } from "./actions";
import { Marker } from "./Marker";
import { itemName, usePlanNames, type PlanNames } from "./names";
import { OverdueBanner } from "./OverdueBanner";
import { WeekPreview } from "./WeekPreview";

export function TodayPlan({ today }: { today: string }) {
  const names = usePlanNames();
  const days = useLiveQuery(() => db.planDays.where("date").between(addDays(today, -60), addDays(today, HORIZON_DAYS + 30), true, true).toArray(), [today]);
  const [sheet, setSheet] = useState<null | "pause" | "other">(null);
  if (!days || !names) return null;

  const todayDay = days.find((d) => d.date === today);
  const open = openItems(todayDay);
  const late = overdue(days, today);
  const next = days.filter((d) => d.date > today && openItems(d).length).slice(0, 2);

  return (
    <>
      {late.length > 0 && <OverdueBanner days={late} today={today} names={names} />}
      <Section title="Heute">
        {open.length
          ? <div className="grid gap-2">{open.map((i) => <TodayCard key={i.id} item={i} names={names} />)}</div>
          : <Empty>{todayDay?.items.length ? "Alles erledigt für heute. Stark!" : "Heute ist Ruhetag. Erhol dich gut."}</Empty>}
        <div className={`mt-2 grid gap-2 ${open.length ? "grid-cols-3" : "grid-cols-2"}`}>
          {open.length > 0 && <Button className="px-2" onClick={() => setSheet("pause")}>Heute Pause</Button>}
          <Button className="px-2" onClick={() => setSheet("other")}>Was anderes</Button>
          <Button className="px-2" onClick={() => navigate("week")}>Woche ändern</Button>
        </div>
      </Section>

      {next.length > 0 && (
        <Section title="Als Nächstes" action={<button type="button" className="text-sm font-semibold text-plate-ink" onClick={() => navigate("week")}>Ganze Woche</button>}>
          <Card>
            <ul className="divide-y divide-line">
              {next.map((d) => (
                <li key={d.date} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="w-20 shrink-0 text-xs text-soft">{niceDate(d.date)}</span>
                  <span className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                    {openItems(d).map((i) => <span key={i.id} className="inline-flex items-center gap-1.5 font-medium"><Marker kind={i.ref.kind} status="planned" />{itemName(names, i)}</span>)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      )}

      <PauseSheet open={sheet === "pause"} onClose={() => setSheet(null)} today={today} days={days} names={names} />
      <OtherSheet open={sheet === "other"} onClose={() => setSheet(null)} today={today} days={days} names={names} />
    </>
  );
}

function TodayCard({ item, names }: { item: PlanItem; names: PlanNames }) {
  const name = itemName(names, item);
  if (item.ref.kind === "runPlan") {
    const plan = names.runPlan(item.ref.id);
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2"><Marker kind="runPlan" status="planned" /><span className="font-semibold">{name}</span></div>
        {plan && <p className="mt-1 text-sm text-soft">{describeTarget(plan)}</p>}
        <Button variant="plate" className="mt-3 w-full" onClick={() => navigate(`run?item=${item.id}`)}>Ergebnis eintragen</Button>
      </Card>
    );
  }
  const routineId = item.ref.id;
  const start = async () => {
    if (await db.drafts.get("current")) { navigate("workout"); return; }
    await startWorkout(routineId, db, { planItemId: item.id });
    navigate("workout");
  };
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2"><Marker kind="routine" status="planned" /><span className="font-semibold">{name}</span></div>
      <Button variant="plate" className="mt-3 w-full" onClick={start}>Training starten</Button>
    </Card>
  );
}

type SheetProps = { open: boolean; onClose: () => void; today: string; days: PlanDay[]; names: PlanNames };

function PauseSheet({ open, onClose, today, days, names }: SheetProps) {
  const [how, setHow] = useState<"shift" | "skip">("shift");
  const ctx = useLiveQuery(() => planCtx(), []);
  const names0 = openItems(days.find((d) => d.date === today)).map((i) => itemName(names, i)).join(" + ");
  const preview = ctx ? (how === "shift" ? postponeFrom(days, today, today, ctx) : skipDay(days, today)) : days;
  const confirm = async () => {
    if (await planAction((d, c) => (how === "shift" ? postponeFrom(d, today, today, c) : skipDay(d, today)), how === "shift" ? "Trainings verschoben" : "Training ausgelassen")) onClose();
  };
  const choice = (k: "shift" | "skip", title: string, text: string) => (
    <button type="button" role="radio" aria-checked={how === k} onClick={() => setHow(k)}
      className={`block w-full rounded-lg p-3 text-left ${how === k ? "bg-tint ring-2 ring-plate" : "ring-1 ring-line"}`}>
      <span className="block text-sm font-semibold">{title}</span>
      <span className="mt-0.5 block text-xs text-soft">{text}</span>
    </button>
  );
  return (
    <Sheet open={open} onClose={onClose} title="Heute Pause">
      <p className="mb-3 text-sm text-soft">Was soll mit {names0 || "dem heutigen Training"} passieren?</p>
      <div className="grid gap-2" role="radiogroup" aria-label="Pause">
        {choice("shift", "Verschieben", ctx?.mode === "fixedWeek" ? "Rückt bis zum nächsten Ruhetag dieser Woche nach." : "Alles rutscht einen Tag nach hinten.")}
        {choice("skip", "Ausfallen lassen", "Fällt aus, der Rest bleibt, wo er ist.")}
      </div>
      <p className="mt-4 mb-1.5 text-xs font-medium text-soft">So sieht die Woche danach aus</p>
      <WeekPreview before={days} after={preview} from={today} names={names} />
      <Button variant="plate" className="mt-4 w-full" onClick={confirm}>Pause eintragen</Button>
    </Sheet>
  );
}

function OtherSheet({ open, onClose, today, days, names }: SheetProps) {
  const [target, setTarget] = useState<string | null>(null);
  const [shift, setShift] = useState(false);
  const options = days.filter((d) => d.date > today && openItems(d).length).slice(0, 10);
  const close = () => { setTarget(null); setShift(false); onClose(); };
  const confirm = async () => {
    if (!target) return;
    if (await planAction((d) => (shift ? pullForward(d, today, target) : swapDays(d, today, target)), shift ? "Vorgezogen, der Rest rückt nach" : "Getauscht")) close();
  };
  const free = async () => {
    if (!(await db.drafts.get("current"))) await startWorkout(null, db, { planItemId: null });
    close();
    navigate("workout");
  };
  return (
    <Sheet open={open} onClose={close} title="Heute was anderes machen">
      <p className="mb-3 text-sm text-soft">Das gewählte Training kommt auf heute.</p>
      {options.length ? (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface shadow-sm" role="radiogroup" aria-label="Training für heute">
          {options.map((d) => (
            <li key={d.date}>
              <button type="button" role="radio" aria-checked={target === d.date} onClick={() => setTarget(d.date)}
                className={`flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left text-sm ${target === d.date ? "bg-tint" : ""}`}>
                <span className="w-20 shrink-0 text-xs text-soft">{niceDate(d.date)}</span>
                <span className="flex flex-1 flex-wrap gap-x-3">{openItems(d).map((i) => <span key={i.id} className="inline-flex items-center gap-1.5 font-medium"><Marker kind={i.ref.kind} status="planned" />{itemName(names, i)}</span>)}</span>
                {target === d.date && <span aria-hidden className="text-plate-ink">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : <Empty>In den nächsten Tagen ist nichts geplant.</Empty>}
      <label className="mt-3 flex min-h-11 items-center justify-between gap-3 text-sm">
        <span>Statt tauschen: alles dazwischen rückt einen Tag nach</span>
        <input type="checkbox" checked={shift} onChange={(e) => setShift(e.target.checked)} className="h-5 w-5 accent-[var(--plate)]" />
      </label>
      <Button variant="plate" className="mt-2 w-full" disabled={!target} onClick={confirm}>Heute machen</Button>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button onClick={free}>Freies Training</Button>
        <Button onClick={() => { close(); navigate("run"); }}>Lauf ohne Plan</Button>
      </div>
    </Sheet>
  );
}
```

- [ ] **Step 4: Startseite einbinden**

In `src/screens/Home.tsx`:
1. Imports: `getSettings` aus `../db/db`, `TodayPlan`, `Marker`, `useToday`, `parseDay` aus format, `db.planDays`.
2. `const today = useToday();` am Anfang; `const days = weekDays(parseDay(today));` statt `weekDays()`; die spätere Zeile `const today = isoDate();` entfernen.
3. Die Abfrage erweitern:

```tsx
  const to = isoDate(days[6]);
  const data = useLiveQuery(async () => {
    const [sessions, runs, routines, draft, sets, settings, planDays] = await Promise.all([
      db.sessions.toArray(),
      db.runs.where("date").aboveOrEqual(from).toArray(),
      db.routines.orderBy("order").toArray(),
      db.drafts.get("current"),
      db.loggedSets.where("performedAt").aboveOrEqual(new Date(days[0]).toISOString()).toArray(),
      getSettings(),
      db.planDays.where("date").between(from, to, true, true).toArray(),
    ]);
    const weekSessions = sessions.filter((s) => localDay(s.performedAt) >= from);
    const volume = sets.filter((s) => !s.isWarmup).reduce((t, s) => t + s.weight * s.reps, 0);
    return { weekSessions, runs, routines, draft, volume, settings, planDays };
  }, [from, to]);
```

   und unten `const { weekSessions, runs, routines, draft, volume, settings, planDays } = data;`
4. `const planActive = settings.weekTemplate.some((d) => d.length > 0);`
5. Wochenstreifen: pro Tag

```tsx
          const plan = planDays.find((p) => p.date === iso);
          const gym = weekSessions.filter((s) => localDay(s.performedAt) === iso && !s.planItemId).length;
          const run = runs.filter((r) => r.date === iso && !r.planItemId).length;
```

   und die Markierungen ersetzen durch:

```tsx
              <span className="mt-1 flex flex-col items-center gap-1">
                {plan?.items.map((i) => <Marker key={i.id} kind={i.ref.kind} status={i.status} />)}
                {[...Array(gym)].map((_, k) => <Marker key={"g" + k} kind="routine" />)}
                {[...Array(run)].map((_, k) => <Marker key={"r" + k} kind="runPlan" />)}
              </span>
```

   `aria-label` des Tages: `${DAYS[i]} ${d.getDate()}.: ${plan?.items.map((x) => `${x.label} ${x.status === "done" ? "erledigt" : x.status === "skipped" ? "ausgelassen" : "geplant"}`).join(", ") || "frei"}${gym + run ? `, ${gym + run} ohne Plan` : ""}`.
6. Den Block `{draft ? (…) : (<Section title="Training starten">…</Section>)}` so ändern, dass bei laufendem Training die Karte bleibt und sonst gilt:

```tsx
      ) : planActive ? (
        <TodayPlan today={today} />
      ) : (
        <Section title="Training starten">
```

   Ab hier bleibt der bisherige Inhalt der Section „Training starten“ unverändert (Plan-Knöpfe, „Freies Training“, „Lauf eintragen“, Hinweis ohne Pläne). Direkt vor ihrem schließenden `</Section>` ergänzen:

```tsx
          <p className="mt-2 text-sm text-soft">Tipp: Unter „Pläne“ legst du deine Musterwoche an, dann schlägt dir die App jeden Tag das passende Training vor.</p>
```

- [ ] **Step 5: Nachtrag im Training anzeigen**

In `src/screens/Workout.tsx` direkt nach dem `<Header … />` des laufenden Trainings:

```tsx
      {draft.performedOn && <p className="-mt-1 mb-3 text-sm text-soft">Nachtrag für {niceDate(draft.performedOn)}</p>}
```

`niceDate` aus `../lib/format` importieren.

- [ ] **Step 6: Prüfen im Browser**

Run: `npm test && npm run typecheck && npm run dev` (Handybreite 400 px)
1. Musterwoche wie im Konzept anlegen (mindestens: heute ein Kraftplan, morgen eine Laufart).
2. Startseite: „Heute“ zeigt den Kraftplan mit „Training starten“. Wochenstreifen zeigt Ringe für geplante Tage.
3. „Heute Pause“ → „Verschieben“ → Vorschau zeigt die verschobene Woche → „Pause eintragen“ → Meldung mit „Rückgängig“ → antippen → alter Stand ist zurück.
4. „Was anderes“ → morgigen Lauf wählen → „Heute machen“ → Heute zeigt den Lauf mit Ziel → „Ergebnis eintragen“ → Formular zeigt „Heute geplant …“, nach Eingabe von Distanz und Zeit erscheint Soll/Ist → speichern → Wochenstreifen zeigt gefüllten Balken.
5. Vergessener Tag: in der Konsole einen Termin von gestern anlegen:

```js
const r = indexedDB.open("satz-und-strecke"); r.onsuccess = () => { const db = r.result; const t = db.transaction("planDays", "readwrite"); const d = new Date(Date.now() - 864e5); const iso = new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); t.objectStore("planDays").put({ date: iso, seq: null, items: [{ id: "test-gestern", ref: { kind: "routine", id: 1 }, status: "planned", label: "Test" }] }); };
```

   Neu laden → Hinweis „…: Test nicht eingetragen“ mit Nachtragen/Verschieben/Ausgelassen; „Ausgelassen“ → Hinweis verschwindet.
6. Dasselbe im Dunkelmodus ansehen.
Expected: alle Schritte wie beschrieben, keine Konsolenfehler.

- [ ] **Step 7: Commit**

```bash
git add src/components/plan src/screens/Home.tsx src/screens/Workout.tsx
git commit -m "Startseite: heutiges Training, Pause, Was anderes, vergessene Tage

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Woche ändern – Ziehen und Antippen

**Files:**
- Create: `src/screens/Week.tsx`
- Modify: `src/App.tsx`, `package.json` (Abhängigkeit)

**Interfaces:**
- Consumes: `planAction`, `Marker`, `usePlanNames` (Task 9), `moveItem`, `openItems` (Task 5)
- Produces: Route `week`

- [ ] **Step 1: Abhängigkeit installieren**

Run: `npm install @dnd-kit/core@^6.3.1`
Expected: `package.json` enthält `"@dnd-kit/core": "^6.3.1"`

- [ ] **Step 2: Seite schreiben**

```tsx
// src/screens/Week.tsx
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db } from "../db/db";
import type { PlanDay, PlanItem } from "../db/types";
import { Button, Empty, Header, Sheet } from "../components/ui";
import { planAction } from "../components/plan/actions";
import { Marker } from "../components/plan/Marker";
import { itemName, usePlanNames, type PlanNames } from "../components/plan/names";
import { addDays } from "../lib/days";
import { niceDate } from "../lib/format";
import { moveItem, openItems } from "../lib/schedule";
import { useToday } from "../lib/useToday";

export function Week() {
  const today = useToday();
  const names = usePlanNames();
  const days = useLiveQuery(() => db.planDays.where("date").between(today, addDays(today, 6), true, true).toArray(), [today]);
  const [picked, setPicked] = useState<string | null>(null); // Antipp-Modus: gewähltes Item
  const [ask, setAsk] = useState<{ itemId: string; target: string } | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Kurz halten, damit normales Scrollen nicht zum Ziehen wird
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  if (!days || !names) return null;

  const apply = async (itemId: string, target: string, how: "add" | "swap") => {
    setAsk(null);
    await planAction((d) => moveItem(d, itemId, target, how, today), how === "swap" ? "Getauscht" : "Verschoben");
  };
  const drop = (itemId: string, target: string) => {
    setPicked(null);
    const src = days.find((d) => d.items.some((i) => i.id === itemId));
    if (!src || src.date === target) return;
    if (openItems(days.find((d) => d.date === target)).length) setAsk({ itemId, target });
    else apply(itemId, target, "add");
  };
  const onDragEnd = (e: DragEndEvent) => { if (e.over) drop(String(e.active.id), String(e.over.id)); };

  return (
    <div>
      <Header title="Woche ändern" onBack />
      <p className="mb-3 text-sm text-soft">Training am Griff ⠿ ziehen oder antippen und dann den Zieltag antippen. Auf einem belegten Tag wählst du Tauschen oder Dazulegen.</p>
      {!days.length && <Empty>Noch kein Wochenplan. Leg ihn unter „Pläne“ an.</Empty>}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <ul className="grid gap-2">
          {days.map((d) => (
            <DayRow key={d.date} day={d} today={today} names={names} picked={picked} onPick={setPicked} onTapDay={() => picked && drop(picked, d.date)} />
          ))}
        </ul>
      </DndContext>
      <Sheet open={!!ask} onClose={() => setAsk(null)} title="Tag ist schon belegt">
        <div className="grid gap-2 pb-2">
          <Button variant="plate" onClick={() => ask && apply(ask.itemId, ask.target, "swap")}>Tauschen</Button>
          <Button onClick={() => ask && apply(ask.itemId, ask.target, "add")}>Dazulegen</Button>
        </div>
      </Sheet>
    </div>
  );
}

function DayRow({ day, today, names, picked, onPick, onTapDay }: {
  day: PlanDay; today: string; names: PlanNames; picked: string | null; onPick: (id: string | null) => void; onTapDay: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: day.date });
  const target = !!picked && !day.items.some((i) => i.id === picked);
  return (
    <li ref={setNodeRef} onClick={onTapDay} aria-label={target ? `Auf ${niceDate(day.date)} legen` : undefined}
      className={`flex gap-3 rounded-xl border p-2.5 shadow-sm ${isOver ? "border-plate bg-tint" : target ? "border-plate/50 bg-surface" : "border-line bg-surface"}`}>
      <span className={`w-16 shrink-0 pt-1.5 text-xs ${day.date === today ? "font-semibold text-plate-ink" : "text-soft"}`}>{day.date === today ? "Heute" : niceDate(day.date)}</span>
      <span className="flex flex-1 flex-col gap-1">
        {day.items.length
          ? day.items.map((i) => <ItemChip key={i.id} item={i} names={names} picked={picked} onPick={onPick} />)
          : <span className="rounded-lg border border-dashed border-line px-2 py-1.5 text-xs text-soft">Pause</span>}
      </span>
    </li>
  );
}

function ItemChip({ item, names, picked, onPick }: { item: PlanItem; names: PlanNames; picked: string | null; onPick: (id: string | null) => void }) {
  const movable = item.status === "planned";
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id, disabled: !movable });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;
  const name = itemName(names, item);
  return (
    <span ref={setNodeRef} style={style}
      className={`relative flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${isDragging ? "z-10 bg-surface shadow-lg ring-1 ring-plate/40" : picked === item.id ? "bg-tint ring-1 ring-plate" : "bg-surface-2"} ${movable ? "" : "opacity-60"}`}>
      <button type="button" disabled={!movable} aria-pressed={picked === item.id}
        onClick={(e) => { e.stopPropagation(); onPick(picked === item.id ? null : item.id); }}
        className="flex min-h-8 flex-1 items-center gap-2 text-left">
        <Marker kind={item.ref.kind} status={item.status} />
        <span className="font-medium">{name}</span>
        {item.status === "done" && <span className="text-xs text-ok">✓ erledigt</span>}
        {item.status === "skipped" && <span className="text-xs text-soft">ausgelassen</span>}
      </button>
      {movable && <span {...listeners} {...attributes} aria-label={`${name} ziehen`} className="touch-none px-1.5 py-1 text-soft">⠿</span>}
    </span>
  );
}
```

- [ ] **Step 3: Route ergänzen**

In `src/App.tsx`: `import { Week } from "./screens/Week";`, im `switch`:

```tsx
    case "week": screen = <Week />; break;
```

und `PARENT` um `week: "home"` ergänzen.

- [ ] **Step 4: Prüfen im Browser**

Run: `npm run typecheck && npm run build && npm run dev` (Handybreite 400 px, Touch-Emulation in den DevTools an)
1. Startseite → „Woche ändern“: 7 Tage ab heute, Ruhetage als „Pause“.
2. Training antippen → Zieltag (Pause) antippen → Training ist verschoben, Meldung mit „Rückgängig“.
3. Training auf belegten Tag ziehen → Auswahl „Tauschen“/„Dazulegen“ → „Tauschen“ tauscht.
4. „Rückgängig“ stellt den Stand vorher wieder her.
5. Liste lässt sich normal scrollen, ohne versehentlich zu ziehen.
Expected: alles wie beschrieben, keine Konsolenfehler.

- [ ] **Step 5: Commit**

```bash
git add src/screens/Week.tsx src/App.tsx package.json package-lock.json
git commit -m "Woche ändern: Trainings ziehen, antippen, tauschen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Verlauf zeigt ausgelassene Termine, Abschlussprüfung

**Files:**
- Modify: `src/screens/History.tsx`

**Interfaces:**
- Consumes: `PlanDay` aus der Datenbank

- [ ] **Step 1: Ausgelassene Termine laden**

In `src/screens/History.tsx`:
1. `Item` um eine Variante erweitern:

```ts
  | { kind: "skipped"; id: string; day: string; ts: string; title: string; meta: string; detail: string };
```

2. In `loadItems` `db.planDays.toArray()` mitladen (`const [sessions, runs, sets, exercises, planDays] = …`) und vor `].sort(…)` ergänzen:

```ts
    ...planDays.flatMap((d) => d.items.filter((i) => i.status === "skipped").map((i): Item => ({
      kind: "skipped", id: i.id, day: d.date, ts: d.date + "T00:00:00", title: i.label, meta: `${niceDate(d.date)}, ausgelassen`, detail: "",
    }))),
```

3. In `Row` am Anfang:

```tsx
  if (item.kind === "skipped") {
    return (
      <li className="flex items-center gap-3 px-4 py-3 text-soft">
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-line" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium line-through decoration-1">{item.title}</span>
          <span className="block text-xs tnum">{item.meta}</span>
        </span>
      </li>
    );
  }
```

   Der weitere Code in `Row` greift dann nur noch auf `gym`/`run` zu; TypeScript verengt `item.kind` automatisch.

- [ ] **Step 2: Alles prüfen**

Run: `npm test && npm run typecheck && npm run build`
Expected: alle Tests PASS, Typecheck und Build ohne Fehler.

Dann im Browser (hell und dunkel, 400 px):
1. Musterwoche aus dem Konzept anlegen (Mo Zone 2, Di Push, Mi Longrun, Do Pull + Z2 kurz, Fr Pause, Sa Intervall, So Beine).
2. Heute „Pause → Ausfallen lassen“ → Verlauf zeigt den Termin durchgestrichen als „ausgelassen“.
3. „Rückgängig“ ist danach nicht mehr verfügbar, sobald die Meldung weg ist.
4. Unter „Ich“ Sicherung speichern und wieder laden → Musterwoche und Termine sind noch da.
5. Kraftplan löschen, der in der Woche steckt → Rückfrage nennt die Woche; danach fehlt er in der Musterwoche.
Expected: alles wie beschrieben.

- [ ] **Step 3: Commit**

```bash
git add src/screens/History.tsx
git commit -m "Verlauf zeigt ausgelassene Termine

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
