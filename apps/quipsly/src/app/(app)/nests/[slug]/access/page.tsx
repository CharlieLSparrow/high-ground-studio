import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Crown,
  Eye,
  Pencil,
  ShieldCheck,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";

import { auth } from "@/auth";
import {
  PRIVATE_FICTION_ISSUE_SLUG,
  PRIVATE_FICTION_PROJECT_SLUG,
  PRIVATE_FICTION_SERIES_SLUG,
} from "@/lib/fiction/private-fiction-access";
import {
  findStudioProjectForAccess,
  listStudioProjectAccessGrants,
  normalizeAccessEmail,
  resolveStudioProjectAccess,
  roleAllowsAction,
} from "@/lib/server/studio-project-access";
import { grantNestAccessAction, revokeNestAccessAction } from "./actions";

export const dynamic = "force-dynamic";

type NestAccessPageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function roleCopy(role: string) {
  if (role === "OWNER") return "Can edit the Nest, invite collaborators, change roles, and revoke access.";
  if (role === "EDITOR") return "Can create and edit work inside the Nest. Cannot invite people or change access.";
  return "Can open and read the Nest. Cannot edit content or manage collaborators.";
}

function roleIcon(role: string) {
  if (role === "OWNER") return Crown;
  if (role === "EDITOR") return Pencil;
  return Eye;
}

function roleTone(role: string) {
  if (role === "OWNER") return "border-amber-200 bg-amber-50 text-amber-950";
  if (role === "EDITOR") return "border-sky-200 bg-sky-50 text-sky-950";
  return "border-emerald-200 bg-emerald-50 text-emerald-950";
}

function statusLabel(grant: { hasUserRecord?: boolean }) {
  return grant.hasUserRecord ? "Account connected" : "Invite staged";
}

function statusCopy(grant: { hasUserRecord?: boolean }) {
  return grant.hasUserRecord
    ? "This email has a Quipsly user record. They should see this Nest on /projects after sign-in."
    : "Access is ready. When this email signs in, Quipsly will connect the account and show this Nest on /projects.";
}

const roleCards = [
  {
    role: "OWNER",
    title: "Owner",
    description: roleCopy("OWNER"),
  },
  {
    role: "EDITOR",
    title: "Editor",
    description: roleCopy("EDITOR"),
  },
  {
    role: "VIEWER",
    title: "Viewer",
    description: roleCopy("VIEWER"),
  },
];

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function NestAccessPage({ params, searchParams }: NestAccessPageProps) {
  const { slug } = await params;
  const query = searchParams ? await searchParams : {};
  const session = await auth();
  const actorEmail = normalizeAccessEmail(session?.user?.primaryEmail || session?.user?.email);

  if (!actorEmail) {
    redirect(`/api/auth/signin?callbackUrl=/nests/${encodeURIComponent(slug)}/access`);
  }

  const access = await resolveStudioProjectAccess({
    projectSlug: slug,
    email: actorEmail,
    action: "read",
  });

  if (!access.allowed) {
    notFound();
  }
  const canManageSharing = access.role ? roleAllowsAction(access.role, "manage") : false;

  const project = await findStudioProjectForAccess(slug);
  if (!project) {
    notFound();
  }

  const grants = await listStudioProjectAccessGrants(slug);
  const activeGrants = grants.filter((grant) => grant.status === "ACTIVE");
  const revokedGrants = grants.filter((grant) => grant.status === "REVOKED");
  const openWorkHref =
    project.slug === PRIVATE_FICTION_PROJECT_SLUG
      ? `/fiction-tools/private/${PRIVATE_FICTION_SERIES_SLUG}/${PRIVATE_FICTION_ISSUE_SLUG}`
      : `/create?project=${encodeURIComponent(project.slug)}`;
  const openWorkLabel = project.slug === PRIVATE_FICTION_PROJECT_SLUG ? "Open fiction packet" : "Open document Nest";
  const accessError = firstQueryValue(query.accessError);
  const granted = firstQueryValue(query.granted);
  const revoked = firstQueryValue(query.revoked);

  return (
    <main className="min-h-full bg-[#fdfaf6] px-4 py-6 text-[#3d3122] md:px-8 md:py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 rounded-full border border-[#eadfca] bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-[#8c6b4a] shadow-sm transition hover:bg-[#fff8eb]"
        >
          <ArrowLeft size={14} />
          Back to Nests
        </Link>

        <header className="rounded-3xl border border-[#e8dcc4] bg-white/95 p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.24em] text-[#a36f2e]">
                Nest collaboration
              </div>
              <h1 className="mt-3 font-serif text-4xl font-black tracking-tight md:text-5xl">
                Share {project.name}
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-[#6b5b45] md:text-base">
                Invite collaborators by email. They do not need a Quipsly account yet; when they sign in with the same email, this Nest will appear on their /projects page with the right role already attached.
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em]">
                <ShieldCheck size={16} />
                {canManageSharing ? "You can manage" : "You have access"}
              </div>
              <p className="mt-2 text-sm leading-6 text-emerald-900">
                Your access source: {access.source}. Role: {access.role}.
              </p>
            </div>
          </div>
        </header>

        {accessError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900 shadow-sm">
            <h2 className="font-serif text-lg font-black">Access change failed</h2>
            <p className="mt-1 text-sm leading-6">{accessError}</p>
          </div>
        ) : null}

        {granted ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 shadow-sm">
            <h2 className="font-serif text-lg font-black">Invite saved</h2>
            <p className="mt-1 text-sm leading-6">
              {granted} can open this Nest after signing in with that email.
            </p>
          </div>
        ) : null}

        {revoked ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 shadow-sm">
            <h2 className="font-serif text-lg font-black">Access revoked</h2>
            <p className="mt-1 text-sm leading-6">
              {revoked} no longer has active access to this Nest.
            </p>
          </div>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-3xl border border-[#e8dcc4] bg-white p-5 shadow-sm md:p-6">
            <div className="mb-5 flex items-start gap-3">
              <div className="rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-3 text-[#8c6b4a]">
                <UserPlus size={22} />
              </div>
              <div>
                <h2 className="font-serif text-2xl font-black">Invite by email</h2>
              <p className="mt-1 text-sm leading-6 text-[#7d6a50]">
                {canManageSharing
                    ? "Type their email, choose Viewer/Editor/Owner, then grant access. They can sign in later and land on /projects with this Nest ready to open."
                    : "You can see this Nest, but only an owner can change the collaborator list."}
              </p>
              </div>
            </div>

            {canManageSharing ? (
              <form action={grantNestAccessAction} className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                <input type="hidden" name="projectSlug" value={project.slug} />
                <input
                  name="targetEmail"
                  type="email"
                  className="rounded-2xl border border-[#eadfca] bg-[#fffdf9] px-4 py-3 text-sm text-[#3d3122] shadow-sm outline-none focus:border-[#c28a37]"
                  placeholder="collaborator@example.com"
                  required
                />
                <select
                  name="role"
                  defaultValue="VIEWER"
                  className="rounded-2xl border border-[#eadfca] bg-[#fffdf9] px-4 py-3 text-sm font-bold text-[#3d3122] shadow-sm outline-none focus:border-[#c28a37]"
                >
                  <option value="VIEWER">Viewer</option>
                  <option value="EDITOR">Editor</option>
                  <option value="OWNER">Owner</option>
                </select>
                <button className="rounded-2xl bg-[#3d3122] px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-[#fffaf3] shadow-lg transition hover:-translate-y-0.5">
                  Grant access
                </button>
              </form>
            ) : (
              <div className="rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-5 text-sm leading-6 text-[#7d6a50]">
                You can keep working here, but collaborator invites are owner-only for this Nest. Ask an owner to add teammates when the project is ready to share.
              </div>
            )}
          </div>

          <aside className="rounded-3xl border border-[#e8dcc4] bg-[#fffaf3] p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-[#eadfca] bg-white p-3 text-[#8c6b4a]">
                <BookOpen size={20} />
              </div>
              <div>
                <h2 className="font-serif text-xl font-black">Open the work</h2>
                <p className="mt-1 text-xs leading-5 text-[#7d6a50]">
                  Sharing controls stay separate from the creative surface.
                </p>
              </div>
            </div>
            <Link
              href={openWorkHref}
              className="mt-5 inline-flex w-full items-center justify-center rounded-2xl border border-[#3d3122] bg-[#3d3122] px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-[#fffaf3] shadow-sm transition hover:-translate-y-0.5"
            >
              {openWorkLabel}
            </Link>
          </aside>
        </section>

        <section className="rounded-3xl border border-[#e8dcc4] bg-white p-5 shadow-sm md:p-6">
          <div className="mb-5">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-[#a36f2e]">Role guide</div>
            <h2 className="mt-2 font-serif text-2xl font-black">Plain-English permissions</h2>
            <p className="mt-1 text-sm leading-6 text-[#7d6a50]">
              Keep this boring on purpose: owners manage, editors create, viewers read.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {roleCards.map((card) => {
              const Icon = roleIcon(card.role);
              return (
                <div key={card.role} className={`rounded-2xl border p-4 ${roleTone(card.role)}`}>
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em]">
                    <Icon size={16} />
                    {card.title}
                  </div>
                  <p className="mt-3 text-sm leading-6">{card.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-[#e8dcc4] bg-white p-5 shadow-sm md:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-serif text-2xl font-black">Current collaborators</h2>
              <p className="mt-1 text-sm text-[#7d6a50]">
                Active collaborators and staged invites for this Nest.
              </p>
            </div>
            <div className="rounded-full border border-[#eadfca] bg-[#fffaf3] px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[#8c6b4a]">
              {activeGrants.length} active
            </div>
          </div>

          {activeGrants.length > 0 ? (
            <div className="grid gap-3">
              {activeGrants.map((grant) => {
                const isSelf = normalizeAccessEmail(grant.email) === actorEmail;
                const Icon = roleIcon(grant.role);
                return (
                  <div key={grant.id} className="rounded-2xl border border-[#eadfca] bg-[#fffdf9] p-4">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-bold text-[#3d3122]">{grant.email}</div>
                          {isSelf ? (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-900">
                              You
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-sm leading-6 text-[#7d6a50]">
                          {grant.userName ? `${grant.userName} · ` : ""}
                          {statusCopy(grant)}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${roleTone(grant.role)}`}>
                            <Icon size={13} />
                            {grant.role}
                          </span>
                          <span className="rounded-full border border-[#eadfca] bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#8c6b4a]">
                            {statusLabel(grant)}
                          </span>
                          <span className="rounded-full border border-[#eadfca] bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#8c6b4a]">
                            invited {formatDate(grant.createdAt)}
                          </span>
                        </div>
                        <div className="mt-3 rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-3 text-xs leading-5 text-[#7d6a50]">
                          <strong className="text-[#3d3122]">Role meaning:</strong> {roleCopy(grant.role)}
                          <br />
                          <strong className="text-[#3d3122]">Invited by:</strong> {grant.createdByEmail || "System / legacy import"}
                          {grant.note ? (
                            <>
                              <br />
                              <strong className="text-[#3d3122]">Note:</strong> {grant.note}
                            </>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 md:justify-end">
                        {canManageSharing && !isSelf ? (
                          <form action={revokeNestAccessAction}>
                            <input type="hidden" name="projectSlug" value={project.slug} />
                            <input type="hidden" name="targetEmail" value={grant.email} />
                            <button className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-rose-900 transition hover:bg-rose-100">
                              <UserMinus size={14} />
                              Revoke access
                            </button>
                          </form>
                        ) : (
                          <span className="rounded-full border border-[#eadfca] bg-[#fffaf3] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#8c6b4a]">
                            {isSelf ? "Self revoke disabled" : "Visible only"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#eadfca] bg-[#fffaf3] p-5 text-sm leading-6 text-[#7d6a50]">
              <h3 className="font-serif text-xl font-black text-[#3d3122]">No collaborators yet.</h3>
              <p className="mt-2">
                {canManageSharing
                  ? "Invite someone above to test the beta happy path: they sign in, open /projects, choose this Nest, open the document, and use Nest Chat."
                  : "You are currently the only visible collaborator on this page. An owner can add more people when this Nest becomes shared work."}
              </p>
            </div>
          )}
        </section>

        {revokedGrants.length > 0 ? (
          <section className="rounded-3xl border border-[#e8dcc4] bg-white/80 p-5 shadow-sm md:p-6">
            <div className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[#8c6b4a]">
              <Users size={14} />
              Recently revoked
            </div>
            <div className="grid gap-2">
              {revokedGrants.slice(0, 5).map((grant) => (
                <div key={grant.id} className="rounded-2xl border border-[#eadfca] bg-[#fffaf3] px-4 py-3 text-xs text-[#7d6a50]">
                  {grant.email} · {grant.role} · revoked after invite from {grant.createdByEmail || "System / legacy import"}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
