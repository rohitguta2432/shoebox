import { BookOpen, ScanLine } from "lucide-react";
import type { ModelStatus } from "@/lib/extract";

interface Props {
  view: "read" | "ledger";
  onView: (view: "read" | "ledger") => void;
  status: ModelStatus | null;
  pileCount: number;
  ledgerCount: number;
}

export function Cover({ view, onView, status, pileCount, ledgerCount }: Props) {
  const state = !status ? "checking" : status.ok ? "ready" : "down";
  return (
    <header className="cover">
      <div className="cover__row">
        <div className="wordmark">
          <span className="wordmark__name">Shoebox</span>
          <span className="wordmark__line">Bill photo to GST ledger. Runs on this laptop.</span>
        </div>
        <div className="engine" data-state={state} title={status?.error}>
          <span className="engine__dot" aria-hidden="true" />
          <span>{state === "ready" ? "Model ready" : state === "down" ? "Model not running" : "Checking model"}</span>
          {status?.model ? <span className="engine__model">{status.model}</span> : null}
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Shoebox views">
        <button
          type="button"
          role="tab"
          id="tab-read"
          aria-controls="panel-read"
          aria-selected={view === "read"}
          className="tab"
          onClick={() => onView("read")}
        >
          <ScanLine size={16} aria-hidden="true" />
          Read bills
          {pileCount > 0 ? <span className="tab__count">{pileCount}</span> : null}
        </button>
        <button
          type="button"
          role="tab"
          id="tab-ledger"
          aria-controls="panel-ledger"
          aria-selected={view === "ledger"}
          className="tab"
          onClick={() => onView("ledger")}
        >
          <BookOpen size={16} aria-hidden="true" />
          Ledger
          <span className="tab__count">{ledgerCount}</span>
        </button>
      </div>
    </header>
  );
}
