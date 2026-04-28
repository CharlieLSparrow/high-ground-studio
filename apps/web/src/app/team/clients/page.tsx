import GlassPanel from "@/components/ui/GlassPanel";
import PageEyebrow from "@/components/ui/PageEyebrow";
import { prisma } from "@/lib/prisma";

import {
  createClientAction,
  grantMembershipAction,
  promoteUserToClientAction,
  seedMembershipPlansAction,
  updateMembershipStatusAction,
} from "./actions";

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

function formatDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default async function TeamClientsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { success, error } = await searchParams;

  const [clientProfiles, signedInUsers, membershipPlans] = await Promise.all([
    prisma.clientProfile.findMany({
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
    }),
    prisma.user.findMany({
      where: {
        clientProfile: null,
      },
      orderBy: [{ updatedAt: "desc" }],
      include: {
        aliases: {
          orderBy: [{ email: "asc" }],
        },
        roles: {
          orderBy: [{ role: "asc" }],
        },
      },
    }),
    prisma.membershipPlan.findMany({
      where: {
        isActive: true,
      },
      orderBy: [{ name: "asc" }],
    }),
  ]);

  type ClientProfileItem = (typeof clientProfiles)[number];
  type AliasItem = ClientProfileItem["user"]["aliases"][number];
  type RoleItem = ClientProfileItem["user"]["roles"][number];
  type MembershipItem = ClientProfileItem["user"]["memberships"][number];
  type RoleLabel = RoleItem["role"];
  type AliasEmail = AliasItem["email"];

  type SignedInUserItem = (typeof signedInUsers)[number];
  type SignedInRoleItem = SignedInUserItem["roles"][number];
  type SignedInAliasItem = SignedInUserItem["aliases"][number];

  const today = formatDateInput(new Date());

  return (
    <section className="space-y-8">
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

          <GlassPanel className="mb-8 p-6 text-[var(--text-light)]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <PageEyebrow>Plans</PageEyebrow>
                <h2 className="m-0 text-[1.3rem] leading-tight tracking-[-0.03em] text-[var(--text-light)]">
                  Membership plans
                </h2>
              </div>

              <div className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm font-semibold text-[rgba(245,239,230,0.88)]">
                {membershipPlans.length} active
              </div>
            </div>

            {membershipPlans.length === 0 ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/4 px-5 py-6 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.82)]">
                  No active membership plans yet. Sync the current internal
                  catalog so the team can assign the live monthly offers plus
                  the manual single-session option without inventing product
                  names from memory.
                </div>

                <form action={seedMembershipPlansAction}>
                  <button
                    type="submit"
                    className="rounded-full border border-flare/25 bg-flare/15 px-4 py-2 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] transition hover:border-flare/40 hover:bg-flare/20"
                  >
                    Sync membership plans
                  </button>
                </form>
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                {membershipPlans.map((plan) => (
                  <div
                    key={plan.id}
                    className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-[rgba(245,239,230,0.9)]"
                  >
                    <strong>{plan.name}</strong>
                    <div className="mt-1 text-[rgba(245,239,230,0.75)]">
                      {plan.billingIntervalMonths
                        ? `Every ${plan.billingIntervalMonths} month(s)`
                        : "Manual / one-time"}
                    </div>
                    {plan.description ? (
                      <div className="mt-2 text-[0.8rem] leading-6 text-[rgba(245,239,230,0.7)]">
                        {plan.description}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </GlassPanel>

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
                  const aliasEmails = user.aliases.map(
                    (alias: AliasItem): AliasEmail => alias.email,
                  );
                  const roleLabels = user.roles.map(
                    (role: RoleItem): RoleLabel => role.role,
                  );
                  const latestMembership = user.memberships[0] ?? null;

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

                      <div className="mt-4 grid gap-4 xl:grid-cols-3">
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
                            Current membership
                          </div>

                          <div className="text-sm leading-6 text-[rgba(245,239,230,0.88)]">
                            {latestMembership ? (
                              <>
                                <div>
                                  Plan: <strong>{latestMembership.plan.name}</strong>
                                </div>
                                <div>
                                  Status:{" "}
                                  <strong>{latestMembership.status}</strong>
                                </div>
                                <div>
                                  Started:{" "}
                                  <strong>
                                    {latestMembership.startsAt.toLocaleDateString()}
                                  </strong>
                                </div>
                              </>
                            ) : (
                              <div>No membership yet</div>
                            )}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                          <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
                            Grant membership
                          </div>

                          {membershipPlans.length === 0 ? (
                            <div className="text-sm leading-6 text-[rgba(245,239,230,0.88)]">
                              Create plans first.
                            </div>
                          ) : (
                            <form action={grantMembershipAction} className="space-y-3">
                              <input type="hidden" name="userId" value={user.id} />

                              <select
                                name="planId"
                                required
                                defaultValue=""
                                className="w-full rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-[var(--text-light)] outline-none"
                              >
                                <option value="" disabled className="text-black">
                                  Select a plan
                                </option>
                                {membershipPlans.map((plan) => (
                                  <option key={plan.id} value={plan.id} className="text-black">
                                    {plan.name}
                                  </option>
                                ))}
                              </select>

                              <input
                                name="startsAt"
                                type="date"
                                defaultValue={today}
                                className="w-full rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-[var(--text-light)] outline-none"
                              />

                              <input
                                name="endsAt"
                                type="date"
                                className="w-full rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-[var(--text-light)] outline-none"
                              />

                              <textarea
                                name="notes"
                                rows={2}
                                placeholder="Optional membership notes"
                                className="w-full rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-[var(--text-light)] outline-none placeholder:text-[rgba(245,239,230,0.4)]"
                              />

                              <button
                                type="submit"
                                className="rounded-full border border-flare/25 bg-flare/15 px-4 py-2 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] transition hover:border-flare/40 hover:bg-flare/20"
                              >
                                Grant
                              </button>
                            </form>
                          )}
                        </div>
                      </div>

                      {latestMembership ? (
                        <div className="mt-4 flex flex-wrap gap-3">
                          {latestMembership.status !== "ACTIVE" ? (
                            <form action={updateMembershipStatusAction}>
                              <input
                                type="hidden"
                                name="membershipId"
                                value={latestMembership.id}
                              />
                              <input type="hidden" name="status" value="ACTIVE" />
                              <button
                                type="submit"
                                className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-bold uppercase tracking-[0.08em] text-emerald-100 transition hover:bg-emerald-400/20"
                              >
                                Mark active
                              </button>
                            </form>
                          ) : null}

                          {latestMembership.status !== "PAUSED" ? (
                            <form action={updateMembershipStatusAction}>
                              <input
                                type="hidden"
                                name="membershipId"
                                value={latestMembership.id}
                              />
                              <input type="hidden" name="status" value="PAUSED" />
                              <button
                                type="submit"
                                className="rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm font-bold uppercase tracking-[0.08em] text-amber-100 transition hover:bg-amber-400/20"
                              >
                                Pause
                              </button>
                            </form>
                          ) : null}

                          {latestMembership.status !== "CANCELED" ? (
                            <form action={updateMembershipStatusAction}>
                              <input
                                type="hidden"
                                name="membershipId"
                                value={latestMembership.id}
                              />
                              <input type="hidden" name="status" value="CANCELED" />
                              <button
                                type="submit"
                                className="rounded-full border border-red-400/30 bg-red-400/10 px-4 py-2 text-sm font-bold uppercase tracking-[0.08em] text-red-100 transition hover:bg-red-400/20"
                              >
                                Cancel
                              </button>
                            </form>
                          ) : null}
                        </div>
                      ) : null}

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

                      {user.memberships.length > 1 ? (
                        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                          <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
                            Membership history
                          </div>

                          <div className="space-y-2 text-sm leading-6 text-[rgba(245,239,230,0.88)]">
                            {user.memberships.map((membership: MembershipItem) => (
                              <div key={membership.id}>
                                <strong>{membership.plan.name}</strong> —{" "}
                                {membership.status} —{" "}
                                {membership.startsAt.toLocaleDateString()}
                              </div>
                            ))}
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

      <GlassPanel className="p-6 text-[var(--text-light)]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <PageEyebrow>Signed-in Users</PageEyebrow>
            <h2 className="m-0 text-[1.7rem] leading-tight tracking-[-0.03em] text-[var(--text-light)]">
              People already in the system
            </h2>
          </div>

          <div className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm font-semibold text-[rgba(245,239,230,0.88)]">
            {signedInUsers.length} available
          </div>
        </div>

        {signedInUsers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/4 px-5 py-8 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.82)]">
            No signed-in non-client users yet. Once people log in, they can be
            promoted into clients from here with one click like the civilized
            little software operators we are becoming.
          </div>
        ) : (
          <div className="space-y-4">
            {signedInUsers.map((user: SignedInUserItem) => (
              <div
                key={user.id}
                className="rounded-[24px] border border-white/10 bg-white/6 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="m-0 text-[1.15rem] font-bold text-[var(--text-light)]">
                      {user.name || user.primaryEmail}
                    </h3>

                    <p className="mb-0 mt-2 text-[0.95rem] leading-7 text-[rgba(245,239,230,0.88)]">
                      {user.primaryEmail}
                    </p>
                  </div>

                  <form action={promoteUserToClientAction}>
                    <input type="hidden" name="userId" value={user.id} />
                    <button
                      type="submit"
                      className="rounded-full border border-flare/25 bg-flare/15 px-4 py-2 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] transition hover:border-flare/40 hover:bg-flare/20"
                    >
                      Turn into client
                    </button>
                  </form>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {user.roles.map((role: SignedInRoleItem) => (
                    <span
                      key={role.id}
                      className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.9)]"
                    >
                      {role.role.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>

                {user.aliases.length > 0 ? (
                  <div className="mt-4">
                    <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
                      Alias emails
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {user.aliases.map((alias: SignedInAliasItem) => (
                        <span
                          key={alias.id}
                          className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[0.82rem] text-[rgba(245,239,230,0.9)]"
                        >
                          {alias.email}
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
                        <strong>{user.newsletterOptIn ? "Yes" : "No"}</strong>
                      </div>
                      <div>
                        Announcements:{" "}
                        <strong>{user.announcementsOptIn ? "Yes" : "No"}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
                      Last updated
                    </div>

                    <div className="text-sm leading-6 text-[rgba(245,239,230,0.88)]">
                      {user.updatedAt.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassPanel>
    </section>
  );
}
