import Link from "next/link";
import {
  Activity,
  BadgeCheck,
  CalendarClock,
  CircleAlert,
  KeyRound,
  Mail,
  Search,
  ShieldCheck,
  UserRoundCheck,
  Users,
  Video,
} from "lucide-react";

import { adminAuth } from "@/lib/firebase/firebase-admin";
import { getPrismaClient } from "@/lib/prisma";
import { requireQuipslySupportActor } from "@/lib/server/user-management";

import {
  revokeSupportUserSessionsAction,
  setSupportUserActiveAction,
  setSupportUserRoleAction,
} from "./actions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

type SupportSearchParams = {
  q?: string | string[];
  page?: string | string[];
  user?: string | string[];
  result?: string | string[];
};

function one(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function readableDate(value?: Date | string | null) {
  if (!value) return "Not yet";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Denver",
  }).format(date);
}

function resultMessage(result?: string) {
  if (result === "suspended") return "Account access suspended and active Firebase sessions revoked.";
  if (result === "resumed") return "Account access resumed.";
  if (result === "sessions-revoked") return "Active Firebase sessions revoked. The customer can sign in again normally.";
  if (result === "self-suspend-blocked") return "Quipsly prevented you from suspending your own support account.";
  if (result === "already-active") return "This account was already active.";
  if (result === "already-suspended") return "This account was already suspended.";
  if (result === "no-firebase-identity") return "No Firebase credential is linked to this Quipsly person yet.";
  if (result === "not-found") return "That Quipsly user no longer exists.";
  if (result === "role-added") return "Role added. The change is active now and recorded in the support timeline.";
  if (result === "role-removed") return "Role removed. The change is active now and recorded in the support timeline.";
  if (result === "self-owner-removal-blocked") return "Quipsly prevented you from removing your own platform-owner access.";
  if (result === "last-owner-removal-blocked") return "Quipsly kept the final database-backed platform owner in place.";
  if (result === "invalid-role") return "Choose a recognized Quipsly role.";
  return null;
}

async function firebaseSummary(firebaseUid: string | null) {
  if (!firebaseUid) return { state: "not-linked" as const };
  try {
    const record = await adminAuth.getUser(firebaseUid);
    return {
      state: "linked" as const,
      uid: record.uid,
      email: record.email ?? null,
      emailVerified: record.emailVerified,
      disabled: record.disabled,
      providers: record.providerData.map((entry) => entry.providerId),
      createdAt: record.metadata.creationTime,
      lastSignInAt: record.metadata.lastSignInTime ?? null,
      tokensValidAfter: record.tokensValidAfterTime,
    };
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code || "")
      : "";
    return {
      state: code === "auth/user-not-found" ? "missing" as const : "unavailable" as const,
      code: code || "firebase-read-failed",
    };
  }
}

export default async function SupportOperationsPage({
  searchParams,
}: {
  searchParams?: Promise<SupportSearchParams>;
}) {
  const supportActor = await requireQuipslySupportActor();
  const canManageRoles = supportActor.capabilities.includes("USER_ADMIN");
  const params = searchParams ? await searchParams : {};
  const query = (one(params.q) || "").trim().slice(0, 160);
  const requestedPage = Number.parseInt(one(params.page) || "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const selectedUserId = (one(params.user) || "").trim();
  const message = resultMessage(one(params.result));
  const prisma = getPrismaClient();

  const where = query
    ? {
        OR: [
          { id: { equals: query } },
          { primaryEmail: { contains: query, mode: "insensitive" as const } },
          { name: { contains: query, mode: "insensitive" as const } },
          { aliases: { some: { email: { contains: query, mode: "insensitive" as const } } } },
          { authIdentities: { some: { emailAtLink: { contains: query, mode: "insensitive" as const } } } },
        ],
      }
    : {};

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        primaryEmail: true,
        name: true,
        isActive: true,
        firebaseUid: true,
        createdAt: true,
        updatedAt: true,
        roles: { select: { role: true } },
        aliases: { select: { email: true } },
        authIdentities: { orderBy: { lastSeenAt: "desc" }, take: 1, select: { lastSeenAt: true } },
        _count: { select: { callParticipants: true, userEvents: true, coachingEngagementMemberships: true } },
      },
    }),
  ]);

  const selectedId = selectedUserId || users[0]?.id || "";
  const selected = selectedId
    ? await prisma.user.findUnique({
        where: { id: selectedId },
        select: {
          id: true,
          primaryEmail: true,
          name: true,
          image: true,
          firebaseUid: true,
          isActive: true,
          emailVerified: true,
          welcomeCompletedAt: true,
          createdAt: true,
          updatedAt: true,
          roles: { orderBy: { role: "asc" }, select: { role: true, createdAt: true } },
          aliases: { orderBy: { email: "asc" }, select: { email: true, label: true } },
          authIdentities: {
            orderBy: { lastSeenAt: "desc" },
            select: { authority: true, subject: true, provider: true, emailAtLink: true, emailVerifiedAt: true, lastSeenAt: true },
          },
          memberships: {
            orderBy: { createdAt: "desc" },
            select: { status: true, startsAt: true, endsAt: true, plan: { select: { name: true, slug: true } } },
          },
          organizationMemberships: {
            orderBy: { createdAt: "desc" },
            select: { role: true, organization: { select: { name: true, slug: true } } },
          },
          coachProfile: {
            select: {
              slug: true,
              displayName: true,
              timezone: true,
              isActive: true,
              _count: { select: { serviceOfferings: true, availabilityWindows: true } },
            },
          },
          clientProfile: { select: { displayName: true, createdAt: true } },
          callParticipants: {
            orderBy: { updatedAt: "desc" },
            take: 12,
            select: {
              role: true,
              accessStatus: true,
              providerAccessStatus: true,
              updatedAt: true,
              room: {
                select: {
                  id: true,
                  title: true,
                  purpose: true,
                  status: true,
                  scheduledStart: true,
                  _count: { select: { recordingAssets: true, transcriptJobs: true } },
                },
              },
            },
          },
          userEvents: {
            orderBy: { createdAt: "desc" },
            take: 20,
            select: { id: true, eventName: true, createdAt: true },
          },
          accountDeletionRequests: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { status: true, requestedAt: true, completedAt: true, failedAt: true },
          },
          _count: {
            select: {
              callParticipants: true,
              coachingBookingsAsCoach: true,
              coachingBookingsAsClient: true,
              coachingEngagementMemberships: true,
              userEvents: true,
              nativeDeviceSessions: true,
            },
          },
        },
      })
    : null;

  const emails = selected
    ? [...new Set([selected.primaryEmail, ...selected.aliases.map((entry) => entry.email)].map((email) => email.toLowerCase()))]
    : [];
  const [
    firebase,
    projectGrants,
    roomInvitations,
    deliveryCounts,
    transactionalEmails,
    recipientDeliveryStates,
  ] = selected
    ? await Promise.all([
        firebaseSummary(selected.firebaseUid),
        prisma.studioProjectAccessGrant.findMany({
          where: { email: { in: emails }, status: "ACTIVE" },
          orderBy: { updatedAt: "desc" },
          select: { role: true, email: true, project: { select: { name: true, slug: true } } },
        }),
        prisma.callRoomInvitation.findMany({
          where: { email: { in: emails } },
          orderBy: { updatedAt: "desc" },
          take: 12,
          select: {
            status: true,
            email: true,
            expiresAt: true,
            acceptedAt: true,
            room: { select: { id: true, title: true, purpose: true } },
            deliveries: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, errorCode: true, completedAt: true } },
          },
        }),
        prisma.callRoomInvitationDeliveryReceipt.groupBy({
          by: ["status"],
          where: { recipientEmail: { in: emails } },
          _count: { id: true },
        }),
        prisma.transactionalEmail.findMany({
          where: { recipientUserId: selected.id },
          orderBy: [{ scheduledFor: "desc" }, { id: "desc" }],
          take: 12,
          select: {
            id: true,
            kind: true,
            status: true,
            scheduledFor: true,
            sentAt: true,
            errorCode: true,
            errorMessage: true,
            room: { select: { id: true, title: true } },
          },
        }),
        prisma.emailRecipientDeliveryState.findMany({
          where: { recipientEmail: { in: emails } },
          orderBy: { updatedAt: "desc" },
          select: { recipientEmail: true, status: true, reasonCode: true, reasonMessage: true, lastEventAt: true },
        }),
      ])
    : [{ state: "not-linked" as const }, [], [], [], [], []];

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const nextPage = new URLSearchParams({ ...(query ? { q: query } : {}), page: String(Math.min(pages, page + 1)) });
  const previousPage = new URLSearchParams({ ...(query ? { q: query } : {}), page: String(Math.max(1, page - 1)) });

  return (
    <main className="min-h-full bg-[#f5efe5] px-4 py-6 text-[#2e251d] md:px-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="flex flex-col gap-4 rounded-3xl border border-[#ddcfba] bg-white p-6 shadow-sm lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#8f5e2c]">Quipsly support operations</p>
            <h1 className="mt-2 font-serif text-4xl font-black">Find the person. See the system.</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#66594a]">
              Identity, access, entitlements, calls, invitations, and workflow health in one support surface. Customer content stays out of this view.
            </p>
          </div>
          <nav className="flex flex-wrap gap-2 text-sm font-black">
            {supportActor.capabilities.includes("PRODUCT_ANALYTICS") ? <Link href="/admin/product-ops" className="rounded-full border border-[#d5c3aa] px-4 py-2">Product operations</Link> : null}
            {canManageRoles ? <Link href="/admin/users" className="rounded-full border border-[#d5c3aa] px-4 py-2">Provisioning</Link> : null}
            <Link href="/admin/auth-diagnostics" className="rounded-full border border-[#d5c3aa] px-4 py-2">Auth health</Link>
            {canManageRoles ? <Link href="/admin/account-deletion" className="rounded-full border border-[#d5c3aa] px-4 py-2">Deletion</Link> : null}
          </nav>
        </header>

        {message ? <div role="status" className="rounded-2xl border border-emerald-300 bg-emerald-50 px-5 py-4 text-sm font-bold text-emerald-950">{message}</div> : null}

        <section className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
          <aside className="rounded-3xl border border-[#ddcfba] bg-white p-4 shadow-sm">
            <form className="flex gap-2" action="/admin/support">
              <label className="sr-only" htmlFor="support-search">Search people</label>
              <input id="support-search" name="q" defaultValue={query} placeholder="Email, name, user ID" className="min-w-0 flex-1 rounded-xl border border-[#d5c3aa] px-4 py-3 text-sm outline-none focus:border-[#7e4f24]" />
              <button className="grid min-h-11 min-w-11 place-items-center rounded-xl bg-[#3d2f24] text-white" aria-label="Search"><Search size={18} /></button>
            </form>
            <div className="mt-4 flex items-center justify-between text-xs font-bold text-[#766757]">
              <span>{total} person{total === 1 ? "" : "s"}</span><span>Page {page} of {pages}</span>
            </div>
            <div className="mt-3 grid gap-2">
              {users.map((user) => {
                const href = `/admin/support?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(page), user: user.id }).toString()}`;
                const active = user.id === selected?.id;
                return (
                  <Link key={user.id} href={href} className={`rounded-2xl border p-4 transition ${active ? "border-[#7e4f24] bg-[#fff4e8]" : "border-[#eadfce] hover:border-[#c9ac87]"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><div className="truncate font-black">{user.name || "Name not set"}</div><div className="mt-1 truncate text-xs text-[#6f6254]">{user.primaryEmail}</div></div>
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${user.isActive ? "bg-emerald-500" : "bg-rose-500"}`} aria-label={user.isActive ? "Active" : "Suspended"} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1 text-[10px] font-black uppercase tracking-wide text-[#796956]">
                      {user.roles.map((role) => <span key={role.role} className="rounded bg-[#efe6d8] px-2 py-1">{role.role}</span>)}
                      {!user.roles.length ? <span>No app role</span> : null}
                    </div>
                    <div className="mt-3 text-[11px] text-[#887967]">Last identity use: {readableDate(user.authIdentities[0]?.lastSeenAt)}</div>
                  </Link>
                );
              })}
              {!users.length ? <div className="rounded-2xl border border-dashed border-[#d5c3aa] p-8 text-center text-sm text-[#766757]">No people match that search.</div> : null}
            </div>
            <div className="mt-4 flex justify-between gap-2 text-xs font-black">
              <Link aria-disabled={page <= 1} href={page <= 1 ? "#" : `/admin/support?${previousPage}`} className={`rounded-full border px-4 py-2 ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}>Previous</Link>
              <Link aria-disabled={page >= pages} href={page >= pages ? "#" : `/admin/support?${nextPage}`} className={`rounded-full border px-4 py-2 ${page >= pages ? "pointer-events-none opacity-40" : ""}`}>Next</Link>
            </div>
          </aside>

          {selected ? (
            <div className="space-y-5">
              <section className="rounded-3xl border border-[#ddcfba] bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2"><UserRoundCheck className="text-[#8f5e2c]" /><h2 className="font-serif text-3xl font-black">{selected.name || "Name not set"}</h2></div>
                    <p className="mt-2 font-semibold">{selected.primaryEmail}</p>
                    <p className="mt-1 font-mono text-xs text-[#766757]">{selected.id}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <form action={revokeSupportUserSessionsAction}><input type="hidden" name="userId" value={selected.id} /><button className="min-h-11 rounded-full border border-[#cbb89e] px-4 text-xs font-black">Revoke login sessions</button></form>
                    <form action={setSupportUserActiveAction}>
                      <input type="hidden" name="userId" value={selected.id} /><input type="hidden" name="active" value={selected.isActive ? "false" : "true"} />
                      <button className={`min-h-11 rounded-full px-4 text-xs font-black text-white ${selected.isActive ? "bg-rose-700" : "bg-emerald-700"}`}>{selected.isActive ? "Suspend access" : "Resume access"}</button>
                    </form>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <StatusCard icon={ShieldCheck} label="App account" value={selected.isActive ? "Active" : "Suspended"} tone={selected.isActive ? "good" : "bad"} />
                  <StatusCard icon={KeyRound} label="Firebase" value={firebase.state === "linked" ? (firebase.disabled ? "Disabled" : "Active") : firebase.state === "missing" ? "Identity missing" : firebase.state === "unavailable" ? "Read unavailable" : "Not linked"} tone={firebase.state === "linked" && !firebase.disabled ? "good" : "warn"} />
                  <StatusCard icon={Video} label="Calls" value={String(selected._count.callParticipants)} detail={`${selected._count.coachingBookingsAsCoach} as coach · ${selected._count.coachingBookingsAsClient} as client`} />
                  <StatusCard icon={Activity} label="Events" value={String(selected._count.userEvents)} detail={`${selected._count.nativeDeviceSessions} native device session(s)`} />
                </div>
              </section>

              <section className="grid gap-5 lg:grid-cols-2">
                <Panel icon={KeyRound} title="Identity and sign-in">
                  <Fact label="Primary email" value={selected.primaryEmail} />
                  <Fact label="Quipsly email verified" value={readableDate(selected.emailVerified)} />
                  <Fact label="Welcome completed" value={readableDate(selected.welcomeCompletedAt)} />
                  {firebase.state === "linked" ? <>
                    <Fact label="Firebase UID" value={firebase.uid} mono />
                    <Fact label="Firebase email" value={firebase.email || "Not set"} />
                    <Fact label="Providers" value={firebase.providers.join(", ") || "None"} />
                    <Fact label="Last Firebase sign-in" value={firebase.lastSignInAt || "Not yet"} />
                    <Fact label="Firebase email verified" value={firebase.emailVerified ? "Yes" : "No"} />
                  </> : <Fact label="Firebase read" value={firebase.state} />}
                  {selected.aliases.map((alias) => <Fact key={alias.email} label={`Alias${alias.label ? ` · ${alias.label}` : ""}`} value={alias.email} />)}
                  {selected.authIdentities.map((identity) => <div key={`${identity.authority}:${identity.subject}`} className="rounded-xl border border-[#eadfce] p-3 text-xs"><div className="font-black">{identity.provider || identity.authority}</div><div className="mt-1 break-all text-[#6f6254]">{identity.emailAtLink || "No email claim"}</div><div className="mt-1 text-[#887967]">Last used {readableDate(identity.lastSeenAt)}</div></div>)}
                </Panel>

                <Panel icon={BadgeCheck} title="Roles and entitlements">
                  <Fact label="App roles" value={selected.roles.map((role) => role.role).join(", ") || "None"} />
                  {canManageRoles ? (
                    <div className="rounded-xl border border-[#eadfce] p-3">
                      <div className="text-xs font-black text-[#746554]">Platform and product roles</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {([
                          ["OWNER", "Platform owner"],
                          ["SUPPORT_AGENT", "Support agent"],
                          ["PRODUCT_ANALYST", "Product analyst"],
                          ["TEAM_SCHEDULER", "Team scheduler"],
                          ["COACH", "Coach"],
                          ["CLIENT", "Client"],
                          ["NETWORK_PASS", "Network pass"],
                        ] as const).map(([role, label]) => {
                          const enabled = selected.roles.some((entry) => entry.role === role);
                          return (
                            <form action={setSupportUserRoleAction} key={role}>
                              <input type="hidden" name="userId" value={selected.id} />
                              <input type="hidden" name="role" value={role} />
                              <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
                              <button
                                className={`min-h-10 rounded-full border px-3 text-[11px] font-black ${enabled ? "border-emerald-300 bg-emerald-50 text-emerald-950" : "border-[#d8c8b2] bg-[#faf7f1] text-[#655746]"}`}
                                title={enabled ? `Remove ${label}` : `Add ${label}`}
                              >
                                {enabled ? `Remove ${label}` : `Add ${label}`}
                              </button>
                            </form>
                          );
                        })}
                      </div>
                      <p className="mt-3 text-xs leading-5 text-[#766757]">Support and analytics roles open only their back-office tools. Coach and client roles control product entry. Nest access remains separate.</p>
                    </div>
                  ) : null}
                  <Fact label="Organization access" value={selected.organizationMemberships.map((membership) => `${membership.organization.name} · ${membership.role}`).join("; ") || "None"} />
                  <Fact label="Memberships" value={selected.memberships.map((membership) => `${membership.plan.name} · ${membership.status}`).join("; ") || "None"} />
                  <Fact label="Nest/project grants" value={projectGrants.map((grant) => `${grant.project.name} · ${grant.role}`).join("; ") || "None"} />
                  <Fact label="Coaching relationships" value={String(selected._count.coachingEngagementMemberships)} />
                  {selected.coachProfile ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950"><div className="font-black">Coach profile · {selected.coachProfile.isActive ? "active" : "inactive"}</div><div className="mt-1">/{selected.coachProfile.slug || "slug-not-set"} · {selected.coachProfile.timezone}</div><div className="mt-1">{selected.coachProfile._count.serviceOfferings} offering(s) · {selected.coachProfile._count.availabilityWindows} availability window(s)</div></div> : null}
                </Panel>
              </section>

              <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
                <Panel icon={CalendarClock} title="Recent sessions">
                  {selected.callParticipants.map((participant) => <Link href={`/sessions/${participant.room.id}`} key={`${participant.room.id}:${participant.role}`} className="block rounded-xl border border-[#eadfce] p-3 transition hover:border-[#b99267]"><div className="flex items-center justify-between gap-2"><span className="font-black">{participant.room.title || "Untitled session"}</span><span className="text-[10px] font-black uppercase">{participant.room.status}</span></div><div className="mt-1 text-xs text-[#6f6254]">{participant.room.purpose} · {participant.role} · {readableDate(participant.room.scheduledStart)}</div><div className="mt-1 text-xs text-[#887967]">{participant.room._count.recordingAssets} recording(s) · {participant.room._count.transcriptJobs} transcript job(s)</div></Link>)}
                  {!selected.callParticipants.length ? <Empty>No call participation yet.</Empty> : null}
                </Panel>
                <Panel icon={Mail} title="Invites and email">
                  <Fact label="Delivery totals" value={deliveryCounts.map((entry) => `${entry.status}: ${entry._count.id}`).join(" · ") || "No email attempts"} />
                  {recipientDeliveryStates.map((state) => <div key={state.recipientEmail} className={`rounded-xl border p-3 text-xs ${state.status === "DELIVERABLE" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-rose-200 bg-rose-50 text-rose-950"}`}><div className="flex justify-between gap-2"><span className="font-black">{state.recipientEmail}</span><span className="font-black">{state.status}</span></div><div className="mt-1">Last provider evidence {readableDate(state.lastEventAt)}{state.reasonCode ? ` · ${state.reasonCode}` : ""}</div>{state.reasonMessage ? <div className="mt-1">{state.reasonMessage}</div> : null}</div>)}
                  {transactionalEmails.map((email) => <Link href={`/sessions/${email.room.id}`} key={email.id} className={`rounded-xl border p-3 text-xs ${["FAILED", "BOUNCED", "COMPLAINED", "SUPPRESSED"].includes(email.status) ? "border-rose-200 bg-rose-50 text-rose-950" : "border-[#eadfce]"}`}><div className="flex justify-between gap-2"><span className="font-black">{email.room.title || "Session message"}</span><span className="font-black">{email.status}</span></div><div className="mt-1 text-[#6f6254]">{email.kind.replaceAll("_", " ")} · scheduled {readableDate(email.scheduledFor)}</div>{email.errorCode ? <div className="mt-1">{email.errorCode}{email.errorMessage ? ` · ${email.errorMessage}` : ""}</div> : null}</Link>)}
                  {roomInvitations.map((invitation) => <div key={`${invitation.room.id}:${invitation.email}`} className="rounded-xl border border-[#eadfce] p-3 text-xs"><div className="flex justify-between gap-2"><span className="font-black">{invitation.room.title || "Session invite"}</span><span className="font-black">{invitation.status}</span></div><div className="mt-1 text-[#6f6254]">{invitation.email}</div><div className="mt-1 text-[#887967]">Email: {invitation.deliveries[0]?.status || "not attempted"}{invitation.deliveries[0]?.errorCode ? ` · ${invitation.deliveries[0].errorCode}` : ""}</div></div>)}
                  {!roomInvitations.length && !transactionalEmails.length ? <Empty>No Session email found.</Empty> : null}
                </Panel>
              </section>

              <Panel icon={Activity} title="Recent support and product timeline">
                <div className="grid gap-2 md:grid-cols-2">
                  {selected.userEvents.map((event) => <div key={event.id} className="rounded-xl border border-[#eadfce] px-3 py-2 text-xs"><div className="font-black">{event.eventName}</div><div className="mt-1 text-[#887967]">{readableDate(event.createdAt)}</div></div>)}
                </div>
                {!selected.userEvents.length ? <Empty>No events have been recorded.</Empty> : null}
                {selected.accountDeletionRequests[0] ? <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-950"><strong>Deletion request:</strong> {selected.accountDeletionRequests[0].status} · requested {readableDate(selected.accountDeletionRequests[0].requestedAt)}</div> : null}
              </Panel>
            </div>
          ) : <div className="grid min-h-[520px] place-items-center rounded-3xl border border-dashed border-[#d5c3aa] bg-white p-8 text-center text-[#766757]"><div><Users className="mx-auto h-10 w-10" /><p className="mt-3 font-black">Choose a person to inspect.</p></div></div>}
        </section>
      </div>
    </main>
  );
}

function StatusCard({ icon: Icon, label, value, detail, tone = "neutral" }: { icon: typeof CircleAlert; label: string; value: string; detail?: string; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const tones = { neutral: "border-[#e2d6c5] bg-[#faf7f1]", good: "border-emerald-200 bg-emerald-50", warn: "border-amber-200 bg-amber-50", bad: "border-rose-200 bg-rose-50" };
  return <article className={`rounded-2xl border p-4 ${tones[tone]}`}><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-[#746554]"><Icon size={14} />{label}</div><div className="mt-2 text-lg font-black">{value}</div>{detail ? <div className="mt-1 text-xs text-[#766757]">{detail}</div> : null}</article>;
}

function Panel({ icon: Icon, title, children }: { icon: typeof CircleAlert; title: string; children: React.ReactNode }) {
  return <section className="rounded-3xl border border-[#ddcfba] bg-white p-5 shadow-sm"><h3 className="flex items-center gap-2 font-serif text-xl font-black"><Icon size={19} className="text-[#8f5e2c]" />{title}</h3><div className="mt-4 grid gap-3">{children}</div></section>;
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="grid gap-1 rounded-xl border border-[#eadfce] p-3 text-xs sm:grid-cols-[150px_minmax(0,1fr)]"><span className="font-black text-[#746554]">{label}</span><span className={`break-all ${mono ? "font-mono" : "font-semibold"}`}>{value}</span></div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-[#d5c3aa] p-5 text-center text-sm text-[#766757]">{children}</div>;
}
