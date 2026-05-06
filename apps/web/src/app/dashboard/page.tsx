import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import GlassPanel from "@/components/ui/GlassPanel";
import PageContainer from "@/components/ui/PageContainer";
import PageEyebrow from "@/components/ui/PageEyebrow";
import { buildSignInHref } from "@/lib/content-access";
import { prisma } from "@/lib/prisma";
import { redirectToWelcomeIfNeeded } from "@/lib/server/welcome";
import { submitCoachingRequestAction } from "@/app/coaching/actions";

type SearchParams = Promise<{
  intent?: string;
  coaching?: string;
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
        "rounded-2xl border px-4 py-3 text-sm font-medium",
        isError
          ? "border-red-400/25 bg-red-400/10 text-red-100"
          : "border-emerald-400/25 bg-emerald-400/10 text-emerald-100",
      ].join(" ")}
    >
      {message}
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect(buildSignInHref("/dashboard"));
  }

  const { intent, coaching, error } = await searchParams;

  redirectToWelcomeIfNeeded(session, "/dashboard");

  const user = await prisma.user.findUnique({
    where: {
      id: session.user.id,
    },
    include: {
      clientProfile: true,
      memberships: {
        include: {
          plan: true,
        },
        orderBy: [{ startsAt: "desc" }],
      },
      clientAppointments: {
        orderBy: [{ scheduledStart: "asc" }],
        include: {
          coachUser: true,
        },
      },
    },
  });

  if (!user) {
    redirect("/");
  }

  const displayName =
    user.clientProfile?.displayName ||
    user.name ||
    user.primaryEmail;

  const activeMembership =
    user.memberships.find((membership) => membership.status === "ACTIVE") ??
    null;

  const upcomingAppointments = user.clientAppointments.filter(
    (appointment) => appointment.status !== "CANCELED",
  );
  const showCoachingPanel = intent === "coaching" || coaching === "requested";
  const coachingSuccess =
    coaching === "requested"
      ? "Your coaching request is in. Scott will follow up personally about fit, scheduling, and next steps."
      : undefined;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#08171b_0%,#10272d_16%,#18383d_40%,#6f5636_78%,#f3eadb_100%)] pb-20">
      <PageContainer className="pt-10">
        <div className="space-y-8">
          <GlassPanel className="p-6 text-[var(--text-light)]">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <PageEyebrow>Member Home</PageEyebrow>
              {activeMembership ? <PageEyebrow>Active Member</PageEyebrow> : null}
            </div>

            <h1 className="m-0 text-[clamp(2.2rem,5vw,4rem)] leading-[0.98] tracking-[-0.04em] text-[var(--text-light)]">
              Welcome, {displayName}
            </h1>

            <p className="mb-0 mt-4 max-w-[760px] text-[1rem] leading-7 text-[rgba(245,239,230,0.88)]">
              This is your member home for coaching details, upcoming sessions,
              and the essentials that keep the relationship clear and easy to
              navigate.
            </p>

            <div className="mt-6">
              <Link
                href="/dashboard/settings"
                className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/30 hover:text-[var(--accent)]"
              >
                Email preferences
              </Link>
            </div>
          </GlassPanel>

          {showCoachingPanel ? (
            <div className="space-y-4">
              <StatusMessage success={coachingSuccess} error={error} />

              <GlassPanel className="p-6 text-[var(--text-light)]">
                <PageEyebrow>Coaching</PageEyebrow>

                <h2 className="m-0 mt-3 text-[1.8rem] leading-tight tracking-[-0.03em] text-[var(--text-light)]">
                  Book a Coaching Session
                </h2>

                <p className="mb-0 mt-4 max-w-[760px] text-[1rem] leading-7 text-[rgba(245,239,230,0.9)]">
                  Tell us how you would like Scott to reach out. Once you send the request, he will follow up personally about fit, scheduling, and next steps.
                </p>

                <form action={submitCoachingRequestAction} className="mt-6 space-y-4">
                  <input
                    type="hidden"
                    name="source"
                    value="dashboard"
                  />
                  <input
                    type="text"
                    name="company"
                    tabIndex={-1}
                    autoComplete="off"
                    className="hidden"
                    aria-hidden="true"
                  />

                  <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm leading-6 text-[rgba(245,239,230,0.9)]">
                    Signed in as <strong>{displayName}</strong>
                  </div>

                  <div>
                    <label
                      htmlFor="preferredContactMethod"
                      className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
                    >
                      Preferred contact method
                    </label>
                    <select
                      id="preferredContactMethod"
                      name="preferredContactMethod"
                      required
                      defaultValue="EMAIL"
                      className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none"
                    >
                      <option value="EMAIL" className="text-black">
                        Email
                      </option>
                      <option value="PHONE_CALL" className="text-black">
                        Phone call
                      </option>
                      <option value="TEXT" className="text-black">
                        Text
                      </option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="phone"
                      className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
                    >
                      Phone number <span className="font-normal text-[rgba(245,239,230,0.68)]">optional</span>
                    </label>
                    <input
                      id="phone"
                      name="phone"
                      type="tel"
                      className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none placeholder:text-[rgba(245,239,230,0.4)]"
                      placeholder="Only if you want a call or text"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="note"
                      className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
                    >
                      Optional note
                    </label>
                    <textarea
                      id="note"
                      name="note"
                      rows={5}
                      className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none placeholder:text-[rgba(245,239,230,0.4)]"
                      placeholder="Anything you want Scott to know before he reaches out, or leave it blank and keep things simple."
                    />
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm leading-6 text-[rgba(245,239,230,0.82)]">
                    Coaching is donation-supported during this credentialing season. There is no fixed fee up front. If the session is helpful, you can donate afterward in whatever amount feels appropriate and sustainable for you.
                  </div>

                  <button
                    type="submit"
                    className="rounded-full border border-flare/35 bg-flare/18 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] transition hover:border-flare/50 hover:bg-flare/24"
                  >
                    Send Coaching Request
                  </button>
                </form>
              </GlassPanel>
            </div>
          ) : null}

          <section className="grid gap-8 lg:grid-cols-2">
            <GlassPanel className="p-6 text-[var(--text-light)]">
              <PageEyebrow>Membership</PageEyebrow>

              <h2 className="m-0 mt-3 text-[1.6rem] leading-tight tracking-[-0.03em] text-[var(--text-light)]">
                Your plan
              </h2>

              <div className="mt-5 rounded-2xl border border-white/10 bg-white/6 p-5">
                {activeMembership ? (
                  <div className="space-y-2 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.9)]">
                    <div>
                      Plan: <strong>{activeMembership.plan.name}</strong>
                    </div>
                    <div>
                      Status: <strong>{activeMembership.status}</strong>
                    </div>
                    <div>
                      Started:{" "}
                      <strong>
                        {activeMembership.startsAt.toLocaleDateString()}
                      </strong>
                    </div>
                    {activeMembership.endsAt ? (
                      <div>
                        Ends:{" "}
                        <strong>
                          {activeMembership.endsAt.toLocaleDateString()}
                        </strong>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="text-[0.98rem] leading-7 text-[rgba(245,239,230,0.82)]">
                    You do not currently have an active coaching rhythm on file.
                    If you are already in conversation with us, we will confirm
                    the right next step directly.
                  </div>
                )}
              </div>
            </GlassPanel>

            <GlassPanel className="p-6 text-[var(--text-light)]">
              <PageEyebrow>Appointments</PageEyebrow>

              <h2 className="m-0 mt-3 text-[1.6rem] leading-tight tracking-[-0.03em] text-[var(--text-light)]">
                Upcoming sessions
              </h2>

              {upcomingAppointments.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-white/4 px-5 py-8 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.82)]">
                  No upcoming appointments yet.
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  {upcomingAppointments.map((appointment) => (
                    <div
                      key={appointment.id}
                      className="rounded-2xl border border-white/10 bg-white/6 p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <div className="text-[1rem] font-bold text-[var(--text-light)]">
                            {appointment.scheduledStart.toLocaleString()}
                          </div>
                          <div className="mt-2 text-sm leading-6 text-[rgba(245,239,230,0.88)]">
                            Ends: {appointment.scheduledEnd.toLocaleString()}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.9)]">
                            {appointment.status.replace(/_/g, " ")}
                          </span>
                          <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.9)]">
                            {appointment.locationType.replace(/_/g, " ")}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                          <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
                            Coach
                          </div>
                          <div className="text-sm leading-6 text-[rgba(245,239,230,0.88)]">
                            {appointment.coachUser?.name ||
                              appointment.coachUser?.primaryEmail ||
                              "Unassigned"}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                          <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
                            Time zone
                          </div>
                          <div className="text-sm leading-6 text-[rgba(245,239,230,0.88)]">
                            {appointment.timezone}
                          </div>
                        </div>
                      </div>

                      {appointment.locationDetails ? (
                        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                          <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
                            Location details
                          </div>
                          <div className="text-sm leading-7 text-[rgba(245,239,230,0.88)]">
                            {appointment.locationDetails}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </GlassPanel>
          </section>
        </div>
      </PageContainer>
    </main>
  );
}
