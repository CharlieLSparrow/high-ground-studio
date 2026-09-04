import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const deployScript = fileURLToPath(
  new URL("./quipsly-deploy-preview.sh", import.meta.url),
);
const hotfixScript = fileURLToPath(
  new URL("./quipsly-hotfix-deploy.sh", import.meta.url),
);

test("preview deploy help is read-only and available without cloud authentication", () => {
  const help = execFileSync("bash", [deployScript, "--help"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { PATH: "/usr/bin:/bin" },
  });

  assert.match(help, /Deploy the exact SOURCE_REF/);
  assert.match(help, /preview receives no production traffic/);
  assert.match(help, /PRESERVE_LIVE_CAPABILITIES/);
});

test("preview deploy inherits live capabilities unless an operator explicitly overrides them", () => {
  const source = readFileSync(deployScript, "utf8");

  assert.match(source, /PRESERVE_LIVE_CAPABILITIES="\$\{PRESERVE_LIVE_CAPABILITIES:-1\}"/);
  assert.match(source, /ENABLE_ACCOUNT_DELETION_WORKER_EXPLICIT="\$\{ENABLE_ACCOUNT_DELETION_WORKER\+x\}"/);
  assert.match(source, /ENABLE_LIVEKIT_EGRESS_EXPLICIT="\$\{ENABLE_LIVEKIT_EGRESS\+x\}"/);
  assert.match(source, /quipsly-release-feature-inheritance\.mjs/);
  assert.match(source, /Unspecified release capabilities inherited from the current live/);
  assert.match(source, /Unexpected inherited release feature/);
});

test("Nest release lanes preserve zero idle instances but allow one replacement instance", () => {
  for (const scriptPath of [deployScript, hotfixScript]) {
    execFileSync("bash", ["-n", scriptPath], { cwd: repoRoot, stdio: "pipe" });
    const source = readFileSync(scriptPath, "utf8");

    assert.match(source, /MIN_INSTANCES="\$\{MIN_INSTANCES:-0\}"/);
    assert.match(source, /MAX_INSTANCES="\$\{MAX_INSTANCES:-2\}"/);
    assert.match(source, /MIN_INSTANCES > MAX_INSTANCES/);
    assert.match(source, /MAX_INSTANCES < 2/);
    assert.match(
      source,
      /--min-instances=(?:"\$\{MIN_INSTANCES\}"|\$\{MIN_INSTANCES\})/,
    );
    assert.match(
      source,
      /--max-instances=(?:"\$\{MAX_INSTANCES\}"|\$\{MAX_INSTANCES\})/,
    );
  }
});

test("preview deploy bounds request concurrency against the rolling database pool budget", () => {
  const source = readFileSync(deployScript, "utf8");

  assert.match(source, /CONCURRENCY="\$\{CONCURRENCY:-8\}"/);
  assert.match(source, /PRISMA_PG_POOL_MAX="\$\{PRISMA_PG_POOL_MAX:-4\}"/);
  assert.match(
    source,
    /PRISMA_ROLLOUT_CONNECTION_BUDGET="\$\{PRISMA_ROLLOUT_CONNECTION_BUDGET:-16\}"/,
  );
  assert.match(
    source,
    /2 \* MAX_INSTANCES \* PRISMA_PG_POOL_MAX > PRISMA_ROLLOUT_CONNECTION_BUDGET/,
  );
  assert.match(source, /--concurrency="\$\{CONCURRENCY\}"/);
  assert.match(source, /PRISMA_PG_POOL_MAX=\$\{PRISMA_PG_POOL_MAX\}/);
});

test("preview deploy mounts the required secrets and privately validates the release-smoke signing key", () => {
  execFileSync("bash", ["-n", deployScript], { cwd: repoRoot, stdio: "pipe" });
  const source = readFileSync(deployScript, "utf8");

  assert.match(source, /gcloud secrets versions describe/);
  assert.match(source, /gcloud secrets versions access/);
  assert.match(source, /bytes >= 32/);
  assert.match(source, /bytes <= 4096/);
  assert.match(source, /value\.trim\(\) === value/);
  assert.match(source, /!\/\[\\u0000-\\u001f\\u007f\]\//);
  assert.match(
    source,
    /--update-secrets="QUIPSLY_RELEASE_SMOKE_SECRET=\$\{RELEASE_SMOKE_SECRET_NAME\}:\$\{RELEASE_SMOKE_SECRET_VERSION\},REEFBALL_IMAGE_PROXY_TOKEN_SECRET=\$\{IMAGE_PROXY_TOKEN_SECRET_NAME\}:\$\{IMAGE_PROXY_TOKEN_SECRET_VERSION\}\$\{livekit_secret_mounts\}\$\{google_calendar_oauth_secrets\}\$\{google_drive_oauth_secrets\}\$\{account_deletion_worker_secret\}\$\{session_invitation_email_secret\}\$\{stripe_saas_secrets\}"/,
  );
  assert.match(source, /The value was not printed/);
  assert.doesNotMatch(source, /echo "\$\{?QUIPSLY_RELEASE_SMOKE_SECRET/);
  assert.doesNotMatch(source, /set -x/);
});

test("SaaS subscription activation is explicit and Secret Manager backed", () => {
  const source = readFileSync(deployScript, "utf8");

  assert.match(source, /ENABLE_STRIPE_SAAS="\$\{ENABLE_STRIPE_SAAS:-0\}"/);
  assert.match(source, /ENABLE_STRIPE_SAAS must be 0 or 1/);
  assert.match(source, /STRIPE_SECRET_KEY=\$\{STRIPE_SECRET_KEY_SECRET_NAME\}:latest/);
  assert.match(source, /STRIPE_SAAS_WEBHOOK_SECRET=\$\{STRIPE_SAAS_WEBHOOK_SECRET_NAME\}:latest/);
  assert.match(source, /QUIPSLY_STRIPE_COACH_MONTHLY_PRICE_ID=\$\{STRIPE_COACH_MONTHLY_PRICE_SECRET_NAME\}:latest/);
  assert.match(source, /QUIPSLY_STRIPE_COACH_ANNUAL_PRICE_ID=\$\{STRIPE_COACH_ANNUAL_PRICE_SECRET_NAME\}:latest/);
  assert.match(source, /QUIPSLY_SAAS_ENTITLEMENT_ENFORCEMENT=true/);
});

test("preview deploy configures production App Store receipt verification", () => {
  const source = readFileSync(deployScript, "utf8");

  assert.match(source, /APP_STORE_BUNDLE_ID="\$\{APP_STORE_BUNDLE_ID:-com\.highgroundodyssey\.HighGroundCapture\}"/);
  assert.match(source, /APP_STORE_APP_APPLE_ID="\$\{APP_STORE_APP_APPLE_ID:-6780995957\}"/);
  assert.match(source, /APP_STORE_ENABLE_ONLINE_CHECKS="\$\{APP_STORE_ENABLE_ONLINE_CHECKS:-true\}"/);
  assert.match(source, /APP_STORE_APP_APPLE_ID=\$\{APP_STORE_APP_APPLE_ID\}/);
  assert.match(source, /APP_STORE_ENABLE_ONLINE_CHECKS=\$\{APP_STORE_ENABLE_ONLINE_CHECKS\}/);
});

test("preview deploy enables the exact public GA4 stream without treating its id as a secret", () => {
  const source = readFileSync(deployScript, "utf8");

  assert.match(
    source,
    /QUIPSLY_GA_MEASUREMENT_ID="\$\{QUIPSLY_GA_MEASUREMENT_ID:-G-47PCQGW8ZB\}"/,
  );
  assert.match(source, /QUIPSLY_GA_MEASUREMENT_ID must be a GA4 measurement ID/);
  assert.match(source, /QUIPSLY_GA_MEASUREMENT_ID=\$\{QUIPSLY_GA_MEASUREMENT_ID\}/);
  assert.match(source, /QUIPSLY_GA_PROPERTY_ID="\$\{QUIPSLY_GA_PROPERTY_ID:-503353241\}"/);
  assert.match(source, /QUIPSLY_GA_PROPERTY_ID must be a numeric GA4 property ID/);
  assert.match(source, /QUIPSLY_GA_PROPERTY_ID=\$\{QUIPSLY_GA_PROPERTY_ID\}/);
  assert.doesNotMatch(source, /QUIPSLY_GA_MEASUREMENT_ID=.*:latest/);
});

test("preview deploy keeps database staff roles authoritative", () => {
  const source = readFileSync(deployScript, "utf8");
  const hotfix = readFileSync(hotfixScript, "utf8");

  assert.match(source, /QUIPSLY_ADMIN_BREAK_GLASS_ENABLED=false/);
  assert.doesNotMatch(source, /QUIPSLY_ADMIN_EMAILS=.*\$\{QUIPSLY_ADMIN_EMAILS/);
  assert.match(hotfix, /QUIPSLY_ADMIN_BREAK_GLASS_ENABLED="\$\{QUIPSLY_ADMIN_BREAK_GLASS_ENABLED:-false\}"/);
  assert.match(hotfix, /Emergency admin recovery requires an exact QUIPSLY_ADMIN_EMAILS list/);
  assert.match(hotfix, /QUIPSLY_ADMIN_BREAK_GLASS_ENABLED=\$\{QUIPSLY_ADMIN_BREAK_GLASS_ENABLED\}/);
});

test("preview deploy defaults to the valid dedicated account deletion identity", () => {
  const source = readFileSync(deployScript, "utf8");

  assert.match(
    source,
    /ACCOUNT_DELETION_WORKER_SERVICE_ACCOUNT="\$\{ACCOUNT_DELETION_WORKER_SERVICE_ACCOUNT:-quipsly-deletion-worker@\$\{PROJECT_ID\}\.iam\.gserviceaccount\.com\}"/,
  );
  assert.doesNotMatch(
    source,
    /quipsly-account-deletion-worker@\$\{PROJECT_ID\}\.iam\.gserviceaccount\.com/,
  );
});

test("session invitation email is explicit, Secret Manager backed, and safe to disable", () => {
  const source = readFileSync(deployScript, "utf8");

  assert.match(
    source,
    /ENABLE_SESSION_INVITATION_EMAIL="\$\{ENABLE_SESSION_INVITATION_EMAIL:-0\}"/,
  );
  assert.match(source, /ENABLE_SESSION_INVITATION_EMAIL must be 0 or 1/);
  assert.match(source, /SESSION_INVITATION_RESEND_API_KEY_SECRET_NAME/);
  assert.match(source, /RESEND_WEBHOOK_SECRET_NAME/);
  assert.match(
    source,
    /SESSION_INVITATION_EMAIL_FROM="\$\{SESSION_INVITATION_EMAIL_FROM:-invites@notify\.quipsly\.com\}"/,
  );
  assert.match(
    source,
    /QUIPSLY_SITE_URL="\$\{QUIPSLY_SITE_URL:-https:\/\/nest\.quipsly\.com\}"/,
  );
  assert.match(source, /QUIPSLY_SITE_URL must be one HTTPS origin/);
  assert.match(
    source,
    /validate_private_secret "\$\{SESSION_INVITATION_RESEND_API_KEY_SECRET_NAME\}" "api-key"/,
  );
  assert.match(
    source,
    /QUIPSLY_SESSION_INVITATION_RESEND_API_KEY=\$\{SESSION_INVITATION_RESEND_API_KEY_SECRET_NAME\}:latest/,
  );
  assert.match(
    source,
    /validate_private_secret "\$\{RESEND_WEBHOOK_SECRET_NAME\}" "webhook-secret"/,
  );
  assert.match(
    source,
    /QUIPSLY_RESEND_WEBHOOK_SECRET=\$\{RESEND_WEBHOOK_SECRET_NAME\}:latest/,
  );
  assert.match(
    source,
    /QUIPSLY_SESSION_INVITATION_EMAIL_FROM=\$\{SESSION_INVITATION_EMAIL_FROM\}/,
  );
  assert.match(source, /QUIPSLY_SITE_URL=\$\{QUIPSLY_SITE_URL\}/);
  assert.doesNotMatch(source, /QUIPSLY_SESSION_INVITATION_RESEND_API_KEY=[^$]/);
});

test("Drive activation is explicit, least-privilege, and entirely Secret Manager backed", () => {
  const source = readFileSync(deployScript, "utf8");

  assert.match(
    source,
    /ENABLE_GOOGLE_DRIVE_OAUTH="\$\{ENABLE_GOOGLE_DRIVE_OAUTH:-0\}"/,
  );
  assert.match(source, /ENABLE_GOOGLE_DRIVE_OAUTH must be 0 or 1/);
  assert.match(source, /GOOGLE_DRIVE_OAUTH_CLIENT_ID_SECRET_NAME/);
  assert.match(source, /GOOGLE_DRIVE_OAUTH_TOKEN_ENCRYPTION_KEY_SECRET_NAME/);
  assert.match(source, /GOOGLE_DRIVE_PICKER_API_KEY_SECRET_NAME/);
  assert.match(source, /GOOGLE_DRIVE_PICKER_APP_ID_SECRET_NAME/);
  assert.match(
    source,
    /validate_private_secret "\$\{GOOGLE_DRIVE_OAUTH_CLIENT_ID_SECRET_NAME\}" "oauth-client-id"/,
  );
  assert.match(
    source,
    /validate_private_secret "\$\{GOOGLE_DRIVE_OAUTH_TOKEN_ENCRYPTION_KEY_SECRET_NAME\}" "encryption-key"/,
  );
  assert.match(
    source,
    /Google Drive OAuth and Picker secrets passed enabled-version and private shape validation/,
  );
  assert.doesNotMatch(source, /GOOGLE_DRIVE_OAUTH_CLIENT_SECRET=[^$]/);
});

test("preview deploy declares provider secrets while keeping optional egress default-off", () => {
  const source = readFileSync(deployScript, "utf8");

  assert.match(
    source,
    /ENABLE_LIVEKIT_PROVIDER="\$\{ENABLE_LIVEKIT_PROVIDER:-1\}"/,
  );
  assert.match(
    source,
    /CONFIGURE_LIVEKIT_EGRESS="\$\{CONFIGURE_LIVEKIT_EGRESS:-1\}"/,
  );
  assert.match(
    source,
    /ENABLE_LIVEKIT_EGRESS="\$\{ENABLE_LIVEKIT_EGRESS:-0\}"/,
  );
  assert.match(
    source,
    /ENABLE_LIVEKIT_EGRESS=1 requires ENABLE_LIVEKIT_PROVIDER=1 and CONFIGURE_LIVEKIT_EGRESS=1/,
  );
  assert.match(
    source,
    /validate_private_secret "\$\{LIVEKIT_URL_SECRET_NAME\}" "url"/,
  );
  assert.match(
    source,
    /validate_private_secret "\$\{LIVEKIT_EGRESS_CREDENTIALS_SECRET_NAME\}" "gcp-credentials"/,
  );
  assert.match(
    source,
    /validate_private_secret "\$\{LIVEKIT_EGRESS_BUCKET_SECRET_NAME\}" "bucket"/,
  );
  assert.match(
    source,
    /LIVEKIT_EGRESS_ENABLED=\$\{livekit_egress_enabled_value\}/,
  );
  assert.match(source, /Its value was not printed/);
  assert.doesNotMatch(source, /set -x/);
});

test("account deletion activation requires a private dedicated worker and keeps Nest non-destructive", () => {
  const source = readFileSync(deployScript, "utf8");

  assert.match(source, /ENABLE_ACCOUNT_DELETION_WORKER must be 0 or 1/);
  assert.match(
    source,
    /Account deletion worker shared secret .* is missing or disabled/,
  );
  assert.match(source, /dedicated worker identity/);
  assert.match(source, /concurrency 1/);
  assert.match(source, /maximum 1 instance/);
  assert.match(source, /900-second timeout/);
  assert.match(source, /private IAM boundary/);
  assert.match(source, /Nest invoker grant/);
  assert.match(source, /Nest shared-secret access/);
  assert.match(source, /exact storage allowlist/);
  assert.match(source, /exact source identity/);
  assert.match(source, /QUIPSLY_ACCOUNT_DELETION_WORKER_ENABLED=true/);
  assert.match(source, /QUIPSLY_ACCOUNT_DELETION_EXECUTOR_ENABLED=false/);
  assert.match(source, /account_deletion_worker_secret/);
  assert.match(source, /account_deletion_worker_env_vars/);
});

test("preview deploy reuses one verified image for one committed source", () => {
  const source = readFileSync(deployScript, "utf8");

  assert.match(source, /canonical_image_tag="source-\$\{SOURCE_SHA\}"/);
  assert.match(source, /IMAGE_TAG="\$\{canonical_image_tag\}"/);
  assert.match(source, /IMAGE_TAG must equal \$\{canonical_image_tag\}/);
  assert.match(
    source,
    /Create a new commit for a distinct Nest release identity/,
  );
  assert.match(
    source,
    /gcloud artifacts docker images describe "\$\{IMAGE_URI\}"/,
  );
  assert.match(source, /Reusing exact-source Quipsly image/);
  assert.match(
    source,
    /Cloud Build skipped: this committed source already has a verified image/,
  );
  assert.match(source, /REUSE_EXISTING_IMAGE must be 0 or 1/);
  assert.match(
    source,
    /Refusing to replace an existing immutable Quipsly image tag/,
  );
  assert.match(
    source,
    /Create a new commit for a distinct Nest release identity/,
  );
  assert.match(
    source,
    /elif \[\[ "\$\{image_readback_status\}" == "0" \]\]; then[\s\S]*REUSE_EXISTING_IMAGE[\s\S]*Refusing to replace an existing immutable Quipsly image tag/,
  );
  assert.match(
    source,
    /CLOUD_BUILD_MACHINE_TYPE="\$\{CLOUD_BUILD_MACHINE_TYPE:-e2-highcpu-32\}"/,
  );
  assert.match(source, /--machine-type "\$\{CLOUD_BUILD_MACHINE_TYPE\}"/);
  assert.match(
    source,
    /MIN_CLOUD_BUILD_INTERVAL_HOURS="\$\{MIN_CLOUD_BUILD_INTERVAL_HOURS:-72\}"/,
  );
  assert.match(
    source,
    /ALLOW_EARLY_CLOUD_BUILD="\$\{ALLOW_EARLY_CLOUD_BUILD:-0\}"/,
  );
  assert.match(source, /--format='json\(createTime,status,substitutions\)'/);
  assert.match(source, /quipsly-latest-successful-build\.mjs/);
  assert.doesNotMatch(
    source,
    /--filter="status=SUCCESS AND substitutions\._IMAGE_NAME=/,
  );
  assert.match(source, /Cloud Build cadence gate/);
  assert.match(source, /For an urgent production repair only/);
  assert.match(source, /requested existing image is unavailable/);
  assert.match(
    source,
    /Could not verify the release image after the build\/reuse decision/,
  );
  assert.doesNotMatch(source, /IMAGE_TAG="\$\{IMAGE_TAG:-preview-\$\(date/);
});

test("transcript activation requires an immutable worker and exact Nest execution authority", () => {
  const source = readFileSync(deployScript, "utf8");

  assert.match(source, /ENABLE_TRANSCRIPT_WORKER must be 0 or 1/);
  assert.match(
    source,
    /Transcript worker project, region, job, identity, bucket, or secret name is unsafe/,
  );
  assert.match(
    source,
    /gcloud run jobs describe "\$\{TRANSCRIPT_WORKER_JOB\}"/,
  );
  assert.match(source, /@sha256:\[0-9a-f\]\{64\}\$/);
  assert.match(source, /roles\/run\.jobsExecutor/);
  assert.match(source, /roles\/run\.jobsExecutorWithOverrides/);
  assert.match(
    source,
    /Nest lacks the exact transcript jobsExecutor boundary or has unsafe override authority/,
  );
  assert.match(source, /Transcript provider secret .* is missing or disabled/);
  assert.match(source, /TRANSCRIPT_PROVIDER must be deepgram or google-speech-v2/);
  assert.match(source, /GOOGLE_SPEECH_MODEL=.*chirp_3/);
  assert.match(source, /QUIPSLY_TRANSCRIPT_PROVIDER=\$\{TRANSCRIPT_PROVIDER\}/);
  assert.match(source, /QUIPSLY_TRANSCRIPT_WORKER_ENABLED=1/);
  assert.match(
    source,
    /Transcript worker passed immutable job, provider identity, and Nest executor readback/,
  );
});
