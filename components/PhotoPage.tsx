"use client";

import { AlertCircle, Check, ImagePlus, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ModelStatus } from "@/lib/extract";
import { SAMPLES, type QueueItem } from "./types";

interface Props {
  current: QueueItem | null;
  queue: QueueItem[];
  status: ModelStatus | null;
  onFiles: (files: File[]) => void;
  onSamples: (ids: string[]) => void;
  onSelect: (key: string) => void;
  onRemove: (key: string) => void;
}

export function PhotoPage({ current, queue, status, onFiles, onSamples, onSelect, onRemove }: Props) {
  return (
    <section className="page page--photo" aria-label="Bill photo">
      <div className="photo-stick">
        {status && !status.ok ? <Setup status={status} /> : null}
        {current ? <Photo item={current} /> : <DropZone onFiles={onFiles} onSamples={onSamples} />}
        {queue.length > 0 ? <Tray queue={queue} current={current} onSelect={onSelect} onRemove={onRemove} onFiles={onFiles} /> : null}
      </div>
    </section>
  );
}

function Setup({ status }: { status: ModelStatus }) {
  return (
    <div className="setup" role="alert">
      <p style={{ fontWeight: 600 }}>{status.error ?? "The model isn't ready."}</p>
      <ol style={{ margin: "8px 0 0 18px", listStyle: "decimal", display: "grid", gap: 4 }}>
        <li>
          Install Ollama from <code>ollama.com</code>
        </li>
        <li>
          Run <code>ollama pull {status.model || "qwen3.5:9b"}</code>
        </li>
        <li>Keep Ollama running. This page notices on its own.</li>
      </ol>
    </div>
  );
}

function DropZone({ onFiles, onSamples }: { onFiles: (files: File[]) => void; onSamples: (ids: string[]) => void }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const depth = useRef(0);

  return (
    <div
      className="drop"
      data-over={over}
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current++;
        setOver(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        onFiles([...e.dataTransfer.files].filter((f) => f.type.startsWith("image/")));
      }}
    >
      <div>
        <h1 className="drop__title">Empty the shoebox.</h1>
        <p className="drop__lead" style={{ marginTop: 10 }}>
          Drop photos of your supplier bills here. Shoebox reads each one, then checks every number.
        </p>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
        <button type="button" className="btn btn--primary" onClick={() => input.current?.click()}>
          <ImagePlus size={17} aria-hidden="true" />
          Choose bill photos
        </button>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>JPG or PNG. Several at once is fine. You can also paste.</span>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            onFiles([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </div>
      <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>No bills handy? Try a sample.</span>
          <button type="button" className="btn btn--link" onClick={() => onSamples(SAMPLES.map((s) => s.id))}>
            Read all {SAMPLES.length}
          </button>
        </div>
        <div className="samples">
          {SAMPLES.map((s) => (
            <button key={s.id} type="button" className="sample" onClick={() => onSamples([s.id])}>
              <span className="sample__thumb" style={{ backgroundImage: `url(/samples/${s.id}.jpg)` }} aria-hidden="true" />
              <span className="sample__name">{s.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, []);
  return <span className="num">{((now - since) / 1000).toFixed(1)} s</span>;
}

function Photo({ item }: { item: QueueItem }) {
  const [loupe, setLoupe] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const reading = item.state === "reading";
  const zoom = 2.6;
  const radius = 95;

  return (
    <>
      <div
        className="photo"
        onMouseMove={(e) => {
          if (reading) return;
          const box = e.currentTarget.getBoundingClientRect();
          setLoupe({ x: e.clientX - box.left, y: e.clientY - box.top, w: box.width, h: box.height });
        }}
        onMouseLeave={() => setLoupe(null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- local data URL, nothing to optimise */}
        <img src={item.src} alt={`Photo of ${item.bill?.supplierName || "a bill"}`} draggable={false} />
        {reading ? <div className="scan" aria-hidden="true" /> : null}
        {loupe && !reading ? (
          <div
            className="loupe"
            aria-hidden="true"
            style={{
              left: loupe.x,
              top: loupe.y,
              backgroundImage: `url(${item.src})`,
              backgroundSize: `${loupe.w * zoom}px ${loupe.h * zoom}px`,
              backgroundPosition: `${-(loupe.x * zoom - radius)}px ${-(loupe.y * zoom - radius)}px`,
            }}
          />
        ) : null}
      </div>

      <div className="photo-meta">
        {item.state === "waiting" ? <span>In the pile. The model reads one bill at a time.</span> : null}
        {reading && item.startedAt ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--ink-2)" }}>
            <Loader2 size={15} className="animate-spin" aria-hidden="true" />
            Reading on this laptop <Elapsed since={item.startedAt} />
          </span>
        ) : null}
        {item.state === "read" && item.ms ? (
          <span>
            Read by <span className="num">{item.model}</span> in <span className="num">{(item.ms / 1000).toFixed(1)} s</span>. Hover the
            photo to magnify.
          </span>
        ) : null}
        {item.state === "read" && !item.ms ? <span>Saved photo. Hover to magnify.</span> : null}
        {item.raw && !reading ? (
          <button type="button" className="btn btn--link" onClick={() => setShowRaw((v) => !v)} aria-expanded={showRaw}>
            {showRaw ? "Hide" : "Show"} what the model wrote
          </button>
        ) : null}
      </div>

      {item.raw && (reading || showRaw) ? (
        <div className="carbon" aria-label="What the model is writing">
          <div>{reading ? item.raw.slice(-900) : item.raw}</div>
        </div>
      ) : null}

      {item.state === "error" ? (
        <div className="error-card" role="alert">
          <p style={{ display: "flex", gap: 8, fontWeight: 600 }}>
            <AlertCircle size={18} aria-hidden="true" style={{ color: "var(--fail)", flex: "none", marginTop: 2 }} />
            Couldn&apos;t read this bill
          </p>
          <p style={{ marginTop: 4, color: "var(--ink-2)" }}>{item.error}</p>
        </div>
      ) : null}
    </>
  );
}

function Tray({
  queue,
  current,
  onSelect,
  onRemove,
  onFiles,
}: {
  queue: QueueItem[];
  current: QueueItem | null;
  onSelect: (key: string) => void;
  onRemove: (key: string) => void;
  onFiles: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div style={{ marginTop: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          The pile <span style={{ fontWeight: 400, color: "var(--muted)" }}>{queue.length} to go</span>
        </span>
        <div style={{ display: "flex", gap: 14 }}>
          {current ? (
            <button type="button" className="btn btn--link" onClick={() => onRemove(current.key)}>
              Remove this bill
            </button>
          ) : null}
          <button type="button" className="btn btn--link" onClick={() => input.current?.click()}>
            Add more
          </button>
        </div>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            onFiles([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </div>
      <div className="tray" role="list" aria-label="Bills in the pile">
        {queue.map((item, i) => (
          <button
            key={item.key}
            type="button"
            role="listitem"
            className="tray__item"
            style={{ backgroundImage: `url(${item.src})` }}
            aria-current={item.key === current?.key}
            aria-label={`Bill ${i + 1}: ${item.bill?.supplierName || item.name}, ${item.state}`}
            onClick={() => onSelect(item.key)}
          >
            <span className="tray__badge" data-state={item.state} aria-hidden="true">
              {item.state === "read" ? <Check size={11} strokeWidth={3} /> : null}
              {item.state === "reading" ? <Loader2 size={11} className="animate-spin" /> : null}
              {item.state === "error" ? <X size={11} strokeWidth={3} /> : null}
              {item.state === "waiting" ? <span style={{ fontSize: 10, fontFamily: "var(--font-mono)" }}>{i + 1}</span> : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
