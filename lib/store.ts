// The ledger lives in ./data on this laptop: one JSON file plus the bill photos.

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { coerceBill, type Bill } from "./bill";
import { runChecks } from "./checks";
import type { LedgerEntry } from "./ledger";

const DATA_DIR = process.env.SHOEBOX_DATA ?? path.join(process.cwd(), "data");
const LEDGER_FILE = path.join(DATA_DIR, "ledger.json");
const PHOTOS_DIR = path.join(DATA_DIR, "bills");

const safeId = (id: string) => /^[a-zA-Z0-9-]{8,64}$/.test(id);

export async function loadLedger(): Promise<LedgerEntry[]> {
  try {
    return JSON.parse(await fs.readFile(LEDGER_FILE, "utf8")) as LedgerEntry[];
  } catch {
    return [];
  }
}

async function saveLedger(entries: LedgerEntry[]) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${LEDGER_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(entries, null, 2));
  await fs.rename(tmp, LEDGER_FILE);
}

export interface SaveInput {
  id?: string;
  bill: Bill;
  imageBase64?: string | null;
  model?: string | null;
  readMs?: number | null;
}

export async function saveEntry(input: SaveInput): Promise<LedgerEntry> {
  const entries = await loadLedger();
  const id = input.id && safeId(input.id) ? input.id : randomUUID();
  const bill = coerceBill(input.bill);
  const existing = entries.find((e) => e.id === id);

  let image = existing?.image ?? null;
  if (input.imageBase64) {
    await fs.mkdir(PHOTOS_DIR, { recursive: true });
    image = `${id}.jpg`;
    await fs.writeFile(path.join(PHOTOS_DIR, image), Buffer.from(input.imageBase64, "base64"));
  }

  const entry: LedgerEntry = {
    id,
    savedAt: existing?.savedAt ?? new Date().toISOString(),
    bill,
    status: runChecks(bill).status,
    image,
    model: input.model ?? existing?.model ?? null,
    readMs: input.readMs ?? existing?.readMs ?? null,
  };
  const next = existing ? entries.map((e) => (e.id === id ? entry : e)) : [entry, ...entries];
  await saveLedger(next);
  return entry;
}

export async function removeEntry(id: string): Promise<LedgerEntry | null> {
  const entries = await loadLedger();
  const entry = entries.find((e) => e.id === id) ?? null;
  if (!entry) return null;
  await saveLedger(entries.filter((e) => e.id !== id));
  return entry;
}

// Put a removed entry back (undo). The photo is kept on disk until then.
export async function restoreEntry(entry: LedgerEntry): Promise<void> {
  const entries = await loadLedger();
  if (entries.some((e) => e.id === entry.id)) return;
  const next = [entry, ...entries].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  await saveLedger(next);
}

export async function readPhoto(id: string): Promise<Buffer | null> {
  if (!safeId(id)) return null;
  try {
    return await fs.readFile(path.join(PHOTOS_DIR, `${id}.jpg`));
  } catch {
    return null;
  }
}
