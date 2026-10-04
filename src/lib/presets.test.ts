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
