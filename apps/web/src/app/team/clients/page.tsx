import GlassPanel from "@/components/ui/GlassPanel";
import PageEyebrow from "@/components/ui/PageEyebrow";
import { prisma } from "@/lib/prisma";

import { createClientAction } from "./actions";

type SearchParams = Promise<{
  success?: string;
  error?: string;
}>;

function StatusMessage({
  success,
  error,
}: {
  success?: string;
  error?: string;
}) {
  if (!success && !error) {
    return null;
  }

  const isError = Boolean(error);
  const message = error ?? success ?? "";

  return (
    <div
      className={[
        "mb-6 rounded-2xl border px-4 py-3 text-sm font-medium",
        isError
          ? "border-red-400/25 bg-red-400/10 text-red-100"
          : "border-emerald-400/25 bg-emerald-400/10 text-emerald-100",
      ].join(" ")}
    >
      {message}
    </div>
  );
}

export default async function TeamClientsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { success, error } = await searchParams;

  const clientProfiles = await prisma.clientProfile.findMany({
    orderBy: [{ updatedAt: "desc" }],
    include: {
      user: {
        include: {
          aliases: {
            orderBy: [{ email: "asc" }],
          },
          roles: {
            orderBy: [{ role: "asc" }],
          },
          memberships: {
            where: {
              status: "ACTIVE",
            },
            include: {
              plan: true,
            },
            orderBy: [{ startsAt: "desc" }],
          },
          _count: {
            select: {
              clientAppointments: true,
            },
          },
        },
      },
    },
  });

  type ClientProfileItem = (typeof clientProfiles)[number];
  type AliasItem = ClientProfileItem["user"]["aliases"][number];
  type RoleItem = ClientProfileItem["user"]["roles"][number];
  type RoleLabel = RoleItem["role"];
  type AliasEmail = AliasItem["email"];

  return (
    <section className="grid gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <div>
        <GlassPanel className="p-6 text-[var(--text-light)]">
          <div className="mb-4">
            <PageEyebrow>Create Client</PageEyebrow>
          </div>

          <h2 className="m-0 text-[1.7rem] leading-tight tracking-[-0.03em] text-[var(--text-light)]">
            Pre-provision a coaching client
          </h2>

          <p className="mb-0 mt-4 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.88)]">
            This creates the internal user record before first login. When that
            exact email later signs in with Google, the account snaps into the
            existing identity instead of spawning a duplicate chaos clone.
          </p>

          <div className="mt-5 rounded-2xl border border-white/10 bg-white/6 p-4 text-[0.92rem] leading-7 text-[rgba(245,239,230,0.88)]">
            Alias emails are useful when one human uses multiple Google
            identities. That means Scott-style account confusion can eventually
            collapse into one internal website identity.
          </div>

          <form action={createClientAction} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="primaryEmail"
                className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
              >
                Primary email
              </label>
              <input
                id="primaryEmail"
                name="primaryEmail"
                type="email"
                required
                className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none placeholder:text-[rgba(245,239,230,0.4)]"
                placeholder="client@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="name"
                className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
              >
                Client name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none placeholder:text-[rgba(245,239,230,0.4)]"
                placeholder="Jane Sparrow"
              />
            </div>

            <div>
              <label
                htmlFor="aliasEmails"
                className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
              >
                Alias emails
              </label>
              <textarea
                id="aliasEmails"
                name="aliasEmails"
                rows={4}
                className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none placeholder:text-[rgba(245,239,230,0.4)]"
                placeholder={"second-email@example.com\nthird-email@example.com"}
              />
              <p className="mb-0 mt-2 text-xs leading-6 text-[rgba(245,239,230,0.65)]">
                One per line or comma separated.
              </p>
            </div>

            <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/6 px-4 py-3">
              <input
                type="checkbox"
                name="newsletterOptIn"
                className="mt-1"
              />
              <span className="text-sm leading-6 text-[rgba(245,239,230,0.9)]">
                Opt this user into the newsletter
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/6 px-4 py-3">
              <input
                type="checkbox"
                name="announcementsOptIn"
                className="mt-1"
              />
              <span className="text-sm leading-6 text-[rgba(245,239,230,0.9)]">
                Opt this user into announcements
              </span>
            </label>

            <button
              type="submit"
              className="w-full rounded-2xl border border-flare/25 bg-flare/15 px-4 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] transition hover:border-flare/40 hover:bg-flare/20"
            >
              Create client
            </button>
          </form>
        </GlassPanel>
      </div>

      <div>
        <StatusMessage success={success} error={error} />

        <GlassPanel className="p-6 text-[var(--text-light)]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <PageEyebrow>Client Directory</PageEyebrow>
              <h2 className="m-0 text-[1.7rem] leading-tight tracking-[-0.03em] text-[var(--text-light)]">
                Coaching clients
              </h2>
            </div>

            <div className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm font-semibold text-[rgba(245,239,230,0.88)]">
              {clientProfiles.length} total
            </div>
          </div>

          {clientProfiles.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/4 px-5 py-8 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.82)]">
              No clients yet. Create the first one on the left and we will
              pretend this was all perfectly organized from the beginning.
            </div>
          ) : (
            <div className="space-y-4">
              {clientProfiles.map((profile: ClientProfileItem) => {
                const user = profile.user;
                const activeMembership = user.memberships[0] ?? null;
                const aliasEmails = user.aliases.map(
                  (alias: AliasItem): AliasEmail => alias.email,
                );
                const roleLabels = user.roles.map(
                  (role: RoleItem): RoleLabel => role.role,
                );

                return (
                  <div
                    key={profile.id}
                    className="rounded-[24px] border border-white/10 bg-white/6 p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h3 className="m-0 text-[1.15rem] font-bold text-[var(--text-light)]">
                          {profile.displayName || user.name || user.primaryEmail}
                        </h3>

                        <p className="mb-0 mt-2 text-[0.95rem] leading-7 text-[rgba(245,239,230,0.88)]">
                          {user.primaryEmail}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {roleLabels.map((role: RoleLabel) => (
                          <span
                            key={role}
                            className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.9)]"
                          >
                            {role.replace(/_/g, " ")}
                          </span>
                        ))}

                        <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.9)]">
                          {user._count.clientAppointments} appointments
                        </span>
                      </div>
                    </div>

                    {aliasEmails.length > 0 ? (
                      <div className="mt-4">
                        <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
                          Alias emails
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {aliasEmails.map((email: AliasEmail) => (
                            <span
                              key={email}
                              className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[0.82rem] text-[rgba(245,239,230,0.9)]"
                            >
                              {email}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
                          Marketing
                        </div>

                        <div className="space-y-1 text-sm leading-6 text-[rgba(245,239,230,0.88)]">
                          <div>
                            Newsletter:{" "}
                            <strong>
                              {user.newsletterOptIn ? "Yes" : "No"}
                            </strong>
                          </div>
                          <div>
                            Announcements:{" "}
                            <strong>
                              {user.announcementsOptIn ? "Yes" : "No"}
                            </strong>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
                          Membership
                        </div>

                        <div className="text-sm leading-6 text-[rgba(245,239,230,0.88)]">
                          {activeMembership ? (
                            <>
                              <div>
                                Active plan:{" "}
                                <strong>{activeMembership.plan.name}</strong>
                              </div>
                              <div>
                                Started:{" "}
                                <strong>
                                  {activeMembership.startsAt.toLocaleDateString()}
                                </strong>
                              </div>
                            </>
                          ) : (
                            <div>No active membership yet</div>
                          )}
                        </div>
                      </div>
                    </div>

                    {profile.notes ? (
                      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
                          Notes
                        </div>
                        <div className="text-sm leading-7 text-[rgba(245,239,230,0.88)]">
                          {profile.notes}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </GlassPanel>
      </div>
    </section>
  );
}