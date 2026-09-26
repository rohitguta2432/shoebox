"use client";

import { Download, ScanLine, Trash2 } from "lucide-react";
import { formatIsoDate, parseBillDate } from "@/lib/dates";
import { formatINR } from "@/lib/format";
import { normalizeGstin } from "@/lib/gstin";
import { itcSummary, type LedgerEntry } from "@/lib/ledger";

const STATUS_WORD = { ready: "Checked", review: "Look again", fix: "Not ready" } as const;

interface Props {
  ledger: LedgerEntry[];
  onOpen: (entry: LedgerEntry) => void;
  onDelete: (entry: LedgerEntry) => void;
  onRead: () => void;
}

export function LedgerView({ ledger, onOpen, onDelete, onRead }: Props) {
  const itc = itcSummary(ledger);
  const held = ledger.length - itc.readyBills;

  return (
    <section className="ledger" id="panel-ledger" role="tabpanel" aria-labelledby="tab-ledger">
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 className="ledger__title">Purchase ledger</h1>
          <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>
            {ledger.length === 0 ? "Empty for now." : `${ledger.length} ${ledger.length === 1 ? "bill" : "bills"}, newest first.`}
          </p>
        </div>
        {ledger.length > 0 ? (
          <a className="btn btn--primary" href="/api/ledger/csv" download>
            <Download size={17} aria-hidden="true" />
            Download CSV for your CA
          </a>
        ) : null}
      </div>

      {ledger.length === 0 ? (
        <div style={{ padding: "40px 0", maxWidth: 520 }}>
          <p style={{ fontSize: 17, fontWeight: 600 }}>Nothing in the ledger yet.</p>
          <p style={{ color: "var(--ink-2)", marginTop: 6 }}>
            Read a bill, look over the checks, and press Add to ledger. It shows up here, ready to send to your accountant.
          </p>
          <button type="button" className="btn btn--primary" style={{ marginTop: 18 }} onClick={onRead}>
            <ScanLine size={17} aria-hidden="true" />
            Read a bill
          </button>
        </div>
      ) : (
        <>
          <div className="balance">
            <div className="balance__row balance__row--claim">
              <span className="balance__label">Input tax credit ready to claim</span>
              <span className="balance__count">
                {itc.readyBills} {itc.readyBills === 1 ? "bill" : "bills"}
              </span>
              <span className="balance__amount">{formatINR(itc.claimable)}</span>
            </div>
            <div className="balance__row">
              <span className="balance__label">On hold until you fix or check them</span>
              <span className="balance__count">
                {held} {held === 1 ? "bill" : "bills"}
              </span>
              <span className="balance__amount">{formatINR(itc.onHold)}</span>
            </div>
          </div>

          <div className="table-wrap">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Supplier</th>
                  <th scope="col">Invoice</th>
                  <th scope="col" className="r">
                    Taxable
                  </th>
                  <th scope="col" className="r">
                    GST
                  </th>
                  <th scope="col" className="r">
                    Total
                  </th>
                  <th scope="col">Checks</th>
                  <th scope="col">
                    <span className="visually-hidden">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((entry) => {
                  const b = entry.bill;
                  const date = parseBillDate(b.invoiceDate);
                  const gst = (b.cgst ?? 0) + (b.sgst ?? 0) + (b.igst ?? 0);
                  return (
                    <tr key={entry.id} onClick={() => onOpen(entry)}>
                      <td className="num" style={{ whiteSpace: "nowrap", fontSize: 13.5 }}>
                        {date ? formatIsoDate(date) : (b.invoiceDate ?? "—")}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="supplier-cell"
                          style={{ textAlign: "left" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpen(entry);
                          }}
                        >
                          {b.supplierName || "Unnamed supplier"}
                        </button>
                        <span className="sub">{b.supplierGstin ? normalizeGstin(b.supplierGstin) : "no GSTIN"}</span>
                      </td>
                      <td className="num" style={{ fontSize: 13.5 }}>
                        {b.invoiceNumber ?? "—"}
                      </td>
                      <td className="r num">{b.taxableTotal === null ? "—" : formatINR(b.taxableTotal)}</td>
                      <td className="r num">{formatINR(gst)}</td>
                      <td className="r num" style={{ fontWeight: 600 }}>
                        {b.grandTotal === null ? "—" : formatINR(b.grandTotal)}
                      </td>
                      <td>
                        <span className="mini-stamp" data-status={entry.status}>
                          {STATUS_WORD[entry.status]}
                        </span>
                      </td>
                      <td className="r" style={{ width: 44 }}>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`Remove ${b.supplierName || "this bill"} from the ledger`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(entry);
                          }}
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
