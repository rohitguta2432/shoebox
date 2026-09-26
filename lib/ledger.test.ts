import { describe, expect, it } from "vitest";
import { goodBill } from "./fixtures";
import { itcSummary, registerCsv, registerRows, type LedgerEntry } from "./ledger";

const entry = (overrides: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: "b1",
  savedAt: "2026-09-26T10:00:00.000Z",
  bill: goodBill(),
  status: "ready",
  image: null,
  model: null,
  readMs: null,
  ...overrides,
});

describe("purchase register", () => {
  it("writes one row per GST rate and splits the tax between them", () => {
    const rows = registerRows(entry());
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ date: "2026-09-12", gstRate: 5, taxable: 2040, cgst: 51, sgst: 51, invoiceTotal: 4384 });
    expect(rows[1]).toMatchObject({ gstRate: 18, taxable: 1900, cgst: 171, sgst: 171, invoiceTotal: null });
  });

  it("never loses a paisa when splitting", () => {
    const bill = goodBill();
    bill.cgst = 222.01;
    bill.sgst = 222.01;
    const rows = registerRows(entry({ bill }));
    const cgst = rows.reduce((s, r) => s + Math.round(r.cgst * 100), 0);
    expect(cgst).toBe(22201);
  });

  it("quotes cells that contain commas", () => {
    const bill = { ...goodBill(), supplierName: "Shree Ganesh Traders, Pune" };
    const csv = registerCsv([entry({ bill })]);
    expect(csv.split("\n")[0]).toContain("Invoice date,Invoice number,Supplier");
    expect(csv).toContain('"Shree Ganesh Traders, Pune"');
    expect(csv.trim().split("\n")).toHaveLength(3);
  });
});

describe("input tax credit", () => {
  it("only counts bills that passed every check as claimable", () => {
    const summary = itcSummary([entry(), entry({ id: "b2", status: "fix" })]);
    expect(summary.bills).toBe(2);
    expect(summary.readyBills).toBe(1);
    expect(summary.claimable).toBe(444);
    expect(summary.onHold).toBe(444);
  });
});
