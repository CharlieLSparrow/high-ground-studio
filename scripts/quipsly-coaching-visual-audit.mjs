#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";
import {
  assertNoHorizontalOverflow,
  clearRenderedSession,
  loadPlaywright,
  requireLoopbackOrigin,
  signInThroughRenderedLogin,
} from "./lib/retained-qa-browser.mjs";

const contextArgument =
  process.argv.slice(2).find((argument) => argument !== "--") ||
  process.env.QUIPSLY_COACHING_VISUAL_CONTEXT;
assert(
  contextArgument,
  "Pass a retained fresh-coaching context path to the visual audit.",
);
const contextPath = path.resolve(contextArgument);
const context = JSON.parse(await readFile(contextPath, "utf8"));
const baseURL = requireLoopbackOrigin(
  process.env.QUIPSLY_LOCAL_BASE_URL || context.baseURL,
  "Coaching visual audit base URL",
);
assert.equal(
  context.schema,
  "quipsly-fresh-coaching-acceptance-context-v1",
  "Visual audit requires a retained fresh-coaching context.",
);

const auditDirectory = path.join(path.dirname(contextPath), "visual-audit");
await mkdir(auditDirectory, { recursive: true });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const sessionRoute = (mode) =>
  `/sessions/${encodeURIComponent(context.roomId)}?mode=${encodeURIComponent(mode)}`;
const targets = [
  {
    name: "coach-desktop-home",
    identity: context.identities.coach,
    viewport: { width: 1440, height: 1000 },
    route: "/coaching",
  },
  {
    name: "coach-phone-home",
    identity: context.identities.coach,
    viewport: { width: 390, height: 844 },
    route: "/coaching",
  },
  {
    name: "client-phone-home",
    identity: context.identities.client,
    viewport: { width: 390, height: 844 },
    route: "/coaching",
  },
  {
    name: "client-phone-session",
    identity: context.identities.client,
    viewport: { width: 390, height: 844 },
    route: context.clientEntryPath,
  },
  {
    name: "coach-phone-session",
    identity: context.identities.coach,
    viewport: { width: 390, height: 844 },
    route: sessionRoute("overview"),
  },
  {
    name: "coach-phone-transcript",
    identity: context.identities.coach,
    viewport: { width: 390, height: 844 },
    route: sessionRoute("transcript"),
  },
  {
    name: "coach-phone-notes",
    identity: context.identities.coach,
    viewport: { width: 390, height: 844 },
    route: sessionRoute("notes"),
  },
  {
    name: "coach-phone-work",
    identity: context.identities.coach,
    viewport: { width: 390, height: 844 },
    route: sessionRoute("work"),
  },
  {
    name: "coach-phone-share",
    identity: context.identities.coach,
    viewport: { width: 390, height: 844 },
    route: sessionRoute("outputs"),
  },
];
const targetFilter = process.env.QUIPSLY_COACHING_VISUAL_TARGET?.trim();
const selectedTargets = targetFilter
  ? targets.filter((target) => target.name.includes(targetFilter))
  : targets;
assert(
  selectedTargets.length > 0,
  `No coaching visual-audit target matched ${targetFilter}.`,
);
const results = [];

try {
  for (const target of selectedTargets) {
    const browserContext = await browser.newContext({
      viewport: target.viewport,
      reducedMotion: "reduce",
    });
    const page = await browserContext.newPage();
    const password = readRetainedQAPassword({
      service: context.keychainService,
      account: target.identity.email,
    });
    assert(
      password,
      `No retained password exists for ${target.identity.email}.`,
    );
    try {
      await signInThroughRenderedLogin({
        page,
        baseURL,
        identity: target.identity,
        password,
        callbackPath: target.route,
      });
      await page.waitForLoadState("networkidle").catch(() => undefined);
      const main = page.locator("main").last();
      await main.waitFor({ state: "visible", timeout: 30_000 });
      let overflowError = null;
      try {
        await assertNoHorizontalOverflow(main, target.name);
      } catch (cause) {
        overflowError = cause instanceof Error ? cause.message : String(cause);
      }
      const metrics = await main.evaluate((element) => {
        const text = (element.innerText || "").trim();
        const visible = (candidate) => {
          const style = window.getComputedStyle(candidate);
          const rect = candidate.getBoundingClientRect();
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0
          );
        };
        return {
          words: text ? text.split(/\s+/).length : 0,
          headings: [...element.querySelectorAll("h1,h2,h3")].filter(visible)
            .length,
          buttons: [...element.querySelectorAll("button")].filter(visible)
            .length,
          links: [...element.querySelectorAll("a")].filter(visible).length,
          expandedDetails: [
            ...element.querySelectorAll("details[open]"),
          ].filter(visible).length,
          collapsedDetails: [
            ...element.querySelectorAll("details:not([open])"),
          ].filter(visible).length,
          scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight,
          viewportHeight: window.innerHeight,
          pageLengths:
            Math.round((element.scrollHeight / window.innerHeight) * 10) / 10,
        };
      });
      const screenshotPath = path.join(auditDirectory, `${target.name}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      const scrollScreenshots = [];
      if (metrics.pageLengths > 2) {
        for (const [label, fraction] of [
          ["quarter", 0.25],
          ["middle", 0.5],
          ["three-quarter", 0.75],
          ["end", 1],
        ]) {
          await main.evaluate((element, nextFraction) => {
            let scroller = element.parentElement;
            while (
              scroller &&
              scroller !== document.body &&
              scroller.scrollHeight <= scroller.clientHeight + 1
            ) {
              scroller = scroller.parentElement;
            }
            if (scroller && scroller.scrollHeight > scroller.clientHeight + 1) {
              scroller.scrollTop =
                (scroller.scrollHeight - scroller.clientHeight) * nextFraction;
              return;
            }
            const maximum = Math.max(
              0,
              document.documentElement.scrollHeight - window.innerHeight,
            );
            window.scrollTo(0, maximum * nextFraction);
          }, fraction);
          await page.waitForTimeout(50);
          const slicePath = path.join(
            auditDirectory,
            `${target.name}-${label}.png`,
          );
          await page.screenshot({ path: slicePath });
          scrollScreenshots.push({ label, fraction, screenshotPath: slicePath });
        }
      }
      results.push({
        ...target,
        screenshotPath,
        scrollScreenshots,
        metrics,
        overflowError,
      });
    } finally {
      await clearRenderedSession(page, baseURL, target.name).catch(
        () => undefined,
      );
      await browserContext.close();
    }
  }
} finally {
  await browser.close();
}

const receipt = {
  schema: "quipsly-coaching-visual-audit-v1",
  createdAt: new Date().toISOString(),
  sourceContextPath: contextPath,
  results,
};
const receiptPath = path.join(auditDirectory, "receipt.json");
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, receiptPath, results }, null, 2));
if (results.some((result) => result.overflowError)) process.exitCode = 1;
