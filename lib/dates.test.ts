import { describe, expect, it } from "vitest";
import { formatIsoDate, parseBillDate } from "./dates";

describe("bill dates", () => {
  it("reads the day-first formats Indian bills use", () => {
    expect(parseBillDate("26/09/2026")).toBe("2026-09-26");
    expect(parseBillDate("26-09-26")).toBe("2026-09-26");
    expect(parseBillDate("26.09.2026")).toBe("2026-09-26");
    expect(parseBillDate("5/9/2026")).toBe("2026-09-05");
    expect(parseBillDate("26 Sep 2026")).toBe("2026-09-26");
    expect(parseBillDate("26-Sep-26")).toBe("2026-09-26");
    expect(parseBillDate("1st August 2026")).toBe("2026-08-01");
    expect(parseBillDate("Sep 26, 2026")).toBe("2026-09-26");
    expect(parseBillDate("2026-09-26")).toBe("2026-09-26");
  });

  it("refuses dates that don't exist", () => {
    expect(parseBillDate("31/02/2026")).toBeNull();
    expect(parseBillDate("13/13/2026")).toBeNull();
    expect(parseBillDate("hello")).toBeNull();
    expect(parseBillDate(null)).toBeNull();
  });

  it("formats for people", () => {
    expect(formatIsoDate("2026-09-05")).toBe("5 Sep 2026");
  });
});
