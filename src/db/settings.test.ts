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
    expect(s.name).toBeNull();
    expect(s.birthDate).toBeNull();
  });

  it("verwerfen ungültige Namen und Geburtsdaten", async () => {
    const db = new AppDB("settings-" + Math.random());
    await db.open();
    await db.settings.put({ ...DEFAULT_SETTINGS, name: "  ", birthDate: "04.10.2004" } as never);
    expect(await getSettings(db)).toMatchObject({ name: null, birthDate: null });
    await db.settings.put({ ...DEFAULT_SETTINGS, name: " Justin ", birthDate: "2004-10-04" });
    expect(await getSettings(db)).toMatchObject({ name: "Justin", birthDate: "2004-10-04" });
  });

  it("geben nie das geteilte Standard-Array der Musterwoche zurück", async () => {
    const db = new AppDB("settings-" + Math.random());
    await db.open();
    const s = await getSettings(db);
    s.weekTemplate[0].push({ kind: "routine", id: 1 });
    expect(DEFAULT_SETTINGS.weekTemplate[0]).toEqual([]);
  });
});
