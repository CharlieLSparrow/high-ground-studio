#!/usr/bin/env node

import { access } from "node:fs/promises";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { pathToFileURL } from "node:url";

const envFile = process.env.QUIPSLY_LOCAL_ENV_FILE?.trim();
if (envFile) loadEnvFile(envFile);

const nextEntrypoint = path.resolve(
  process.cwd(),
  "node_modules/next/dist/bin/next",
);
await access(nextEntrypoint);

// Import Next in this process after loading the environment. Passing
// --env-file to Node itself is unsafe here because Next forwards execArgv to
// its dev child through NODE_OPTIONS, where Node forbids that flag.
process.argv = [process.execPath, nextEntrypoint, "dev", "--webpack"];
await import(pathToFileURL(nextEntrypoint).href);
