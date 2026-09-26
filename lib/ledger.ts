// Saved bills and the purchase register a CA can open in any spreadsheet.

import type { Bill } from "./bill";
import type { BillStatus } from "./checks";
import { parseBillDate } from "./dates";
import { verifyGstin } from "./gstin";

export interface LedgerEntry {
  id: string;
  savedAt: string;
  bill: Bill;
  status: BillStatus;
  image: string | null;
  model: string | null;
  readMs: number | null;
}

export interface RegisterRow {
  date: string;
  invoiceNumber: string;
  supplier: string;
  supplierGstin: string;
  supplierState: string;
  gstRate: number | null;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  invoiceTotal: number | null;
  status: BillStatus;
}

const paise = (x: number | null | undefined) => Math.round((x ?? 0) * 100);

// Split one printed tax amount across rate groups, in proportion to each group's
// share of the expected tax. Works in paise; the last group takes the remainder.
function allocate(total: number, weights: number[]): number[] {
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum === 0) return weights.map((_, i) => (i === 0 ? total : 0));
  let given = 0;
  return weights.map((w, i) => {
    if (i === weights.length - 1) return total - given;
    const share = Math.round((total * w) / weightSum);
    given += share;
    return share;
  });
}

export function registerRows(entry: LedgerEntry): RegisterRow[] {
  const { bill, status } = entry;
  const supplier = verifyGstin(bill.supplierGstin);
  const base = {
    date: parseBillDate(bill.invoiceDate) ?? bill.invoiceDate ?? "",
    invoiceNumber: bill.invoiceNumber ?? "",
    supplier: bill.supplierName,
    supplierGstin: supplier.status === "missing" ? "" : "gstin" in supplier ? supplier.gstin : "",
    supplierState: supplier.status === "valid" ? supplier.state : "",
    status,
  };

  const groups = new Map<number | null, number>();
  for (const line of bill.lines) {
    groups.set(line.gstRate, (groups.get(line.gstRate) ?? 0) + paise(line.amount));
  }
  if (groups.size === 0) groups.set(null, paise(bill.taxableTotal));

  const rates = [...groups.keys()];
  const taxable = rates.map((r) => groups.get(r)!);
  const weights = rates.map((r, i) => taxable[i] * (r ?? 0));
  const cgst = allocate(paise(bill.cgst), weights);
  const sgst = allocate(paise(bill.sgst), weights);
  const igst = allocate(paise(bill.igst), weights);

  return rates.map((rate, i) => ({
    ...base,
    gstRate: rate,
    taxable: taxable[i] / 100,
    cgst: cgst[i] / 100,
    sgst: sgst[i] / 100,
    igst: igst[i] / 100,
    cess: i === 0 ? paise(bill.cess) / 100 : 0,
    invoiceTotal: i === 0 ? bill.grandTotal : null,
  }));
}

const HEADER = [
  "Invoice date",
  "Invoice number",
  "Supplier",
  "Supplier GSTIN",
  "Supplier state",
  "GST rate %",
  "Taxable value",
  "CGST",
  "SGST",
  "IGST",
  "Cess",
  "Invoice total",
  "Checks",
];

const STATUS_LABEL: Record<BillStatus, string> = {
  ready: "Checked",
  review: "Look again",
  fix: "Not ready",
};

function cell(value: string | number | null): string {
  if (value === null) return "";
  const s = typeof value === "number" ? value.toFixed(2) : value;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function registerCsv(entries: LedgerEntry[]): string {
  const rows = entries.flatMap(registerRows);
  const lines = [HEADER.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.date,
        r.invoiceNumber,
        r.supplier,
        r.supplierGstin,
        r.supplierState,
        r.gstRate === null ? "" : String(r.gstRate),
        r.taxable,
        r.cgst,
        r.sgst,
        r.igst,
        r.cess,
        r.invoiceTotal,
        STATUS_LABEL[r.status],
      ]
        .map(cell)
        .join(","),
    );
  }
  return lines.join("\n") + "\n";
}

export interface ItcSummary {
  bills: number;
  readyBills: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  claimable: number; // GST on bills that passed every check
  onHold: number; // GST on bills that still need a look
}

export function itcSummary(entries: LedgerEntry[]): ItcSummary {
  let taxable = 0, cgst = 0, sgst = 0, igst = 0, claimable = 0, onHold = 0, readyBills = 0;
  for (const { bill, status } of entries) {
    const gst = paise(bill.cgst) + paise(bill.sgst) + paise(bill.igst);
    taxable += paise(bill.taxableTotal ?? bill.lines.reduce((s, l) => s + (l.amount ?? 0), 0));
    cgst += paise(bill.cgst);
    sgst += paise(bill.sgst);
    igst += paise(bill.igst);
    if (status === "ready") {
      claimable += gst;
      readyBills++;
    } else {
      onHold += gst;
    }
  }
  return {
    bills: entries.length,
    readyBills,
    taxable: taxable / 100,
    cgst: cgst / 100,
    sgst: sgst / 100,
    igst: igst / 100,
    claimable: claimable / 100,
    onHold: onHold / 100,
  };
}
