import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  type LucideIcon,
  MessageSquareText,
  Radio,
  Send,
  UserRoundPlus,
} from "lucide-react";

import type { SessionFinishingEvidence } from "./session-finishing-cockpit";
import type { SessionPreparation } from "./session-preparation-model";
import { sessionWorkspaceHref } from "./session-workspace-model";

export type CoachingQuickPathStep = {
  id: "invite" | "record" | "transcript" | "follow-up";
  label: string;
  detail: string;
  href: string;
  action: string;
  state: "DONE" | "NEXT" | "LATER";
  icon: LucideIcon;
};

export function buildCoachingQuickPath(input: {
  roomId: string;
  preparation: SessionPreparation | null;
  contentReadiness: {
    status: "none" | "capture-proof-only" | "substantial";
  } | null;
  finishingEvidence: SessionFinishingEvidence;
}) {
  const participantReady = (input.preparation?.participants.length ?? 0) >= 2;
  const recordingReady = input.contentReadiness?.status === "substantial";
  const transcriptEvidenceReady = input.finishingEvidence.transcriptJobs.some(
    (job) => job.readiness ? job.readiness.state === "READY" : job.status === "COMPLETED" && job.segmentCount > 0,
  );
  const transcriptNeedsReview = input.finishingEvidence.transcriptJobs.some(
    (job) => job.readiness?.state === "REVIEW_REQUIRED" || job.readiness?.state === "HELD",
  );
  const transcriptReady = recordingReady && transcriptEvidenceReady;
  const followUpEvidenceReleased = input.finishingEvidence.outputs.some(
    (output) =>
      output.kind === "CLIENT_FOLLOW_UP" && output.status === "RELEASED",
  );
  const followUpReleased = transcriptReady && followUpEvidenceReleased;

  const completed = [
    participantReady,
    recordingReady,
    transcriptReady,
    followUpReleased,
  ];
  const nextIndex = completed.findIndex((value) => !value);
  const stateAt = (index: number): CoachingQuickPathStep["state"] =>
    completed[index] ? "DONE" : index === nextIndex ? "NEXT" : "LATER";

  return [
    {
      id: "invite" as const,
      label: "Invite and check devices",
      detail: participantReady
        ? "You and your client can open this private Session."
        : "Invite your client, then choose the microphone, camera, and headphones you want to use.",
      href: sessionWorkspaceHref(
        input.roomId,
        participantReady ? "live" : "prepare",
      ),
      action: participantReady ? "Open room" : "Invite client",
      state: stateAt(0),
      icon: UserRoundPlus,
    },
    {
      id: "record" as const,
      label: "Call and record",
      detail: recordingReady
        ? "Your Session recordings are ready."
        : "Join the call and start recording on each device you want to keep in full quality.",
      href: sessionWorkspaceHref(input.roomId, "live"),
      action: recordingReady ? "Review recording" : "Start Session",
      state: stateAt(1),
      icon: Radio,
    },
    {
      id: "transcript" as const,
      label: "Read and edit the transcript",
      detail: transcriptReady
        ? "The transcript is ready to read, correct, and trim."
        : transcriptEvidenceReady
          ? "Quipsly is matching the transcript to the complete Session recording."
          : transcriptNeedsReview
            ? "The transcript is ready for a quick timing or speaker check."
          : "Create the transcript, correct any words or speakers, and trim from the text.",
      href: sessionWorkspaceHref(input.roomId, "transcript"),
      action: transcriptReady ? "Open transcript" : "Create transcript",
      state: stateAt(2),
      icon: MessageSquareText,
    },
    {
      id: "follow-up" as const,
      label: "Share the follow-up",
      detail: followUpReleased
        ? "Your client can see the shared follow-up in this private Session."
        : followUpEvidenceReleased
          ? "A follow-up is ready to reconnect to the finished transcript."
          : "Quipsly creates editable notes, tasks, and goals; share the ones that help.",
      href: `${sessionWorkspaceHref(input.roomId, "outputs")}#client-follow-up`,
      action: followUpReleased ? "View shared follow-up" : "Prepare follow-up",
      state: stateAt(3),
      icon: Send,
    },
  ] satisfies CoachingQuickPathStep[];
}

export function SessionCoachingQuickPath(props: {
  roomId: string;
  preparation: SessionPreparation | null;
  contentReadiness: {
    status: "none" | "capture-proof-only" | "substantial";
  } | null;
  finishingEvidence: SessionFinishingEvidence;
}) {
  const steps = buildCoachingQuickPath(props);
  const next = steps.find((step) => step.state === "NEXT") ?? steps.at(-1)!;

  return (
    <section
      className="rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-4 shadow-sm sm:p-6"
      aria-labelledby="coaching-quick-path-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-800">
            Session flow
          </p>
          <h2
            id="coaching-quick-path-heading"
            className="mt-1 font-serif text-2xl font-black text-[#3d3122] sm:text-3xl"
          >
            Your Session, start to finish
          </h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#765f40]">
            Quipsly keeps the call, recording, transcript, follow-up, and shared
            work together.
          </p>
        </div>
        <Link
          href={next.href}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-violet-800 px-5 py-2 text-xs font-black uppercase tracking-wide text-white"
        >
          {next.action} <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>

      <ol className="mt-4 grid gap-2 lg:grid-cols-4 lg:gap-3">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <li
              key={step.id}
              className={`rounded-2xl border p-3 sm:p-4 ${
                step.state === "DONE"
                  ? "border-emerald-200 bg-emerald-50"
                  : step.state === "NEXT"
                    ? "border-violet-300 bg-white ring-2 ring-violet-100"
                    : "border-slate-200 bg-white/65"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-[#765f40]">
                  <Icon size={15} aria-hidden="true" /> {index + 1}
                </span>
                {step.state === "DONE" ? (
                  <CheckCircle2
                    size={17}
                    className="text-emerald-700"
                    aria-label="Done"
                  />
                ) : (
                  <CircleDashed
                    size={17}
                    className={
                      step.state === "NEXT"
                        ? "text-violet-700"
                        : "text-slate-400"
                    }
                    aria-label={step.state === "NEXT" ? "Next" : "Later"}
                  />
                )}
              </div>
              <h3 className="mt-1 font-black text-[#3d3122] sm:mt-3">{step.label}</h3>
              <p className={`${step.state === "NEXT" ? "block" : "hidden sm:block"} mt-1 text-xs font-semibold leading-5 text-[#765f40] sm:mt-2`}>
                {step.detail}
              </p>
              <Link
                href={step.href}
                className="mt-1 inline-flex min-h-9 items-center gap-1 text-xs font-black text-violet-800 hover:underline sm:mt-3 sm:min-h-10"
              >
                {step.action} <ArrowRight size={12} aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
