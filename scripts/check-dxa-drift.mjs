#!/usr/bin/env node
/**
 * dxa-ui drift check — SELF-CONTAINED. sync.mjs vendors this exact file into
 * each consuming repo as scripts/check-dxa-drift.mjs, so it must not import
 * anything from dxa-ui: in CI, dxa-ui does not exist.
 *
 * Two modes, chosen by whether --source is given:
 *
 *   CI mode (default, no network, no dxa-ui):
 *     node scripts/check-dxa-drift.mjs
 *     Reads <target>/.dxa-ui-version — the manifest sync.mjs committed — and
 *     verifies the sha256 of every vendored file it lists (including this
 *     script itself). Detects a vendored copy edited in place after sync.
 *
 *   Dev mode (dxa-ui available):
 *     node scripts/check-dxa-drift.mjs --source ../../dxa-ui
 *     Everything CI mode does, plus: compares the manifest's recorded source
 *     hash and version against the live dxa-ui, and reports "source moved
 *     ahead — re-run sync" as a separate, actionable failure.
 *
 * Comparison is by content hash, never timestamp: a re-copied identical file
 * is not drift; a file edited in place is, whichever has the newer mtime.
 *
 * Exit 0 = in sync. Exit 1 = drift. Exit 2 = usage / missing manifest.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MANIFEST_NAME = ".dxa-ui-version";
/** Everything sync.mjs can vendor. Any change to any of these moves the source hash. */
export const SOURCE_ARTIFACTS = [
  "tokens/dxa-tokens.css",
  "tokens/dxa-tokens.ts",
  "tokens/dxa-password.ts",
  "tokens/dxa-password.vectors.ts",
  "scripts/check-drift.mjs",
  "scripts/token-lint.mjs",
];

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const short = (h) => h.slice(0, 16);

function parseArgs(argv) {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  // Default target: the repo the script was vendored into (scripts/.. = root).
  const args = { target: resolve(scriptDir, ".."), source: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--target") args.target = resolve(argv[++i]);
    else if (a === "--source") args.source = resolve(argv[++i]);
    else if (a === "-h" || a === "--help") {
      console.log("usage: check-dxa-drift.mjs [--target <repo>] [--source <dxa-ui>]");
      process.exit(0);
    } else {
      console.error(`check-dxa-drift: unknown argument ${a}`);
      process.exit(2);
    }
  }
  return args;
}

/**
 * Hash of the dxa-ui source as a whole: sorted "path\0content" pairs. Any
 * change to any shipped artifact changes it. Recorded by sync.mjs, and
 * recomputed here in dev mode to detect "source moved ahead".
 */
export function computeSourceHash(sourceRoot) {
  const h = createHash("sha256");
  for (const rel of [...SOURCE_ARTIFACTS].sort()) {
    const p = join(sourceRoot, rel);
    if (!existsSync(p)) continue;
    h.update(rel).update("\0").update(readFileSync(p)).update("\0");
  }
  return h.digest("hex");
}

function main() {
const args = parseArgs(process.argv);
const manifestPath = join(args.target, MANIFEST_NAME);

if (!existsSync(manifestPath)) {
  console.error(`check-dxa-drift: no ${MANIFEST_NAME} in ${args.target}`);
  console.error("  run dxa-ui/scripts/sync.mjs against this repo first");
  process.exit(2);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (err) {
  console.error(`check-dxa-drift: ${MANIFEST_NAME} is not valid JSON — ${err.message}`);
  process.exit(2);
}

const failures = [];

// ---- CI mode: vendored files vs the hashes recorded at sync time -----------
for (const [rel, recorded] of Object.entries(manifest.files ?? {})) {
  const p = join(args.target, rel);
  if (!existsSync(p)) {
    failures.push(`missing: ${rel} is listed in ${MANIFEST_NAME} but absent`);
    continue;
  }
  const actual = sha256(readFileSync(p));
  if (actual !== recorded) {
    failures.push(
      `${rel} was edited in place after sync\n` +
        `      recorded: ${short(recorded)}\n` +
        `      actual:   ${short(actual)}\n` +
        `      -> revert ${rel}; edit dxa-ui/tokens instead, then re-run sync.mjs`,
    );
  }
}

// ---- Dev mode: manifest vs live source --------------------------------------
if (args.source) {
  const versionPath = join(args.source, "VERSION");
  if (!existsSync(versionPath)) {
    failures.push(`--source ${args.source} has no VERSION file — is that really dxa-ui?`);
  } else {
    const liveVersion = readFileSync(versionPath, "utf8").trim();
    const liveHash = computeSourceHash(args.source);
    if (manifest.version !== liveVersion) {
      failures.push(
        `version skew: this repo was synced from v${manifest.version}, dxa-ui is v${liveVersion}\n` +
          `      -> re-run dxa-ui/scripts/sync.mjs`,
      );
    }
    if (manifest.sourceHash !== liveHash) {
      failures.push(
        `dxa-ui source moved ahead of this repo\n` +
          `      synced from: ${short(manifest.sourceHash ?? "")}\n` +
          `      live source: ${short(liveHash)}\n` +
          `      -> re-run dxa-ui/scripts/sync.mjs`,
      );
    }
  }
}

const label = relative(process.cwd(), args.target) || ".";
if (failures.length > 0) {
  console.error(`FAIL dxa-ui drift (v${manifest.version}) in ${label}`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}

const n = Object.keys(manifest.files ?? {}).length;
console.log(
  `OK dxa-ui v${manifest.version} in sync at ${label} ` +
    `(${n} vendored file(s), content-hash verified${args.source ? ", source verified" : ""})`,
);
}

// Run only when invoked directly; importing this module (sync.mjs does, for
// computeSourceHash) must not trigger the check.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
