// Reads one sample with the local model and prints what it got wrong.
// Run: npx tsx scripts/probe.mts wholesale-invoice [model]

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { runChecks } from "../lib/checks";
import { extract, modelStatus } from "../lib/extract";

const ROOT = resolve(import.meta.dirname, "..");
const id = process.argv[2] ?? "wholesale-invoice";
const model = process.argv[3];

const status = await modelStatus(model);
if (!status.ok) {
  console.error(status.error);
  process.exit(1);
}
const truth = JSON.parse(readFileSync(join(ROOT, "samples/truth", `${id}.json`), "utf8")).bill;
const image = readFileSync(join(ROOT, "public/samples", `${id}.jpg`)).toString("base64");

const result = await extract(image, { model });
console.log(`${result.model} read ${id} in ${(result.ms / 1000).toFixed(1)}s`);
console.log(JSON.stringify(result.bill, null, 1));

const flat = (o: unknown, prefix = ""): Record<string, unknown> =>
  Object.entries(o as Record<string, unknown>).reduce(
    (acc, [k, v]) =>
      v && typeof v === "object" ? { ...acc, ...flat(v, `${prefix}${k}.`) } : { ...acc, [`${prefix}${k}`]: v },
    {} as Record<string, unknown>,
  );
const want = flat(truth);
const got = flat(result.bill);
const wrong = Object.keys(want).filter((k) => String(want[k]) !== String(got[k]));
console.log(`\n${Object.keys(want).length - wrong.length}/${Object.keys(want).length} fields exact`);
for (const k of wrong) console.log(`  ${k}: want ${JSON.stringify(want[k])} got ${JSON.stringify(got[k])}`);
const report = runChecks(result.bill);
console.log(`\nchecks: ${report.status}`, report.checks.filter((c) => c.level !== "pass").map((c) => c.title));
