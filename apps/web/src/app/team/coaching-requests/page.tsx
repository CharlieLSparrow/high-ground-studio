import GlassPanel from "@/components/ui/GlassPanel";
import PageEyebrow from "@/components/ui/PageEyebrow";
import { prisma } from "@/lib/prisma";

import { updateCoachingRequestAction } from "./actions";

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

export default async function TeamCoachingRequestsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { success, error } = await searchParams;

  const [requests, staffUsers] = await Promise.all([
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
            role: {
              in: ["OWNER", "TEAM_SCHEDULER", "COACH"],
            },
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
          This is the intake queue for unscheduled coaching requests. SMS and donation processing are not wired yet. Appointment conversion comes next, after the queue is stable.
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
            No coaching requests yet. When the public intake form starts getting used, new requests will appear here.
          </div>
        </GlassPanel>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => {
            const clientDisplayName =
              request.clientUser.clientProfile?.displayName ||
              request.clientUser.name ||
              request.clientUser.primaryEmail;

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
                      <div className="space-y-1">
                        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.68)]">
                          Converted appointment
                        </div>
                        <div>{request.convertedAppointment.scheduledStart.toLocaleString()}</div>
                        <div>
                          Coach: {request.convertedAppointment.coachUser?.name || request.convertedAppointment.coachUser?.primaryEmail || "Unassigned"}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.68)]">
                          Conversion
                        </div>
                        <div>Appointment conversion comes next.</div>
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
                        <div className="text-sm leading-6 text-[rgba(245,239,230,0.88)] break-all">
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

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
                        Availability notes
                      </div>
                      <div className="text-sm leading-7 text-[rgba(245,239,230,0.88)] whitespace-pre-wrap">
                        {request.availabilityNotes || "No availability notes provided."}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
                        Coaching goals
                      </div>
                      <div className="mb-3 text-xs uppercase tracking-[0.08em] text-[rgba(245,239,230,0.62)]">
                        Preview: {request.coachingGoals.slice(0, 140)}{request.coachingGoals.length > 140 ? "…" : ""}
                      </div>
                      <div className="text-sm leading-7 text-[rgba(245,239,230,0.92)] whitespace-pre-wrap">
                        {request.coachingGoals}
                      </div>
                    </div>
                  </div>

                  <form action={updateCoachingRequestAction} className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
                    <input type="hidden" name="requestId" value={request.id} />

                    <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
                      Update request
                    </div>

                    <div>
                      <label
                        htmlFor={`status-${request.id}`}
                        className="mb-1 block text-xs font-semibold text-[rgba(245,239,230,0.82)]"
                      >
                        Status
                      </label>
                      <select
                        id={`status-${request.id}`}
                        name="status"
                        defaultValue={request.status}
                        className="w-full rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-[var(--text-light)] outline-none"
                      >
                        <option value="NEW" className="text-black">New</option>
                        <option value="CONTACTED" className="text-black">Contacted</option>
                        <option value="SCHEDULED" className="text-black">Scheduled</option>
                        <option value="CLOSED" className="text-black">Closed</option>
                        <option value="DECLINED" className="text-black">Declined</option>
                      </select>
                    </div>

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
                        <option value="" className="text-black">Unassigned</option>
                        {staffUsers.map((staffUser) => (
                          <option key={staffUser.id} value={staffUser.id} className="text-black">
                            {staffUser.name || staffUser.primaryEmail}
                          </option>
                        ))}
                      </select>
                    </div>

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

                    <div className="rounded-2xl border border-dashed border-white/10 bg-white/4 px-4 py-3 text-sm leading-6 text-[rgba(245,239,230,0.78)]">
                      Donation links and text notifications are intentionally not wired in this pass.
                    </div>

                    <button
                      type="submit"
                      className="rounded-full border border-flare/25 bg-flare/15 px-4 py-2 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] transition hover:border-flare/40 hover:bg-flare/20"
                    >
                      Save request
                    </button>
                  </form>
                </div>
              </GlassPanel>
            );
          })}
        </div>
      )}
    </section>
  );
}
