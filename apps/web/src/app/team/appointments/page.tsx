import GlassPanel from "@/components/ui/GlassPanel";
import PageEyebrow from "@/components/ui/PageEyebrow";
import { prisma } from "@/lib/prisma";

import { createAppointmentAction } from "./actions";

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

function formatLocalDateTime(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default async function TeamAppointmentsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { success, error } = await searchParams;

  const [clients, coaches, appointments] = await Promise.all([
    prisma.clientProfile.findMany({
      orderBy: [{ displayName: "asc" }, { user: { primaryEmail: "asc" } }],
      include: {
        user: true,
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
    prisma.appointment.findMany({
      orderBy: [{ scheduledStart: "asc" }],
      take: 25,
      include: {
        clientUser: true,
        coachUser: true,
        createdByUser: true,
      },
    }),
  ]);

  const now = new Date();
  const defaultStart = new Date(now.getTime() + 60 * 60 * 1000);
  defaultStart.setMinutes(0, 0, 0);
  const defaultEnd = new Date(defaultStart.getTime() + 60 * 60 * 1000);

  return (
    <section className="grid gap-8 lg:grid-cols-[minmax(0,430px)_minmax(0,1fr)]">
      <div>
        <GlassPanel className="p-6 text-[var(--text-light)]">
          <div className="mb-4">
            <PageEyebrow>Create Appointment</PageEyebrow>
          </div>

          <h2 className="m-0 text-[1.7rem] leading-tight tracking-[-0.03em] text-[var(--text-light)]">
            Book a coaching appointment
          </h2>

          <p className="mb-0 mt-4 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.88)]">
            Team users can create appointments for coaching clients directly.
            This is the practical version first: reliable, editable later,
            dramatically less haunted than trying to improvise everything in
            Google Calendar by hand.
          </p>

          <form action={createAppointmentAction} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="clientUserId"
                className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
              >
                Client
              </label>
              <select
                id="clientUserId"
                name="clientUserId"
                required
                className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none"
                defaultValue=""
              >
                <option value="" disabled className="text-black">
                  Select a client
                </option>
                {clients.map((client) => (
                  <option key={client.userId} value={client.userId} className="text-black">
                    {client.displayName || client.user.name || client.user.primaryEmail}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="coachUserId"
                className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
              >
                Coach
              </label>
              <select
                id="coachUserId"
                name="coachUserId"
                className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none"
                defaultValue=""
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

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label
                  htmlFor="scheduledStart"
                  className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
                >
                  Start
                </label>
                <input
                  id="scheduledStart"
                  name="scheduledStart"
                  type="datetime-local"
                  required
                  defaultValue={formatLocalDateTime(defaultStart)}
                  className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="scheduledEnd"
                  className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
                >
                  End
                </label>
                <input
                  id="scheduledEnd"
                  name="scheduledEnd"
                  type="datetime-local"
                  required
                  defaultValue={formatLocalDateTime(defaultEnd)}
                  className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="timezone"
                className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
              >
                Time zone
              </label>
              <input
                id="timezone"
                name="timezone"
                type="text"
                defaultValue="America/Denver"
                className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="locationType"
                className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
              >
                Location type
              </label>
              <select
                id="locationType"
                name="locationType"
                defaultValue="VIDEO"
                className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none"
              >
                <option value="VIDEO" className="text-black">Video</option>
                <option value="PHONE" className="text-black">Phone</option>
                <option value="IN_PERSON" className="text-black">In person</option>
                <option value="OTHER" className="text-black">Other</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="locationDetails"
                className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
              >
                Location details
              </label>
              <input
                id="locationDetails"
                name="locationDetails"
                type="text"
                placeholder="Zoom link, phone number, office, etc."
                className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none placeholder:text-[rgba(245,239,230,0.4)]"
              />
            </div>

            <div>
              <label
                htmlFor="notes"
                className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
              >
                Internal notes
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={4}
                className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none placeholder:text-[rgba(245,239,230,0.4)]"
                placeholder="Anything the team should know before the appointment"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-2xl border border-flare/25 bg-flare/15 px-4 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] transition hover:border-flare/40 hover:bg-flare/20"
            >
              Create appointment
            </button>
          </form>
        </GlassPanel>
      </div>

      <div>
        <StatusMessage success={success} error={error} />

        <GlassPanel className="p-6 text-[var(--text-light)]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <PageEyebrow>Upcoming</PageEyebrow>
              <h2 className="m-0 text-[1.7rem] leading-tight tracking-[-0.03em] text-[var(--text-light)]">
                Appointment queue
              </h2>
            </div>

            <div className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm font-semibold text-[rgba(245,239,230,0.88)]">
              {appointments.length} shown
            </div>
          </div>

          {appointments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/4 px-5 py-8 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.82)]">
              No appointments yet. Create the first one on the left and pretend
              this whole system was inevitable.
            </div>
          ) : (
            <div className="space-y-4">
              {appointments.map((appointment) => (
                <div
                  key={appointment.id}
                  className="rounded-[24px] border border-white/10 bg-white/6 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="m-0 text-[1.1rem] font-bold text-[var(--text-light)]">
                        {appointment.clientUser.name || appointment.clientUser.primaryEmail}
                      </h3>

                      <p className="mb-0 mt-2 text-[0.95rem] leading-7 text-[rgba(245,239,230,0.88)]">
                        {appointment.scheduledStart.toLocaleString()} →{" "}
                        {appointment.scheduledEnd.toLocaleString()}
                      </p>
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
                        Created by
                      </div>
                      <div className="text-sm leading-6 text-[rgba(245,239,230,0.88)]">
                        {appointment.createdByUser.name ||
                          appointment.createdByUser.primaryEmail}
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

                  {appointment.notes ? (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
                        Notes
                      </div>
                      <div className="text-sm leading-7 text-[rgba(245,239,230,0.88)]">
                        {appointment.notes}
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </GlassPanel>
      </div>
    </section>
  );
}