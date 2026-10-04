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
