import Link from "next/link";
import { ArrowRight, AudioLines, ListTodo, MessageSquareText, Radio, type LucideIcon } from "lucide-react";
import type { SessionFinishingEvidence } from "./session-finishing-cockpit";
import type { SessionPreparation } from "./session-preparation-model";
import type { SessionSourceEvidence } from "./session-source-evidence-model";
import { sessionWorkspaceHref } from "./session-workspace-model";

type RecordingShortcutSource = Pick<SessionSourceEvidence["sources"][number],
  "recordingAssetId" | "status" | "protectedPlayback">;

type CoachingWorkspaceInput = {
  roomId: string;
  preparation: SessionPreparation | null;
  recordingSources?: readonly RecordingShortcutSource[];
  finishingEvidence: SessionFinishingEvidence;
  audience?: "producer" | "participant";
};

export type CoachingQuickPathStep = {
  id: "call" | "record" | "transcript" | "work";
  label: string;
  detail: string;
  href: string;
  action: string;
  status: string;
  icon: LucideIcon;
};

function playableSources(sources: readonly RecordingShortcutSource[]) {
  // Reuse the authorized playback projection, not a recording-length or QA gate.
  return sources.filter(source => source.status === "VERIFIED_MATCH" && source.protectedPlayback?.url);
}

export function buildCoachingQuickPath(input: CoachingWorkspaceInput): CoachingQuickPathStep[] {
  const sources = input.recordingSources ?? [];
  const available = playableSources(sources);
  const attentionCount = sources.length - available.length;
  // A retry must not be concealed by an earlier successful attempt on that source.
  const latestJobs = new Map<string, SessionFinishingEvidence["transcriptJobs"][number]>();
  for (const job of [...input.finishingEvidence.transcriptJobs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
    const key = job.recordingAssetId ?? job.id;
    if (!latestJobs.has(key)) latestJobs.set(key, job);
  }
  const jobs = [...latestJobs.values()];
  const textAvailable = jobs.some(job => job.segmentCount > 0 && job.status === "COMPLETED"
    && job.readiness?.state !== "HELD" && job.readiness?.state !== "PROCESSING");
  const transcriptAttention = jobs.some(job => job.status === "FAILED" || job.status === "HELD"
    || job.readiness?.state === "HELD");
  const attributionAttention = jobs.some(job => job.readiness?.state === "REVIEW_REQUIRED");
  const processing = jobs.some(job => ["QUEUED", "PENDING", "PROCESSING", "RUNNING"].includes(job.status)
    || job.readiness?.state === "PROCESSING");
  const transcriptDetail = textAvailable
    ? attributionAttention ? "Read and correct the text. Some speaker labels or timing may need adjustment."
      : transcriptAttention ? "Available text is ready to read. Another transcript needs attention."
        : processing ? "Read and correct the available text while the remaining recordings transcribe."
          : "Read, correct, and work from your transcript."
    : transcriptAttention ? "A transcript needs attention. Open it to see what happened and recover."
      : processing ? "Your transcript is being prepared. You can keep working here."
        : "Your transcript will appear here after recording. Notes and shared work are available now.";

  return [
    {
      id: "call", label: "Call", status: "Join when ready",
      detail: "Check your microphone and camera, then join the private call.",
      href: sessionWorkspaceHref(input.roomId, "live"), action: "Join call", icon: Radio,
    },
    {
      id: "record", label: "Recordings",
      status: available.length ? "Available" : sources.length ? "Needs attention" : "No recording yet",
      detail: available.length
        ? `${available.length} recording${available.length === 1 ? "" : "s"} available to play and work with.${attentionCount ? ` ${attentionCount} more need attention.` : ""}`
        : sources.length ? "Open recordings to check upload progress or recover a recording."
          : "Listen, make a light edit, or download a shared recording here.",
      href: sessionWorkspaceHref(input.roomId, "recordings"), action: "Open recordings", icon: AudioLines,
    },
    {
      id: "transcript", label: "Transcript",
      status: textAvailable ? "Available" : transcriptAttention ? "Needs attention" : processing ? "Processing" : "No transcript yet",
      detail: transcriptDetail,
      href: sessionWorkspaceHref(input.roomId, "transcript"), action: "Open transcript", icon: MessageSquareText,
    },
    {
      id: "work", label: "Shared work", status: "Always available",
      detail: "Work together on tasks and goals before or after the call. Generated work stays editable.",
      href: sessionWorkspaceHref(input.roomId, "work"), action: "Open shared work", icon: ListTodo,
    },
  ];
}

export function SessionCoachingQuickPath(props: CoachingWorkspaceInput) {
  const cards = buildCoachingQuickPath(props);
  const producer = props.audience !== "participant";
  const needsInvite = producer && (props.preparation?.participants.length ?? 0) < 2;
  const available = playableSources(props.recordingSources ?? []).length > 0;
  const primary = needsInvite
    ? { href: sessionWorkspaceHref(props.roomId, "prepare"), action: "Invite client" }
    : cards.find(card => card.id === (available ? "record" : "call"))!;
  const followUpShared = props.finishingEvidence.outputs.some(output =>
    output.kind === "CLIENT_FOLLOW_UP" && output.status === "RELEASED");

  return (
    <section className="rounded-3xl border border-[#ddcdaf] bg-[#fffdf8] p-4 shadow-sm sm:p-6"
      aria-labelledby="coaching-quick-path-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="coaching-quick-path-heading" className="font-serif text-2xl font-bold text-[#3d3122]">
            Your session workspace
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#765f40]">
            The call and everything you work on together, in one place.
          </p>
        </div>
        <nav aria-label="Session actions">
          <Link href={primary.href} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#354438] px-5 py-2 text-sm font-bold text-white">
            {primary.action} <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </nav>
      </div>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {cards.map(card => {
          const Icon = card.icon;
          return (
            <li key={card.id} className="min-w-0 rounded-2xl border border-[#ddcdaf] bg-[#f7f3e8] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="inline-flex items-center gap-2 font-bold text-[#3d3122]">
                  <Icon size={18} aria-hidden="true" /> {card.label}
                </h3>
                <span className="text-xs text-[#765f40]">{card.status}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-[#765f40]">{card.detail}</p>
              <Link href={card.href} className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-bold text-[#354438] hover:underline">
                {card.action} <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
      <nav aria-label="Session notes and follow-up" className="mt-3 flex flex-wrap gap-x-5">
        <Link href={sessionWorkspaceHref(props.roomId, "notes")} className="inline-flex min-h-11 items-center text-sm font-bold text-[#354438] hover:underline">
          Session notes
        </Link>
        {producer || followUpShared ? (
          <Link href={`${sessionWorkspaceHref(props.roomId, "outputs")}#client-follow-up`} className="inline-flex min-h-11 items-center text-sm font-bold text-[#354438] hover:underline">
            {followUpShared ? "Shared follow-up" : "Prepare follow-up"}
          </Link>
        ) : null}
      </nav>
    </section>
  );
}
