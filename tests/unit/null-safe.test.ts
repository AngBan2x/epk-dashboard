import { describe, it, expect } from "vitest";
import { safeString, hasValue, safeNumber, safeArray, safeDate, formatDuration, formatNumber } from "@/lib/null-safe";

describe("safeString", () => {
  it("returns string when valid", () => {
    expect(safeString("hello")).toBe("hello");
  });
  it("returns — for null", () => {
    expect(safeString(null)).toBe("—");
  });
  it("returns — for undefined", () => {
    expect(safeString(undefined)).toBe("—");
  });
  it("returns — for empty string", () => {
    expect(safeString("")).toBe("—");
  });
  it("returns — for number", () => {
    expect(safeString(42)).toBe("—");
  });
});

describe("hasValue", () => {
  it("returns true when value exists", () => {
    expect(hasValue({ a: "hello" }, "a")).toBe(true);
  });
  it("returns false when value is null", () => {
    expect(hasValue({ a: null }, "a")).toBe(false);
  });
  it("returns false when value is undefined", () => {
    expect(hasValue({ a: undefined }, "a")).toBe(false);
  });
  it("returns false when value is empty string", () => {
    expect(hasValue({ a: "" }, "a")).toBe(false);
  });
});

describe("safeNumber", () => {
  it("returns number when valid", () => {
    expect(safeNumber(42)).toBe(42);
  });
  it("returns fallback for null", () => {
    expect(safeNumber(null)).toBe(0);
  });
  it("returns custom fallback", () => {
    expect(safeNumber(null, -1)).toBe(-1);
  });
  it("returns fallback for NaN", () => {
    expect(safeNumber(NaN)).toBe(0);
  });
});

describe("safeArray", () => {
  it("returns array when valid", () => {
    expect(safeArray([1, 2])).toEqual([1, 2]);
  });
  it("returns empty array for null", () => {
    expect(safeArray(null)).toEqual([]);
  });
  it("returns empty array for non-array", () => {
    expect(safeArray("string")).toEqual([]);
  });
});

describe("safeDate", () => {
  it("returns Date when valid", () => {
    const d = safeDate("2026-01-01");
    expect(d).toBeInstanceOf(Date);
  });
  it("returns null for null", () => {
    expect(safeDate(null)).toBeNull();
  });
  it("returns null for invalid date", () => {
    expect(safeDate("not-a-date")).toBeNull();
  });
});

describe("formatDuration", () => {
  it("formats mm:ss", () => {
    expect(formatDuration("03:45")).toBe("3:45");
  });
  it("pads seconds", () => {
    expect(formatDuration("04:05")).toBe("4:05");
  });
  it("returns original if invalid", () => {
    expect(formatDuration("invalid")).toBe("invalid");
  });
});

describe("formatNumber", () => {
  it("formats with dots", () => {
    expect(formatNumber(14250)).toBe("14.250");
  });
  it("formats zero", () => {
    expect(formatNumber(0)).toBe("0");
  });
});
