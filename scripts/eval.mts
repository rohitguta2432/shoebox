// Scores the local model on every sample bill against the saved truth.
// Run: npx tsx scripts/eval.mts [model]

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Bill } from "../lib/bill";
import { runChecks } from "../lib/checks";
import { extract, modelStatus } from "../lib/extract";

const ROOT = resolve(import.meta.dirname, "..");
const model = process.argv[2];

const status = await modelStatus(model);
if (!status.ok) {
  console.error(status.error);
  process.exit(1);
}

const flatten = (bill: Bill): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(bill)) {
    if (k === "lines") continue;
    out[k] = String(v ?? "");
  }
  bill.lines.forEach((line, i) => {
    for (const [k, v] of Object.entries(line)) out[`lines.${i}.${k}`] = String(v ?? "");
  });
  return out;
};

// Case and spacing differences are not reading errors.
const same = (a: string, b: string) => a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();

let fields = 0;
let exact = 0;
let verdicts = 0;
let totalMs = 0;
const files = readdirSync(join(ROOT, "samples/truth")).filter((f) => f.endsWith(".json")).sort();

console.log(`model ${status.model}\n`);
for (const file of files) {
  const truth = JSON.parse(readFileSync(join(ROOT, "samples/truth", file), "utf8"));
  const image = readFileSync(join(ROOT, "public/samples", `${truth.id}.jpg`)).toString("base64");
  const result = await extract(image, { model });
  totalMs += result.ms;

  const want = flatten(truth.bill);
  const got = flatten(result.bill);
  const keys = Object.keys(want);
  const wrong = keys.filter((k) => !same(want[k], got[k] ?? ""));
  fields += keys.length;
  exact += keys.length - wrong.length;

  const report = runChecks(result.bill);
  const verdictOk = report.status === truth.expect;
  if (verdictOk) verdicts++;

  console.log(
    `${truth.id.padEnd(22)} ${String(keys.length - wrong.length).padStart(3)}/${keys.length} fields  ` +
      `${(result.ms / 1000).toFixed(1).padStart(5)} s  verdict ${report.status.padEnd(6)} ${verdictOk ? "(right)" : `(expected ${truth.expect})`}`,
  );
  for (const k of wrong) console.log(`    ${k}: printed ${JSON.stringify(want[k])}, read ${JSON.stringify(got[k] ?? "")}`);
  for (const c of report.checks.filter((c) => c.level !== "pass")) console.log(`    check ${c.level}: ${c.title}`);
}

console.log(
  `\n${exact}/${fields} fields read exactly (${((exact / fields) * 100).toFixed(1)}%), ` +
    `${verdicts}/${files.length} verdicts right, ${(totalMs / files.length / 1000).toFixed(1)} s per bill on average`,
);
