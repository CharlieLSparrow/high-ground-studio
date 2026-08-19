import { headers } from "next/headers";
import { ShieldCheck, UserRoundPlus, Users, FileText, UserMinus, RefreshCw, Search, Link2 } from "lucide-react";

import {
  listActiveProjectInvites,
  listManagedProjects,
  listManagedUsers,
  listConfiguredUserManagementEmails,
  requireQuipslyAdminActor,
} from "@/lib/server/user-management";
import {
  grantProjectAccessFromAdminAction,
  provisionCoachCohortAction,
  repairManagedUserStarterStateAction,
  revokeProjectAccessFromAdminAction,
  upsertManagedUserAction,
} from "./actions";
import { CopyInviteLinkButton } from "./CopyInviteLinkButton";

export const dynamic = "force-dynamic";

type PageSearchParams = {
  created?: string;
  updated?: string;
  invited?: string;
  repaired?: string;
  revoked?: string;
  role?: string;
  error?: string;
  actor?: string;
  firebaseLogin?: string;
  starter?: string;
  callbackPath?: string;
  inviteToken?: string;
  homeNest?: string;
  cohortReady?: string;
  cohortCreated?: string;
  cohortUpdated?: string;
};

function valueFromQuery(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function splitInviteValue(value?: string) {
  const [email, projectSlug] = String(value || "").split("::");
  return {
    email: email || "",
    projectSlug: projectSlug || "",
  };
}

function roleTone(role: string) {
  if (role === "OWNER") return "border-amber-200 bg-amber-50 text-amber-950";
  if (role === "EDITOR") return "border-sky-200 bg-sky-50 text-sky-950";
  return "border-emerald-200 bg-emerald-50 text-emerald-950";
}

function inviteStatus(invite: { userName: string | null; userImage: string | null; status?: string }) {
  if (invite.status === "pending") return "Pending sign-in";
  if (invite.status === "accepted") return "Invite accepted";
  if (invite.status === "active-grant") return "Access active";
  if (invite.userName || invite.userImage) return "Account connected";
  return "Ready for first sign-in";
}

export default async function UserManagementPage({
  searchParams,
}: {
  searchParams?: Promise<PageSearchParams>;
}) {
  const adminActor = await requireQuipslyAdminActor();

  const query = searchParams ? await searchParams : {};
  const [users, projects, invites, configuredAdmins] = await Promise.all([
    listManagedUsers(),
    listManagedProjects(),
    listActiveProjectInvites(),
    Promise.resolve(listConfiguredUserManagementEmails()),
  ]);

  const created = valueFromQuery(query.created);
  const updated = valueFromQuery(query.updated);
  const invited = valueFromQuery(query.invited);
  const repaired = valueFromQuery(query.repaired);
  const revoked = valueFromQuery(query.revoked);
  const invitedRole = valueFromQuery(query.role);
  const actor = valueFromQuery(query.actor);
  const firebaseLogin = valueFromQuery(query.firebaseLogin);
  const starter = valueFromQuery(query.starter);
  const repairedHomeNest = valueFromQuery(query.homeNest);
  const error = valueFromQuery(query.error);
  const cohortReady = Number(valueFromQuery(query.cohortReady) || 0);
  const cohortCreated = Number(valueFromQuery(query.cohortCreated) || 0);
  const cohortUpdated = Number(valueFromQuery(query.cohortUpdated) || 0);
  const callbackPath = valueFromQuery(query.callbackPath);
  const inviteToken = valueFromQuery(query.inviteToken);
  const { email: invitedEmail, projectSlug: invitedProjectSlug } = splitInviteValue(invited);
  const { email: revokedEmail, projectSlug: revokedProjectSlug } = splitInviteValue(revoked);
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "nest.quipsly.com";
  const protocol = requestHeaders.get("x-forwarded-proto") || "https";
  const origin = `${protocol}://${host}`;
  const inviteLink = `${origin}/login?callbackUrl=${encodeURIComponent("/projects")}`;
  const coachCohortSignInLink = `${origin}/login?callbackUrl=${encodeURIComponent("/coaching")}`;
  const safeCallbackPath = callbackPath?.startsWith("/") && !callbackPath.startsWith("//") ? callbackPath : "";
  const successInviteLink = inviteToken
    ? `${origin}/login?callbackUrl=${encodeURIComponent(safeCallbackPath || "/projects")}&inviteToken=${encodeURIComponent(inviteToken)}`
    : `${origin}/login?callbackUrl=${encodeURIComponent(safeCallbackPath || "/projects")}`;
  const defaultRemoteEditorProjectSlug = "high-ground-odyssey-manuscript";
  const defaultRemoteEditorEpisodeSlug = "episode-4";
  const defaultRemoteEditorPath = `/editor?project=${encodeURIComponent(defaultRemoteEditorProjectSlug)}&episode=${encodeURIComponent(defaultRemoteEditorEpisodeSlug)}`;
  const accountSwitchPath = `/account/switch?callbackUrl=${encodeURIComponent("/admin/users")}`;

  return (
      <main className="min-h-full bg-[#fdfaf6] px-4 py-6 text-[#3d3122] md:px-8 md:py-10">
        <div className="mx-auto max-w-7xl space-y-6">
          <header className="rounded-3xl border border-[#e8dcc4] bg-white/95 p-6 shadow-sm md:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.22em] text-[#a36f2e]">
                  Quipsly Admin Management
                </div>
                <h1 className="mt-3 font-serif text-4xl font-black tracking-tight md:text-5xl">
                  User + Invite Console
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-[#6b5b45] md:text-base">
                  Invite someone by email, give them access to a Nest, and send them one safe sign-in link. If they have
                  never used Quipsly before, we create the app-owned user record now so their first login lands cleanly.
                </p>
              </div>
              <div className="rounded-xl border border-[#eadfca] bg-[#fffaf3] px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-[#8c6b4a]">
                Configured admins: {configuredAdmins.join(", ") || "not configured"}
              </div>
            </div>
          </header>

          {error ? (
            <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900 shadow-sm">
              <h2 className="font-serif text-lg font-black">That did not save</h2>
              <p className="mt-1 text-sm leading-6">{error}</p>
              <p className="mt-2 text-xs font-bold uppercase tracking-[0.12em] text-rose-800">
                No access was changed. Adjust the form and try again.
              </p>
            </section>
          ) : null}

          {cohortReady > 0 ? (
            <section className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-violet-950 shadow-sm">
              <h2 className="font-serif text-lg font-black">Coach cohort ready</h2>
              <p className="mt-1 text-sm leading-6">
                {cohortReady} coach account{cohortReady === 1 ? " is" : "s are"} ready: {cohortCreated} created and {cohortUpdated} refreshed. Each has the COACH role, free starter state, and a Home Nest.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <CopyInviteLinkButton inviteLink={coachCohortSignInLink} />
                <code className="max-w-full overflow-x-auto rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs">{coachCohortSignInLink}</code>
              </div>
            </section>
          ) : null}

          {created ? (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 shadow-sm">
              <h2 className="font-serif text-lg font-black">User record ready</h2>
              <p className="mt-1 text-sm leading-6">
                {created} now has an app-owned Quipsly user record. You can grant Nest access below.
                {starter === "ready" ? " Free starter access and Home Nest are ready." : ""}
              </p>
            </section>
          ) : null}

          {updated ? (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 shadow-sm">
              <h2 className="font-serif text-lg font-black">User record updated</h2>
              <p className="mt-1 text-sm leading-6">
                {updated} is current{actor ? `; last touched by ${actor}` : ""}.
                {firebaseLogin ? ` Firebase login ${firebaseLogin}.` : ""}
                {starter === "ready" ? " Free starter access and Home Nest are ready." : ""}
              </p>
            </section>
          ) : null}

          {invited ? (
            <section className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-900 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-serif text-lg font-black">Nest invite ready</h2>
                  <p className="mt-1 text-sm leading-6">
                    {invitedEmail} can now open {invitedProjectSlug || "the selected Nest"}
                    {invitedRole ? ` as ${invitedRole.toLowerCase()}` : ""}. Send them the sign-in link and they should land on
                    their `/projects` page with this Nest visible.
                  </p>
                </div>
                <CopyInviteLinkButton inviteLink={successInviteLink} />
              </div>
            </section>
          ) : null}

          {repaired ? (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 shadow-sm">
              <h2 className="font-serif text-lg font-black">Starter state repaired</h2>
              <p className="mt-1 text-sm leading-6">
                {repaired} now has free starter access and Home Nest
                {repairedHomeNest ? ` ${repairedHomeNest}` : ""} ready.
              </p>
            </section>
          ) : null}

          <section className="rounded-3xl border border-sky-200 bg-sky-50/80 p-5 text-sky-950 shadow-sm md:p-6">
            <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.22em] text-sky-800">
                  Remote episode editor handoff
                </div>
                <h2 className="mt-2 font-serif text-3xl font-black">Invite Mako or another editor to this cut</h2>
                <p className="mt-2 text-sm leading-6 text-sky-900/80">
                  This creates the app-owned user record if needed, grants Nest access, and gives you a direct sign-in link
                  that lands them in the episode editor. The Mac app can then use Episode Sync to check collaborators,
                  assets, local cache state, and edit focus.
                </p>
                <div className="mt-4 rounded-2xl border border-sky-200 bg-white/80 p-4 text-sm leading-6">
                  <div className="font-black uppercase tracking-[0.14em] text-sky-900">Suggested role</div>
                  <p className="mt-1 text-sky-900/75">
                    Use <strong>Editor</strong> for Mako so she can save timeline changes. Use Viewer only for people reviewing.
                  </p>
                </div>
              </div>

              <form action={grantProjectAccessFromAdminAction} className="grid gap-3 rounded-3xl border border-sky-200 bg-white p-4 shadow-sm">
                <input
                  name="targetEmail"
                  type="email"
                  required
                  className="rounded-2xl border border-sky-200 bg-[#fffdf9] px-4 py-3 text-sm text-[#3d3122] shadow-sm outline-none focus:border-sky-500"
                  placeholder="mako@example.com"
                />
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    name="projectSlug"
                    required
                    defaultValue={defaultRemoteEditorProjectSlug}
                    className="rounded-2xl border border-sky-200 bg-[#fffdf9] px-4 py-3 text-sm text-[#3d3122] shadow-sm outline-none focus:border-sky-500"
                    placeholder="Nest/project slug"
                  />
                  <input
                    name="episodeSlug"
                    defaultValue={defaultRemoteEditorEpisodeSlug}
                    className="rounded-2xl border border-sky-200 bg-[#fffdf9] px-4 py-3 text-sm text-[#3d3122] shadow-sm outline-none focus:border-sky-500"
                    placeholder="episode slug"
                  />
                </div>
                <input type="hidden" name="handoffKind" value="episode-editor" />
                <div className="grid gap-3 md:grid-cols-2">
                  <select
                    name="role"
                    defaultValue="EDITOR"
                    className="rounded-2xl border border-sky-200 bg-[#fffdf9] px-4 py-3 text-sm font-bold text-[#3d3122] shadow-sm outline-none focus:border-sky-500"
                  >
                    <option value="EDITOR">Editor</option>
                    <option value="VIEWER">Viewer</option>
                    <option value="OWNER">Owner</option>
                  </select>
                  <input
                    name="note"
                    type="text"
                    defaultValue="Remote Mac episode editing handoff"
                    className="rounded-2xl border border-sky-200 bg-[#fffdf9] px-4 py-3 text-sm text-[#3d3122] shadow-sm outline-none focus:border-sky-500"
                  />
                </div>
                <button className="rounded-2xl bg-sky-900 px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-white shadow-lg transition hover:-translate-y-0.5">
                  Create remote editor invite
                </button>
                <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs leading-5 text-sky-900">
                  Direct editor path: <code>{defaultRemoteEditorPath}</code>
                </div>
              </form>
            </div>
          </section>

          {revoked ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 shadow-sm">
              <h2 className="font-serif text-lg font-black">Nest access revoked</h2>
              <p className="mt-1 text-sm leading-6">
                {revokedEmail} no longer has active access to {revokedProjectSlug || "that Nest"}.
              </p>
            </section>
          ) : null}

          <section className="rounded-3xl border border-[#d7ead7] bg-[#f4fbf3] p-5 text-[#24402b] shadow-sm md:p-6">
            <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr_1fr]">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.22em] text-[#4b7c51]">
                  Auth flight deck
                </div>
                <h2 className="mt-2 font-serif text-2xl font-black">You are operating as {adminActor.email}</h2>
                <p className="mt-2 text-sm leading-6 text-[#48634d]">
                  Firebase proves sign-in. Quipsly/Postgres owns app users, Home Nests, roles, grants, and free starter state.
                  This panel is the safe place to manage those app-owned records.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-[#bdd9bf] bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#4b7c51]">
                    Admin session active
                  </span>
                  <span className="rounded-full border border-[#bdd9bf] bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#4b7c51]">
                    User id {adminActor.userId ? adminActor.userId.slice(0, 8) : "not linked"}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-[#bdd9bf] bg-white/80 p-4">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-[#4b7c51]">
                  Switch or verify accounts
                </div>
                <p className="mt-2 text-sm leading-6 text-[#48634d]">
                  Use this before testing an invitee, a collaborator, or a generated smoke user. No impersonation; each test uses a real Firebase session.
                </p>
                <a
                  href={accountSwitchPath}
                  className="mt-3 inline-flex rounded-full bg-[#24402b] px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white shadow-sm transition hover:-translate-y-0.5"
                >
                  Open account switcher
                </a>
              </div>

              <div className="rounded-2xl border border-[#bdd9bf] bg-white/80 p-4">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-[#4b7c51]">
                  Diagnostics and agent proof
                </div>
                <p className="mt-2 text-sm leading-6 text-[#48634d]">
                  Use diagnostics for redacted Firebase/Admin health, then use generated smoke users for Codex-safe repeatable testing.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href="/admin/auth-diagnostics"
                    className="inline-flex rounded-full border border-[#bdd9bf] bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-[#24402b] shadow-sm transition hover:-translate-y-0.5"
                  >
                    Auth diagnostics
                  </a>
                  <code className="rounded-full border border-[#bdd9bf] bg-[#f7fff5] px-3 py-2 text-[10px] font-bold text-[#48634d]">
                    generated smokes auto-clean
                  </code>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-violet-200 bg-violet-50 p-5 text-violet-950 shadow-sm md:p-6">
            <div className="grid gap-5 lg:grid-cols-[1.05fr_1fr]">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.22em] text-violet-700">Coach cohort onboarding</div>
                <h2 className="mt-2 font-serif text-3xl font-black">Prepare up to 100 coaches before sending one link</h2>
                <p className="mt-3 text-sm leading-6 text-violet-900">
                  This is the real cohort path, not a test-user shortcut. Quipsly creates or repairs each app-owned user, assigns the COACH role, and prepares free starter state plus a private Home Nest. Coaches then sign in with Google or their own Quipsly email—no shared password and no staff intervention after entry.
                </p>
                <div className="mt-4 rounded-2xl border border-violet-200 bg-white/80 p-4 text-xs leading-5 text-violet-900">
                  One row per person: <code>coach@example.com,Coach Name</code>. The name is optional. Quipsly validates the entire list before changing access and reports exactly how far a failed batch progressed.
                </div>
              </div>
              <form action={provisionCoachCohortAction} className="grid gap-3 rounded-3xl border border-violet-200 bg-white p-4 shadow-sm">
                <label htmlFor="coach-cohort" className="text-xs font-black uppercase tracking-[0.14em] text-violet-800">Coach emails</label>
                <textarea
                  id="coach-cohort"
                  name="coaches"
                  rows={9}
                  required
                  placeholder={"coach1@example.com,Coach One\ncoach2@example.com,Coach Two"}
                  className="w-full rounded-2xl border border-violet-200 bg-violet-50/40 px-4 py-3 font-mono text-sm outline-none focus:border-violet-600"
                />
                <button className="rounded-2xl bg-violet-900 px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-white shadow-lg transition hover:-translate-y-0.5">
                  Prepare coach cohort
                </button>
              </form>
            </div>
          </section>

          <section className="rounded-3xl border border-[#d8e5f4] bg-[#f3f8ff] p-5 text-[#1d3650] shadow-sm md:p-6">
            <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.22em] text-[#456f9c]">
                  Capture reviewer setup
                </div>
                <h2 className="mt-2 font-serif text-3xl font-black">Create the iOS test login on purpose</h2>
                <p className="mt-2 text-sm leading-6 text-[#526981]">
                  The native capture app now signs in through Firebase email/password, then asks Quipsly for app-owned
                  session truth. Use this card when you need a real reviewer, operator, or Codex-safe account with free
                  starter access and a Home Nest.
                </p>
                <div className="mt-4 grid gap-3 text-xs leading-5 text-[#526981] md:grid-cols-3">
                  <div className="rounded-2xl border border-[#c3d9ef] bg-white/80 p-3">
                    <div className="font-black uppercase tracking-[0.14em] text-[#456f9c]">1. Firebase</div>
                    <p className="mt-1">Email/password proves the person or reviewer can sign in.</p>
                  </div>
                  <div className="rounded-2xl border border-[#c3d9ef] bg-white/80 p-3">
                    <div className="font-black uppercase tracking-[0.14em] text-[#456f9c]">2. Quipsly</div>
                    <p className="mt-1">Postgres owns roles, Home Nest, free tier, and capture sessions.</p>
                  </div>
                  <div className="rounded-2xl border border-[#c3d9ef] bg-white/80 p-3">
                    <div className="font-black uppercase tracking-[0.14em] text-[#456f9c]">3. Device</div>
                    <p className="mt-1">The iOS app verifies `/api/mac/session-check` with a bearer token.</p>
                  </div>
                </div>
              </div>

              <form action={upsertManagedUserAction} className="grid gap-3 rounded-3xl border border-[#c3d9ef] bg-white p-4 shadow-sm">
                <input
                  type="email"
                  name="primaryEmail"
                  defaultValue="reviewer-capture@dev.test"
                  className="rounded-2xl border border-[#c3d9ef] bg-[#fbfdff] px-4 py-3 text-sm text-[#1d3650] shadow-sm outline-none focus:border-[#456f9c]"
                  required
                />
                <input
                  type="text"
                  name="name"
                  defaultValue="Quipsly Capture Reviewer"
                  className="rounded-2xl border border-[#c3d9ef] bg-[#fbfdff] px-4 py-3 text-sm text-[#1d3650] shadow-sm outline-none focus:border-[#456f9c]"
                />
                <select
                  name="role"
                  className="rounded-2xl border border-[#c3d9ef] bg-[#fbfdff] px-4 py-3 text-sm font-bold text-[#1d3650] shadow-sm outline-none focus:border-[#456f9c]"
                  defaultValue="CLIENT"
                >
                  <option value="CLIENT">CLIENT reviewer</option>
                  <option value="COACH">COACH operator</option>
                  <option value="TEAM_SCHEDULER">TEAM_SCHEDULER</option>
                  <option value="">No app role</option>
                </select>
                <input
                  type="password"
                  name="firebasePassword"
                  placeholder="Set temporary Firebase password"
                  className="rounded-2xl border border-[#c3d9ef] bg-[#fbfdff] px-4 py-3 text-sm text-[#1d3650] shadow-sm outline-none focus:border-[#456f9c]"
                  required
                />
                <p className="rounded-2xl border border-[#c3d9ef] bg-[#f7fbff] px-4 py-3 text-xs leading-5 text-[#526981]">
                  This creates or updates the Firebase email/password user, links the Firebase UID to the Quipsly user,
                  and repairs free starter/Home Nest state. It does not create a coaching session by itself.
                </p>
                <button className="rounded-2xl bg-[#1d3650] px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-white shadow-lg transition hover:-translate-y-0.5">
                  Create capture reviewer login
                </button>
              </form>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <article className="rounded-3xl border border-[#e8dcc4] bg-white p-5 shadow-sm md:p-6">
              <div className="mb-4 flex items-start gap-3">
                <div className="rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-3 text-[#8c6b4a]">
                  <UserRoundPlus size={24} />
                </div>
                <div>
                  <h2 className="font-serif text-2xl font-black">Create / update user</h2>
                  <p className="mt-1 text-sm leading-6 text-[#7d6a50]">
                    Add a user record now so they can be invited immediately.
                  </p>
                </div>
              </div>

              <form action={upsertManagedUserAction} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                <input
                  type="email"
                  name="primaryEmail"
                  placeholder="user@example.com"
                  className="rounded-2xl border border-[#eadfca] bg-[#fffdf9] px-4 py-3 text-sm text-[#3d3122] shadow-sm outline-none focus:border-[#c28a37]"
                  required
                />
                <input
                  type="text"
                  name="name"
                  placeholder="Display name (optional)"
                  className="rounded-2xl border border-[#eadfca] bg-[#fffdf9] px-4 py-3 text-sm text-[#3d3122] shadow-sm outline-none focus:border-[#c28a37]"
                />
                <select
                  name="role"
                  className="rounded-2xl border border-[#eadfca] bg-[#fffdf9] px-4 py-3 text-sm font-bold text-[#3d3122] shadow-sm outline-none focus:border-[#c28a37]"
                  defaultValue=""
                >
                  <option value="">App role (optional)</option>
                  <option value="OWNER">OWNER</option>
                  <option value="TEAM_SCHEDULER">TEAM_SCHEDULER</option>
                  <option value="COACH">COACH</option>
                  <option value="CLIENT">CLIENT</option>
                  <option value="NETWORK_PASS">NETWORK_PASS</option>
                </select>
                <input
                  type="password"
                  name="firebasePassword"
                  placeholder="Firebase login password (optional)"
                  className="rounded-2xl border border-[#eadfca] bg-[#fffdf9] px-4 py-3 text-sm text-[#3d3122] shadow-sm outline-none focus:border-[#c28a37] md:col-span-3"
                />
                <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-950 md:col-span-3">
                  Leave password blank for a Google/invite-only user. Enter a password only when you intentionally want an admin-created Firebase email/password login, such as a test/operator account.
                </p>
                <button className="rounded-2xl bg-[#3d3122] px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-[#fffaf3] shadow-lg transition hover:-translate-y-0.5 md:col-span-3">
                  Save user
                </button>
              </form>
            </article>

            <article className="rounded-3xl border border-[#e8dcc4] bg-white p-5 shadow-sm md:p-6">
              <div className="mb-4 flex items-start gap-3">
                <div className="rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-3 text-[#8c6b4a]">
                  <Users size={24} />
                </div>
                <div>
                  <h2 className="font-serif text-2xl font-black">Invite to a Nest</h2>
                  <p className="mt-1 text-sm leading-6 text-[#7d6a50]">
                    Invite by email. Quipsly creates the user record, grants the Nest, and gives you a safe sign-in link to send.
                  </p>
                </div>
              </div>

              <form action={grantProjectAccessFromAdminAction} className="grid gap-3 md:grid-cols-2">
                <input
                  name="targetEmail"
                  type="email"
                  required
                  className="rounded-2xl border border-[#eadfca] bg-[#fffdf9] px-4 py-3 text-sm text-[#3d3122] shadow-sm outline-none focus:border-[#c28a37]"
                  placeholder="invitee@example.com"
                />
                <label className="relative block">
                  <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#a38b6e]" />
                  <input
                    name="projectSlug"
                    required
                    list="admin-nest-picker"
                    className="w-full rounded-2xl border border-[#eadfca] bg-[#fffdf9] py-3 pl-11 pr-4 text-sm text-[#3d3122] shadow-sm outline-none focus:border-[#c28a37]"
                    placeholder="Search or paste a Nest slug"
                  />
                </label>
                <datalist id="admin-nest-picker">
                  {projects.map((project) => (
                    <option key={project.id} value={project.slug}>
                      {project.name} · {project.workspaceName}
                    </option>
                  ))}
                </datalist>
                {/*
                <select
                  name="projectSlug"
                  required
                  defaultValue=""
                  className="rounded-2xl border border-[#eadfca] bg-[#fffdf9] px-4 py-3 text-sm text-[#3d3122] shadow-sm outline-none focus:border-[#c28a37]"
                >
                  <option value="">Pick a Nest</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.slug}>
                      {project.slug} · {project.name}
                    </option>
                  ))}
                </select>
                */}
                <select
                  name="role"
                  defaultValue="VIEWER"
                  className="rounded-2xl border border-[#eadfca] bg-[#fffdf9] px-4 py-3 text-sm font-bold text-[#3d3122] shadow-sm outline-none focus:border-[#c28a37]"
                >
                  <option value="VIEWER">Viewer</option>
                  <option value="EDITOR">Editor</option>
                  <option value="OWNER">Owner</option>
                </select>
                <input
                  name="note"
                  type="text"
                  placeholder="note (optional)"
                  className="rounded-2xl border border-[#eadfca] bg-[#fffdf9] px-4 py-3 text-sm text-[#3d3122] shadow-sm outline-none focus:border-[#c28a37]"
                />
                <button className="rounded-2xl bg-[#3d3122] px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-[#fffaf3] shadow-lg transition hover:-translate-y-0.5 md:col-span-2">
                  Create invite + grant access
                </button>
              </form>

              <div className="mt-4 rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-4 text-sm leading-6 text-[#7d6a50]">
                <div className="flex items-center gap-2 font-black uppercase tracking-[0.14em] text-[#8c6b4a]">
                  <Link2 size={15} />
                  Safe invite link
                </div>
                <p className="mt-2">
                  This link signs them in and lands them on `/projects`; access comes from the email grant, not from the link itself.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <code className="max-w-full overflow-hidden text-ellipsis rounded-xl border border-[#eadfca] bg-white px-3 py-2 text-xs text-[#3d3122]">
                    {inviteLink}
                  </code>
                  <CopyInviteLinkButton inviteLink={inviteLink} />
                </div>
              </div>
            </article>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <article className="rounded-3xl border border-[#e8dcc4] bg-white p-5 shadow-sm md:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={20} className="text-[#8c6b4a]" />
                  <h2 className="font-serif text-2xl font-black">Managed users</h2>
                </div>
                <a
                  href="/admin/users"
                  className="inline-flex items-center gap-2 rounded-full border border-[#eadfca] bg-[#fffdf9] px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-[#8c6b4a]"
                >
                  <RefreshCw size={14} />
                  <span>Refresh</span>
                </a>
              </div>

              {users.length > 0 ? (
                <ul className="space-y-3">
                  {users.map((user) => (
                    <li key={user.id} className="rounded-2xl border border-[#eadfca] bg-[#fffdf9] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-serif text-lg font-black">{user.primaryEmail}</div>
                          <div className="mt-1 text-sm text-[#7d6a50]">
                            {user.name || "No display name"}
                          </div>
                          {user.aliases.length > 0 ? (
                            <div className="mt-1 text-xs text-[#8a735b]">aliases: {user.aliases.join(", ")}</div>
                          ) : null}
                        </div>
                        <div className="rounded-full border border-[#eadfca] bg-[#fffaf3] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#8c6b4a]">
                          id: {user.id.slice(0, 8)}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full border border-[#eadfca] bg-[#fffaf3] px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-[#8c6b4a]">
                          roles: {user.roles.length > 0 ? user.roles.join(", ") : "none"}
                        </span>
                        <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${
                          user.firebaseUid
                            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                            : "border-amber-200 bg-amber-50 text-amber-900"
                        }`}>
                          {user.firebaseUid ? "Firebase linked" : "No Firebase UID yet"}
                        </span>
                        <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${
                          user.hasFreeMembership
                            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                            : "border-amber-200 bg-amber-50 text-amber-900"
                        }`}>
                          {user.hasFreeMembership ? "Free tier ready" : "Free tier missing"}
                        </span>
                        <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${
                          user.homeNestSlug
                            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                            : "border-amber-200 bg-amber-50 text-amber-900"
                        }`}>
                          {user.homeNestSlug ? `Home Nest: ${user.homeNestSlug}` : "Home Nest missing"}
                        </span>
                        <span className="rounded-full border border-[#eadfca] bg-[#fffaf3] px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-[#8c6b4a]">
                          created {new Date(user.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {!user.hasFreeMembership || !user.homeNestSlug ? (
                        <form action={repairManagedUserStarterStateAction} className="mt-3">
                          <input type="hidden" name="primaryEmail" value={user.primaryEmail} />
                          <button
                            type="submit"
                            className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-emerald-900 transition hover:-translate-y-0.5"
                          >
                            Repair free tier + Home Nest
                          </button>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-2xl border border-dashed border-[#eadfca] bg-[#fffdf9] p-5 text-sm leading-6 text-[#7d6a50]">
                  No managed users yet. Save a user above to get started.
                </div>
              )}
            </article>

            <article className="rounded-3xl border border-[#e8dcc4] bg-white p-5 shadow-sm md:p-6">
              <div className="mb-4 flex items-center gap-3">
                <FileText size={20} className="text-[#8c6b4a]" />
                <h2 className="font-serif text-2xl font-black">Active Nest invites</h2>
              </div>

              {invites.length > 0 ? (
                <ul className="space-y-3">
                  {invites.map((invite) => (
                    <li
                      key={invite.id}
                      className="rounded-2xl border border-[#eadfca] bg-[#fffdf9] p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-bold text-[#3d3122]">{invite.email}</div>
                          <div className="mt-1 text-sm leading-6 text-[#7d6a50]">
                            {invite.projectName}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-[#8a735b]">
                            <span>{invite.projectSlug}</span>
                            <span>·</span>
                            <span>{invite.workspaceName}</span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${roleTone(invite.role)}`}>
                              {invite.role}
                            </span>
                            <span className="rounded-full border border-[#eadfca] bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#8c6b4a]">
                              {inviteStatus(invite)}
                            </span>
                            <span className="rounded-full border border-[#eadfca] bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#8c6b4a]">
                              invited {new Date(invite.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <CopyInviteLinkButton inviteLink={inviteLink} />
                          <form
                            action={revokeProjectAccessFromAdminAction}
                            className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-rose-900"
                          >
                            <input type="hidden" name="targetEmail" value={invite.email} />
                            <input type="hidden" name="projectSlug" value={invite.projectSlug} />
                            <button type="submit" className="flex items-center gap-2">
                              <UserMinus size={14} />
                              Revoke
                            </button>
                          </form>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-2xl border border-dashed border-[#eadfca] bg-[#fffdf9] p-5 text-sm leading-6 text-[#7d6a50]">
                  No active invites yet.
                </div>
              )}
            </article>
          </section>
        </div>
      </main>
  );
}
