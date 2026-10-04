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
