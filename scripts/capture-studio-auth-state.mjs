import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";

const studioBaseUrl =
  process.env.STUDIO_BASE_URL?.replace(/\/$/, "") || "http://localhost:3000";
const storageStatePath = path.resolve(
  process.env.STUDIO_AUTH_STORAGE_STATE ||
    "artifacts/auth/studio-storage-state.json",
);

async function main() {
  await mkdir(path.dirname(storageStatePath), { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${studioBaseUrl}/manuscript`, {
    waitUntil: "domcontentloaded",
  });

  console.log("");
  console.log("A browser window is open for manual Studio sign-in.");
  console.log("Do not paste credentials into this terminal.");
  console.log("After Studio /manuscript is signed in and visible, return here.");
  console.log("");

  const readline = createInterface({ input, output });
  await readline.question(
    "Press Enter to save private Studio auth storage state, or Ctrl+C to cancel. ",
  );
  readline.close();

  await context.storageState({ path: storageStatePath });
  await browser.close();

  console.log("");
  console.log(
    `Saved private Studio auth storage state to ${path.relative(process.cwd(), storageStatePath) || storageStatePath}`,
  );
  console.log("This file is ignored by git and must never be committed.");
}

await main();
