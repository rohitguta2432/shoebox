// Indian bills print dates day-first: 26/09/2026, 26-09-26, 26.09.2026,
// 26 Sep 2026, 26-Sep-26. Returns an ISO date (2026-09-26) or null.

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function fullYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

function iso(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseBillDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, "$1");

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return iso(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{1,2})[\/\-. ](\d{1,2})[\/\-. ](\d{2}|\d{4})$/);
  if (m) return iso(fullYear(+m[3]), +m[2], +m[1]);

  m = s.match(/^(\d{1,2})[\-\s.\/]*([a-z]{3,9})[\-\s.,\/]*(\d{2}|\d{4})$/);
  if (m && MONTHS[m[2].slice(0, 3)]) return iso(fullYear(+m[3]), MONTHS[m[2].slice(0, 3)], +m[1]);

  m = s.match(/^([a-z]{3,9})[\s.]+(\d{1,2}),?\s+(\d{4})$/);
  if (m && MONTHS[m[1].slice(0, 3)]) return iso(+m[3], MONTHS[m[1].slice(0, 3)], +m[2]);

  return null;
}

export function formatIsoDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${names[m - 1]} ${y}`;
}
