import { headers } from "next/headers";
import { CheckCircle2, CircleAlert, KeyRound, Route, ShieldCheck } from "lucide-react";

import { adminAuth } from "@/lib/firebase/firebase-admin";
import { getPrismaClient } from "@/lib/prisma";
import { normalizeAccessEmail } from "@/lib/server/studio-project-access";
import { QUIPSLY_SESSION_COOKIE_NAME } from "@/lib/server/quipsly-session";
import {
  listConfiguredUserManagementEmails,
  isUserManagementBreakGlassEnabled,
  type QuipslyAdminActor,
  requireQuipslySupportActor,
} from "@/lib/server/user-management";
import { sourceLabelForNestKind } from "@/lib/studio/project-registry";

export const dynamic = "force-dynamic";

const FREE_PLAN_SLUG = "quipsly-free";

type DiagnosticRow = {
  label: string;
  ok: boolean;
  detail: string;
};

function present(name: string): DiagnosticRow {
  return {
    label: name,
    ok: Boolean(process.env[name]),
    detail: process.env[name] ? "configured" : "missing",
  };
}

function publicFirebaseRows(): DiagnosticRow[] {
  return [
    present("NEXT_PUBLIC_FIREBASE_API_KEY"),
    present("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    present("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
    present("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
    present("NEXT_PUBLIC_FIREBASE_APP_ID"),
  ];
}

function serverFirebaseRows(): DiagnosticRow[] {
  const serviceAccountPair = Boolean(process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
  const applicationDefaultPath = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);

  return [
    present("FIREBASE_PROJECT_ID"),
    {
      label: "Firebase Admin credentials",
      ok: serviceAccountPair || applicationDefaultPath || Boolean(process.env.FIREBASE_PROJECT_ID),
      detail: serviceAccountPair
        ? "service account env pair present"
        : applicationDefaultPath
          ? "application default credential path present"
          : process.env.FIREBASE_PROJECT_ID
            ? "runtime identity expected"
            : "missing project/credential signal",
    },
  ];
}

function isFirebaseAdminCredentialUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  if (record.code === "app/invalid-credential") return true;
  if (record.error_subtype === "invalid_rapt") return true;
  if (record.error_description && String(record.error_description).includes("invalid_rapt")) return true;
  if (record.message && String(record.message).includes("invalid_rapt")) return true;

  const cause = record.cause;
  return Boolean(cause && isFirebaseAdminCredentialUnavailable(cause));
}

function isExpectedFirebaseMissingUser(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  if (record.code === "auth/user-not-found") return true;

  const cause = record.cause;
  return Boolean(cause && isExpectedFirebaseMissingUser(cause));
}

async function firebaseAdminRuntimeRows(origin: string): Promise<DiagnosticRow[]> {
  try {
    await adminAuth.getUser("quipsly-firebase-admin-preflight-nonexistent-user");
    return [
      {
        label: "Firebase Admin live reachability",
        ok: true,
        detail: "Admin SDK call succeeded; unexpected sentinel user existed",
      },
      {
        label: "Public preflight endpoint",
        ok: true,
        detail: `${origin}/api/auth/firebase-admin-preflight should return structured 200/503 JSON`,
      },
    ];
  } catch (error) {
    if (isExpectedFirebaseMissingUser(error)) {
      return [
        {
          label: "Firebase Admin live reachability",
          ok: true,
          detail: "Admin SDK call reached Firebase; expected sentinel user was not found",
        },
        {
          label: "Public preflight endpoint",
          ok: true,
          detail: `${origin}/api/auth/firebase-admin-preflight should return structured 200 JSON`,
        },
      ];
    }

    if (isFirebaseAdminCredentialUnavailable(error)) {
      return [
        {
          label: "Firebase Admin live reachability",
          ok: false,
          detail: "credential unavailable; refresh ADC locally or check Cloud Run service-account Firebase permissions",
        },
        {
          label: "Public preflight endpoint",
          ok: true,
          detail: `${origin}/api/auth/firebase-admin-preflight should return structured 503 JSON`,
        },
      ];
    }

    const reason = error instanceof Error ? error.message : "unknown";
    return [
      {
        label: "Firebase Admin live reachability",
        ok: false,
        detail: `Admin SDK call failed: ${reason.slice(0, 140)}`,
      },
      {
        label: "Public preflight endpoint",
        ok: true,
        detail: `${origin}/api/auth/firebase-admin-preflight should report the same class of failure without secrets`,
      },
    ];
  }
}

function appTruthRows(input: { actor: QuipslyAdminActor; breakGlassEnabled: boolean; breakGlassEmailCount: number }): DiagnosticRow[] {
  return [
    present("DATABASE_URL"),
    present("AUTH_SECRET"),
    {
      label: "NEXTAUTH_SECRET fallback",
      ok: Boolean(process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET),
      detail: process.env.NEXTAUTH_SECRET
        ? "configured as legacy/fallback secret"
        : process.env.AUTH_SECRET
          ? "covered by AUTH_SECRET"
          : "missing",
    },
    {
      label: "Database staff authority",
      ok: input.actor.roles.some((role) => ["OWNER", "SUPPORT_AGENT", "PRODUCT_ANALYST"].includes(role)),
      detail: input.actor.roles.length ? input.actor.roles.join(", ") : "no database roles",
    },
    {
      label: "Emergency email override",
      ok: !input.breakGlassEnabled,
      detail: input.breakGlassEnabled
        ? `ACTIVE with ${input.breakGlassEmailCount} configured address(es); repair database authority and disable it`
        : "disabled; email alone cannot grant staff or content access",
    },
    {
      label: "Quipsly session cookie name",
      ok: QUIPSLY_SESSION_COOKIE_NAME === "session",
      detail: "constant imported by auth/session routes",
    },
  ];
}

async function currentActorTruthRows(actor: QuipslyAdminActor): Promise<DiagnosticRow[]> {
  const prisma = getPrismaClient();
  const normalizedEmail = normalizeAccessEmail(actor.email);
  const now = new Date();

  try {
    const [user, freePlan, homeGrant] = await Promise.all([
      prisma.user.findFirst({
        where: {
          OR: [
            ...(actor.userId ? [{ id: actor.userId }] : []),
            { primaryEmail: normalizedEmail },
            { aliases: { some: { email: normalizedEmail } } },
          ],
        },
        select: {
          id: true,
          primaryEmail: true,
          firebaseUid: true,
          memberships: {
            where: {
              status: "ACTIVE",
              OR: [{ endsAt: null }, { endsAt: { gt: now } }],
              plan: { slug: FREE_PLAN_SLUG },
            },
            select: {
              id: true,
              plan: { select: { slug: true } },
            },
          },
        },
      }),
      prisma.membershipPlan.findUnique({
        where: { slug: FREE_PLAN_SLUG },
        select: { slug: true, isActive: true },
      }),
      prisma.studioProjectAccessGrant.findFirst({
        where: {
          email: normalizedEmail,
          status: "ACTIVE",
          project: { sourceLabel: sourceLabelForNestKind("home") },
        },
        select: {
          role: true,
          project: { select: { slug: true, name: true } },
        },
      }),
    ]);

    return [
      {
        label: "App-owned User row",
        ok: Boolean(user),
        detail: user
          ? `found for ${user.primaryEmail}`
          : `missing for ${normalizedEmail || "current actor"}`,
      },
      {
        label: "Firebase UID link",
        ok: Boolean(user?.firebaseUid),
        detail: user?.firebaseUid
          ? "linked to Firebase identity"
          : "missing; current actor may not have completed Firebase session linking",
      },
      {
        label: "Free starter plan",
        ok: Boolean(freePlan?.isActive),
        detail: freePlan?.isActive
          ? `${FREE_PLAN_SLUG} configured and active`
          : `${FREE_PLAN_SLUG} missing or inactive`,
      },
      {
        label: "Free membership for actor",
        ok: Boolean(user?.memberships?.length),
        detail: user?.memberships?.length
          ? "active free membership found"
          : "active free membership missing for current actor",
      },
      {
        label: "Home Nest access grant",
        ok: Boolean(homeGrant),
        detail: homeGrant
          ? `${homeGrant.project.slug} (${homeGrant.role})`
          : "no active Home Nest grant found for current actor email",
      },
    ];
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    return [
      {
        label: "Current actor account truth",
        ok: false,
        detail: `database check failed: ${reason.slice(0, 140)}`,
      },
    ];
  }
}

function StatusPill({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${
        ok
          ? "border border-emerald-200 bg-emerald-50 text-emerald-900"
          : "border border-amber-200 bg-amber-50 text-amber-950"
      }`}
    >
      {ok ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}
      {ok ? "Ready" : "Needs check"}
    </span>
  );
}

function DiagnosticSection({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: DiagnosticRow[];
}) {
  return (
    <section className="rounded-3xl border border-[#e8dcc4] bg-white p-5 shadow-sm md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl font-black text-[#3d3122]">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-[#7d6a50]">{description}</p>
        </div>
        <StatusPill ok={rows.every((row) => row.ok)} />
      </div>
      <div className="mt-5 grid gap-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid gap-2 rounded-2xl border border-[#eadfca] bg-[#fffdf9] p-4 md:grid-cols-[1fr_auto] md:items-center"
          >
            <div>
              <div className="text-sm font-black text-[#3d3122]">{row.label}</div>
              <div className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-[#8c6b4a]">{row.detail}</div>
            </div>
            <StatusPill ok={row.ok} />
          </div>
        ))}
      </div>
    </section>
  );
}

function GoogleOAuthRedirectCallout({ origin }: { origin: string }) {
  const firebaseProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "quipsly-reef";
  const firebaseAuthDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || `${firebaseProjectId}.firebaseapp.com`;
  const requiredAuthorizedDomain = (() => {
    try {
      return new URL(origin).host;
    } catch {
      return "nest.quipsly.com";
    }
  })();
  const requiredRedirectUri = `https://${firebaseAuthDomain}/__/auth/handler`;

  return (
    <section className="rounded-3xl border border-[#f2d6a8] bg-[#fff8ea] p-5 text-[#5a3b12] shadow-sm md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-[#a36f2e]">
            <Route size={18} /> Google browser sign-in final gate
          </div>
          <h2 className="mt-3 font-serif text-2xl font-black text-[#3d3122]">One console setting can still block Google.</h2>
          <p className="mt-2 max-w-4xl text-sm leading-7 text-[#6b5b45]">
            Firebase can be healthy while Google still rejects the OAuth request. If Google shows
            <span className="mx-1 rounded-lg bg-white px-2 py-1 font-black text-[#8a2d2d]">redirect_uri_mismatch</span>,
            the web OAuth client behind the Google client ID must allow Firebase&apos;s handler URL.
          </p>
        </div>
        <StatusPill ok={false} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[#eadfca] bg-white/75 p-4">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-[#8c6b4a]">Firebase authorized domain</div>
          <p className="mt-2 text-sm leading-6 text-[#6b5b45]">
            Firebase Auth must authorize the browser host:
          </p>
          <code className="mt-3 block overflow-x-auto rounded-xl bg-[#2b2117] px-3 py-2 text-xs font-bold text-[#ffe6b0]">
            {requiredAuthorizedDomain}
          </code>
        </div>
        <div className="rounded-2xl border border-[#eadfca] bg-white/75 p-4">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-[#8c6b4a]">Google OAuth redirect URI</div>
          <p className="mt-2 text-sm leading-6 text-[#6b5b45]">
            Google Auth Platform / Clients must authorize this exact redirect URI:
          </p>
          <code className="mt-3 block overflow-x-auto rounded-xl bg-[#2b2117] px-3 py-2 text-xs font-bold text-[#ffe6b0]">
            {requiredRedirectUri}
          </code>
        </div>
      </div>

      <ol className="mt-5 grid gap-2 rounded-2xl border border-[#eadfca] bg-white/70 p-4 text-sm leading-6 text-[#6b5b45]">
        <li>
          <span className="font-black text-[#3d3122]">1.</span> Open Google Auth Platform clients for
          <code className="mx-1 rounded bg-[#fff3da] px-1 font-bold">high-ground-odyssey</code>.
        </li>
        <li>
          <span className="font-black text-[#3d3122]">2.</span> Use a browser account with project-console access.
        </li>
        <li>
          <span className="font-black text-[#3d3122]">3.</span> Edit the web OAuth client stored in
          <code className="mx-1 rounded bg-[#fff3da] px-1 font-bold">studio-google-client-id</code>.
        </li>
        <li>
          <span className="font-black text-[#3d3122]">4.</span> Add the redirect URI above, save, then retest
          <code className="mx-1 rounded bg-[#fff3da] px-1 font-bold">/login</code> with Google.
        </li>
      </ol>
    </section>
  );
}

export default async function AuthDiagnosticsPage() {
  const actor = await requireQuipslySupportActor();
  const configuredAdmins = listConfiguredUserManagementEmails();
  const breakGlassEnabled = isUserManagementBreakGlassEnabled();
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "nest.quipsly.com";
  const protocol = requestHeaders.get("x-forwarded-proto") || "https";
  const origin = `${protocol}://${host}`;
  const [actorTruthRows, firebaseRuntimeRows] = await Promise.all([
    currentActorTruthRows(actor),
    firebaseAdminRuntimeRows(origin),
  ]);

  const legacyRows: DiagnosticRow[] = [
    {
      label: "Legacy signin route",
      ok: true,
      detail: `${origin}/api/auth/signin should 303 to /login?callbackUrl=/projects`,
    },
    {
      label: "Legacy Google callback route",
      ok: true,
      detail: `${origin}/api/auth/callback/google should 303 to /login?callbackUrl=/projects`,
    },
    {
      label: "Invite links",
      ok: true,
      detail: "/login?inviteToken=qinv_... is context only; Firebase email must match the invite",
    },
  ];

  return (
    <main className="min-h-full bg-[#fdfaf6] px-4 py-6 text-[#3d3122] md:px-8 md:py-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl border border-[#e8dcc4] bg-white/95 p-6 shadow-sm md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-[#a36f2e]">
                <ShieldCheck size={18} /> Quipsly auth diagnostics
              </div>
              <h1 className="mt-3 font-serif text-4xl font-black tracking-tight md:text-5xl">
                Firebase proves identity. Quipsly decides access.
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-[#6b5b45] md:text-base">
                This page is an admin-only, redacted health surface for the Firebase-first auth cutover. It reports
                configuration presence and expected route behavior without printing secrets, cookies, tokens, passwords,
                private keys, or database URLs.
              </p>
            </div>
            <div className="rounded-2xl border border-[#eadfca] bg-[#fffaf3] px-4 py-3 text-sm leading-6 text-[#6b5b45]">
              <div className="font-black uppercase tracking-[0.14em] text-[#8c6b4a]">Current actor</div>
              <div className="mt-1 font-bold text-[#3d3122]">{actor.email}</div>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          <DiagnosticSection
            title="Firebase public client"
            description="These public web config entries let the browser start Firebase Google or email/password sign-in. Values are intentionally hidden."
            rows={publicFirebaseRows()}
          />
          <DiagnosticSection
            title="Firebase Admin server"
            description="The server must verify Firebase ID tokens and mint Quipsly session cookies. Runtime identity is preferred in production."
            rows={serverFirebaseRows()}
          />
          <DiagnosticSection
            title="Firebase Admin live proof"
            description="This makes a real, harmless Admin SDK call. Config-looking is not enough; the server has to reach Firebase."
            rows={firebaseRuntimeRows}
          />
          <DiagnosticSection
            title="Quipsly app truth"
            description="Postgres and Quipsly-owned records remain the source of users, roles, Nests, memberships, and access grants."
            rows={appTruthRows({ actor, breakGlassEnabled, breakGlassEmailCount: configuredAdmins.length })}
          />
          <DiagnosticSection
            title="Current actor onboarding truth"
            description="Read-only account proof for the signed-in admin: app user, Firebase link, free starter access, and Home Nest visibility."
            rows={actorTruthRows}
          />
          <DiagnosticSection
            title="Route traps and invite safety"
            description="Old auth endpoints should route into the Firebase login door. Invite links are helpful labels, not bearer permissions."
            rows={legacyRows}
          />
        </div>

        <GoogleOAuthRedirectCallout origin={origin} />

        <section className="rounded-3xl border border-[#d7eadc] bg-[#f2fff5] p-5 text-[#1f4b31] shadow-sm md:p-6">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-[#2f7a4e]">
            <KeyRound size={18} /> Safe smoke commands
          </div>
          <p className="mt-3 text-sm leading-7">
            Run these with credentials supplied through environment variables only. Never paste passwords or tokens into
            logs, docs, screenshots, or chat.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-2xl bg-[#10261a] p-4 text-xs leading-6 text-[#d9ffe4]"><code>{`corepack pnpm --filter quipsly exec tsc --noEmit --incremental false
scripts/dev/quipsly-local-smoke.sh
curl -i ${origin}/api/auth/firebase-admin-preflight

QUIPSLY_AUTH_SMOKE_BASE_URL=${origin} \
QUIPSLY_AUTH_SMOKE_EMAIL=<operator email> \
QUIPSLY_AUTH_SMOKE_PASSWORD=<operator password> \
node scripts/quipsly-firebase-auth-smoke.mjs

QUIPSLY_SELF_SERVE_SMOKE_BASE_URL=${origin} \
node scripts/quipsly-generated-self-serve-account-smoke.mjs`}</code></pre>
        </section>

        <section className="rounded-3xl border border-[#eadfca] bg-white p-5 shadow-sm md:p-6">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-[#8c6b4a]">
            <Route size={18} /> What this page does not prove
          </div>
          <p className="mt-3 text-sm leading-7 text-[#6b5b45]">
            This page proves redacted configuration shape and expected route contracts. It does not prove a human completed
            Google account chooser, that a specific invitee accepted a link, or that production was smoked after deploy.
            Use the smoke scripts and Chrome/browser checks for those evidence levels.
          </p>
        </section>
      </div>
    </main>
  );
}
