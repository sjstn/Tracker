import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../db/db";
import { ACCENTS, applyAppearance, readStoredAppearance, type AppearanceTarget } from "./appearance";

function fakeTarget() {
  const attrs: Record<string, string> = {};
  const target: AppearanceTarget = {
    setAttribute: (k, v) => { attrs[k] = v; },
    removeAttribute: (k) => { delete attrs[k]; },
  };
  return { attrs, target };
}

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => { data[k] = v; },
  };
}

describe("Darstellung", () => {
  it("startet mit Amber und folgt dem System", () => {
    expect(DEFAULT_SETTINGS.accent).toBe("amber");
    expect(DEFAULT_SETTINGS.theme).toBe("system");
    expect(ACCENTS.map(([k]) => k)).toEqual(["amber", "indigo", "emerald", "rose"]);
  });

  it("setzt Akzent und Modus am Wurzelelement und merkt sie sich", () => {
    const { attrs, target } = fakeTarget();
    const storage = fakeStorage();
    applyAppearance({ accent: "rose", theme: "dark" }, target, storage);
    expect(attrs).toEqual({ "data-accent": "rose", "data-theme": "dark" });
    expect(readStoredAppearance(storage)).toEqual({ accent: "rose", theme: "dark" });
  });

  it("entfernt data-theme bei System", () => {
    const { attrs, target } = fakeTarget();
    applyAppearance({ accent: "indigo", theme: "dark" }, target, fakeStorage());
    applyAppearance({ accent: "indigo", theme: "system" }, target, fakeStorage());
    expect(attrs).toEqual({ "data-accent": "indigo" });
  });

  it("ignoriert kaputte oder unbekannte gespeicherte Werte", () => {
    expect(readStoredAppearance(fakeStorage({ appearance: "{kaputt" }))).toBeNull();
    expect(readStoredAppearance(fakeStorage({ appearance: '{"accent":"lila","theme":"dark"}' }))).toBeNull();
    expect(readStoredAppearance(fakeStorage())).toBeNull();
  });
});
