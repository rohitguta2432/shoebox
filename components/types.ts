import type { Bill } from "@/lib/bill";

export type ItemState = "waiting" | "reading" | "read" | "error";

// One bill in the pile: a photo, and what the model has read off it so far.
export interface QueueItem {
  key: string;
  name: string;
  src: string; // data URL, or the saved photo's URL when editing a ledger entry
  base64: string | null;
  state: ItemState;
  raw: string;
  bill: Bill | null;
  model: string | null;
  ms: number | null;
  startedAt: number | null;
  error: string | null;
  entryId: string | null;
}

export interface ToastMessage {
  id: number;
  text: string;
  undo?: () => void;
}

export const SAMPLES = [
  { id: "wholesale-invoice", name: "Wholesale tax invoice" },
  { id: "interstate-igst", name: "Inter-state IGST bill" },
  { id: "thermal-receipt", name: "Thermal till receipt" },
  { id: "billbook-handwritten", name: "Handwritten bill book" },
] as const;
