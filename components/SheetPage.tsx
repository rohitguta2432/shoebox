"use client";

import { AlertTriangle, Check as CheckIcon, CopyX, CornerDownLeft, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toNumber, type Bill, type BillLine } from "@/lib/bill";
import { runChecks, type Check, type CheckReport, type Level } from "@/lib/checks";
import { formatIsoDate, parseBillDate } from "@/lib/dates";
import { normalizeGstin, verifyGstin } from "@/lib/gstin";
import type { LedgerEntry } from "@/lib/ledger";
import type { QueueItem } from "./types";

const plain = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (x: number | null) => (x === null ? "" : plain.format(x));
type Flags = Record<string, Exclude<Level, "pass">>;

interface Props {
  item: QueueItem | null;
  waitingAhead: number;
  remaining: number;
  duplicate: LedgerEntry | null;
  onChange: (bill: Bill) => void;
  onSave: () => void;
  onSkip: () => void;
  onRetry: () => void;
  saving: boolean;
}

export function SheetPage({ item, waitingAhead, remaining, duplicate, onChange, onSave, onSkip, onRetry, saving }: Props) {
  if (!item) {
    return (
      <section className="page page--sheet" aria-label="Ledger page">
        <Explainer />
      </section>
    );
  }
  if (item.state === "error") {
    return (
      <section className="page page--sheet" aria-label="Ledger page">
        <div className="explainer" style={{ paddingTop: 8 }}>
          <h2>This one didn&apos;t read.</h2>
          <p>{item.error}</p>
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button type="button" className="btn btn--primary" onClick={onRetry}>
              Try again
            </button>
            <button type="button" className="btn btn--quiet" onClick={onSkip}>
              Remove from the pile
            </button>
          </div>
        </div>
      </section>
    );
  }
  return (
    <Sheet
      item={item}
      waitingAhead={waitingAhead}
      remaining={remaining}
      duplicate={duplicate}
      onChange={onChange}
      onSave={onSave}
      onSkip={onSkip}
      saving={saving}
    />
  );
}

function Sheet({
  item,
  waitingAhead,
  remaining,
  duplicate,
  onChange,
  onSave,
  onSkip,
  saving,
}: Omit<Props, "item" | "onRetry"> & { item: QueueItem }) {
  const reading = item.state !== "read";
  const bill = item.bill;
  const report = useMemo<CheckReport | null>(() => {
    if (reading || !bill) return null;
    const base = runChecks(bill);
    if (!duplicate) return base;
    // Only the ledger knows about duplicates, so this check joins here.
    const checks: Check[] = [
      {
        id: "duplicate",
        level: "fail",
        title: "Already in your ledger",
        detail: `Invoice ${duplicate.bill.invoiceNumber} from this supplier is saved already. Adding it again would claim its tax twice.`,
        fields: ["invoiceNumber"],
      },
      ...base.checks,
    ];
    return { checks, status: "fix", counts: { ...base.counts, fail: base.counts.fail + 1 } };
  }, [reading, bill, duplicate]);
  const flags = useMemo<Flags>(() => {
    const out: Flags = {};
    for (const c of report?.checks ?? []) {
      if (c.level === "pass") continue;
      for (const f of c.fields) if (out[f] !== "fail") out[f] = c.level;
    }
    return out;
  }, [report]);
  const checkFor = (field: string) => report?.checks.find((c) => c.id === field);

  if (!bill) {
    return (
      <section className="page page--sheet" aria-label="Ledger page" aria-busy="true">
        <div className="sheet-head">
          <div>
            <div className="supplier" style={{ color: "var(--muted)" }}>
              {item.state === "waiting" ? "Waiting in the pile" : "Reading the bill"}
            </div>
            <div className="sheet-sub">
              {item.state === "waiting"
                ? `The model finishes ${waitingAhead === 1 ? "one bill" : `${waitingAhead} bills`} first.`
                : "Fields appear here as the model writes them."}
            </div>
          </div>
          <Stamp report={null} reading={item.state === "reading"} />
        </div>
        <GhostRows />
      </section>
    );
  }

  const set = <K extends keyof Bill>(key: K, value: Bill[K]) => onChange({ ...bill, [key]: value });
  const setLine = (i: number, patch: Partial<BillLine>) =>
    onChange({ ...bill, lines: bill.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const date = parseBillDate(bill.invoiceDate);
  const lineCount = bill.lines.length;

  return (
    <section className="page page--sheet" aria-label="Ledger page" aria-busy={reading}>
      <div className="sheet-head">
        <div style={{ minWidth: 0, flex: 1 }}>
          {reading ? (
            <div className="supplier">
              {bill.supplierName ? <span className="ink-in">{bill.supplierName}</span> : <span style={{ color: "var(--muted)" }}>Reading</span>}
            </div>
          ) : (
            <input
              className="supplier supplier-input"
              value={bill.supplierName}
              onChange={(e) => set("supplierName", e.target.value)}
              aria-label="Supplier name"
              placeholder="Supplier name"
            />
          )}
          <div className="sheet-sub">
            {reading
              ? "The model is writing. Checks run the moment it finishes."
              : `Tax invoice · ${lineCount} ${lineCount === 1 ? "line" : "lines"}${item.entryId ? " · editing a saved entry" : ""}`}
          </div>
        </div>
        <Stamp report={report} reading={reading} />
      </div>

      {duplicate && !reading ? (
        <div className="banner" role="note">
          <CopyX size={17} aria-hidden="true" />
          <span>
            Already in your ledger: invoice <b>{duplicate.bill.invoiceNumber}</b> from this supplier, saved{" "}
            {new Date(duplicate.savedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}. Saving again would
            claim its tax twice.
          </span>
        </div>
      ) : null}

      <div className="section">
        <h2 className="section__title">Bill details</h2>
        <div className="fields">
          <Field label="Supplier GSTIN" field="supplierGstin" flags={flags} htmlFor="f-supplierGstin">
            <GstinField
              id="f-supplierGstin"
              label="Supplier GSTIN"
              value={bill.supplierGstin}
              reading={reading}
              check={checkFor("supplierGstin")}
              onChange={(v) => set("supplierGstin", v)}
            />
          </Field>
          <Field label="Invoice number" field="invoiceNumber" flags={flags} htmlFor="f-invoiceNumber">
            <TextValue id="f-invoiceNumber" reading={reading} value={bill.invoiceNumber} onChange={(v) => set("invoiceNumber", v)} mono />
          </Field>
          <Field label={date && !reading ? `Invoice date · ${formatIsoDate(date)}` : "Invoice date"} field="invoiceDate" flags={flags} htmlFor="f-invoiceDate">
            <TextValue id="f-invoiceDate" reading={reading} value={bill.invoiceDate} onChange={(v) => set("invoiceDate", v)} mono />
          </Field>
          <Field label="Place of supply" field="placeOfSupply" flags={flags} htmlFor="f-placeOfSupply">
            <TextValue id="f-placeOfSupply" reading={reading} value={bill.placeOfSupply} onChange={(v) => set("placeOfSupply", v)} />
          </Field>
          <Field label="Buyer" field="buyerName" flags={flags} htmlFor="f-buyerName">
            <TextValue id="f-buyerName" reading={reading} value={bill.buyerName} onChange={(v) => set("buyerName", v)} />
          </Field>
          <Field label="Buyer GSTIN" field="buyerGstin" flags={flags} htmlFor="f-buyerGstin">
            <GstinField
              id="f-buyerGstin"
              label="Buyer GSTIN"
              value={bill.buyerGstin}
              reading={reading}
              check={checkFor("buyerGstin")}
              onChange={(v) => set("buyerGstin", v)}
            />
          </Field>
        </div>
      </div>

      <div className="section">
        <h2 className="section__title">
          Items <span className="section__note">{lineCount === 0 ? "none yet" : `${lineCount} ${lineCount === 1 ? "line" : "lines"}`}</span>
        </h2>
        <div style={{ overflowX: "auto", position: "relative" }}>
          <table className="items">
            <thead>
              <tr>
                <th scope="col">
                  <span className="visually-hidden">Line</span>
                </th>
                <th scope="col">Item</th>
                <th scope="col">HSN</th>
                <th scope="col" className="r">
                  Qty
                </th>
                <th scope="col" className="r">
                  Rate ₹
                </th>
                <th scope="col" className="r">
                  GST %
                </th>
                <th scope="col" className="r">
                  Amount ₹
                </th>
              </tr>
            </thead>
            <tbody>
              {bill.lines.map((line, i) => (
                <tr key={i}>
                  <td className="n">{i + 1}</td>
                  <Cell field={`lines.${i}.description`} flags={flags}>
                    <TextValue reading={reading} value={line.description} label={`Line ${i + 1} item`} onChange={(v) => setLine(i, { description: v ?? "" })} />
                  </Cell>
                  <Cell field={`lines.${i}.hsn`} flags={flags} style={{ width: 78 }}>
                    <TextValue reading={reading} value={line.hsn} label={`Line ${i + 1} HSN`} onChange={(v) => setLine(i, { hsn: v })} mono />
                  </Cell>
                  <Cell field={`lines.${i}.quantity`} flags={flags} right style={{ width: 70 }}>
                    <NumberValue reading={reading} value={line.quantity} label={`Line ${i + 1} quantity`} plainNumber onChange={(v) => setLine(i, { quantity: v })} />
                  </Cell>
                  <Cell field={`lines.${i}.rate`} flags={flags} right style={{ width: 104 }}>
                    <NumberValue reading={reading} value={line.rate} label={`Line ${i + 1} rate`} onChange={(v) => setLine(i, { rate: v })} />
                  </Cell>
                  <Cell field={`lines.${i}.gstRate`} flags={flags} right style={{ width: 64 }}>
                    <NumberValue reading={reading} value={line.gstRate} label={`Line ${i + 1} GST rate`} plainNumber onChange={(v) => setLine(i, { gstRate: v })} />
                  </Cell>
                  <Cell field={`lines.${i}.amount`} flags={flags} right style={{ width: 118 }}>
                    <NumberValue reading={reading} value={line.amount} label={`Line ${i + 1} amount`} onChange={(v) => setLine(i, { amount: v })} />
                  </Cell>
                </tr>
              ))}
              {bill.lines.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ color: "var(--muted)", fontSize: 13, padding: "12px 6px" }}>
                    {reading ? "Waiting for the first line." : "No lines were read."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="totals">
          <TotalRow label="Taxable value" field="taxableTotal" value={bill.taxableTotal} flags={flags} reading={reading} onChange={(v) => set("taxableTotal", v)} />
          <TotalRow label="CGST" field="cgst" value={bill.cgst} flags={flags} reading={reading} onChange={(v) => set("cgst", v)} />
          <TotalRow label="SGST" field="sgst" value={bill.sgst} flags={flags} reading={reading} onChange={(v) => set("sgst", v)} />
          <TotalRow label="IGST" field="igst" value={bill.igst} flags={flags} reading={reading} onChange={(v) => set("igst", v)} />
          {bill.cess !== null ? (
            <TotalRow label="Cess" field="cess" value={bill.cess} flags={flags} reading={reading} onChange={(v) => set("cess", v)} />
          ) : null}
          <TotalRow label="Round off" field="roundOff" value={bill.roundOff} flags={flags} reading={reading} onChange={(v) => set("roundOff", v)} />
          <TotalRow label="Grand total" field="grandTotal" value={bill.grandTotal} flags={flags} reading={reading} grand onChange={(v) => set("grandTotal", v)} />
        </div>
      </div>

      <div className="section" style={{ paddingBottom: 18 }}>
        <h2 className="section__title">
          Checks
          <span className="section__note">
            {report ? `${report.counts.pass} passed${report.counts.warn ? ` · ${report.counts.warn} to look at` : ""}${report.counts.fail ? ` · ${report.counts.fail} to fix` : ""}` : "after reading"}
          </span>
        </h2>
        {report ? (
          <Checks report={report} onFix={(fix) => set(fix.field as keyof Bill, fix.value as never)} />
        ) : (
          <p style={{ fontSize: 13.5, color: "var(--muted)", paddingTop: 10 }}>
            GSTIN checksums, line math, tax rates, totals and tax type. Plain code, same answer every time.
          </p>
        )}
      </div>

      <div className="actions">
        <span className="actions__note">
          {reading ? "Hold on, still reading." : remaining > 1 ? `${remaining - 1} more in the pile after this one.` : "Last bill in the pile."}
        </span>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" className="btn btn--quiet" onClick={onSkip} disabled={saving}>
            {item.entryId ? "Close" : "Skip"}
          </button>
          <button type="button" className="btn btn--primary" onClick={onSave} disabled={reading || saving}>
            {item.entryId ? "Save changes" : "Add to ledger"}
            <span className="kbd" aria-hidden="true">
              ⌘ <CornerDownLeft size={11} style={{ display: "inline", verticalAlign: "-1px" }} />
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ pieces ------------------------------ */

function Field({
  label,
  field,
  flags,
  htmlFor,
  children,
}: {
  label: string;
  field: string;
  flags: Flags;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field" data-field={field} data-flag={flags[field]}>
      <label className="field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Cell({
  field,
  flags,
  right,
  style,
  children,
}: {
  field: string;
  flags: Flags;
  right?: boolean;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <td className={right ? "r" : undefined} data-field={field} data-flag={flags[field]} style={style}>
      {children}
    </td>
  );
}

function TextValue({
  id,
  value,
  onChange,
  reading,
  label,
  mono,
}: {
  id?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  reading: boolean;
  label?: string;
  mono?: boolean;
}) {
  const draft = useDraft(value ?? "", (text) => onChange(text.trim() === "" ? null : text));
  if (reading) {
    return (
      <span className={`field__value cell-text ${mono ? "num" : ""}`}>
        {value ? <span className="ink-in">{value}</span> : null}
      </span>
    );
  }
  return <input id={id} className={`input ${mono ? "num" : ""}`} placeholder="—" aria-label={label} {...draft.props} />;
}

// Inputs keep a private draft while you type and hand the value over on Enter
// or when you leave the field, so the checks don't flicker on every keystroke.
function useDraft(shown: string, commit: (text: string) => void) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const justFocused = useRef(false);
  return {
    props: {
      value: draft ?? shown,
      onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
        cancelled.current = false;
        justFocused.current = true;
        setDraft(shown);
        e.currentTarget.select(); // typing replaces the old value
      },
      // A click would otherwise drop the selection when the mouse comes up.
      onMouseUp: (e: React.MouseEvent<HTMLInputElement>) => {
        if (justFocused.current) e.preventDefault();
        justFocused.current = false;
      },
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value),
      onBlur: () => {
        if (!cancelled.current && draft !== null && draft !== shown) commit(draft);
        setDraft(null);
      },
      onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) e.currentTarget.blur();
        if (e.key === "Escape") {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      },
    },
  };
}

function NumberValue({
  value,
  onChange,
  reading,
  label,
  plainNumber,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  reading: boolean;
  label: string;
  plainNumber?: boolean;
}) {
  const shown = value === null ? "" : plainNumber ? String(value) : money(value);
  const draft = useDraft(shown, (text) => onChange(toNumber(text)));
  if (reading) {
    return <span className="cell-text num">{shown ? <span className="ink-in">{shown}</span> : null}</span>;
  }
  return <input className="input input--num" inputMode="decimal" aria-label={label} placeholder="—" {...draft.props} />;
}

function TotalRow({
  label,
  field,
  value,
  flags,
  reading,
  grand,
  onChange,
}: {
  label: string;
  field: string;
  value: number | null;
  flags: Flags;
  reading: boolean;
  grand?: boolean;
  onChange: (value: number | null) => void;
}) {
  return (
    <div className={`totals__row ${grand ? "totals__row--grand" : ""}`} data-field={field} data-flag={flags[field]}>
      <span>{label}</span>
      <NumberValue reading={reading} value={value} label={label} onChange={onChange} />
    </div>
  );
}

const GROUPS = [2, 5, 4, 1, 1, 1, 1];

function GstinField({
  id,
  label,
  value,
  reading,
  check,
  onChange,
}: {
  id: string;
  label: string;
  value: string | null;
  reading: boolean;
  check?: Check;
  onChange: (value: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [fixedAt, setFixedAt] = useState<number | null>(null);
  const gstin = normalizeGstin(value ?? "");
  const verdict = verifyGstin(value);
  const fix = check?.fix;
  const suspect = fix ? [...gstin].findIndex((ch, i) => ch !== fix.value[i]) : -1;
  const draft = useDraft(value ?? "", (text) => onChange(normalizeGstin(text) || null));

  if (editing && !reading) {
    return (
      <input
        id={id}
        autoFocus
        className="input gstin-input"
        maxLength={24}
        aria-label={label}
        placeholder="15 characters"
        {...draft.props}
        onBlur={() => {
          draft.props.onBlur();
          setEditing(false);
        }}
      />
    );
  }

  const meta = reading
    ? ""
    : verdict.status === "missing"
      ? "Not on the bill. Press to add."
      : verdict.status === "valid"
        ? `${verdict.state} · PAN ${verdict.gstin.slice(2, 12)}`
        : verdict.status === "unknown-state"
          ? "Unknown state code"
          : gstin.length !== 15
            ? `${gstin.length} characters. A GSTIN has 15.`
            : "Checksum doesn't match";

  let index = 0;
  return (
    <div>
      <button
        type="button"
        id={id}
        className="gstin"
        disabled={reading}
        onClick={() => setEditing(true)}
        aria-label={`${label}: ${gstin || "not on the bill"}. Press to edit.`}
      >
        {GROUPS.map((size, g) => (
          <span key={g} className="gstin__group">
            {Array.from({ length: size }, () => {
              const i = index++;
              const ch = gstin[i] ?? "";
              const cls = [
                "gstin__char",
                i === suspect && !reading ? "gstin__char--suspect" : "",
                i === fixedAt && fixedAt !== null && verdict.status === "valid" ? "gstin__char--fixed" : "",
              ].join(" ");
              return (
                <span key={`${i}-${ch}`} className={cls}>
                  {ch ? <span className={reading ? "ink-in" : undefined}>{ch}</span> : null}
                </span>
              );
            })}
          </span>
        ))}
      </button>
      {gstin.length > 15 ? <div className="gstin__meta" style={{ color: "var(--fail)" }}>Read as {gstin}</div> : null}
      {meta ? (
        <div className="gstin__meta" style={verdict.status === "valid" ? { color: "var(--pass)" } : undefined}>
          {meta}
        </div>
      ) : null}
      {fix && suspect >= 0 && !reading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, fontSize: 13 }}>
          <span>
            Character {suspect + 1} reads <b className="num">{gstin[suspect]}</b>.
          </span>
          <button
            type="button"
            className="btn btn--fix"
            onClick={() => {
              onChange(fix.value);
              setFixedAt(suspect);
            }}
          >
            Use {fix.value[suspect]}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Stamp({ report, reading }: { report: CheckReport | null; reading: boolean }) {
  if (!report) {
    return (
      <div className="stamp" data-status="pending" aria-hidden="true">
        <span className="stamp__big">{reading ? "Reading" : "In line"}</span>
        <span className="stamp__small">not checked yet</span>
      </div>
    );
  }
  const { status, counts } = report;
  const total = counts.pass + counts.warn + counts.fail;
  const big = status === "ready" ? "Checked" : status === "review" ? "Look again" : "Not ready";
  const small =
    status === "ready"
      ? `all ${total} checks passed`
      : status === "review"
        ? `${counts.warn} ${counts.warn === 1 ? "thing" : "things"} to look at`
        : `${counts.fail} ${counts.fail === 1 ? "problem" : "problems"} to fix`;
  return (
    <div key={`${status}-${counts.fail}-${counts.warn}`} className="stamp stamp--land" data-status={status} role="status">
      <span className="stamp__big">{big}</span>
      <span className="stamp__small">{small}</span>
    </div>
  );
}

function focusField(field: string) {
  const el = document.querySelector<HTMLElement>(`[data-field="${CSS.escape(field)}"]`);
  if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  el.classList.remove("flash");
  void el.offsetWidth;
  el.classList.add("flash");
  el.querySelector<HTMLElement>("input, button")?.focus({ preventScroll: true });
}

function Checks({ report, onFix }: { report: CheckReport; onFix: (fix: NonNullable<Check["fix"]>) => void }) {
  const problems = report.checks.filter((c) => c.level !== "pass");
  const passes = report.checks.filter((c) => c.level === "pass");
  return (
    <>
      {problems.length > 0 ? (
        <ul className="checks">
          {problems.map((c) => (
            <li key={c.id} className="check" data-level={c.level}>
              <span className="check__mark" aria-hidden="true">
                {c.level === "fail" ? <X size={14} strokeWidth={2.75} /> : <AlertTriangle size={13} strokeWidth={2.5} />}
              </span>
              <button type="button" className="check__title" onClick={() => c.fields[0] && focusField(c.fields[0])}>
                <span className="visually-hidden">{c.level === "fail" ? "Problem: " : "Look at: "}</span>
                {c.title}
              </button>
              {c.fix ? (
                <button type="button" className="btn btn--fix" onClick={() => onFix(c.fix!)} style={{ gridRow: "span 2" }}>
                  {c.fix.label}
                </button>
              ) : (
                <span />
              )}
              <p className="check__detail">{c.detail}</p>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="passes" aria-label="Checks that passed">
        {passes.map((c) => (
          <button key={c.id} type="button" className="pass-chip" title={c.detail} onClick={() => c.fields[0] && focusField(c.fields[0])}>
            <CheckIcon size={13} strokeWidth={2.75} aria-hidden="true" />
            {c.title}
          </button>
        ))}
      </div>
    </>
  );
}

function GhostRows() {
  return (
    <div aria-hidden="true" style={{ marginTop: 18 }}>
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} style={{ height: 44, borderBottom: "1px solid var(--rule)" }} />
      ))}
    </div>
  );
}

function Explainer() {
  return (
    <div className="explainer" style={{ paddingBottom: 32 }}>
      <h2>The AI reads the bill. Plain code checks it.</h2>
      <p>
        Every bill goes through the same checks, the same way, every time. When something is off, Shoebox points at the exact
        field and shows the numbers behind it.
      </p>
      <ol className="rulebook">
        <li>
          <div>
            <b>GSTINs are real.</b> <span>The last character is a checksum, so one misread character is always caught.</span>
          </div>
        </li>
        <li>
          <div>
            <b>Every line adds up.</b> <span>Quantity × rate = amount, discounts included.</span>
          </div>
        </li>
        <li>
          <div>
            <b>Tax matches the rates.</b> <span>Each line&apos;s GST rate, applied to its amount, adds up to the tax charged.</span>
          </div>
        </li>
        <li>
          <div>
            <b>CGST equals SGST.</b> <span>Inside one state they are always the same.</span>
          </div>
        </li>
        <li>
          <div>
            <b>Right tax type.</b> <span>Same state: CGST and SGST. Across states: IGST.</span>
          </div>
        </li>
        <li>
          <div>
            <b>Grand total adds up.</b> <span>Taxable value, plus GST, plus round-off.</span>
          </div>
        </li>
        <li>
          <div>
            <b>Details make sense.</b> <span>A real date, an invoice number of at most 16 characters, real GST rates.</span>
          </div>
        </li>
        <li>
          <div>
            <b>No bill twice.</b> <span>The same invoice from the same supplier can&apos;t enter your ledger again.</span>
          </div>
        </li>
      </ol>
      <p style={{ marginTop: 18, fontSize: 13.5 }}>Nothing leaves this laptop. The model runs in Ollama, on this machine.</p>
    </div>
  );
}
