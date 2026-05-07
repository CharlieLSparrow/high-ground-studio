import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { submitCoachingRequestAction } from "@/app/coaching/actions";
import GlassPanel from "@/components/ui/GlassPanel";
import PageContainer from "@/components/ui/PageContainer";
import PageEyebrow from "@/components/ui/PageEyebrow";
import { buildGoogleCalendarEventUrl } from "@/lib/calendar-links";
import { buildSignInHref } from "@/lib/content-access";
import { prisma } from "@/lib/prisma";
import { redirectToWelcomeIfNeeded } from "@/lib/server/welcome";

type SearchParams = Promise<{
  intent?: string;
  coaching?: string;
  error?: string;
}>;

const FALLBACK_COACHING_GOALS =
  "Requested a coaching conversation from the simplified coaching call-to-action page.";

// Temporary High Ground default until user-specific time zones are collected.
const DASHBOARD_TIME_ZONE = "America/Denver";

function formatDashboardDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: DASHBOARD_TIME_ZONE,
    timeZoneName: "short",
  }).format(value);
}

function formatDashboardDateOnly(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: DASHBOARD_TIME_ZONE,
  }).format(value);
}

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

function formatFriendlyCoachingStatus(status: string) {
  switch (status) {
    case "NEW":
      return "Request received";
    case "CONTACTED":
      return "Scott/team has reached out";
    case "SCHEDULED":
      return "Session scheduled";
    case "CLOSED":
      return "Closed";
    case "DECLINED":
      return "Not moving forward";
    default:
      return status.replace(/_/g, " ");
  }
}

function formatContactMethod(value: string) {
  switch (value) {
    case "EMAIL":
      return "Email";
    case "PHONE_CALL":
      return "Phone call";
    case "TEXT":
      return "Text";
    default:
      return value.replace(/_/g, " ");
  }
}

function formatAppointmentStatus(value: string) {
  return value.replace(/_/g, " ");
}

function formatAppointmentLocation(value: string) {
  switch (value) {
    case "IN_PERSON":
      return "In person";
    default:
      return formatAppointmentStatus(value);
  }
}

function buildAppointmentCalendarDetails({
  coachName,
  coachEmail,
  status,
  locationDetails,
}: {
  coachName: string;
  coachEmail?: string | null;
  status: string;
  locationDetails?: string | null;
}) {
  const lines = [
    "Scheduled through High Ground Odyssey.",
    `Coach: ${coachName}`,
    coachEmail ? `Coach email: ${coachEmail}` : null,
    `Appointment status: ${formatAppointmentStatus(status)}`,
    locationDetails ? `Location details: ${locationDetails}` : null,
  ].filter(Boolean);

  return lines.join("\n");
}

function StatusChip({ status }: { status: string }) {
  const tone =
    status === "SCHEDULED"
      ? "border-sky-300/25 bg-sky-300/10 text-sky-100"
      : status === "CONTACTED"
        ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
        : status === "CLOSED"
          ? "border-white/12 bg-white/10 text-[rgba(245,239,230,0.9)]"
          : status === "DECLINED"
            ? "border-rose-300/25 bg-rose-300/10 text-rose-100"
            : "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";

  return (
    <span
      className={[
        "inline-flex rounded-full border px-3 py-1 text-[0.76rem] font-semibold uppercase tracking-[0.08em]",
        tone,
      ].join(" ")}
    >
      {formatFriendlyCoachingStatus(status)}
    </span>
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
      coachingRequests: {
        orderBy: [{ createdAt: "desc" }],
        take: 5,
        include: {
          assignedCoachUser: true,
          convertedAppointment: {
            include: {
              coachUser: true,
            },
          },
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
  const showCoachingPanel = intent === "coaching" && coaching !== "requested";
  const coachingSuccess =
    coaching === "requested"
      ? "Your coaching request is in. Scott will follow up personally about fit, scheduling, and next steps."
      : undefined;
  const coachingRequests = user.coachingRequests;
  const latestCoachingRequest = coachingRequests[0] ?? null;
  const olderCoachingRequests = coachingRequests.slice(1);
  const coachingDonationUrl =
    process.env.HGO_COACHING_DONATION_URL?.trim() || null;
  const featuredDonationAppointment =
    latestCoachingRequest?.convertedAppointment ??
    user.clientAppointments.find((appointment) =>
      appointment.status === "SCHEDULED" ||
      appointment.status === "CONFIRMED" ||
      appointment.status === "COMPLETED",
    ) ??
    null;
  const showDonationCallout = Boolean(
    coachingDonationUrl && featuredDonationAppointment,
  );
  const latestCoachingCalendarUrl = latestCoachingRequest?.convertedAppointment
    ? buildGoogleCalendarEventUrl({
        title: "High Ground Coaching Session",
        start: latestCoachingRequest.convertedAppointment.scheduledStart,
        end: latestCoachingRequest.convertedAppointment.scheduledEnd,
        details: buildAppointmentCalendarDetails({
          coachName:
            latestCoachingRequest.convertedAppointment.coachUser?.name ||
            "Unassigned coach",
          coachEmail:
            latestCoachingRequest.convertedAppointment.coachUser?.primaryEmail,
          status: latestCoachingRequest.convertedAppointment.status,
          locationDetails:
            latestCoachingRequest.convertedAppointment.locationDetails,
        }),
        location:
          latestCoachingRequest.convertedAppointment.locationDetails ||
          formatAppointmentLocation(
            latestCoachingRequest.convertedAppointment.locationType,
          ),
        guestEmail: user.primaryEmail,
      })
    : null;

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

          <div className="space-y-4">
            <StatusMessage success={coachingSuccess} error={error} />

            <GlassPanel className="p-6 text-[var(--text-light)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <PageEyebrow>Coaching</PageEyebrow>
                  <h2 className="m-0 mt-3 text-[1.8rem] leading-tight tracking-[-0.03em] text-[var(--text-light)]">
                    Your Coaching Requests
                  </h2>
                  <p className="mb-0 mt-4 max-w-[760px] text-[1rem] leading-7 text-[rgba(245,239,230,0.9)]">
                    {latestCoachingRequest
                      ? "We have your request. Scott will follow up personally using your preferred contact method."
                      : "No coaching requests yet. When you are ready, you can ask Scott to reach out and start with a simple conversation."}
                  </p>
                </div>

                <Link
                  href="/dashboard?intent=coaching"
                  className="inline-flex rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/30 hover:text-[var(--accent)]"
                >
                  {latestCoachingRequest ? "Request another session" : "Request Coaching"}
                </Link>
              </div>

              {latestCoachingRequest ? (
                <div className="mt-6 space-y-4">
                  <div className="rounded-[28px] border border-white/10 bg-white/6 p-5 md:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusChip status={latestCoachingRequest.status} />
                          <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.9)]">
                            {formatContactMethod(
                              latestCoachingRequest.preferredContactMethod,
                            )}
                          </span>
                        </div>

                        <p className="mb-0 mt-4 text-sm leading-6 text-[rgba(245,239,230,0.82)]">
                          Requested {formatDashboardDate(latestCoachingRequest.createdAt)}
                        </p>
                        <p className="mb-0 mt-2 text-sm leading-6 text-[rgba(245,239,230,0.72)]">
                          Last updated {formatDashboardDate(latestCoachingRequest.updatedAt)}
                        </p>
                      </div>

                      {latestCoachingRequest.assignedCoachUser ? (
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-[rgba(245,239,230,0.88)]">
                          <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.68)]">
                            Assigned coach
                          </div>
                          <div>
                            {latestCoachingRequest.assignedCoachUser.name ||
                              latestCoachingRequest.assignedCoachUser.primaryEmail}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
                          Preferred contact method
                        </div>
                        <div className="text-sm leading-6 text-[rgba(245,239,230,0.88)]">
                          {formatContactMethod(
                            latestCoachingRequest.preferredContactMethod,
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
                          Phone
                        </div>
                        <div className="text-sm leading-6 text-[rgba(245,239,230,0.88)]">
                          {latestCoachingRequest.phone || "Not provided"}
                        </div>
                      </div>
                    </div>

                    {latestCoachingRequest.coachingGoals &&
                    latestCoachingRequest.coachingGoals !==
                      FALLBACK_COACHING_GOALS ? (
                      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
                          Your note
                        </div>
                        <div className="text-sm leading-7 text-[rgba(245,239,230,0.88)] whitespace-pre-wrap">
                          {latestCoachingRequest.coachingGoals}
                        </div>
                      </div>
                    ) : null}

                    {latestCoachingRequest.convertedAppointment ? (
                      <div className="mt-4 rounded-2xl border border-sky-300/18 bg-sky-300/8 p-4">
                        <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-sky-100/80">
                          Appointment summary
                        </div>
                        <div className="space-y-1 text-sm leading-6 text-sky-50/90">
                          <div>
                            Scheduled for{" "}
                            {formatDashboardDate(latestCoachingRequest.convertedAppointment.scheduledStart)}
                          </div>
                          <div>
                            Coach:{" "}
                            {latestCoachingRequest.convertedAppointment.coachUser?.name ||
                              latestCoachingRequest.convertedAppointment.coachUser
                                ?.primaryEmail ||
                              "Unassigned"}
                          </div>
                          <div>
                            Status:{" "}
                            {formatAppointmentStatus(
                              latestCoachingRequest.convertedAppointment.status,
                            )}
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-3">
                          {latestCoachingCalendarUrl ? (
                            <a
                              href={latestCoachingCalendarUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex rounded-full border border-sky-200/25 bg-sky-200/10 px-4 py-2 text-sm font-bold uppercase tracking-[0.08em] text-sky-50 no-underline transition hover:bg-sky-200/20"
                            >
                              Add to Google Calendar
                            </a>
                          ) : null}

                          {showDonationCallout && coachingDonationUrl ? (
                            <a
                              href={coachingDonationUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex rounded-full border border-flare/35 bg-flare/18 px-4 py-2 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/50 hover:bg-flare/24"
                            >
                              Make a Pay-What-You-Can Contribution
                            </a>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    {showDonationCallout && coachingDonationUrl ? (
                      <div className="mt-4 rounded-2xl border border-flare/25 bg-flare/12 p-4">
                        <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--accent)]">
                          Donation-supported coaching
                        </div>
                        <p className="mb-0 text-sm leading-7 text-[rgba(245,239,230,0.9)]">
                          During Scott&apos;s credentialing season, sessions do
                          not have a fixed fee. If this session was helpful, you
                          can contribute whatever feels right and sustainable.
                        </p>
                      </div>
                    ) : null}
                  </div>

                  {olderCoachingRequests.length > 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
                      <div className="mb-3 text-[12px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.68)]">
                        Recent requests
                      </div>
                      <div className="space-y-3">
                        {olderCoachingRequests.map((request) => (
                          <div
                            key={request.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/6 px-4 py-3"
                          >
                            <div>
                              <div className="text-sm font-semibold text-[rgba(245,239,230,0.92)]">
                                {formatFriendlyCoachingStatus(request.status)}
                              </div>
                              <div className="mt-1 text-sm leading-6 text-[rgba(245,239,230,0.72)]">
                                {formatDashboardDateOnly(request.createdAt)} · {formatContactMethod(request.preferredContactMethod)}
                              </div>
                            </div>

                            {request.convertedAppointment ? (
                              <div className="text-sm leading-6 text-[rgba(245,239,230,0.82)]">
                                Appointment on {formatDashboardDateOnly(request.convertedAppointment.scheduledStart)}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-white/4 px-5 py-8 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.82)]">
                  No coaching requests yet. When you are ready, you can ask Scott to reach out and start with a simple conversation.
                </div>
              )}
            </GlassPanel>
          </div>

          {showCoachingPanel ? (
            <GlassPanel className="p-6 text-[var(--text-light)]">
              <PageEyebrow>Coaching</PageEyebrow>

              <h2 className="m-0 mt-3 text-[1.8rem] leading-tight tracking-[-0.03em] text-[var(--text-light)]">
                Book a Coaching Session
              </h2>

              <p className="mb-0 mt-4 max-w-[760px] text-[1rem] leading-7 text-[rgba(245,239,230,0.9)]">
                Tell us how you would like Scott to reach out. Once you send the request, he will follow up personally about fit, scheduling, and next steps.
              </p>

              <form action={submitCoachingRequestAction} className="mt-6 space-y-4">
                <input type="hidden" name="source" value="dashboard" />
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

                <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm leading-6 text-[rgba(245,239,230,0.82)]">
                  If you choose Text and provide a phone number, you agree to receive text messages from High Ground Odyssey about your coaching request, scheduling, and related follow-up. Standard message and data rates may apply. Reply STOP to opt out. Reply HELP for help. Carriers are not liable for delayed or undelivered messages. {" "}
                  <Link
                    href="/sms-opt-in"
                    className="font-semibold text-[var(--accent)] underline decoration-[rgba(245,239,230,0.35)] underline-offset-4 transition hover:text-[var(--text-light)]"
                  >
                    Text Message Opt-In Terms
                  </Link>
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
                  {upcomingAppointments.map((appointment) => {
                    const calendarUrl = buildGoogleCalendarEventUrl({
                      title: "High Ground Coaching Session",
                      start: appointment.scheduledStart,
                      end: appointment.scheduledEnd,
                      details: buildAppointmentCalendarDetails({
                        coachName:
                          appointment.coachUser?.name || "Unassigned coach",
                        coachEmail: appointment.coachUser?.primaryEmail,
                        status: appointment.status,
                        locationDetails: appointment.locationDetails,
                      }),
                      location:
                        appointment.locationDetails ||
                        formatAppointmentLocation(appointment.locationType),
                      guestEmail: user.primaryEmail,
                    });

                    return (
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
                            {formatAppointmentStatus(appointment.status)}
                          </span>
                          <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.9)]">
                            {formatAppointmentLocation(appointment.locationType)}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-3">
                        <a
                          href={calendarUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex rounded-full border border-sky-200/20 bg-sky-200/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-sky-50 no-underline transition hover:bg-sky-200/20"
                        >
                          Add to Google Calendar
                        </a>

                        {coachingDonationUrl &&
                        (appointment.status === "SCHEDULED" ||
                          appointment.status === "CONFIRMED" ||
                          appointment.status === "COMPLETED") ? (
                          <a
                            href={coachingDonationUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex rounded-full border border-flare/25 bg-flare/15 px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/40 hover:bg-flare/20"
                          >
                            Make a Pay-What-You-Can Contribution
                          </a>
                        ) : null}
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
                    );
                  })}
                </div>
              )}
            </GlassPanel>
          </section>
        </div>
      </PageContainer>
    </main>
  );
}
