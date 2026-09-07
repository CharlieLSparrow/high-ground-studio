#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// Deployment tool only: the application owns all access policy and retries.
export function configureSessionAccessScheduler({
  env = process.env,
  apply = false,
  run = gcloud,
} = {}) {
  const project = env.PROJECT_ID || "high-ground-odyssey";
  const region = env.REGION || "us-central1";
  const service = env.SERVICE_NAME || "studio";
  const location = env.SCHEDULER_REGION || region;
  const job = "quipsly-session-access";
  const email =
    env.SESSION_ACCESS_WORKER_SERVICE_ACCOUNT ||
    `${job}@${project}.iam.gserviceaccount.com`;
  const sha = env.EXPECTED_SOURCE_SHA;
  if (
    ![project, region, service, location].every((value) =>
      /^[a-z][a-z0-9-]{0,62}$/.test(value),
    ) ||
    !/^[a-z0-9][a-z0-9-]{4,28}$/.test(email.split("@")[0]) ||
    email.split("@")[1] !== `${project}.iam.gserviceaccount.com` ||
    email.split("@").length !== 2 ||
    !/^[a-f0-9]{40}$/.test(sha || "")
  ) {
    throw new Error(
      "Provide safe project/service settings, a same-project worker identity, and EXPECTED_SOURCE_SHA (40 lowercase hex characters).",
    );
  }
  const scope = [`--project=${project}`, `--region=${region}`];
  const schedulerScope = [`--project=${project}`, `--location=${location}`];
  const read = (...args) => JSON.parse(run([...args, "--format=json"]));
  const deployed = read("run", "services", "describe", service, ...scope);
  const audience = deployed.status?.url;
  if (!/^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.run\.app$/.test(audience || ""))
    throw new Error("Cloud Run did not return a valid service audience.");
  const traffic = (deployed.status?.traffic || []).filter(
    (target) => target.percent > 0,
  );
  if (
    traffic.length !== 1 ||
    traffic[0].percent !== 100 ||
    !traffic[0].revisionName
  )
    throw new Error(
      "Session access setup requires one serving revision at 100% traffic.",
    );
  const revision = read(
    "run",
    "revisions",
    "describe",
    traffic[0].revisionName,
    ...scope,
  );
  const values = Object.fromEntries(
    (revision.spec?.containers?.[0]?.env || []).map((item) => [
      item.name,
      item.value,
    ]),
  );
  if (
    !revision.status?.conditions?.some(
      (item) => item.type === "Ready" && item.status === "True",
    ) ||
    values.QUIPSLY_SOURCE_SHA !== sha ||
    values.SESSION_ACCESS_WORKER_SERVICE_ACCOUNT !== email ||
    values.SESSION_ACCESS_WORKER_AUDIENCE !== audience
  ) {
    throw new Error(
      "Serving revision is not ready or does not match the requested source and session access identity. Deploy and promote that configuration first.",
    );
  }
  // List operations distinguish absent resources from authentication/API failures.
  // A failed describe must never be interpreted as permission to create something.
  const accounts = read(
    "iam",
    "service-accounts",
    "list",
    `--project=${project}`,
  );
  const jobs = read("scheduler", "jobs", "list", ...schedulerScope);
  const existing = jobs.find(
    (item) =>
      item.name === `projects/${project}/locations/${location}/jobs/${job}`,
  );
  const account = accounts.find((item) => item.email === email);
  if (account?.disabled)
    throw new Error("The session access worker identity is disabled.");
  if (existing && existing.state !== "ENABLED")
    throw new Error(
      "The existing scheduler is not enabled; do not silently resume an operator-paused job.",
    );
  const uri = `${audience}/api/cron/session-access`;
  const plan = {
    applied: false,
    sourceSha: sha,
    revision: traffic[0].revisionName,
    serviceAccount: email,
    uri,
    audience,
    schedule: "* * * * *",
    operation: existing ? "update" : "create",
  };
  if (!apply) return plan;
  if (!account)
    run([
      "iam",
      "service-accounts",
      "create",
      email.split("@")[0],
      `--project=${project}`,
      "--display-name=Quipsly session access maintenance",
      "--quiet",
    ]);
  run([
    "run",
    "services",
    "add-iam-policy-binding",
    service,
    ...scope,
    `--member=serviceAccount:${email}`,
    "--role=roles/run.invoker",
    "--quiet",
  ]);
  run([
    "scheduler",
    "jobs",
    plan.operation,
    "http",
    job,
    ...schedulerScope,
    `--schedule=${plan.schedule}`,
    "--time-zone=Etc/UTC",
    `--uri=${uri}`,
    "--http-method=POST",
    `--oidc-service-account-email=${email}`,
    `--oidc-token-audience=${audience}`,
    "--attempt-deadline=60s",
    "--max-retry-attempts=0",
    "--max-retry-duration=0s",
    "--quiet",
  ]);
  // The next minute is the durable retry. Avoid multiplying calls during outages.
  const saved = read("scheduler", "jobs", "describe", job, ...schedulerScope);
  const target = saved.httpTarget;
  if (
    saved.name !== `projects/${project}/locations/${location}/jobs/${job}` ||
    saved.state !== "ENABLED" ||
    saved.schedule !== plan.schedule ||
    saved.timeZone !== "Etc/UTC" ||
    saved.attemptDeadline !== "60s" ||
    (saved.retryConfig?.retryCount ?? 0) !== 0 ||
    (saved.retryConfig?.maxRetryDuration ?? "0s") !== "0s" ||
    target?.httpMethod !== "POST" ||
    target.uri !== uri ||
    target.oidcToken?.audience !== audience ||
    target.oidcToken?.serviceAccountEmail !== email ||
    target.oauthToken
  ) {
    throw new Error(
      "Session access scheduler readback did not match its requested configuration.",
    );
  }
  return { ...plan, applied: true };
}

function gcloud(args) {
  return execFileSync("gcloud", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60_000,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    console.log(
      "Usage: EXPECTED_SOURCE_SHA=<deployed commit> node scripts/release/quipsly-session-access-scheduler.mjs [--apply]\nDefault: read-only plan. --apply creates/updates the dedicated identity, invoker binding, and minute scheduler. Obtain cost/access approval first. Requires Cloud Scheduler API already enabled. This does not deploy, promote, or resume paused jobs.",
    );
  } else {
    try {
      if (args.length > 1 || (args.length === 1 && args[0] !== "--apply"))
        throw new Error("Unknown arguments; use --help.");
      console.log(
        JSON.stringify(
          configureSessionAccessScheduler({ apply: args[0] === "--apply" }),
          null,
          2,
        ),
      );
    } catch (error) {
      // Do not print child-process buffers, which may contain private config.
      console.error(
        error.status != null
          ? `Cloud command failed (exit ${error.status}); no automatic retry or fallback creation.`
          : error.message,
      );
      process.exitCode = 1;
    }
  }
}
