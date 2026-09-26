// What the vision model reads off the photo. The model only copies; every
// number is checked by plain code in checks.ts.

export interface BillLine {
  description: string;
  hsn: string | null;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
  discount: number | null;
  amount: number | null; // the line's amount column (value before tax)
  gstRate: number | null; // total GST percent for the line: CGST 9% + SGST 9% = 18
}

export interface Bill {
  supplierName: string;
  supplierGstin: string | null;
  buyerName: string | null;
  buyerGstin: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null; // exactly as printed, parsed in dates.ts
  placeOfSupply: string | null;
  lines: BillLine[];
  taxableTotal: number | null;
  cgst: number | null;
  sgst: number | null;
  igst: number | null;
  cess: number | null;
  roundOff: number | null;
  grandTotal: number | null;
}

export function emptyLine(): BillLine {
  return {
    description: "",
    hsn: null,
    quantity: null,
    unit: null,
    rate: null,
    discount: null,
    amount: null,
    gstRate: null,
  };
}

export function emptyBill(): Bill {
  return {
    supplierName: "",
    supplierGstin: null,
    buyerName: null,
    buyerGstin: null,
    invoiceNumber: null,
    invoiceDate: null,
    placeOfSupply: null,
    lines: [],
    taxableTotal: null,
    cgst: null,
    sgst: null,
    igst: null,
    cess: null,
    roundOff: null,
    grandTotal: null,
  };
}

const text = { type: ["string", "null"] };
const num = { type: ["number", "null"] };

// JSON schema handed to Ollama's `format` so the model can only answer in this shape.
export const BILL_SCHEMA = {
  type: "object",
  properties: {
    supplierName: { type: "string" },
    supplierGstin: text,
    buyerName: text,
    buyerGstin: text,
    invoiceNumber: text,
    invoiceDate: text,
    placeOfSupply: text,
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          hsn: text,
          quantity: num,
          unit: text,
          rate: num,
          discount: num,
          amount: num,
          gstRate: num,
        },
        required: ["description", "hsn", "quantity", "unit", "rate", "discount", "amount", "gstRate"],
      },
    },
    taxableTotal: num,
    cgst: num,
    sgst: num,
    igst: num,
    cess: num,
    roundOff: num,
    grandTotal: num,
  },
  required: [
    "supplierName",
    "supplierGstin",
    "buyerName",
    "buyerGstin",
    "invoiceNumber",
    "invoiceDate",
    "placeOfSupply",
    "lines",
    "taxableTotal",
    "cgst",
    "sgst",
    "igst",
    "cess",
    "roundOff",
    "grandTotal",
  ],
} as const;

export const EXTRACT_PROMPT = `This is a photo of an Indian GST bill. Copy what is printed into the JSON fields.

Rules:
- Copy exactly. Never calculate, correct or guess a number. If the bill's own math is wrong, copy it wrong.
- GSTINs have 15 characters. Copy them one character at a time.
- Amounts are plain rupee numbers: 1,23,456.50 becomes 123456.5. No commas, no rupee sign.
- gstRate is the total GST percent of the line. CGST 9% + SGST 9% is 18.
- amount is the line's amount column, the value before tax.
- invoiceDate: copy the date as printed.
- supplier is the business that issued the bill. buyer is the "Bill to" party.
- Use null for anything that is not printed.`;

// Models sometimes return numbers as strings ("1,234.50"). Coerce defensively.
export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[₹,\s]|Rs\.?|INR/gi, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s : null;
}

// Turn whatever the model produced into a well-formed Bill.
export function coerceBill(raw: unknown): Bill {
  const r = (raw ?? {}) as Record<string, unknown>;
  const lines = Array.isArray(r.lines) ? r.lines : [];
  return {
    supplierName: toText(r.supplierName) ?? "",
    supplierGstin: toText(r.supplierGstin),
    buyerName: toText(r.buyerName),
    buyerGstin: toText(r.buyerGstin),
    invoiceNumber: toText(r.invoiceNumber),
    invoiceDate: toText(r.invoiceDate),
    placeOfSupply: toText(r.placeOfSupply),
    lines: lines.map((l) => {
      const line = (l ?? {}) as Record<string, unknown>;
      return {
        description: toText(line.description) ?? "",
        hsn: toText(line.hsn),
        quantity: toNumber(line.quantity),
        unit: toText(line.unit),
        rate: toNumber(line.rate),
        discount: toNumber(line.discount),
        amount: toNumber(line.amount),
        gstRate: toNumber(line.gstRate),
      };
    }),
    taxableTotal: toNumber(r.taxableTotal),
    cgst: toNumber(r.cgst),
    sgst: toNumber(r.sgst),
    igst: toNumber(r.igst),
    cess: toNumber(r.cess),
    roundOff: toNumber(r.roundOff),
    grandTotal: toNumber(r.grandTotal),
  };
}
