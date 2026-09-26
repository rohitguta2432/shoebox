// Builds the sample bills: HTML -> Chrome screenshot -> ImageMagick "phone photo".
// Every number is computed here, so the saved truth JSON is exactly what is printed.
// Run: npx tsx scripts/make-samples.mts

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Bill, BillLine } from "../lib/bill";
import { runChecks } from "../lib/checks";
import { gstin } from "../lib/fixtures";

const ROOT = resolve(import.meta.dirname, "..");
const BUILD = join(ROOT, "samples/.build");
const TRUTH = join(ROOT, "samples/truth");
const OUT = join(ROOT, "public/samples");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
for (const dir of [BUILD, TRUTH, OUT]) mkdirSync(dir, { recursive: true });

// ---------- money ----------
const r2 = (x: number) => Math.round(x * 100) / 100;
const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (x: number) => inr.format(x);

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const two = (n: number) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : ""));
const three = (n: number) =>
  [Math.floor(n / 100) ? ONES[Math.floor(n / 100)] + " Hundred" : "", n % 100 ? two(n % 100) : ""].filter(Boolean).join(" ");
function inWords(n: number): string {
  const parts = [
    [Math.floor(n / 1e7), "Crore"],
    [Math.floor((n % 1e7) / 1e5), "Lakh"],
    [Math.floor((n % 1e5) / 1e3), "Thousand"],
  ] as const;
  const words = parts.filter(([v]) => v).map(([v, unit]) => `${two(v)} ${unit}`);
  if (n % 1000) words.push(three(n % 1000));
  return `Rupees ${words.join(" ")} Only`;
}

// ---------- bills ----------
interface Item {
  description: string;
  hsn: string;
  quantity: number;
  unit: string;
  rate: number;
  gstRate: number;
}

interface Sample {
  id: string;
  title: string;
  template: "invoice" | "igst" | "thermal" | "billbook";
  bill: Bill;
  expect: "ready" | "fix";
  meta: Record<string, string>;
}

function makeBill(parts: Omit<Bill, "lines" | "taxableTotal" | "cgst" | "sgst" | "igst" | "cess" | "roundOff" | "grandTotal">, items: Item[], interstate: boolean): Bill {
  const lines: BillLine[] = items.map((i) => ({ ...i, discount: null, amount: r2(i.quantity * i.rate) }));
  const taxable = r2(lines.reduce((s, l) => s + l.amount!, 0));
  // Billing software rounds tax per line, then adds the lines up.
  const half = r2(lines.reduce((s, l) => s + r2((l.amount! * l.gstRate!) / 200), 0));
  const full = r2(lines.reduce((s, l) => s + r2((l.amount! * l.gstRate!) / 100), 0));
  const beforeRound = interstate ? r2(taxable + full) : r2(taxable + 2 * half);
  const grand = Math.round(beforeRound);
  return {
    ...parts,
    lines,
    taxableTotal: taxable,
    cgst: interstate ? null : half,
    sgst: interstate ? null : half,
    igst: interstate ? full : null,
    cess: null,
    roundOff: r2(grand - beforeRound),
    grandTotal: grand,
  };
}

const GANESH = gstin("27AAKFS4821M1Z");
const ANAND = gstin("27AAHCP5519L1Z");
const DECCAN = gstin("29AAGCM7316P1Z");
const SAI = gstin("27ABMPS6604K1Z");
const PIXEL = gstin("27AAPFP2267D1Z");
const BALAJI = gstin("27AASFB9043H1Z");

const samples: Sample[] = [
  {
    id: "wholesale-invoice",
    title: "Wholesale tax invoice",
    template: "invoice",
    expect: "ready",
    meta: {
      tagline: "Wholesale FMCG Distributors",
      address: "Shop 14, Market Yard, Gultekdi, Pune 411037",
      buyerAddress: "Kothrud, Pune 411038",
    },
    bill: makeBill(
      {
        supplierName: "Shree Ganesh Traders",
        supplierGstin: GANESH,
        buyerName: "Anand Kirana Store",
        buyerGstin: ANAND,
        invoiceNumber: "SGT/26-27/0412",
        invoiceDate: "12/09/2026",
        placeOfSupply: "27-Maharashtra",
      },
      [
        { description: "Glucose Biscuit 800g", hsn: "1905", quantity: 24, unit: "pcs", rate: 85, gstRate: 5 },
        { description: "Iodised Salt 1kg", hsn: "2501", quantity: 50, unit: "pcs", rate: 24, gstRate: 0 },
        { description: "Detergent Powder 1kg", hsn: "3402", quantity: 20, unit: "pcs", rate: 95, gstRate: 18 },
        { description: "Toor Dal 1kg", hsn: "0713", quantity: 30, unit: "pcs", rate: 148, gstRate: 5 },
        { description: "Sunflower Oil 1L", hsn: "1512", quantity: 24, unit: "pcs", rate: 132.5, gstRate: 5 },
        { description: "Toothpaste 150g", hsn: "3306", quantity: 36, unit: "pcs", rate: 76.25, gstRate: 5 },
      ],
      false,
    ),
  },
  {
    id: "interstate-igst",
    title: "Inter-state IGST invoice",
    template: "igst",
    expect: "ready",
    meta: {
      tagline: "Electrical Goods · Wholesale & Retail",
      address: "42, SP Road, Bengaluru 560002, Karnataka",
      buyerAddress: "Main Road, Panchavati, Nashik 422003",
    },
    bill: makeBill(
      {
        supplierName: "Deccan Electricals",
        supplierGstin: DECCAN,
        buyerName: "Sai Hardware",
        buyerGstin: SAI,
        invoiceNumber: "DE/2627/00931",
        invoiceDate: "19-09-2026",
        placeOfSupply: "27-Maharashtra",
      },
      [
        { description: "PVC Wire 1.5 sq mm, 90 m", hsn: "8544", quantity: 6, unit: "roll", rate: 1450, gstRate: 18 },
        { description: "Modular Switch 6A", hsn: "8536", quantity: 100, unit: "pcs", rate: 38.5, gstRate: 18 },
        { description: "MCB 32A Single Pole", hsn: "8536", quantity: 20, unit: "pcs", rate: 212, gstRate: 18 },
        { description: "Extension Board 4-way", hsn: "8536", quantity: 12, unit: "pcs", rate: 289, gstRate: 18 },
      ],
      true,
    ),
  },
  {
    id: "thermal-receipt",
    title: "Thermal till receipt",
    template: "thermal",
    expect: "ready",
    meta: { address: "Shop 3, FC Road, Shivajinagar, Pune 411004", counter: "Till 2 · Cashier: R" },
    bill: makeBill(
      {
        supplierName: "Pixel Computers",
        supplierGstin: PIXEL,
        buyerName: "Anand Kirana Store",
        buyerGstin: ANAND,
        invoiceNumber: "PC-118307",
        invoiceDate: "22-Sep-2026",
        placeOfSupply: "Maharashtra",
      },
      [
        { description: "Toner Cartridge 88A", hsn: "8443", quantity: 2, unit: "pcs", rate: 1150, gstRate: 18 },
        { description: "USB Mouse, wired", hsn: "8471", quantity: 5, unit: "pcs", rate: 245, gstRate: 18 },
        { description: "HDMI Cable 1.5m", hsn: "8544", quantity: 4, unit: "pcs", rate: 180, gstRate: 18 },
        { description: "Pen Drive 64GB", hsn: "8523", quantity: 3, unit: "pcs", rate: 499, gstRate: 18 },
      ],
      false,
    ),
  },
];

// The truth is what is PRINTED. Receipts and bill books don't print units or
// per-line GST rates, so the model is right to leave those empty.
const notPrinted = (bill: Bill): Bill => ({ ...bill, lines: bill.lines.map((l) => ({ ...l, unit: null, gstRate: null })) });
samples[2].bill = notPrinted(samples[2].bill);

// A handwritten bill-book page whose writer swapped two digits of the total.
const billbook = makeBill(
  {
    supplierName: "Balaji Provision Stores",
    supplierGstin: BALAJI,
    buyerName: "Anand Kirana Store",
    buyerGstin: ANAND,
    invoiceNumber: "347",
    invoiceDate: "24/9/26",
    placeOfSupply: null,
  },
  [
    { description: "Sugar 50 kg bag", hsn: "1701", quantity: 2, unit: "bag", rate: 2150, gstRate: 5 },
    { description: "Wheat Atta 10 kg", hsn: "1101", quantity: 5, unit: "bag", rate: 420, gstRate: 5 },
    { description: "Rice 25 kg", hsn: "1006", quantity: 2, unit: "bag", rate: 1450, gstRate: 5 },
  ],
  false,
);
samples.push({
  id: "billbook-handwritten",
  title: "Handwritten bill book",
  template: "billbook",
  expect: "fix",
  meta: { address: "Hadapsar Gaon, Pune 411028", phoneless: "Wholesale Kirana · Sugar · Grains" },
  bill: { ...notPrinted(billbook), grandTotal: 9675, roundOff: null }, // written as 9,675; the lines come to 9,765
});

// ---------- templates ----------
const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function invoiceHtml(s: Sample): string {
  const b = s.bill;
  const igst = s.template === "igst";
  const accent = igst ? "#1d3f72" : "#1b1b1b";
  const rows = b.lines
    .map(
      (l, i) => `<tr><td>${i + 1}</td><td class="d">${esc(l.description)}</td><td>${l.hsn}</td>
      <td class="n">${l.quantity} ${l.unit}</td><td class="n">${money(l.rate!)}</td><td class="n">${l.gstRate}%</td>
      <td class="n">${money(l.amount!)}</td></tr>`,
    )
    .join("");
  const taxRows = igst
    ? `<tr><td>IGST</td><td class="n">${money(b.igst!)}</td></tr>`
    : `<tr><td>CGST</td><td class="n">${money(b.cgst!)}</td></tr><tr><td>SGST</td><td class="n">${money(b.sgst!)}</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#fff;font-family:${igst ? "'Helvetica Neue',Arial" : "'Times New Roman',Times"},serif;color:#1b1b1b}
    .page{width:760px;padding:28px 34px 30px;box-sizing:border-box}
    .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid ${accent};padding-bottom:10px}
    h1{margin:0;font-size:30px;letter-spacing:.5px;color:${accent};${igst ? "" : "font-variant:small-caps;"}}
    .tag{font-size:13px;margin-top:2px}.addr{font-size:13px;margin-top:4px}
    .title{font-size:15px;font-weight:700;border:1.5px solid ${accent};padding:4px 10px;color:${accent}}
    .copy{font-size:11px;text-align:right;margin-top:4px}
    .gst{font-size:13px;margin-top:6px;font-weight:700;letter-spacing:.3px}
    .parties{display:flex;justify-content:space-between;margin:14px 0 12px;font-size:13.5px;line-height:1.55}
    .parties b{font-size:14.5px}
    table.items{width:100%;border-collapse:collapse;font-size:13.5px}
    table.items th{background:${igst ? "#e8eef7" : "#f1f1f1"};border:1px solid #777;padding:6px;font-size:12.5px}
    table.items td{border:1px solid #999;padding:6px 7px;text-align:center}
    td.d{text-align:left!important}td.n{text-align:right!important;font-variant-numeric:tabular-nums}
    .sum{display:flex;justify-content:space-between;margin-top:12px;font-size:13.5px}
    .words{max-width:360px;font-style:italic;line-height:1.5}
    table.tot{border-collapse:collapse;min-width:280px}
    table.tot td{padding:4px 8px;border-bottom:1px solid #ccc}
    table.tot tr.g td{font-size:17px;font-weight:700;border-top:2px solid ${accent};border-bottom:none}
    .sign{text-align:right;margin-top:26px;font-size:13px}
    .foot{margin-top:18px;font-size:11px;color:#555;border-top:1px dashed #999;padding-top:6px}
  </style></head><body><div class="page">
    <div class="top"><div><h1>${esc(b.supplierName)}</h1><div class="tag">${esc(s.meta.tagline)}</div>
      <div class="addr">${esc(s.meta.address)}</div><div class="gst">GSTIN: ${b.supplierGstin}</div></div>
      <div><div class="title">TAX INVOICE</div><div class="copy">Original for Recipient</div></div></div>
    <div class="parties"><div><div>Bill to</div><b>${esc(b.buyerName)}</b><div>${esc(s.meta.buyerAddress)}</div>
      <div>GSTIN: ${b.buyerGstin}</div></div>
      <div><div>Invoice No: <b>${esc(b.invoiceNumber)}</b></div><div>Date: <b>${esc(b.invoiceDate)}</b></div>
      <div>Place of Supply: ${esc(b.placeOfSupply)}</div>${igst ? "<div>Reverse charge: No</div>" : ""}</div></div>
    <table class="items"><thead><tr><th>#</th><th>Description of Goods</th><th>HSN</th><th>Qty</th><th>Rate</th><th>GST</th><th>Amount</th></tr></thead>
      <tbody>${rows}</tbody></table>
    <div class="sum"><div class="words">${inWords(b.grandTotal!)}</div>
      <table class="tot"><tr><td>Taxable Value</td><td class="n">${money(b.taxableTotal!)}</td></tr>${taxRows}
      <tr><td>Round Off</td><td class="n">${money(b.roundOff!)}</td></tr>
      <tr class="g"><td>Grand Total</td><td class="n">₹ ${money(b.grandTotal!)}</td></tr></table></div>
    <div class="sign">For ${esc(b.supplierName)}<br><br><br>Authorised Signatory</div>
    <div class="foot">Goods once sold will not be taken back. Subject to ${igst ? "Bengaluru" : "Pune"} jurisdiction. E. &amp; O.E.</div>
  </div></body></html>`;
}

function thermalHtml(s: Sample): string {
  const b = s.bill;
  const rows = b.lines
    .map(
      (l) => `<div class="l">${esc(l.description)}</div>
      <div class="r"><span>${l.hsn} ${l.quantity} x ${money(l.rate!)}</span><span>${money(l.amount!)}</span></div>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#fff}
    .p{width:360px;padding:22px 18px 30px;box-sizing:border-box;font-family:Menlo,'Courier New',monospace;font-size:13px;color:#2a2a2a;line-height:1.45}
    .c{text-align:center}.b{font-weight:700}.h{font-size:17px;font-weight:700;letter-spacing:1px}
    .dash{border-top:1.5px dashed #444;margin:8px 0}
    .r{display:flex;justify-content:space-between}.l{margin-top:4px}
    .t{font-size:16px;font-weight:700}
  </style></head><body><div class="p">
    <div class="c h">${esc(b.supplierName.toUpperCase())}</div>
    <div class="c">${esc(s.meta.address)}</div>
    <div class="c b">GSTIN ${b.supplierGstin}</div>
    <div class="c b" style="margin-top:6px">TAX INVOICE</div>
    <div class="dash"></div>
    <div class="r"><span>Bill: ${esc(b.invoiceNumber)}</span><span>${esc(b.invoiceDate)}</span></div>
    <div>${esc(s.meta.counter)}</div>
    <div>Cust: ${esc(b.buyerName)}</div>
    <div>Cust GSTIN: ${b.buyerGstin}</div>
    <div>POS: ${esc(b.placeOfSupply)}</div>
    <div class="dash"></div>
    <div class="r b"><span>ITEM / HSN QTY x RATE</span><span>AMT</span></div>
    ${rows}
    <div class="dash"></div>
    <div class="r"><span>Taxable</span><span>${money(b.taxableTotal!)}</span></div>
    <div class="r"><span>CGST @9%</span><span>${money(b.cgst!)}</span></div>
    <div class="r"><span>SGST @9%</span><span>${money(b.sgst!)}</span></div>
    <div class="r"><span>Round off</span><span>${money(b.roundOff!)}</span></div>
    <div class="dash"></div>
    <div class="r t"><span>TOTAL</span><span>Rs ${money(b.grandTotal!)}</span></div>
    <div class="dash"></div>
    <div class="c">Paid: UPI</div>
    <div class="c">Thank you! Visit again</div>
  </div></body></html>`;
}

function billbookHtml(s: Sample): string {
  const b = s.bill;
  const tilt = [-0.6, 0.4, -0.3, 0.7, -0.5];
  const rows = b.lines
    .map(
      (l, i) => `<tr><td class="hw">${i + 1}</td><td class="hw d" style="transform:rotate(${tilt[i]}deg)">${esc(l.description)}</td>
      <td class="hw">${l.hsn}</td><td class="hw">${l.quantity}</td><td class="hw n">${money(l.rate!).replace(".00", "")}</td>
      <td class="hw n">${money(l.amount!).replace(".00", "")}</td></tr>`,
    )
    .join("");
  const blank = Array.from({ length: 4 }, () => "<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>").join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#fbf7ee}
    .p{width:720px;padding:24px 30px 34px;box-sizing:border-box;color:#b3261e;font-family:'Times New Roman',serif}
    .hdr{text-align:center;border-bottom:2px solid #b3261e;padding-bottom:8px}
    .om{font-size:13px}.nm{font-size:32px;font-weight:700;letter-spacing:1px}
    .sub{font-size:14px}.g{font-size:14px;font-weight:700;margin-top:3px}
    .meta{display:flex;justify-content:space-between;margin:12px 0 4px;font-size:15px;align-items:baseline}
    .hw{font-family:'Bradley Hand',Noteworthy,cursive;color:#1f3a8a;font-size:19px;font-weight:700}
    .line{border-bottom:1px solid #b3261e;display:inline-block;min-width:170px;padding:0 6px}
    table{width:100%;border-collapse:collapse;margin-top:10px}
    th{border:1.5px solid #b3261e;font-size:14px;padding:5px}
    td{border-left:1.5px solid #b3261e;border-right:1.5px solid #b3261e;height:36px;padding:2px 8px;text-align:center}
    tbody tr:last-child td{border-bottom:1.5px solid #b3261e}
    td.d{text-align:left}td.n{text-align:right}
    .tot{display:flex;justify-content:flex-end;margin-top:8px}
    .tot table{width:320px;margin:0}
    .tot td{border:1.5px solid #b3261e;height:32px;text-align:left;font-size:15px}
    .tot td.hw{text-align:right}
    .sig{display:flex;justify-content:space-between;margin-top:30px;font-size:14px}
  </style></head><body><div class="p">
    <div class="hdr"><div class="om">|| Shree ||</div><div class="nm">${esc(b.supplierName.toUpperCase())}</div>
      <div class="sub">${esc(s.meta.phoneless)}</div><div class="sub">${esc(s.meta.address)}</div>
      <div class="g">GSTIN : ${b.supplierGstin}</div><div class="sub" style="margin-top:3px"><b>TAX INVOICE</b></div></div>
    <div class="meta"><div>No. <span class="hw" style="font-size:22px">${esc(b.invoiceNumber)}</span></div>
      <div>Date <span class="line hw">${esc(b.invoiceDate)}</span></div></div>
    <div class="meta"><div>M/s. <span class="line hw" style="min-width:330px">${esc(b.buyerName)}</span></div></div>
    <div class="meta"><div>GSTIN <span class="line hw" style="min-width:300px">${b.buyerGstin}</span></div></div>
    <table><thead><tr><th style="width:36px">Sr.</th><th>Particulars</th><th style="width:70px">HSN</th><th style="width:52px">Qty</th>
      <th style="width:90px">Rate</th><th style="width:110px">Amount</th></tr></thead><tbody>${rows}${blank}</tbody></table>
    <div class="tot"><table>
      <tr><td>Total</td><td class="hw">${money(b.taxableTotal!).replace(".00", "")}</td></tr>
      <tr><td>CGST 2.5%</td><td class="hw">${money(b.cgst!)}</td></tr>
      <tr><td>SGST 2.5%</td><td class="hw">${money(b.sgst!)}</td></tr>
      <tr><td><b>G. Total</b></td><td class="hw" style="font-size:23px">${money(b.grandTotal!).replace(".00", "")}/-</td></tr>
    </table></div>
    <div class="sig"><div>Receiver's Sign</div><div>For ${esc(b.supplierName)}</div></div>
  </div></body></html>`;
}

// ---------- render ----------
interface Look {
  width: number;
  height: number;
  rotate: number;
  desk: string;
  paper: string;
  light: string;
  noise: number;
  blur: number;
  skew: [number, number, number, number, number, number, number, number]; // corner offsets
}

const LOOKS: Record<Sample["template"], Look> = {
  invoice: { width: 760, height: 790, rotate: -1.6, desk: "#4a3b2f", paper: "#f4efe3", light: "#bfb6a4", noise: 0.4, blur: 0.55, skew: [16, 22, -10, 8, 6, -18, -20, -6] },
  igst: { width: 760, height: 720, rotate: 1.1, desk: "#2f3a40", paper: "#f6f4ee", light: "#c9c4b8", noise: 0.35, blur: 0.5, skew: [8, 10, -14, 18, 12, -8, -6, -14] },
  thermal: { width: 360, height: 690, rotate: 2.4, desk: "#6b5440", paper: "#f2f0ea", light: "#b9b3a6", noise: 0.5, blur: 0.65, skew: [6, 12, -4, 4, 10, -6, -8, -10] },
  billbook: { width: 720, height: 850, rotate: -2.2, desk: "#3d4a3a", paper: "#f7efdc", light: "#c2b08d", noise: 0.45, blur: 0.6, skew: [12, 18, -18, 10, 8, -12, -14, -8] },
};

function render(s: Sample) {
  const html = s.template === "thermal" ? thermalHtml(s) : s.template === "billbook" ? billbookHtml(s) : invoiceHtml(s);
  const htmlPath = join(BUILD, `${s.id}.html`);
  const rawPath = join(BUILD, `${s.id}.png`);
  writeFileSync(htmlPath, html);
  const look = LOOKS[s.template];
  execFileSync(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=2",
    `--window-size=${look.width},${look.height}`,
    `--screenshot=${rawPath}`,
    `file://${htmlPath}`,
  ], { stdio: "ignore" });

  const w = look.width * 2;
  const h = look.height * 2;
  const [a, b, c, d, e, f, g, k] = look.skew;
  const pad = 70;
  execFileSync("magick", [
    "-seed",
    "7",
    rawPath,
    // paper colour, then light falling off across the page
    "(", "+clone", "-fill", look.paper, "-colorize", "100", ")", "-compose", "multiply", "-composite",
    "(", "+clone", "-sparse-color", "Barycentric", `0,0 #ffffff ${w},${h} ${look.light}`, ")", "-compose", "multiply", "-composite",
    "-attenuate", String(look.noise), "+noise", "Gaussian",
    "-blur", `0x${look.blur}`,
    // a phone is never held perfectly square to the page
    "-compose", "over", "-bordercolor", look.desk, "-border", String(pad),
    "-virtual-pixel", "background", "-background", look.desk,
    "-distort", "Perspective",
    `${pad},${pad} ${pad + a},${pad + b}  ${pad + w},${pad} ${pad + w + c},${pad + d}  ${pad},${pad + h} ${pad + e},${pad + h + f}  ${pad + w},${pad + h} ${pad + w + g},${pad + h + k}`,
    "-rotate", String(look.rotate),
    "-resize", "1400x1400>",
    "-quality", "84",
    join(OUT, `${s.id}.jpg`),
  ]);
}

for (const s of samples) {
  const report = runChecks(s.bill, { today: "2026-09-26" });
  if (report.status !== s.expect) {
    const failing = report.checks.filter((c) => c.level !== "pass").map((c) => `${c.id}: ${c.detail}`);
    throw new Error(`${s.id}: expected ${s.expect}, got ${report.status}\n${failing.join("\n")}`);
  }
  writeFileSync(join(TRUTH, `${s.id}.json`), JSON.stringify({ id: s.id, title: s.title, expect: s.expect, bill: s.bill }, null, 2) + "\n");
  render(s);
  console.log(`${s.id.padEnd(22)} ${report.status.padEnd(6)} grand total ₹${money(s.bill.grandTotal!)}`);
}
