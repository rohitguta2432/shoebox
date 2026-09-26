"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { coerceBill, type Bill } from "@/lib/bill";
import { runChecks } from "@/lib/checks";
import type { ModelStatus } from "@/lib/extract";
import { normalizeGstin } from "@/lib/gstin";
import { prepareImage } from "@/lib/image";
import type { LedgerEntry } from "@/lib/ledger";
import { parsePartialJson } from "@/lib/partial-json";
import { Cover } from "./Cover";
import { LedgerView } from "./LedgerView";
import { PhotoPage } from "./PhotoPage";
import { SheetPage } from "./SheetPage";
import { SAMPLES, type QueueItem, type ToastMessage } from "./types";

const newKey = () => crypto.randomUUID();

function makeItem(name: string, src: string, base64: string | null): QueueItem {
  return {
    key: newKey(),
    name,
    src,
    base64,
    state: "waiting",
    raw: "",
    bill: null,
    model: null,
    ms: null,
    startedAt: null,
    error: null,
    entryId: null,
  };
}

const sameInvoice = (a: Bill, b: Bill) =>
  !!a.invoiceNumber &&
  !!b.invoiceNumber &&
  a.invoiceNumber.trim().toLowerCase() === b.invoiceNumber.trim().toLowerCase() &&
  normalizeGstin(a.supplierGstin ?? "") === normalizeGstin(b.supplierGstin ?? "");

export function Shoebox() {
  const [view, setView] = useState<"read" | "ledger">("read");
  const [status, setStatus] = useState<ModelStatus | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [saving, setSaving] = useState(false);
  const readingKey = useRef<string | null>(null);
  const controllers = useRef(new Map<string, AbortController>());

  const current = queue.find((i) => i.key === currentKey) ?? queue[0] ?? null;

  // ---------------------------------------------------------------- status
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const next = (await fetch("/api/status", { cache: "no-store" }).then((r) => r.json())) as ModelStatus;
        if (alive) setStatus(next);
      } catch {
        if (alive) setStatus({ ok: false, model: "", vision: false, version: null, error: "The Shoebox server isn't answering." });
      }
    };
    poll();
    const timer = setInterval(poll, 12000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  // ---------------------------------------------------------------- ledger
  const refreshLedger = useCallback(async () => {
    const entries = (await fetch("/api/ledger", { cache: "no-store" }).then((r) => r.json())) as LedgerEntry[];
    setLedger(entries);
  }, []);

  useEffect(() => {
    // Load the saved ledger once on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount
    refreshLedger().catch(() => undefined);
  }, [refreshLedger]);

  // ---------------------------------------------------------------- toast
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showToast = useCallback((text: string, undo?: () => void) => {
    clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text, undo });
    toastTimer.current = setTimeout(() => setToast(null), 6500);
  }, []);

  // ---------------------------------------------------------------- reading
  const update = useCallback((key: string, patch: Partial<QueueItem>) => {
    setQueue((q) => q.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }, []);

  const readBill = useCallback(
    async (item: QueueItem) => {
      const controller = new AbortController();
      controllers.current.set(item.key, controller);
      update(item.key, { state: "reading", startedAt: Date.now(), raw: "", bill: null, error: null });
      setAnnouncement(`Reading ${item.name}.`);
      let finished = false;
      let frame = 0;
      try {
        const res = await fetch("/api/extract", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ image: item.base64 }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `The server answered ${res.status}.`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let raw = "";
        const flush = () => {
          frame = 0;
          const partial = parsePartialJson(raw);
          update(item.key, { raw, bill: partial && typeof partial === "object" ? coerceBill(partial) : null });
        };
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let newline: number;
          while ((newline = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            if (!line) continue;
            const event = JSON.parse(line);
            if (event.type === "chunk") {
              raw += event.text;
              if (!frame) frame = requestAnimationFrame(flush);
            } else if (event.type === "done") {
              if (frame) cancelAnimationFrame(frame);
              finished = true;
              const bill = coerceBill(event.bill);
              const report = runChecks(bill);
              update(item.key, { state: "read", raw, bill, model: event.model, ms: event.ms });
              setAnnouncement(
                report.status === "ready"
                  ? `${bill.supplierName || "Bill"} read. All checks passed.`
                  : `${bill.supplierName || "Bill"} read. ${report.counts.fail} problems, ${report.counts.warn} things to look at.`,
              );
            } else if (event.type === "error") {
              throw new Error(event.message);
            }
          }
        }
        if (!finished) throw new Error("The model stopped before it finished the bill.");
      } catch (error) {
        if (frame) cancelAnimationFrame(frame);
        if (controller.signal.aborted) return;
        update(item.key, { state: "error", error: error instanceof Error ? error.message : String(error) });
        setAnnouncement("Couldn't read the bill.");
      } finally {
        controllers.current.delete(item.key);
      }
    },
    [update],
  );

  // One bill at a time, oldest first.
  useEffect(() => {
    if (readingKey.current) return;
    const next = queue.find((i) => i.state === "waiting" && i.base64);
    if (!next) return;
    readingKey.current = next.key;
    // Syncing with an external system (the model server): marking the bill as
    // in flight is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    readBill(next).finally(() => {
      readingKey.current = null;
      setQueue((q) => [...q]);
    });
  }, [queue, readBill]);

  // ---------------------------------------------------------------- adding bills
  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setView("read");
      const items: QueueItem[] = [];
      for (const file of files) {
        try {
          const image = await prepareImage(file);
          items.push(makeItem(file.name, image.dataUrl, image.base64));
        } catch (error) {
          showToast(error instanceof Error ? error.message : "Couldn't open that image.");
        }
      }
      if (items.length === 0) return;
      setQueue((q) => [...q, ...items]);
      setCurrentKey((key) => key ?? items[0].key);
    },
    [showToast],
  );

  const addSamples = useCallback(
    async (ids: string[]) => {
      const files = await Promise.all(
        ids.map(async (id) => {
          const blob = await fetch(`/samples/${id}.jpg`).then((r) => r.blob());
          const name = SAMPLES.find((s) => s.id === id)?.name ?? id;
          return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
        }),
      );
      await addFiles(files);
    },
    [addFiles],
  );

  // Paste a photo from the clipboard.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (files.length) {
        e.preventDefault();
        addFiles(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  // ---------------------------------------------------------------- pile actions
  const removeFromPile = useCallback(
    (key: string, { quiet = false } = {}) => {
      controllers.current.get(key)?.abort();
      const index = queue.findIndex((i) => i.key === key);
      const removed = queue[index];
      const rest = queue.filter((i) => i.key !== key);
      setQueue((q) => q.filter((i) => i.key !== key));
      setCurrentKey((k) => (k === key || k === null ? (rest[Math.min(index, rest.length - 1)]?.key ?? null) : k));
      if (!quiet && removed) {
        showToast("Removed from the pile.", () => {
          const back = removed.state === "reading" ? { ...removed, state: "waiting" as const, raw: "", bill: null } : removed;
          setQueue((q) => [...q.slice(0, index), back, ...q.slice(index)]);
          setCurrentKey(back.key);
        });
      }
    },
    [queue, showToast],
  );

  const retry = useCallback(() => {
    if (current) update(current.key, { state: "waiting", error: null, raw: "", bill: null });
  }, [current, update]);

  const duplicate = useMemo(() => {
    if (!current?.bill || current.state !== "read") return null;
    return ledger.find((e) => e.id !== current.entryId && sameInvoice(e.bill, current.bill!)) ?? null;
  }, [current, ledger]);

  const save = useCallback(async () => {
    if (!current || current.state !== "read" || !current.bill || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/ledger", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: current.entryId ?? undefined,
          bill: current.bill,
          imageBase64: current.entryId ? null : current.base64,
          model: current.model,
          readMs: current.ms,
        }),
      });
      if (!res.ok) throw new Error("Couldn't save to the ledger.");
      const entry = (await res.json()) as LedgerEntry;
      const saved = current;
      removeFromPile(saved.key, { quiet: true });
      await refreshLedger();
      const name = entry.bill.supplierName || "Bill";
      setAnnouncement(`${name} saved to the ledger.`);
      showToast(
        saved.entryId ? `Saved changes to ${name}.` : `${name} is in the ledger.`,
        saved.entryId
          ? undefined
          : async () => {
              await fetch(`/api/ledger?id=${entry.id}`, { method: "DELETE" });
              await refreshLedger();
              setQueue((q) => [saved, ...q]);
              setCurrentKey(saved.key);
              setView("read");
            },
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }, [current, saving, removeFromPile, refreshLedger, showToast]);

  // ⌘↵ / Ctrl+↵ adds the bill on screen to the ledger. A field still being
  // typed in is committed first (on blur), then the newest save() runs.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (view === "read" && e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur();
        setTimeout(() => saveRef.current(), 60);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);

  const openEntry = useCallback((entry: LedgerEntry) => {
    const existing = queue.find((i) => i.entryId === entry.id);
    if (existing) {
      setCurrentKey(existing.key);
    } else {
      const item: QueueItem = {
        ...makeItem(entry.bill.supplierName, entry.image ? `/api/ledger/${entry.id}/photo` : "", null),
        state: "read",
        bill: entry.bill,
        model: entry.model,
        entryId: entry.id,
      };
      setQueue((q) => [item, ...q]);
      setCurrentKey(item.key);
    }
    setView("read");
  }, [queue]);

  const deleteEntry = useCallback(
    async (entry: LedgerEntry) => {
      const res = await fetch(`/api/ledger?id=${entry.id}`, { method: "DELETE" });
      if (!res.ok) return showToast("Couldn't remove that bill.");
      await refreshLedger();
      showToast(`Removed ${entry.bill.supplierName || "bill"} from the ledger.`, async () => {
        await fetch("/api/ledger", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(entry) });
        await refreshLedger();
      });
    },
    [refreshLedger, showToast],
  );

  const waitingAhead = current ? queue.filter((i) => i.state === "reading" || (i.state === "waiting" && queue.indexOf(i) < queue.indexOf(current))).length : 0;

  return (
    <>
      <Cover view={view} onView={setView} status={status} pileCount={queue.length} ledgerCount={ledger.length} />
      <main className="desk">
        <div className="desk__inner">
          {view === "read" ? (
            <div className="spread" id="panel-read" role="tabpanel" aria-labelledby="tab-read">
              <PhotoPage
                current={current}
                queue={queue}
                status={status}
                onFiles={addFiles}
                onSamples={addSamples}
                onSelect={setCurrentKey}
                onRemove={(key) => removeFromPile(key)}
              />
              <SheetPage
                item={current}
                waitingAhead={waitingAhead}
                remaining={queue.length}
                duplicate={duplicate}
                saving={saving}
                onChange={(bill) => current && update(current.key, { bill })}
                onSave={save}
                onSkip={() => current && (current.entryId ? removeFromPile(current.key, { quiet: true }) : removeFromPile(current.key))}
                onRetry={retry}
              />
            </div>
          ) : (
            <LedgerView ledger={ledger} onOpen={openEntry} onDelete={deleteEntry} onRead={() => setView("read")} />
          )}
        </div>
      </main>
      <footer className="foot">
        <div className="foot__inner">
          <span>Nothing leaves this laptop. Bills are read by a local model and checked by plain code.</span>
          <span>Shoebox · open source, MIT</span>
        </div>
      </footer>
      <div className="visually-hidden" aria-live="polite">
        {announcement}
      </div>
      {toast ? (
        <div className="toast" role="status" key={toast.id}>
          <span>{toast.text}</span>
          {toast.undo ? (
            <button
              type="button"
              onClick={() => {
                toast.undo?.();
                setToast(null);
              }}
            >
              Undo
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
