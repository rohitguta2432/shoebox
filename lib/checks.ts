// The model reads. This file checks. Every rule here is plain arithmetic or a
// published GST rule, so the same bill always gets the same verdict.

import type { Bill } from "./bill";
import { formatIsoDate, parseBillDate } from "./dates";
import { formatINR, formatPercent } from "./format";
import { STATE_CODES, stateCodeFromPlace, verifyGstin } from "./gstin";

export type Level = "pass" | "warn" | "fail";
export type BillStatus = "ready" | "review" | "fix";

export interface Fix {
  field: string;
  value: string;
  label: string;
}

export interface Check {
  id: string;
  level: Level;
  title: string;
  detail: string;
  fields: string[]; // e.g. "supplierGstin", "lines.2.amount"
  fix?: Fix;
}

export interface CheckReport {
  checks: Check[];
  status: BillStatus;
  counts: Record<Level, number>;
}

export const GST_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40];

const paise = (rupees: number) => Math.round(rupees * 100);
const has = (x: number | null | undefined): x is number => typeof x === "number" && Number.isFinite(x);
const off = (a: number, b: number) => formatINR(Math.abs(a - b) / 100);

function gstinCheck(who: "Supplier" | "Buyer", field: string, raw: string | null): Check {
  const id = `${field}`;
  const v = verifyGstin(raw);
  switch (v.status) {
    case "missing":
      return who === "Supplier"
        ? {
            id,
            level: "warn",
            title: "No supplier GSTIN",
            detail: "Without the supplier's GSTIN, this bill can't be used to claim input tax credit.",
            fields: [field],
          }
        : {
            id,
            level: "warn",
            title: "No buyer GSTIN",
            detail: "Your own GSTIN must be printed on the bill to claim input tax credit.",
            fields: [field],
          };
    case "bad-shape": {
      if (v.fixes.length === 1) {
        const fix = v.fixes[0];
        return {
          id,
          level: "fail",
          title: `${who} GSTIN has a misread character`,
          detail: `Character ${fix.position} reads "${fix.from}". Its look-alike "${fix.to}" fits the pattern and the checksum.`,
          fields: [field],
          fix: { field, value: fix.gstin, label: `Use ${fix.gstin}` },
        };
      }
      return {
        id,
        level: "fail",
        title: `${who} GSTIN has the wrong pattern`,
        detail:
          v.gstin.length === 15
            ? `"${v.gstin}" doesn't follow the GSTIN pattern: state code, PAN, entity number, Z, check character.`
            : `"${v.gstin}" has ${v.gstin.length} characters. A GSTIN has 15.`,
        fields: [field],
      };
    }
    case "bad-checksum": {
      if (v.fixes.length === 1) {
        const fix = v.fixes[0];
        return {
          id,
          level: "fail",
          title: `${who} GSTIN fails its checksum`,
          detail: `Character ${fix.position} reads "${fix.from}". Swapping it for the look-alike "${fix.to}" makes the checksum work.`,
          fields: [field],
          fix: { field, value: fix.gstin, label: `Use ${fix.gstin}` },
        };
      }
      return {
        id,
        level: "fail",
        title: `${who} GSTIN fails its checksum`,
        detail:
          v.fixes.length > 1
            ? `One character is misread. It could be ${v.fixes.map((f) => f.gstin).join(" or ")}. Check the photo.`
            : `The last character should be "${v.expected}", not "${v.gstin[14]}". At least one character is misread.`,
        fields: [field],
      };
    }
    case "unknown-state":
      return {
        id,
        level: "fail",
        title: `${who} GSTIN has an unknown state code`,
        detail: `It starts with "${v.gstin.slice(0, 2)}", which is not an Indian state code.`,
        fields: [field],
      };
    case "valid":
      return {
        id,
        level: "pass",
        title: `${who} GSTIN is valid`,
        detail: `Checksum matches. Registered in ${v.state}.`,
        fields: [field],
      };
  }
}

function taxTypeCheck(bill: Bill): Check | null {
  const supplier = verifyGstin(bill.supplierGstin);
  const buyer = verifyGstin(bill.buyerGstin);
  const from = supplier.status === "valid" ? supplier.gstin.slice(0, 2) : null;
  // Place of supply decides the tax type; the buyer's GSTIN state is the fallback.
  const to = stateCodeFromPlace(bill.placeOfSupply) ?? (buyer.status === "valid" ? buyer.gstin.slice(0, 2) : null);
  const local = (bill.cgst ?? 0) + (bill.sgst ?? 0);
  const inter = bill.igst ?? 0;
  if (!from || !to || local + inter === 0) return null;

  const fields = ["cgst", "sgst", "igst"];
  if (from === to) {
    return inter > 0
      ? {
          id: "tax-type",
          level: "fail",
          title: "Wrong tax type",
          detail: `Supplier and buyer are both in ${STATE_CODES[from]}, so the bill should charge CGST + SGST, not IGST.`,
          fields,
        }
      : {
          id: "tax-type",
          level: "pass",
          title: "Right tax type",
          detail: `Same state (${STATE_CODES[from]}), so CGST + SGST.`,
          fields,
        };
  }
  return local > 0
    ? {
        id: "tax-type",
        level: "fail",
        title: "Wrong tax type",
        detail: `Supplier is in ${STATE_CODES[from]}, buyer in ${STATE_CODES[to]}. Across states the bill should charge IGST, not CGST + SGST.`,
        fields,
      }
    : {
        id: "tax-type",
        level: "pass",
        title: "Right tax type",
        detail: `${STATE_CODES[from]} to ${STATE_CODES[to]}, so IGST.`,
        fields,
      };
}

function lineChecks(bill: Bill): Check[] {
  const checks: Check[] = [];
  let checked = 0;
  bill.lines.forEach((line, i) => {
    const n = i + 1;
    if (has(line.quantity) && has(line.rate) && has(line.amount)) {
      checked++;
      const gross = line.quantity * line.rate;
      const flat = gross - (line.discount ?? 0);
      const percent = has(line.discount) ? gross * (1 - line.discount / 100) : Number.NaN;
      const tolerance = Math.max(100, paise(line.quantity * 0.005));
      const fits = (x: number) => Number.isFinite(x) && Math.abs(paise(x) - paise(line.amount!)) <= tolerance;
      if (!fits(flat) && !fits(percent)) {
        const less = has(line.discount) && line.discount !== 0 ? ` − ${formatINR(line.discount)}` : "";
        checks.push({
          id: `line-math-${n}`,
          level: "fail",
          title: `Line ${n} doesn't add up`,
          detail: `${line.quantity} × ${formatINR(line.rate)}${less} = ${formatINR(flat)}, but the line says ${formatINR(line.amount)}.`,
          fields: [`lines.${i}.quantity`, `lines.${i}.rate`, `lines.${i}.amount`],
        });
      }
    }
    if (has(line.gstRate) && !GST_RATES.includes(line.gstRate)) {
      checks.push({
        id: `line-rate-${n}`,
        level: "warn",
        title: `Line ${n}: ${formatPercent(line.gstRate)} is not a GST rate`,
        detail: `GST rates are ${GST_RATES.filter((r) => r >= 5).map(formatPercent).join(", ")} (plus a few special ones). Check the photo.`,
        fields: [`lines.${i}.gstRate`],
      });
    }
    if (line.hsn && !/^(\d{4}|\d{6}|\d{8})$/.test(line.hsn.replace(/\s/g, ""))) {
      checks.push({
        id: `line-hsn-${n}`,
        level: "warn",
        title: `Line ${n}: HSN "${line.hsn}" looks wrong`,
        detail: "HSN and SAC codes are 4, 6 or 8 digits.",
        fields: [`lines.${i}.hsn`],
      });
    }
  });
  if (checked > 0 && !checks.some((c) => c.id.startsWith("line-math"))) {
    checks.push({
      id: "line-math",
      level: "pass",
      title: checked === 1 ? "The line adds up" : `All ${checked} lines add up`,
      detail: "Quantity × rate = amount on every line.",
      fields: bill.lines.map((_, i) => `lines.${i}.amount`),
    });
  }
  return checks;
}

function totalChecks(bill: Bill): Check[] {
  const checks: Check[] = [];
  const lines = bill.lines;
  const amounts = lines.map((l) => l.amount);
  const allAmounts = lines.length > 0 && amounts.every(has);
  const linesTotal = allAmounts ? amounts.reduce((s: number, a) => s + paise(a as number), 0) : null;

  if (linesTotal !== null && has(bill.taxableTotal)) {
    const printed = paise(bill.taxableTotal);
    checks.push(
      Math.abs(linesTotal - printed) <= 100
        ? {
            id: "taxable-total",
            level: "pass",
            title: "Lines match the taxable total",
            detail: `${lines.length} ${lines.length === 1 ? "line comes" : "lines come"} to ${formatINR(printed / 100)}.`,
            fields: ["taxableTotal"],
          }
        : {
            id: "taxable-total",
            level: "fail",
            title: "Lines don't match the taxable total",
            detail: `The lines come to ${formatINR(linesTotal / 100)}. The bill says ${formatINR(printed / 100)}, off by ${off(linesTotal, printed)}.`,
            fields: ["taxableTotal"],
          },
    );
  }

  const taxCharged = paise(bill.cgst ?? 0) + paise(bill.sgst ?? 0) + paise(bill.igst ?? 0);
  const anyTax = has(bill.cgst) || has(bill.sgst) || has(bill.igst);
  if (allAmounts && anyTax && lines.every((l) => has(l.gstRate))) {
    const expected = lines.reduce((s, l) => s + Math.round((paise(l.amount!) * l.gstRate!) / 100), 0);
    const tolerance = 100 + 2 * lines.length;
    checks.push(
      Math.abs(expected - taxCharged) <= tolerance
        ? {
            id: "tax-total",
            level: "pass",
            title: "Tax matches the GST rates",
            detail: `${formatINR(taxCharged / 100)} of GST at the printed rates.`,
            fields: ["cgst", "sgst", "igst"],
          }
        : {
            id: "tax-total",
            level: "fail",
            title: "Tax doesn't match the GST rates",
            detail: `At the printed rates the GST should be ${formatINR(expected / 100)}. The bill charges ${formatINR(taxCharged / 100)}, off by ${off(expected, taxCharged)}.`,
            fields: ["cgst", "sgst", "igst"],
          },
    );
  }

  if (has(bill.cgst) || has(bill.sgst)) {
    const c = paise(bill.cgst ?? 0);
    const s = paise(bill.sgst ?? 0);
    checks.push(
      Math.abs(c - s) <= 2
        ? {
            id: "cgst-sgst",
            level: "pass",
            title: "CGST equals SGST",
            detail: `Both are ${formatINR(c / 100)}.`,
            fields: ["cgst", "sgst"],
          }
        : {
            id: "cgst-sgst",
            level: "fail",
            title: "CGST and SGST don't match",
            detail: `CGST is ${formatINR(c / 100)} and SGST is ${formatINR(s / 100)}. They are always equal.`,
            fields: ["cgst", "sgst"],
          },
    );
  }

  const taxable = has(bill.taxableTotal) ? paise(bill.taxableTotal) : linesTotal;
  if (has(bill.grandTotal) && taxable !== null) {
    const roundOff = paise(bill.roundOff ?? 0);
    const cess = paise(bill.cess ?? 0);
    const computed = taxable + taxCharged + cess + roundOff;
    const printed = paise(bill.grandTotal);
    const tolerance = has(bill.roundOff) ? 5 : 100;
    const parts = [`${formatINR(taxable / 100)} + ${formatINR(taxCharged / 100)} GST`];
    if (cess) parts.push(`${formatINR(cess / 100)} cess`);
    if (roundOff) parts.push(`${formatINR(roundOff / 100)} round-off`);
    checks.push(
      Math.abs(computed - printed) <= tolerance
        ? {
            id: "grand-total",
            level: "pass",
            title: "Grand total adds up",
            detail: `${parts.join(" + ")} = ${formatINR(printed / 100)}.`,
            fields: ["grandTotal"],
          }
        : {
            id: "grand-total",
            level: "fail",
            title: "Grand total doesn't add up",
            detail: `${parts.join(" + ")} = ${formatINR(computed / 100)}. The bill says ${formatINR(printed / 100)}, off by ${off(computed, printed)}.`,
            fields: ["grandTotal"],
          },
    );
  }

  if (has(bill.roundOff) && Math.abs(bill.roundOff) >= 1) {
    checks.push({
      id: "round-off",
      level: "warn",
      title: "Round-off is too big",
      detail: `Round-off is ${formatINR(bill.roundOff)}. It should be under ₹1.`,
      fields: ["roundOff"],
    });
  }
  return checks;
}

function headerChecks(bill: Bill, today: string): Check[] {
  const checks: Check[] = [];
  if (!bill.invoiceNumber) {
    checks.push({
      id: "invoice-number",
      level: "warn",
      title: "No invoice number",
      detail: "Every GST invoice needs one. Check the photo.",
      fields: ["invoiceNumber"],
    });
  } else if (bill.invoiceNumber.length > 16) {
    checks.push({
      id: "invoice-number",
      level: "warn",
      title: "Invoice number is too long",
      detail: `GST invoice numbers have at most 16 characters. "${bill.invoiceNumber}" has ${bill.invoiceNumber.length}.`,
      fields: ["invoiceNumber"],
    });
  }

  const date = parseBillDate(bill.invoiceDate);
  if (!bill.invoiceDate) {
    checks.push({
      id: "invoice-date",
      level: "warn",
      title: "No invoice date",
      detail: "The date decides which GST return this bill belongs to.",
      fields: ["invoiceDate"],
    });
  } else if (!date) {
    checks.push({
      id: "invoice-date",
      level: "warn",
      title: "Can't read the date",
      detail: `"${bill.invoiceDate}" is not a date format I know. Use DD/MM/YYYY.`,
      fields: ["invoiceDate"],
    });
  } else if (date > today) {
    checks.push({
      id: "invoice-date",
      level: "fail",
      title: "Invoice date is in the future",
      detail: `${formatIsoDate(date)} is after today. A digit was probably misread.`,
      fields: ["invoiceDate"],
    });
  }
  return checks;
}

const ORDER: Record<Level, number> = { fail: 0, warn: 1, pass: 2 };

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function runChecks(bill: Bill, options: { today?: string } = {}): CheckReport {
  const today = options.today ?? todayIso();
  const checks: Check[] = [
    gstinCheck("Supplier", "supplierGstin", bill.supplierGstin),
    gstinCheck("Buyer", "buyerGstin", bill.buyerGstin),
    ...headerChecks(bill, today),
    ...lineChecks(bill),
    ...totalChecks(bill),
  ];
  const taxType = taxTypeCheck(bill);
  if (taxType) checks.push(taxType);

  checks.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
  const counts = { pass: 0, warn: 0, fail: 0 } as Record<Level, number>;
  for (const c of checks) counts[c.level]++;
  const status: BillStatus = counts.fail > 0 ? "fix" : counts.warn > 0 ? "review" : "ready";
  return { checks, status, counts };
}
