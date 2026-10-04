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
