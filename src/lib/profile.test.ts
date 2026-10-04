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
