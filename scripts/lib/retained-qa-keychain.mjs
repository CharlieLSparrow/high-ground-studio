import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const TEST_EMAIL = /^[^\s@]+@[^\s@]+\.test$/i;
const SAFE_KEYCHAIN_LABEL = /^[A-Za-z0-9._:@+-]{3,160}$/;
const KEYCHAIN_HELPER = fileURLToPath(
  new URL("./retained-qa-keychain.swift", import.meta.url),
);

function assertSafeIdentity(value, label) {
  const normalized = String(value || "").trim();
  if (!TEST_EMAIL.test(normalized)) {
    throw new Error(`${label} must be a reserved .test email address.`);
  }
  return normalized;
}

function assertSafeService(value) {
  const normalized = String(value || "").trim();
  if (!SAFE_KEYCHAIN_LABEL.test(normalized)) {
    throw new Error("Keychain service contains unsupported characters.");
  }
  return normalized;
}

function assertPassword(value) {
  const normalized = String(value || "");
  if (normalized.length < 16 || /[\r\n\0]/.test(normalized)) {
    throw new Error("Retained QA password must contain at least 16 safe characters.");
  }
  return normalized;
}

function requireDarwin(platform) {
  if (platform !== "darwin") {
    throw new Error("Retained QA Keychain mode is available only on macOS.");
  }
}

export function readRetainedQAPassword({
  service,
  account,
  runner = spawnSync,
  platform = process.platform,
}) {
  requireDarwin(platform);
  const safeService = assertSafeService(service);
  const safeAccount = assertSafeIdentity(account, "Keychain account");
  const result = runner(
    "xcrun",
    [
      "swift",
      KEYCHAIN_HELPER,
      "read",
      safeService,
      safeAccount,
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  if (result.status === 44) return null;
  if (result.status !== 0) {
    throw new Error(
      `Could not read retained QA password from macOS Keychain (exit ${String(result.status)}).`,
    );
  }
  return assertPassword(String(result.stdout || ""));
}

export function writeRetainedQAPassword({
  service,
  account,
  password,
  runner = spawnSync,
  platform = process.platform,
}) {
  requireDarwin(platform);
  const safeService = assertSafeService(service);
  const safeAccount = assertSafeIdentity(account, "Keychain account");
  const safePassword = assertPassword(password);
  const result = runner(
    "xcrun",
    [
      "swift",
      KEYCHAIN_HELPER,
      "write",
      safeService,
      safeAccount,
    ],
    {
      encoding: "utf8",
      input: safePassword,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `Could not store retained QA password in macOS Keychain (exit ${String(result.status)}).`,
    );
  }
}

export function resolveRetainedQAPassword({
  service,
  account,
  generate,
  runner = spawnSync,
  platform = process.platform,
}) {
  if (typeof generate !== "function") {
    throw new Error("A retained QA password generator is required.");
  }
  const existing = readRetainedQAPassword({
    service,
    account,
    runner,
    platform,
  });
  if (existing) return { password: existing, created: false };
  const generated = assertPassword(generate());
  writeRetainedQAPassword({
    service,
    account,
    password: generated,
    runner,
    platform,
  });
  return { password: generated, created: true };
}
