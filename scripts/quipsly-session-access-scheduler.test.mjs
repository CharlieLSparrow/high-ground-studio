import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { configureSessionAccessScheduler } from "./release/quipsly-session-access-scheduler.mjs";

const sha = "a".repeat(40);
const email =
  "quipsly-session-access@high-ground-odyssey.iam.gserviceaccount.com";
const audience = "https://studio-example-uc.a.run.app";
function fixture({ existing = false } = {}) {
  const calls = [];
  const job = {
    name: "projects/high-ground-odyssey/locations/us-central1/jobs/quipsly-session-access",
    state: "ENABLED",
    schedule: "* * * * *",
    timeZone: "Etc/UTC",
    attemptDeadline: "60s",
    retryConfig: { retryCount: 0 },
    httpTarget: {
      uri: `${audience}/api/cron/session-access`,
      httpMethod: "POST",
      oidcToken: { audience, serviceAccountEmail: email },
    },
  };
  const service = {
    status: {
      url: audience,
      traffic: [{ revisionName: "studio-release", percent: 100 }],
    },
  };
  const revision = {
    status: { conditions: [{ type: "Ready", status: "True" }] },
    spec: {
      containers: [
        {
          env: [
            { name: "QUIPSLY_SOURCE_SHA", value: sha },
            { name: "SESSION_ACCESS_WORKER_SERVICE_ACCOUNT", value: email },
            { name: "SESSION_ACCESS_WORKER_AUDIENCE", value: audience },
          ],
        },
      ],
    },
  };
  const state = {
    service,
    revision,
    accounts: existing ? [{ email }] : [],
    jobs: existing ? [job] : [],
    job,
    calls,
  };
  state.run = (args) => {
    calls.push(args);
    const key = args.slice(0, 3).join(" ");
    const data = {
      "run services describe": service,
      "run revisions describe": revision,
      "iam service-accounts list": state.accounts,
      "scheduler jobs list": state.jobs,
      "scheduler jobs describe": job,
    }[key];
    return JSON.stringify(data || {});
  };
  return state;
}
const execute = (state, apply = false, extra = {}) =>
  configureSessionAccessScheduler({
    env: { EXPECTED_SOURCE_SHA: sha, ...extra },
    run: state.run,
    apply,
  });
const writes = (state) =>
  state.calls.filter((args) =>
    ["create", "update", "add-iam-policy-binding"].includes(args[2]),
  );

test("default mode reads serving state and plans without cloud writes", () => {
  const state = fixture();
  assert.deepEqual(execute(state), {
    applied: false,
    sourceSha: sha,
    revision: "studio-release",
    serviceAccount: email,
    uri: `${audience}/api/cron/session-access`,
    audience,
    schedule: "* * * * *",
    operation: "create",
  });
  assert.equal(writes(state).length, 0);
});
for (const existing of [false, true])
  test(`apply ${existing ? "updates" : "creates"} the exact job with service-scoped OIDC`, () => {
    const state = fixture({ existing });
    assert.equal(execute(state, true).applied, true);
    const commands = writes(state);
    assert.equal(commands.length, existing ? 2 : 3);
    const binding = commands.find(
      (args) => args[2] === "add-iam-policy-binding",
    );
    assert.ok(binding.includes(`--member=serviceAccount:${email}`));
    assert.ok(binding.includes("--role=roles/run.invoker"));
    const scheduler = commands.find((args) => args[0] === "scheduler");
    assert.equal(scheduler[2], existing ? "update" : "create");
    for (const argument of [
      `--uri=${audience}/api/cron/session-access`,
      `--oidc-token-audience=${audience}`,
      `--oidc-service-account-email=${email}`,
      "--http-method=POST",
      "--max-retry-attempts=0",
      "--max-retry-duration=0s",
      "--attempt-deadline=60s",
    ])
      assert.ok(scheduler.includes(argument));
  });

const invalid = {
  "split traffic": (state) => {
    state.service.status.traffic[0].percent = 50;
  },
  "latest preview instead of serving SHA": (state) => {
    state.revision.spec.containers[0].env[0].value = "b".repeat(40);
  },
  "missing worker configuration": (state) => {
    state.revision.spec.containers[0].env.pop();
  },
  "not ready": (state) => {
    state.revision.status.conditions[0].status = "False";
  },
  "lookalike audience": (state) => {
    state.service.status.url = "https://studio.evilrun.app";
  },
  "disabled account": (state) => {
    state.accounts = [{ email, disabled: true }];
  },
  "paused job": (state) => {
    state.jobs = [{ ...state.job, state: "PAUSED" }];
  },
};
for (const [name, change] of Object.entries(invalid))
  test(`refuses ${name} before any mutation`, () => {
    const state = fixture();
    change(state);
    assert.throws(() => execute(state, true));
    assert.equal(writes(state).length, 0);
  });

test("missing SHA or foreign identity stops before cloud calls", () => {
  for (const extra of [
    { EXPECTED_SOURCE_SHA: "" },
    {
      SESSION_ACCESS_WORKER_SERVICE_ACCOUNT:
        "other-worker@other-project.iam.gserviceaccount.com",
    },
  ]) {
    const state = fixture();
    assert.throws(() => execute(state, true, extra));
    assert.equal(state.calls.length, 0);
  }
});

test("every cloud failure stops at that command, never treats permission failure as absence", () => {
  const reference = fixture();
  execute(reference, true);
  for (let failure = 0; failure < reference.calls.length; failure++) {
    const state = fixture();
    const original = state.run;
    state.run = (args) => {
      if (state.calls.length === failure) {
        state.calls.push(args);
        throw new Error("provider unavailable");
      }
      return original(args);
    };
    assert.throws(() => execute(state, true), /provider unavailable/);
    assert.equal(state.calls.length, failure + 1);
  }
});

test("configuration readback rejects wrong endpoint, identity, schedule, retries, and paused state", () => {
  for (const change of [
    (job) => {
      job.httpTarget.uri += "/wrong";
    },
    (job) => {
      job.httpTarget.oidcToken.audience = "wrong";
    },
    (job) => {
      job.httpTarget.oidcToken.serviceAccountEmail = "wrong";
    },
    (job) => {
      job.schedule = "* * * * 0";
    },
    (job) => {
      job.retryConfig.retryCount = 5;
    },
    (job) => {
      job.retryConfig.maxRetryDuration = "300s";
    },
    (job) => {
      job.state = "PAUSED";
    },
    (job) => {
      job.attemptDeadline = "30s";
    },
  ]) {
    const state = fixture();
    change(state.job);
    assert.throws(() => execute(state, true), /readback/);
  }
});

test("CLI help is available with no credentials and release deploy supplies the worker configuration", () => {
  const script = new URL(
    "./release/quipsly-session-access-scheduler.mjs",
    import.meta.url,
  );
  const help = execFileSync(process.execPath, [script.pathname, "--help"], {
    env: { PATH: "/usr/bin:/bin" },
    encoding: "utf8",
  });
  assert.match(help, /read-only plan/);
  const deploy = readFileSync(
    new URL("./release/quipsly-deploy-preview.sh", import.meta.url),
    "utf8",
  );
  assert.match(
    deploy,
    /SESSION_ACCESS_WORKER_SERVICE_ACCOUNT=\$\{SESSION_ACCESS_WORKER_SERVICE_ACCOUNT\},SESSION_ACCESS_WORKER_AUDIENCE=\$\{session_access_audience\}/,
  );
  const envLine = deploy
    .split("\n")
    .find((line) => line.includes("--update-env-vars="));
  assert.ok(envLine.includes("${session_access_worker_env_vars}"));
});
