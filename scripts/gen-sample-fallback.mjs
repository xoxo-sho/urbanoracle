import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync("src/data/sample.ts", "utf8");
const js = src
  .replace(/^import[\s\S]*?;$/gm, "")                 // drop type imports
  .replace(/^export const (\w+)\s*:[^=]+=/gm, "const $1 =")  // strip annotations
  .replace(/^export /gm, "")
  .replace(/\bas const\b/g, "");

const wanted = [
  "sampleLandPrices",
  "sampleDemographics",
  "sampleDisasterRisks",
  "sampleTransportStations",
];
const body = `${js}\nreturn { ${wanted.join(", ")} };`;
const out = new Function(body)();

for (const [k, v] of Object.entries(out)) {
  if (!Array.isArray(v) || v.length === 0) throw new Error(`${k} is empty/not an array`);
  console.log(`  ${k}: ${v.length} items`);
}
writeFileSync("backend/data/sample_fallback.json", JSON.stringify(out, null, 2) + "\n");
console.log("wrote backend/data/sample_fallback.json");
