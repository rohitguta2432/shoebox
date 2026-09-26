// GSTIN: 15 characters.
//   2 digits   state code        27
//   10 chars   PAN of the business AAPFU0939F
//   1 char     entity number     1
//   1 char     always "Z"        Z
//   1 char     check character   V
//
// The check character is a Luhn mod-36 checksum over the first 14 characters,
// so ANY single wrong character (a 0 read as an O, an 8 read as a B) is caught.

const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// The PAN's 4th letter is the holder type: Person, Company, Firm, LLP (E), HUF,
// AOP, BOI, Government, Local authority, Juridical person, Trust.
const SHAPE = /^[0-9]{2}[A-Z]{3}[ABCEFGHJLPT][A-Z][0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const STATE_CODES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "25": "Daman and Diu",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "28": "Andhra Pradesh (before 2014)",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
  "99": "Centre Jurisdiction",
};

// Characters a camera or a vision model commonly swaps for each other.
const LOOKALIKES: Record<string, string> = {
  "0": "ODQ",
  O: "0DQ",
  D: "0O",
  Q: "0O",
  "1": "IL7",
  I: "1L",
  L: "1I",
  "7": "1TZ",
  T: "7",
  "2": "Z",
  Z: "27",
  "5": "S",
  S: "58",
  "8": "B3S",
  B: "83",
  "3": "8B",
  "6": "GB",
  G: "6C",
  C: "G",
  "4": "A",
  A: "4",
  "9": "G",
  U: "V",
  V: "UY",
  Y: "V",
  M: "NH",
  N: "MH",
  H: "NM",
  E: "F",
  F: "EP",
  P: "FR",
  R: "PK",
  K: "RX",
  X: "K",
};

export function normalizeGstin(raw: string): string {
  return raw.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export function checkCharFor(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const codePoint = CHARS.indexOf(first14[i]);
    // Luhn mod N doubles every second character, counting from the right.
    const product = codePoint * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

export function hasValidShape(gstin: string): boolean {
  return SHAPE.test(gstin);
}

export function hasValidChecksum(gstin: string): boolean {
  return gstin.length === 15 && hasValidShape(gstin) && checkCharFor(gstin.slice(0, 14)) === gstin[14];
}

export function stateOf(gstin: string): string | undefined {
  return STATE_CODES[gstin.slice(0, 2)];
}

// "Place of supply" is printed many ways: "27-Maharashtra", "Karnataka (29)", "Delhi".
export function stateCodeFromPlace(place: string | null | undefined): string | null {
  if (!place) return null;
  const code = place.match(/\b(\d{2})\b/);
  if (code && STATE_CODES[code[1]]) return code[1];
  const lower = place.toLowerCase();
  let best: string | null = null;
  let bestLength = 0;
  for (const [c, name] of Object.entries(STATE_CODES)) {
    if (name.includes("(")) continue; // retired codes only match by number
    const n = name.toLowerCase();
    if (lower.includes(n) && n.length > bestLength) {
      best = c;
      bestLength = n.length;
    }
  }
  return best;
}

export interface GstinFix {
  gstin: string;
  position: number; // 1-based, for humans
  from: string;
  to: string;
}

// A GSTIN that fails its checksum usually has ONE misread character. Try every
// look-alike swap at every position; keep the ones that make a valid GSTIN.
export function suggestFixes(raw: string): GstinFix[] {
  const gstin = normalizeGstin(raw);
  if (gstin.length !== 15 || hasValidChecksum(gstin)) return [];
  const fixes: GstinFix[] = [];
  for (let i = 0; i < 15; i++) {
    for (const alt of LOOKALIKES[gstin[i]] ?? "") {
      const candidate = gstin.slice(0, i) + alt + gstin.slice(i + 1);
      if (hasValidChecksum(candidate) && STATE_CODES[candidate.slice(0, 2)]) {
        fixes.push({ gstin: candidate, position: i + 1, from: gstin[i], to: alt });
      }
    }
  }
  return fixes;
}

export type GstinVerdict =
  | { status: "missing" }
  | { status: "bad-shape"; gstin: string; fixes: GstinFix[] }
  | { status: "bad-checksum"; gstin: string; expected: string; fixes: GstinFix[] }
  | { status: "unknown-state"; gstin: string }
  | { status: "valid"; gstin: string; state: string };

export function verifyGstin(raw: string | null | undefined): GstinVerdict {
  if (!raw || !raw.trim()) return { status: "missing" };
  const gstin = normalizeGstin(raw);
  if (!hasValidShape(gstin)) return { status: "bad-shape", gstin, fixes: suggestFixes(gstin) };
  if (!hasValidChecksum(gstin)) {
    return {
      status: "bad-checksum",
      gstin,
      expected: checkCharFor(gstin.slice(0, 14)),
      fixes: suggestFixes(gstin),
    };
  }
  const state = stateOf(gstin);
  if (!state) return { status: "unknown-state", gstin };
  return { status: "valid", gstin, state };
}
