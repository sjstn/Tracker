import { describe, expect, it } from "vitest";
import { increaseWeight, resolveProgression, roundTo, suggestWorkingSet, warmupWeight } from "./progression";
import { DEFAULT_SETTINGS } from "../db/db";
import { progressionDefaults } from "./progression";

const d = progressionDefaults(DEFAULT_SETTINGS);

describe("Standard-Philosophie", () => {
  it("entspricht der Planung", () => {
    expect(d).toEqual({ repTargetMin: 5, repTargetMax: 8, incrementType: "fixed", incrementValue: 2.5, warmupScheme: "percent_of_working", warmupValue: 50 });
  });
});

describe("resolveProgression", () => {
  it("nutzt Standardwerte, wenn nichts überschrieben ist", () => {
    expect(resolveProgression(d, {}, {})).toEqual(d);
  });
  it("Satz-Vorlage schlägt Übung, Übung schlägt Standard", () => {
    const p = resolveProgression(d, { repTargetMin: 8, repTargetMax: 12, incrementValue: 5 }, { repTargetMax: 10 });
    expect(p.repTargetMin).toBe(8);
    expect(p.repTargetMax).toBe(10);
    expect(p.incrementValue).toBe(5);
  });
  it("ignoriert null-Werte (= erben)", () => {
    const p = resolveProgression(d, { incrementValue: undefined }, { repTargetMin: null as unknown as number });
    expect(p.repTargetMin).toBe(5);
    expect(p.incrementValue).toBe(2.5);
  });
});

describe("suggestWorkingSet", () => {
  it("ohne Historie: kein Gewicht, Untergrenze als Ziel", () => {
    expect(suggestWorkingSet(null, d, 2.5)).toMatchObject({ weight: null, reps: 5, kind: "first" });
  });
  it("Obergrenze erreicht: Gewicht steigt, zurück auf Untergrenze", () => {
    expect(suggestWorkingSet({ weight: 80, reps: 8 }, d, 2.5)).toMatchObject({ weight: 82.5, reps: 5, kind: "increase" });
  });
  it("Obergrenze nicht erreicht: gleiches Gewicht, eine Wdh. mehr", () => {
    expect(suggestWorkingSet({ weight: 80, reps: 6 }, d, 2.5)).toMatchObject({ weight: 80, reps: 7, kind: "repeat" });
  });
  it("unter der Untergrenze: gleiches Gewicht, Ziel Untergrenze", () => {
    expect(suggestWorkingSet({ weight: 80, reps: 3 }, d, 2.5)).toMatchObject({ weight: 80, reps: 5 });
  });
});

describe("Gewichte", () => {
  it("Prozent-Steigerung wird gerundet und steigt immer", () => {
    expect(increaseWeight(100, { incrementType: "percent", incrementValue: 5 }, 2.5)).toBe(105);
    expect(increaseWeight(20, { incrementType: "percent", incrementValue: 2 }, 2.5)).toBe(22.5);
  });
  it("Aufwärmen in Prozent vom Arbeitsgewicht", () => {
    expect(warmupWeight(85, { warmupScheme: "percent_of_working", warmupValue: 50 }, 2.5)).toBe(42.5);
    expect(warmupWeight(null, { warmupScheme: "percent_of_working", warmupValue: 50 }, 2.5)).toBeNull();
    expect(warmupWeight(85, { warmupScheme: "fixed_weight", warmupValue: 20 }, 2.5)).toBe(20);
  });
  it("roundTo", () => { expect(roundTo(41.3, 2.5)).toBe(42.5); expect(roundTo(41.2, 0.5)).toBe(41); });
});
