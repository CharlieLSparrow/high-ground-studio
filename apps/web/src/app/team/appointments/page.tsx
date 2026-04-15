import GlassPanel from "@/components/ui/GlassPanel";
import PageEyebrow from "@/components/ui/PageEyebrow";

export default function TeamAppointmentsPlaceholderPage() {
  return (
    <GlassPanel className="p-6 text-[var(--text-light)]">
      <PageEyebrow>Appointments</PageEyebrow>

      <h2 className="m-0 text-[1.8rem] leading-tight tracking-[-0.03em] text-[var(--text-light)]">
        Appointment console coming next
      </h2>

      <p className="mb-0 mt-4 max-w-[760px] text-[1rem] leading-7 text-[rgba(245,239,230,0.88)]">
        This page is intentionally a placeholder. Next slice, we wire team
        appointment creation, editing, and rescheduling so Scott or a helper can
        manage bookings without begging a spreadsheet to behave.
      </p>
    </GlassPanel>
  );
}