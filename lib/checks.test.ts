import { describe, expect, it } from "vitest";
import type { Bill } from "./bill";
import { runChecks, type Check } from "./checks";
import { goodBill, gstin } from "./fixtures";

const TODAY = "2026-09-26";
const run = (bill: Bill) => runChecks(bill, { today: TODAY });
const find = (checks: Check[], id: string) => checks.find((c) => c.id === id);

describe("a bill whose numbers agree", () => {
  it("is ready for the books", () => {
    const report = run(goodBill());
    expect(report.status).toBe("ready");
    expect(report.counts.fail).toBe(0);
    expect(report.counts.warn).toBe(0);
    expect(report.checks.map((c) => c.id)).toEqual(
      expect.arrayContaining(["supplierGstin", "buyerGstin", "line-math", "taxable-total", "tax-total", "cgst-sgst", "grand-total", "tax-type"]),
    );
  });
});

describe("numbers that don't add up", () => {
  it("catches a wrong grand total and says by how much", () => {
    const bill = { ...goodBill(), grandTotal: 4394 };
    const c = find(run(bill).checks, "grand-total")!;
    expect(c.level).toBe("fail");
    expect(c.detail).toContain("off by ₹10.00");
  });

  it("catches CGST and SGST that differ", () => {
    const bill = { ...goodBill(), cgst: 232, sgst: 212 };
    const report = run(bill);
    expect(find(report.checks, "cgst-sgst")!.level).toBe("fail");
    expect(find(report.checks, "tax-total")!.level).toBe("pass");
  });

  it("catches a line where quantity × rate isn't the amount", () => {
    const bill = goodBill();
    bill.lines[0].amount = 2400;
    const c = find(run(bill).checks, "line-math-1")!;
    expect(c.level).toBe("fail");
    expect(c.detail).toContain("₹2,040.00");
  });

  it("accepts flat and percent discounts", () => {
    const bill = goodBill();
    bill.lines[1] = { ...bill.lines[1], quantity: 10, rate: 200, discount: 100, amount: 1900 };
    expect(find(run(bill).checks, "line-math")!.level).toBe("pass");
    bill.lines[1].discount = 5;
    expect(find(run(bill).checks, "line-math")!.level).toBe("pass");
  });

  it("catches tax that doesn't match the printed rates", () => {
    const bill = { ...goodBill(), cgst: 250, sgst: 250, grandTotal: 4440 };
    const c = find(run(bill).checks, "tax-total")!;
    expect(c.level).toBe("fail");
    expect(c.detail).toContain("₹444.00");
  });
});

describe("tax type", () => {
  it("fails CGST + SGST on a bill across states", () => {
    const bill = { ...goodBill(), supplierGstin: gstin("29AAGCM7316P1Z") };
    const c = find(run(bill).checks, "tax-type")!;
    expect(c.level).toBe("fail");
    expect(c.detail).toContain("Karnataka");
    expect(c.detail).toContain("Maharashtra");
  });

  it("fails IGST on a bill inside one state", () => {
    const bill = { ...goodBill(), cgst: null, sgst: null, igst: 444 };
    expect(find(run(bill).checks, "tax-type")!.level).toBe("fail");
  });

  it("passes IGST across states", () => {
    const bill = { ...goodBill(), supplierGstin: gstin("29AAGCM7316P1Z"), cgst: null, sgst: null, igst: 444 };
    const report = run(bill);
    expect(find(report.checks, "tax-type")!.level).toBe("pass");
    expect(report.status).toBe("ready");
  });
});

describe("misread text", () => {
  it("offers the one-character fix for a misread GSTIN", () => {
    const good = gstin("27AAKFS4821M1Z");
    const misread = good.slice(0, 10) + "I" + good.slice(11); // the 1 in 4821 read as an I
    const c = find(run({ ...goodBill(), supplierGstin: misread }).checks, "supplierGstin")!;
    expect(c.level).toBe("fail");
    expect(c.fix?.value).toBe(good);
  });

  it("fails a date in the future", () => {
    const c = find(run({ ...goodBill(), invoiceDate: "12/09/2027" }).checks, "invoice-date")!;
    expect(c.level).toBe("fail");
  });

  it("warns on a rate that isn't a GST rate", () => {
    const bill = goodBill();
    bill.lines[0].gstRate = 17;
    expect(find(run(bill).checks, "line-rate-1")!.level).toBe("warn");
  });

  it("warns on an invoice number over 16 characters", () => {
    const c = find(run({ ...goodBill(), invoiceNumber: "SGT/2026-27/000412" }).checks, "invoice-number")!;
    expect(c.level).toBe("warn");
  });

  it("asks for review when the buyer GSTIN is missing", () => {
    const report = run({ ...goodBill(), buyerGstin: null });
    expect(report.status).toBe("review");
  });
});
