import type { LedgerEntry } from "@/lib/ledger";
import { loadLedger, removeEntry, restoreEntry, saveEntry, type SaveInput } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await loadLedger());
}

// Save a new bill, or update one when an id is sent.
export async function POST(request: Request) {
  const input = (await request.json()) as SaveInput;
  if (!input?.bill) return Response.json({ error: "No bill to save." }, { status: 400 });
  return Response.json(await saveEntry(input));
}

// Put back an entry that was just deleted (undo).
export async function PUT(request: Request) {
  const entry = (await request.json()) as LedgerEntry;
  if (!entry?.id || !entry.bill) return Response.json({ error: "Not a ledger entry." }, { status: 400 });
  await restoreEntry(entry);
  return Response.json(entry);
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Which entry?" }, { status: 400 });
  const removed = await removeEntry(id);
  return removed ? Response.json(removed) : Response.json({ error: "Not found." }, { status: 404 });
}
