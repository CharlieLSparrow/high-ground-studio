import type {
  HgoProjectionReviewGate,
  HgoProjectionReviewIssue,
} from "@/lib/hgo/projection-review-gate";

const issueStyles: Record<HgoProjectionReviewIssue["severity"], string> = {
  blocker: "border-rose-300/35 bg-rose-300/10 text-rose-100",
  warning: "border-amber-300/35 bg-amber-300/10 text-amber-100",
  info: "border-sky-300/35 bg-sky-300/10 text-sky-100",
};

function Pill({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${className}`}>
      {children}
    </span>
  );
}

function IssueGroup({
  title,
  emptyMessage,
  issues,
}: {
  title: string;
  emptyMessage: string;
  issues: HgoProjectionReviewIssue[];
}) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-void-light/55 p-4">
      <p className="text-xs font-black uppercase text-subject-muted">{title}</p>
      {issues.length ? (
        <div className="mt-3 grid gap-3">
          {issues.map((issue) => (
            <div
              key={issue.id}
              className={`rounded-[18px] border p-4 ${issueStyles[issue.severity]}`}
            >
              <div className="flex flex-wrap gap-2">
                <Pill className={issueStyles[issue.severity]}>
                  {issue.severity}
                </Pill>
                {issue.blocksLivePromotion ? (
                  <Pill className="border-rose-300/35 bg-rose-300/10 text-rose-100">
                    blocks live
                  </Pill>
                ) : null}
              </div>
              <h4 className="mt-3 text-base font-black">{issue.title}</h4>
              <p className="mt-2 text-sm leading-6 opacity-90">{issue.detail}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm font-bold leading-6 text-subject-muted">
          {emptyMessage}
        </p>
      )}
    </div>
  );
}

export default function ProjectionReviewGatePanel({
  gate,
  className = "",
  testId = "hgo-projection-review-gate-panel",
}: {
  gate: HgoProjectionReviewGate;
  className?: string;
  testId?: string;
}) {
  const blockers = gate.issues.filter((issue) => issue.severity === "blocker");
  const warnings = gate.issues.filter((issue) => issue.severity === "warning");
  const infos = gate.issues.filter((issue) => issue.severity === "info");

  return (
    <section
      className={`rounded-[28px] border border-amber-300/25 bg-amber-300/10 p-5 text-amber-50 shadow-glass ${className}`}
      data-testid={testId}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-black uppercase text-amber-100">
            Review gate and promotion readiness
          </p>
          <h2 className="mt-2 text-3xl font-black leading-tight text-subject">
            {gate.canPromoteToLive ? "Promotion-ready" : "Promotion blocked"}
          </h2>
          <p className="mt-3 text-sm leading-6 text-subject-muted">
            This panel evaluates projection review state only. No publish action
            is available here.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Pill className="border-white/15 bg-white/8 text-subject-muted">
            {gate.status}
          </Pill>
          <Pill className="border-white/15 bg-white/8 text-subject-muted">
            {gate.visibility}
          </Pill>
          <Pill
            className={
              gate.isLiveSafe
                ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100"
                : "border-amber-300/35 bg-amber-300/10 text-amber-100"
            }
          >
            {gate.isLiveSafe ? "live-safe" : "not live-safe"}
          </Pill>
        </div>
      </div>

      <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[18px] border border-white/10 bg-void-light/55 p-4">
          <p className="text-xs font-bold uppercase text-subject-muted">
            Can promote
          </p>
          <p className="mt-2 text-3xl font-black">
            {gate.canPromoteToLive ? "Yes" : "No"}
          </p>
        </div>
        <div className="rounded-[18px] border border-white/10 bg-void-light/55 p-4">
          <p className="text-xs font-bold uppercase text-subject-muted">
            Live-safe
          </p>
          <p className="mt-2 text-3xl font-black">
            {gate.isLiveSafe ? "Yes" : "No"}
          </p>
        </div>
        <div className="rounded-[18px] border border-rose-300/20 bg-rose-300/10 p-4">
          <p className="text-xs font-bold uppercase text-rose-100">Blockers</p>
          <p className="mt-2 text-3xl font-black">{gate.blockerCount}</p>
        </div>
        <div className="rounded-[18px] border border-amber-300/20 bg-amber-300/10 p-4">
          <p className="text-xs font-bold uppercase text-amber-100">Warnings</p>
          <p className="mt-2 text-3xl font-black">{gate.warningCount}</p>
        </div>
      </div>

      <p className="mt-5 text-sm font-black text-amber-100">
        No publish action is available here. Promote to live will require a
        later approved workflow.
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <IssueGroup
          title="Blockers"
          issues={blockers}
          emptyMessage="No live-blocking issues under the current staged review gate."
        />
        <IssueGroup
          title="Warnings"
          issues={warnings}
          emptyMessage="No staged-review warnings under the current gate."
        />
        <IssueGroup
          title="Info"
          issues={infos}
          emptyMessage="No informational review notes."
        />
      </div>
    </section>
  );
}
