import { describe, expect, it } from "vitest";
import { pressKey, stepValue } from "./keypad";

describe("pressKey", () => {
  it("ersetzt beim ersten Tippen den alten Wert, danach wird angehängt", () => {
    expect(pressKey("80", "7", true, true)).toBe("7");
    expect(pressKey("7", "5", false, true)).toBe("75");
  });

  it("nimmt ein Komma pro Zahl und nur beim Gewicht", () => {
    expect(pressKey("22", ",", false, true)).toBe("22,");
    expect(pressKey("22,5", ",", false, true)).toBe("22,5");
    expect(pressKey("80", ",", true, true)).toBe("0,");
    expect(pressKey("8", ",", false, false)).toBe("8");
  });

  it("begrenzt Nachkommastellen und Länge", () => {
    expect(pressKey("22,25", "5", false, true)).toBe("22,25");
    expect(pressKey("12345", "6", false, false)).toBe("12345");
  });

  it("löscht ein Zeichen, beim ersten Tippen alles", () => {
    expect(pressKey("22,5", "back", false, true)).toBe("22,");
    expect(pressKey("80", "back", true, true)).toBe("");
  });

  it("ersetzt eine führende Null", () => {
    expect(pressKey("0", "5", false, false)).toBe("5");
  });
});

describe("stepValue", () => {
  it("rechnet vom Wert oder vom Vorschlag aus", () => {
    expect(stepValue("80", undefined, 2.5)).toBe("82,5");
    expect(stepValue("", 60, -2.5)).toBe("57,5");
    expect(stepValue("", null, 1)).toBe("1");
  });

  it("geht nicht unter null", () => {
    expect(stepValue("1", undefined, -2.5)).toBe("0");
  });
});
