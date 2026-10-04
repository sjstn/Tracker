import { describe, expect, it } from "vitest";
import { ageFromBirthDate, ageFromBirthYear, birthYearFromAge, currentAge, validateAbout, type AboutForm } from "./profile";

const now = new Date(2026, 9, 4);
const form = (patch: Partial<AboutForm> = {}): AboutForm =>
  ({ name: "", height: "", ageMode: "age", age: "", birthDate: "", weight: "", ...patch });

describe("Alter", () => {
  it("rechnet zwischen Alter und Geburtsjahr", () => {
    expect(birthYearFromAge(35, now)).toBe(1991);
    expect(ageFromBirthYear(1991, now)).toBe(35);
    expect(ageFromBirthYear(null, now)).toBeNull();
  });

  it("rechnet aus dem Geburtsdatum tagesgenau", () => {
    expect(ageFromBirthDate("2004-10-04", now)).toBe(22);
    expect(ageFromBirthDate("2004-10-05", now)).toBe(21);
    expect(ageFromBirthDate("2004-11-01", now)).toBe(21);
  });

  it("nimmt das Geburtsdatum vor dem Geburtsjahr", () => {
    expect(currentAge({ birthDate: "2004-10-05", birthYear: 2004 }, now)).toBe(21);
    expect(currentAge({ birthDate: null, birthYear: 2004 }, now)).toBe(22);
    expect(currentAge({ birthDate: null, birthYear: null }, now)).toBeNull();
  });
});

describe("validateAbout", () => {
  it("liest gültige Werte mit Komma und Namen", () => {
    expect(validateAbout(form({ name: " Justin ", height: "182", age: "35", weight: "82,4" }), now)).toEqual({
      values: { name: "Justin", heightCm: 182, age: 35, birthDate: null, weightKg: 82.4 }, errors: {},
    });
  });

  it("leere Felder bedeuten nicht ändern", () => {
    expect(validateAbout(form({ age: " " }), now)).toEqual({
      values: { name: null, heightCm: null, age: null, birthDate: null, weightKg: null }, errors: {},
    });
  });

  it("erklärt Werte außerhalb der Grenzen", () => {
    const { errors } = validateAbout(form({ height: "50", age: "5", weight: "500" }), now);
    expect(errors.height).toContain("100");
    expect(errors.age).toContain("10");
    expect(errors.weight).toContain("20");
    expect(validateAbout(form({ height: "abc" }), now).errors.height).toBeTruthy();
    expect(validateAbout(form({ name: "x".repeat(41) }), now).errors.name).toBeTruthy();
  });

  it("liest ein Geburtsdatum statt des Alters", () => {
    expect(validateAbout(form({ ageMode: "date", age: "99", birthDate: "2004-10-04" }), now).values)
      .toMatchObject({ age: null, birthDate: "2004-10-04" });
    expect(validateAbout(form({ ageMode: "date", birthDate: "2027-01-01" }), now).errors.birthDate).toBeTruthy();
    expect(validateAbout(form({ ageMode: "date", birthDate: "2020-01-01" }), now).errors.birthDate).toContain("10");
    expect(validateAbout(form({ ageMode: "date", birthDate: "" }), now)).toMatchObject({ values: { birthDate: null }, errors: {} });
  });
});
