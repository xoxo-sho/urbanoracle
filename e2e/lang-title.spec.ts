import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { AUTH_COPY } from "../src/i18n/auth";
import { LP_COPY } from "../src/i18n/lp";

/**
 * Title stability: once the English document.title has appeared, nothing may
 * put the Japanese metadata title back.
 *
 * Observed after PR #12's deploy (production, 1440×900): an English page whose
 * title went EN and then back to the Japanese metadata title for good — after
 * "click EN, then reload", and on a second load in a reused context.
 *
 * PROTOCOLS (each load runs in a fresh browser context at 1440×900):
 *   P1  load / → click EN → reload → sample after the reload
 *   P2  "en" stored → load / → load / again in the same context → sample after
 *       the second load
 *   P3  "en" stored → load / once → sample
 * NETWORK: none, or uniform throttling of every request through CDP
 *   (latency 150ms, download 1.6 Mbps, upload 750 kbps).
 * CPU: LANG_TITLE_CPU (1 or 4).
 *
 * DEFAULT RUN (CI and `npm run test:login`): the S1′ reproducing cell only —
 * P1, no throttling, 1× CPU — on every page; that is the one cell with a
 * RED (9/20 before the fix). The other cells run only with
 * LANG_TITLE_MATRIX=1, where LANG_TITLE_PROTOCOLS / LANG_TITLE_NETWORKS /
 * LANG_TITLE_CPU select them.
 *
 * Sampling: document.title every 50ms for 3s from the final load event. A load
 * FAILS if, once the EN title has appeared, any later sample differs from it,
 * or if the final title is not EN. Title writes (mutations of <title> or its
 * text) are counted per final load and may not exceed MAX_TITLE_WRITES. After
 * the window, every description meta must carry the EN description.
 *
 * Pages: / and, with the same protocols, /login and /pending (L7).
 * Selection by env: LANG_TITLE_PAGES (default "landing page,login,pending"),
 * LANG_TITLE_LOADS (default 10); with LANG_TITLE_MATRIX=1 also
 * LANG_TITLE_PROTOCOLS (default "P1,P2,P3"), LANG_TITLE_NETWORKS (default
 * "none,throttled") and LANG_TITLE_CPU (default 1). LANG_TITLE_TRACE=1 also
 * records a stack per title write.
 *
 * Requests to the identity hosts are aborted and counted; none may escape.
 */

const STORAGE_KEY = "urbanoracle.lang";
const MATRIX = process.env.LANG_TITLE_MATRIX === "1";
const LOADS = Number(process.env.LANG_TITLE_LOADS ?? 10);
const CPU = MATRIX ? Number(process.env.LANG_TITLE_CPU ?? 1) : 1;
const TRACE = process.env.LANG_TITLE_TRACE === "1";
const SAMPLE_MS = 50;
const WINDOW_MS = 3000;
const MAX_TITLE_WRITES = 5;
const IDENTITY = /(^|\.)(identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|www\.googleapis\.com|firebaseapp\.com)$/;

type Protocol = "P1" | "P2" | "P3";
type Network = "none" | "throttled";
const PROTOCOLS = (MATRIX ? (process.env.LANG_TITLE_PROTOCOLS ?? "P1,P2,P3").split(",") : ["P1"]) as Protocol[];
const NETWORKS = (MATRIX ? (process.env.LANG_TITLE_NETWORKS ?? "none,throttled").split(",") : ["none"]) as Network[];

/** Uniform throttling of every request; bytes per second. */
const THROTTLED = { offline: false, latency: 150, downloadThroughput: 1_600_000 / 8, uploadThroughput: 750_000 / 8 };

type Tally = { seen: number; intercepted: number };
type Write = { t: number; kind: string; value: string; stack: string };

async function guardIdentity(context: BrowserContext, tally: Tally): Promise<void> {
  context.on("request", (request) => {
    if (IDENTITY.test(new URL(request.url()).hostname)) tally.seen++;
  });
  await context.route(
    (url) => IDENTITY.test(url.hostname),
    (route) => {
      tally.intercepted++;
      return route.abort();
    }
  );
}

/**
 * Runs in every document of the context: samples the title for WINDOW_MS from
 * the load event and counts title writes; with `trace`, records a stack per
 * write from the setters that can change the title.
 */
function instrument({ every, span, trace }: { every: number; span: number; trace: boolean }) {
  type W = { __titleSamples: string[]; __titleDone: boolean; __titleWrites: Write[] };
  const w = window as unknown as W;
  w.__titleSamples = [];
  w.__titleDone = false;
  w.__titleWrites = [];
  const isTitle = (n: Node | null) => !!n && (n.nodeName === "TITLE" || n.parentNode?.nodeName === "TITLE");
  const stack = () => (trace ? (new Error().stack ?? "").split("\n").slice(2, 16).join("\n") : "");
  if (trace) {
    const wrap = (proto: object, prop: string, kind: string, guard?: (n: Node) => boolean) => {
      const d = Object.getOwnPropertyDescriptor(proto, prop);
      if (!d?.set) return;
      Object.defineProperty(proto, prop, {
        configurable: true,
        get: d.get,
        set(this: Node, v: unknown) {
          if (!guard || guard(this)) w.__titleWrites.push({ t: performance.now(), kind, value: String(v).slice(0, 70), stack: stack() });
          return d.set!.call(this, v);
        },
      });
    };
    wrap(Document.prototype, "title", "document.title=");
    wrap(Node.prototype, "textContent", "textContent=", isTitle);
    wrap(Node.prototype, "nodeValue", "nodeValue=", isTitle);
    wrap(CharacterData.prototype, "data", "data=", isTitle);
    wrap(HTMLTitleElement.prototype, "text", "title.text=");
  } else {
    new MutationObserver((records) => {
      for (const r of records) {
        if (isTitle(r.target) || [...r.addedNodes].some((n) => n.nodeName === "TITLE")) {
          w.__titleWrites.push({ t: performance.now(), kind: r.type, value: document.title.slice(0, 70), stack: "" });
        }
      }
    }).observe(document, { subtree: true, childList: true, characterData: true });
  }
  window.addEventListener("load", () => {
    const started = performance.now();
    w.__titleSamples.push(document.title);
    const id = setInterval(() => {
      w.__titleSamples.push(document.title);
      if (performance.now() - started >= span) {
        clearInterval(id);
        w.__titleDone = true;
      }
    }, every);
  });
}

async function finalLoad(page: Page): Promise<{ samples: string[]; writes: Write[]; descriptions: string[] }> {
  await page.waitForFunction(() => (window as unknown as { __titleDone: boolean }).__titleDone, null, {
    timeout: WINDOW_MS * CPU + 30_000,
  });
  return page.evaluate(() => {
    const w = window as unknown as { __titleSamples: string[]; __titleWrites: Write[] };
    const descriptions = [...document.querySelectorAll('meta[name="description"]')].map((m) => m.getAttribute("content") ?? "");
    return { samples: w.__titleSamples, writes: w.__titleWrites, descriptions };
  });
}

// python3's http.server does not map clean URLs: the auth routes load as .html.
const PAGES: { name: string; path: string; enTitle: string; enDescription: string }[] = [
  { name: "landing page", path: "/", enTitle: LP_COPY.en.metaTitle, enDescription: LP_COPY.en.metaDescription },
  { name: "login", path: "/login.html", enTitle: AUTH_COPY.en.metaTitle, enDescription: AUTH_COPY.en.metaDescription },
  { name: "pending", path: "/pending.html", enTitle: AUTH_COPY.en.metaTitle, enDescription: AUTH_COPY.en.metaDescription },
].filter((p) => (process.env.LANG_TITLE_PAGES ?? "landing page,login,pending").split(",").includes(p.name));

for (const target of PAGES) {
  for (const protocol of PROTOCOLS) {
    for (const network of NETWORKS) {
      test(`${target.name} ${protocol} net=${network} cpu=${CPU}x: the EN title appears and stays (${LOADS} loads)`, async ({ browser }, info) => {
        test.setTimeout(LOADS * 60_000);
        const tally: Tally = { seen: 0, intercepted: 0 };
        const loads: {
          load: number;
          failed: boolean;
          final: string;
          flips: string[];
          writes: number;
          descriptionsEn: boolean;
          trace: Write[];
        }[] = [];

        for (let load = 0; load < LOADS; load++) {
          const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ja-JP" });
          await guardIdentity(context, tally);
          if (protocol !== "P1") {
            await context.addInitScript((key) => {
              try {
                window.localStorage.setItem(key, "en");
              } catch {}
            }, STORAGE_KEY);
          }
          await context.addInitScript(instrument, { every: SAMPLE_MS, span: WINDOW_MS, trace: TRACE });
          const page = await context.newPage();
          const cdp = await context.newCDPSession(page);
          if (CPU !== 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
          if (network === "throttled") {
            await cdp.send("Network.enable");
            await cdp.send("Network.emulateNetworkConditions", THROTTLED);
          }

          await page.goto(target.path, { waitUntil: "load" });
          if (protocol === "P1") {
            await page.locator('[data-lang-toggle][data-lang-ready="true"]').waitFor({ timeout: 30_000 });
            await page.locator("[data-lang-toggle]").getByRole("button", { name: "EN", exact: true }).click();
            await page.waitForFunction(() => document.documentElement.lang === "en", null, { timeout: 30_000 });
            await page.reload({ waitUntil: "load" });
          } else if (protocol === "P2") {
            await finalLoad(page);
            await page.goto(target.path, { waitUntil: "load" });
          }
          const { samples, writes, descriptions } = await finalLoad(page);
          await context.close();

          const firstEn = samples.indexOf(target.enTitle);
          const flips = [...new Set((firstEn >= 0 ? samples.slice(firstEn + 1) : []).filter((t) => t !== target.enTitle))];
          const final = samples[samples.length - 1] ?? "";
          loads.push({
            load,
            failed: flips.length > 0 || final !== target.enTitle,
            final,
            flips,
            writes: writes.length,
            descriptionsEn: descriptions.length > 0 && descriptions.every((d) => d === target.enDescription),
            trace: TRACE ? writes : [],
          });
        }

        const failing = loads.filter((l) => l.failed);
        const escaped = tally.seen - tally.intercepted;
        const maxWrites = Math.max(...loads.map((l) => l.writes));
        const descriptionMismatch = loads.filter((l) => !l.descriptionsEn).map((l) => l.load);
        await info.attach("title-loads.json", {
          body: JSON.stringify({ protocol, network, cpu: CPU, loads, tally }, null, 1),
          contentType: "application/json",
        });
        console.log(
          `[lang-title] ${target.path} ${protocol} net=${network} cpu=${CPU}x: loads=${LOADS} failing=${failing.length} ` +
            `maxTitleWrites=${maxWrites} descriptionMismatch=${descriptionMismatch.length} ` +
            `identity seen=${tally.seen} intercepted=${tally.intercepted} escaped=${escaped}`
        );
        expect(escaped, "identity requests escaped").toBe(0);
        expect(failing.map((l) => l.load), "loads whose EN title did not hold").toEqual([]);
        expect(maxWrites, "title writes in one load").toBeLessThanOrEqual(MAX_TITLE_WRITES);
        expect(descriptionMismatch, "loads with a description meta not in EN").toEqual([]);
      });
    }
  }
}
