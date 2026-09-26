import type { Bill } from "./bill";
import { checkCharFor } from "./gstin";

// Builds a GSTIN with a correct check character from its first 14 characters.
export const gstin = (first14: string) => first14 + checkCharFor(first14);

// Two lines, two GST rates, same state. Every number agrees with every other.
export function goodBill(): Bill {
  return {
    supplierName: "Shree Ganesh Traders",
    supplierGstin: gstin("27AAKFS4821M1Z"),
    buyerName: "Anand Kirana Store",
    buyerGstin: gstin("27AAHCP5519L1Z"),
    invoiceNumber: "SGT/2026/0412",
    invoiceDate: "12/09/2026",
    placeOfSupply: "27-Maharashtra",
    lines: [
      { description: "Parle-G 800g", hsn: "1905", quantity: 24, unit: "pcs", rate: 85, discount: null, amount: 2040, gstRate: 5 },
      { description: "Surf Excel 1kg", hsn: "3402", quantity: 10, unit: "pcs", rate: 190, discount: null, amount: 1900, gstRate: 18 },
    ],
    taxableTotal: 3940,
    cgst: 222,
    sgst: 222,
    igst: null,
    cess: null,
    roundOff: 0,
    grandTotal: 4384,
  };
}
