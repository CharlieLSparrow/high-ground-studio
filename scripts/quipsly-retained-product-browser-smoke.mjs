#!/usr/bin/env node

import {
  assertNoHorizontalOverflow,
  clearRenderedSession,
  loadPlaywright,
  requireLoopbackOrigin,
  signInThroughRenderedLogin,
} from "./lib/retained-qa-browser.mjs";
import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";

const KEYCHAIN_SERVICE = "com.quipsly.qa.retained-product";
const MEDIA_OPERATOR_EMAIL = "quipsly-media-ms8ct81g@example.test";
const PROJECT_SLUG = "qa-retained-capture-to-follow-through-lab";
const PROJECT_NAME = "QA Retained · Capture to Follow-through Lab";
const NOTE_TITLE = "QA Retained · Build 20 rehearsal truth";
const TASK_TITLE = "QA Retained · Run physical Build 20 rehearsal";
const GOAL_TITLE = "QA Retained · Prove one complete Capture-to-Nest episode loop";
const TAG_LABEL = "#rehearsal";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function contentMain(page) {
  return page.getByRole("main").last();
}

async function projectOverview(page, baseURL) {
  const projectHeading = page.getByRole("heading", { name: PROJECT_NAME, exact: true });
  await projectHeading.waitFor({ timeout: 20_000 });
  const main = contentMain(page);
  const text = await main.innerText();
  for (const expected of [NOTE_TITLE, TASK_TITLE, GOAL_TITLE, TAG_LABEL, "25% recorded progress"]) {
    assert(text.includes(expected), `Retained Nest overview lost ${expected}.`);
  }
  await assertNoHorizontalOverflow(main, "retained Nest overview");

  const tagLink = page.getByRole("link", { name: TAG_LABEL, exact: true });
  await tagLink.click();
  await page.waitForURL((url) => url.origin === baseURL && url.pathname === "/find" && Boolean(url.searchParams.get("tag")));
  await page.getByRole("heading", { name: TAG_LABEL, exact: true }).waitFor();
  const tagText = await contentMain(page).innerText();
  for (const expected of [NOTE_TITLE, TASK_TITLE, GOAL_TITLE]) {
    assert(tagText.includes(expected), `Canonical tag focus lost ${expected}.`);
  }
  assert(
    tagText.includes("Everything below is linked to this exact tag identity"),
    "Canonical tag focus lost its same-Nest identity explanation.",
  );

  await page.goto(`${baseURL}/nests/${PROJECT_SLUG}`, { waitUntil: "load" });
  await projectHeading.waitFor({ timeout: 20_000 });
  const projectNav = page.getByRole("navigation", { name: `${PROJECT_NAME} workspace` });
  await projectNav.getByRole("link", { name: /^Work\b/ }).click();
  await page.waitForURL(
    (url) => url.pathname === `/nests/${PROJECT_SLUG}` && url.searchParams.get("view") === "work",
  );
  await page.getByRole("heading", { name: "Project follow-through", exact: true }).waitFor();
  const projectWorkText = await contentMain(page).innerText();
  assert(projectWorkText.includes(TASK_TITLE), "Project Work lost the exact retained task.");
  assert(projectWorkText.includes(GOAL_TITLE), "Project Work lost the exact retained goal.");
  return {
    nestOverview: "passed",
    canonicalTagFocus: "passed",
    projectWorkProjection: "passed",
  };
}

async function globalWork(page) {
  await page.getByRole("link", { name: "Open all work", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/work");
  await page.getByRole("heading", { name: "Work Queue", exact: true }).waitFor();
  const main = contentMain(page);
  const text = await main.innerText();
  for (const expected of [TASK_TITLE, GOAL_TITLE, TAG_LABEL, "Progress: 25%", "Contributes"]) {
    assert(text.toLowerCase().includes(expected.toLowerCase()), `Global Work lost ${expected}.`);
  }
  await assertNoHorizontalOverflow(main, "global Work");
  return { workQueue: "passed", taskGoalIdentity: "passed", relationshipReadback: "passed" };
}

async function todayAtPhoneWidth(page, baseURL) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseURL}/today`, { waitUntil: "load" });
  await page.getByRole("heading", { name: "Do the next useful thing. Keep the rest quiet.", exact: true }).waitFor();
  const main = contentMain(page);
  const text = await main.innerText();
  for (const expected of [TASK_TITLE, GOAL_TITLE]) {
    assert(text.includes(expected), `Phone-width Today lost ${expected}.`);
  }
  await main.getByRole("list", { name: "Tags" }).filter({ hasText: "rehearsal" }).first().waitFor();
  assert(
    text.includes("Today is read-only planning context"),
    "Today lost its explicit non-effect boundary.",
  );
  await assertNoHorizontalOverflow(main, "phone-width Today");
  return { today: "passed", responsiveViewport: "390x844", horizontalOverflow: false };
}

async function main() {
  const baseURL = requireLoopbackOrigin(
    process.env.QUIPSLY_RETAINED_PRODUCT_BASE_URL || "http://127.0.0.1:3012",
    "QUIPSLY_RETAINED_PRODUCT_BASE_URL",
  );
  const password = readRetainedQAPassword({
    service: KEYCHAIN_SERVICE,
    account: MEDIA_OPERATOR_EMAIL,
  });
  assert(password, "The retained media operator has no Keychain password.");
  const identity = { role: "media-operator", email: MEDIA_OPERATOR_EMAIL };
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: "light",
    locale: "en-US",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    await signInThroughRenderedLogin({
      page,
      baseURL,
      identity,
      password,
      callbackPath: `/nests/${PROJECT_SLUG}`,
    });
    const overview = await projectOverview(page, baseURL);
    const work = await globalWork(page);
    const today = await todayAtPhoneWidth(page, baseURL);
    assert(pageErrors.length === 0, "Retained product browser operation raised a client exception.");
    await clearRenderedSession(page, baseURL, identity.role);
    console.log(JSON.stringify({
      ok: true,
      localOnly: true,
      retained: true,
      renderedProduct: true,
      credentialStore: "macOS Keychain",
      screenshotsCaptured: false,
      secretsPrinted: false,
      mutationsPerformed: false,
      externalSideEffects: false,
      ...overview,
      ...work,
      ...today,
      sessionClear: "passed",
      browserExceptions: 0,
    }, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
}

await main();
