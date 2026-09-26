// Talks to the local Ollama server. Nothing here leaves the machine.

import { BILL_SCHEMA, EXTRACT_PROMPT, coerceBill, type Bill } from "./bill";

export const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
export const DEFAULT_MODEL = process.env.SHOEBOX_MODEL ?? "qwen3.5:9b";

export interface ExtractResult {
  bill: Bill;
  raw: string;
  model: string;
  ms: number;
}

export interface ModelStatus {
  ok: boolean;
  model: string;
  vision: boolean;
  version: string | null;
  error?: string;
}

export async function modelStatus(model = DEFAULT_MODEL): Promise<ModelStatus> {
  try {
    const version = await fetch(`${OLLAMA_URL}/api/version`, { signal: AbortSignal.timeout(2000) }).then((r) => r.json());
    const show = await fetch(`${OLLAMA_URL}/api/show`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model }),
      signal: AbortSignal.timeout(4000),
    });
    if (!show.ok) {
      return { ok: false, model, vision: false, version: version.version ?? null, error: `Model "${model}" is not installed. Run: ollama pull ${model}` };
    }
    const info = await show.json();
    const vision = Array.isArray(info.capabilities) && info.capabilities.includes("vision");
    return {
      ok: vision,
      model,
      vision,
      version: version.version ?? null,
      error: vision ? undefined : `"${model}" can't read images. Pick a vision model with SHOEBOX_MODEL.`,
    };
  } catch {
    return { ok: false, model, vision: false, version: null, error: "Ollama isn't running. Start it with: ollama serve" };
  }
}

// Streams the model's JSON as it is written, then returns the parsed bill.
export async function* streamExtract(
  imageBase64: string,
  options: { model?: string; signal?: AbortSignal } = {},
): AsyncGenerator<string, ExtractResult> {
  const model = options.model ?? DEFAULT_MODEL;
  const started = Date.now();
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: options.signal,
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: EXTRACT_PROMPT, images: [imageBase64] }],
      format: BILL_SCHEMA,
      stream: true,
      think: false,
      keep_alive: "30m",
      options: { temperature: 0, num_ctx: 16384 },
    }),
  });
  if (!res.ok || !res.body) throw new Error(`Ollama answered ${res.status}: ${await res.text()}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let raw = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      if (message.error) throw new Error(message.error);
      const piece: string = message.message?.content ?? "";
      if (piece) {
        raw += piece;
        yield piece;
      }
    }
  }
  return { bill: coerceBill(JSON.parse(raw)), raw, model, ms: Date.now() - started };
}

export async function extract(imageBase64: string, options: { model?: string } = {}): Promise<ExtractResult> {
  const stream = streamExtract(imageBase64, options);
  for (;;) {
    const step = await stream.next();
    if (step.done) return step.value;
  }
}
