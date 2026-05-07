import Link from "next/link";

import GlassPanel from "@/components/ui/GlassPanel";
import PageEyebrow from "@/components/ui/PageEyebrow";
import { prisma } from "@/lib/prisma";

import {
  convertCoachingRequestToAppointmentAction,
  setCoachingRequestStatusAction,
  updateCoachingRequestAction,
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

function formatStatusLabel(value: string) {
  return value.replace(/_/g, " ");
}

function formatLocalDateTime(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default async function TeamCoachingRequestsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { success, error } = await searchParams;

  const [requests, coaches] = await Promise.all([
    prisma.coachingRequest.findMany({
      orderBy: [{ createdAt: "desc" }],
      take: 50,
      include: {
        clientUser: {
          include: {
            clientProfile: true,
          },
        },
        assignedCoachUser: true,
        convertedAppointment: {
          include: {
            coachUser: true,
          },
        },
      },
    }),
    prisma.user.findMany({
      where: {
        roles: {
          some: {
            role: "COACH",
          },
        },
      },
      orderBy: [{ name: "asc" }, { primaryEmail: "asc" }],
    }),
  ]);

  const statusCounts = {
    NEW: requests.filter((request) => request.status === "NEW").length,
    CONTACTED: requests.filter((request) => request.status === "CONTACTED").length,
    SCHEDULED: requests.filter((request) => request.status === "SCHEDULED").length,
    CLOSED: requests.filter((request) => request.status === "CLOSED").length,
    DECLINED: requests.filter((request) => request.status === "DECLINED").length,
  };

  const now = new Date();
  const defaultStart = new Date(now.getTime() + 60 * 60 * 1000);
  defaultStart.setMinutes(0, 0, 0);
  const defaultEnd = new Date(defaultStart.getTime() + 60 * 60 * 1000);

  return (
    <section className="space-y-8">
      <StatusMessage success={success} error={error} />

      <GlassPanel className="p-6 text-[var(--text-light)]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <PageEyebrow>Coaching Intake</PageEyebrow>
            <h2 className="m-0 text-[1.7rem] leading-tight tracking-[-0.03em] text-[var(--text-light)]">
              Coaching request queue
            </h2>
          </div>

          <div className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm font-semibold text-[rgba(245,239,230,0.88)]">
            {requests.length} recent requests
          </div>
        </div>

        <p className="mb-0 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.88)]">
          This is the intake queue for coaching requests that need follow-up,
          scheduling, or closure. Appointment conversion is handled directly
          here now; SMS and calendar automation still are not.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-5">
          {Object.entries(statusCounts).map(([status, count]) => (
            <div
              key={status}
              className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3"
            >
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.68)]">
                {formatStatusLabel(status)}
              </div>
              <div className="mt-1 text-lg font-semibold text-[rgba(245,239,230,0.96)]">
                {count}
              </div>
            </div>
          ))}
        </div>
      </GlassPanel>

      {requests.length === 0 ? (
        <GlassPanel className="p-6 text-[var(--text-light)]">
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/4 px-5 py-8 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.82)]">
            No coaching requests yet. When the public intake form starts getting
            used, new requests will appear here.
          </div>
        </GlassPanel>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => {
            const clientDisplayName =
              request.clientUser.clientProfile?.displayName ||
              request.clientUser.name ||
              request.clientUser.primaryEmail;
            const canSchedule =
              !request.convertedAppointment &&
              request.status !== "CLOSED" &&
              request.status !== "DECLINED";

            return (
              <GlassPanel key={request.id} className="p-5 text-[var(--text-light)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="m-0 text-[1.2rem] font-bold text-[var(--text-light)]">
                      {clientDisplayName}
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.9)]">
                        {formatStatusLabel(request.status)}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.9)]">
                        {formatStatusLabel(request.preferredContactMethod)}
                      </span>
                    </div>
                    <p className="mb-0 mt-3 text-sm leading-6 text-[rgba(245,239,230,0.82)]">
                      Submitted {request.createdAt.toLocaleString()}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[rgba(245,239,230,0.88)]">
                    {request.convertedAppointment ? (
                      <div className="space-y-2">
                        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.68)]">
                          Scheduled appointment
                        </div>
                        <div>{request.convertedAppointment.scheduledStart.toLocaleString()}</div>
                        <div>
                          Coach:{" "}
                          {request.convertedAppointment.coachUser?.name ||
                            request.convertedAppointment.coachUser?.primaryEmail ||
                            "Unassigned"}
                        </div>
                        <Link
                          href="/team/appointments"
                          className="inline-flex text-sm font-semibold text-[var(--accent)] no-underline transition hover:text-[var(--text-light)]"
                        >
                          Manage in appointments
                        </Link>
                      </div>
                    ) : canSchedule ? (
                      <div className="space-y-1">
                        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.68)]">
                          Ready to schedule
                        </div>
                        <div>Use the schedule panel to convert this request.</div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.68)]">
                          Scheduling unavailable
                        </div>
                        <div>Closed and declined requests stay out of the calendar flow.</div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
                          Email
                        </div>
                        <div className="break-all text-sm leading-6 text-[rgba(245,239,230,0.88)]">
                          {request.email}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
                          Phone
                        </div>
                        <div className="text-sm leading-6 text-[rgba(245,239,230,0.88)]">
                          {request.phone || "Not provided"}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
                          Assigned coach
                        </div>
                        <div className="text-sm leading-6 text-[rgba(245,239,230,0.88)]">
                          {request.assignedCoachUser?.name ||
                            request.assignedCoachUser?.primaryEmail ||
                            "Unassigned"}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
                          Client account
                        </div>
                        <div className="text-sm leading-6 text-[rgba(245,239,230,0.88)]">
                          {request.clientUser.primaryEmail}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
                        Availability notes
                      </div>
                      <div className="whitespace-pre-wrap text-sm leading-7 text-[rgba(245,239,230,0.88)]">
                        {request.availabilityNotes || "No availability notes provided."}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
                        Coaching goals
                      </div>
                      <div className="mb-3 text-xs uppercase tracking-[0.08em] text-[rgba(245,239,230,0.62)]">
                        Preview: {request.coachingGoals.slice(0, 140)}
                        {request.coachingGoals.length > 140 ? "…" : ""}
                      </div>
                      <div className="whitespace-pre-wrap text-sm leading-7 text-[rgba(245,239,230,0.92)]">
                        {request.coachingGoals}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {request.convertedAppointment ? (
                      <div className="rounded-2xl border border-sky-300/18 bg-sky-300/8 p-4">
                        <div className="mb-3 text-[12px] font-bold uppercase tracking-[0.08em] text-sky-100/80">
                          Appointment summary
                        </div>
                        <div className="space-y-2 text-sm leading-6 text-sky-50/90">
                          <div>
                            Start: {request.convertedAppointment.scheduledStart.toLocaleString()}
                          </div>
                          <div>
                            End: {request.convertedAppointment.scheduledEnd.toLocaleString()}
                          </div>
                          <div>
                            Coach:{" "}
                            {request.convertedAppointment.coachUser?.name ||
                              request.convertedAppointment.coachUser?.primaryEmail ||
                              "Unassigned"}
                          </div>
                          <div>
                            Status:{" "}
                            {formatStatusLabel(request.convertedAppointment.status)}
                          </div>
                          <div>
                            Location:{" "}
                            {formatStatusLabel(request.convertedAppointment.locationType)}
                          </div>
                          <div>Time zone: {request.convertedAppointment.timezone}</div>
                          {request.convertedAppointment.locationDetails ? (
                            <div>
                              Details: {request.convertedAppointment.locationDetails}
                            </div>
                          ) : null}
                        </div>
                        <Link
                          href="/team/appointments"
                          className="mt-4 inline-flex rounded-full border border-sky-200/25 bg-sky-200/10 px-4 py-2 text-sm font-bold uppercase tracking-[0.08em] text-sky-50 no-underline transition hover:bg-sky-200/20"
                        >
                          Open appointments
                        </Link>
                      </div>
                    ) : null}

                    {canSchedule ? (
                      <form
                        action={convertCoachingRequestToAppointmentAction}
                        className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4"
                      >
                        <input
                          type="hidden"
                          name="coachingRequestId"
                          value={request.id}
                        />

                        <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
                          Schedule appointment
                        </div>

                        <div>
                          <label
                            htmlFor={`schedule-coach-${request.id}`}
                            className="mb-1 block text-xs font-semibold text-[rgba(245,239,230,0.82)]"
                          >
                            Coach
                          </label>
                          <select
                            id={`schedule-coach-${request.id}`}
                            name="coachUserId"
                            required
                            defaultValue={request.assignedCoachUserId ?? ""}
                            className="w-full rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-[var(--text-light)] outline-none"
                          >
                            <option value="" disabled className="text-black">
                              Select a coach
                            </option>
                            {coaches.map((coach) => (
                              <option key={coach.id} value={coach.id} className="text-black">
                                {coach.name || coach.primaryEmail}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <label
                              htmlFor={`schedule-start-${request.id}`}
                              className="mb-1 block text-xs font-semibold text-[rgba(245,239,230,0.82)]"
                            >
                              Start
                            </label>
                            <input
                              id={`schedule-start-${request.id}`}
                              name="scheduledStart"
                              type="datetime-local"
                              required
                              defaultValue={formatLocalDateTime(defaultStart)}
                              className="w-full rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-[var(--text-light)] outline-none"
                            />
                          </div>

                          <div>
                            <label
                              htmlFor={`schedule-end-${request.id}`}
                              className="mb-1 block text-xs font-semibold text-[rgba(245,239,230,0.82)]"
                            >
                              End
                            </label>
                            <input
                              id={`schedule-end-${request.id}`}
                              name="scheduledEnd"
                              type="datetime-local"
                              required
                              defaultValue={formatLocalDateTime(defaultEnd)}
                              className="w-full rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-[var(--text-light)] outline-none"
                            />
                          </div>
                        </div>

                        <div>
                          <label
                            htmlFor={`schedule-timezone-${request.id}`}
                            className="mb-1 block text-xs font-semibold text-[rgba(245,239,230,0.82)]"
                          >
                            Time zone
                          </label>
                          <input
                            id={`schedule-timezone-${request.id}`}
                            name="timezone"
                            type="text"
                            defaultValue="America/Denver"
                            className="w-full rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-[var(--text-light)] outline-none"
                          />
                        </div>

                        <div>
                          <label
                            htmlFor={`schedule-location-type-${request.id}`}
                            className="mb-1 block text-xs font-semibold text-[rgba(245,239,230,0.82)]"
                          >
                            Location type
                          </label>
                          <select
                            id={`schedule-location-type-${request.id}`}
                            name="locationType"
                            defaultValue="VIDEO"
                            className="w-full rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-[var(--text-light)] outline-none"
                          >
                            <option value="VIDEO" className="text-black">
                              Video
                            </option>
                            <option value="PHONE" className="text-black">
                              Phone
                            </option>
                            <option value="IN_PERSON" className="text-black">
                              In person
                            </option>
                            <option value="OTHER" className="text-black">
                              Other
                            </option>
                          </select>
                        </div>

                        <div>
                          <label
                            htmlFor={`schedule-location-details-${request.id}`}
                            className="mb-1 block text-xs font-semibold text-[rgba(245,239,230,0.82)]"
                          >
                            Location details
                          </label>
                          <input
                            id={`schedule-location-details-${request.id}`}
                            name="locationDetails"
                            type="text"
                            placeholder="Zoom link, phone number, office, etc."
                            className="w-full rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-[var(--text-light)] outline-none placeholder:text-[rgba(245,239,230,0.4)]"
                          />
                        </div>

                        <div>
                          <label
                            htmlFor={`schedule-notes-${request.id}`}
                            className="mb-1 block text-xs font-semibold text-[rgba(245,239,230,0.82)]"
                          >
                            Internal scheduling note
                          </label>
                          <textarea
                            id={`schedule-notes-${request.id}`}
                            name="internalNotes"
                            rows={4}
                            className="w-full rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-[var(--text-light)] outline-none placeholder:text-[rgba(245,239,230,0.4)]"
                            placeholder="Optional note to append to the request and store on the appointment"
                          />
                        </div>

                        <div className="rounded-2xl border border-dashed border-white/10 bg-white/4 px-4 py-3 text-sm leading-6 text-[rgba(245,239,230,0.78)]">
                          This creates the appointment and links it back to the
                          coaching request. Calendar invites, email sends, and
                          SMS notifications are still separate work.
                        </div>

                        <button
                          type="submit"
                          className="w-full rounded-2xl border border-flare/25 bg-flare/15 px-4 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] transition hover:border-flare/40 hover:bg-flare/20"
                        >
                          Schedule appointment
                        </button>
                      </form>
                    ) : null}

                    <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
                        Request actions
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {request.status === "NEW" ? (
                          <form action={setCoachingRequestStatusAction}>
                            <input type="hidden" name="requestId" value={request.id} />
                            <input type="hidden" name="status" value="CONTACTED" />
                            <button
                              type="submit"
                              className="rounded-full border border-sky-300/25 bg-sky-300/10 px-4 py-2 text-sm font-bold uppercase tracking-[0.08em] text-sky-50 transition hover:bg-sky-300/20"
                            >
                              Mark contacted
                            </button>
                          </form>
                        ) : null}

                        {request.status !== "CLOSED" ? (
                          <form action={setCoachingRequestStatusAction}>
                            <input type="hidden" name="requestId" value={request.id} />
                            <input type="hidden" name="status" value="CLOSED" />
                            <button
                              type="submit"
                              className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-bold uppercase tracking-[0.08em] text-emerald-100 transition hover:bg-emerald-400/20"
                            >
                              Mark closed
                            </button>
                          </form>
                        ) : null}

                        {!request.convertedAppointment && request.status !== "DECLINED" ? (
                          <form action={setCoachingRequestStatusAction}>
                            <input type="hidden" name="requestId" value={request.id} />
                            <input type="hidden" name="status" value="DECLINED" />
                            <button
                              type="submit"
                              className="rounded-full border border-red-400/30 bg-red-400/10 px-4 py-2 text-sm font-bold uppercase tracking-[0.08em] text-red-100 transition hover:bg-red-400/20"
                            >
                              Mark declined
                            </button>
                          </form>
                        ) : null}
                      </div>

                      <form action={updateCoachingRequestAction} className="space-y-4">
                        <input type="hidden" name="requestId" value={request.id} />

                        {!request.convertedAppointment ? (
                          <div>
                            <label
                              htmlFor={`coach-${request.id}`}
                              className="mb-1 block text-xs font-semibold text-[rgba(245,239,230,0.82)]"
                            >
                              Assigned coach
                            </label>
                            <select
                              id={`coach-${request.id}`}
                              name="assignedCoachUserId"
                              defaultValue={request.assignedCoachUserId ?? ""}
                              className="w-full rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-[var(--text-light)] outline-none"
                            >
                              <option value="" className="text-black">
                                Unassigned
                              </option>
                              {coaches.map((coach) => (
                                <option key={coach.id} value={coach.id} className="text-black">
                                  {coach.name || coach.primaryEmail}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-white/10 bg-white/4 px-4 py-3 text-sm leading-6 text-[rgba(245,239,230,0.78)]">
                            Coach changes after scheduling should happen on the
                            appointments page so the appointment stays
                            authoritative.
                          </div>
                        )}

                        <div>
                          <label
                            htmlFor={`notes-${request.id}`}
                            className="mb-1 block text-xs font-semibold text-[rgba(245,239,230,0.82)]"
                          >
                            Internal notes
                          </label>
                          <textarea
                            id={`notes-${request.id}`}
                            name="internalNotes"
                            rows={6}
                            defaultValue={request.internalNotes ?? ""}
                            className="w-full rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-[var(--text-light)] outline-none"
                            placeholder="Follow-up notes, fit questions, timing, or anything the team should keep in view"
                          />
                        </div>

                        <button
                          type="submit"
                          className="rounded-full border border-flare/25 bg-flare/15 px-4 py-2 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] transition hover:border-flare/40 hover:bg-flare/20"
                        >
                          Save request notes
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              </GlassPanel>
            );
          })}
        </div>
      )}
    </section>
  );
}
