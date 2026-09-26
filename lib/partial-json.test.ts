import { describe, expect, it } from "vitest";
import { parsePartialJson } from "./partial-json";

describe("partial JSON", () => {
  it("shows a string while it is still being written", () => {
    expect(parsePartialJson('{"supplierName": "Shree Gan')).toEqual({ supplierName: "Shree Gan" });
  });

  it("drops a key that has no value yet", () => {
    expect(parsePartialJson('{"supplierName": "Shree", "supplierGs')).toEqual({ supplierName: "Shree" });
    expect(parsePartialJson('{"a": 1, "b":')).toEqual({ a: 1 });
  });

  it("closes open arrays and objects", () => {
    expect(parsePartialJson('{"lines": [{"description": "Toor Dal", "amount": 44')).toEqual({
      lines: [{ description: "Toor Dal", amount: 44 }],
    });
    expect(parsePartialJson('{"lines": [')).toEqual({ lines: [] });
  });

  it("backs off a half-written literal", () => {
    expect(parsePartialJson('{"a": "x", "igst": nu')).toEqual({ a: "x" });
  });

  it("returns the full object when the JSON is complete", () => {
    expect(parsePartialJson('{"a": [1, 2], "b": {"c": null}}')).toEqual({ a: [1, 2], b: { c: null } });
  });

  it("handles escaped quotes inside strings", () => {
    expect(parsePartialJson('{"d": "12\\" pipe", "e": "x')).toEqual({ d: '12" pipe', e: "x" });
  });

  it("gives up gracefully on nothing", () => {
    expect(parsePartialJson("")).toBeUndefined();
  });
});
