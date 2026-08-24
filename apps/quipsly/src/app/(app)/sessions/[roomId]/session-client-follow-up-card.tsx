"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ClipboardCheck,
  Download,
  Eye,
  LockKeyhole,
  Play,
  RotateCcw,
  Send,
  Share2,
  ShieldCheck,
  Target,
} from "lucide-react";
import type { TranscriptSourceSpeakerAuthority } from "@high-ground/quipsly-domain/transcript-derived-task";

import {
  transcriptSpeakerEvidenceCopy,
  TranscriptSpeakerEvidenceBadge,
} from "@/components/transcript-speaker-evidence-badge";

type FollowUpSourceAnchor = {
  schema: string;
  roomId: string;
  transcriptJobId: string;
  segmentId: string;
  startSeconds: number;
  endSeconds: number;
  providerTextSha256: string;
  providerSpeakerLabel: string | null;
  effectiveTextSnapshot: string;
  effectiveSpeakerLabelSnapshot: string | null;
  speakerAuthority?: TranscriptSourceSpeakerAuthority | null;
  sourceBoundParticipantId?: string | null;
  acceptedCorrectionId: string | null;
  recordingAssetId: string;
  playbackSourceId: string;
};

type EligibleNote = {
  id: string;
  title: string | null;
  body: string;
  kind: string;
  sourceAnchor?: FollowUpSourceAnchor | null;
  revisionCount: number;
  updatedAt: string;
};

type EligibleTask = {
  id: string;
  title: string;
  detail: string | null;
  status: string;
  dueAt: string | null;
  completedAt: string | null;
  sourceAnchor?: FollowUpSourceAnchor | null;
  updatedAt: string;
};

type EligibleGoal = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  targetAt: string | null;
  achievedAt: string | null;
  sourceAnchor?: FollowUpSourceAnchor | null;
  updatedAt: string;
};

type FollowUpOutput = {
  id: string;
  roomId: string;
  createdByUserId: string;
  recipientUserId: string;
  kind: "CLIENT_FOLLOW_UP";
  status: "DRAFT" | "RELEASED" | "REVOKED";
  title: string;
  intro: string | null;
  nextSessionFocus: string | null;
  contentSha256: string;
  revision: number;
  releasedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; label: string };
  recipient: { id: string; label: string };
  body: {
    schema?: string;
    notes?: Array<{
      id: string;
      title: string | null;
      body: string;
      kind: string;
      sourceAnchor?: FollowUpSourceAnchor | null;
    }>;
    tasks?: Array<{
      id: string;
      title: string;
      detail: string | null;
      status: string;
      dueAt: string | null;
      sourceAnchor?: FollowUpSourceAnchor | null;
    }>;
    goals?: Array<{
      id: string;
      title: string;
      description: string | null;
      status: string;
      targetAt: string | null;
      sourceAnchor?: FollowUpSourceAnchor | null;
    }>;
    nextSessionFocus?: string | null;
  };
  deliveryEvents: Array<{
    id: string;
    kind: "RELEASED_IN_APP" | "OPENED_IN_APP" | "REVOKED" | "EXPORTED";
    actorUserId: string;
    recipientUserId: string;
    occurredAt: string;
    contentSha256: string;
  }>;
};

type FollowUpResponse = {
  ok: boolean;
  code?: string;
  error?: string;
  role?: "COACH" | "CLIENT";
  room?: {
    id: string;
    title: string;
    scheduledStart: string | null;
    coach: { id: string; label: string } | null;
    client: { id: string; label: string };
  };
  eligible?: {
    notes: EligibleNote[];
    tasks: EligibleTask[];
    goals: EligibleGoal[];
  } | null;
  output?: FollowUpOutput | null;
  readiness?: {
    status: "READY" | "SOURCE_CHANGED";
    releaseAllowed: boolean;
    checkedRevision: number;
    selectedCount: number;
    changedCount: number;
    changes: Array<{
      kind: "FOLLOW_UP" | "NOTE" | "GOAL" | "TASK";
      id: string;
      label: string;
      reason:
        | "SNAPSHOT_INVALID"
        | "MANIFEST_INVALID"
        | "SELECTION_MISMATCH"
        | "NO_LONGER_ELIGIBLE"
        | "CONTENT_CHANGED";
    }>;
  } | null;
};

function selectedState(values: string[]) {
  return new Set(values);
}

function toggle(set: Set<string>, id: string) {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function formatMediaTime(value: number) {
  const total = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function readinessChangeLabel(reason: NonNullable<FollowUpResponse["readiness"]>["changes"][number]["reason"]) {
  if (reason === "CONTENT_CHANGED") return "changed after this draft was saved";
  if (reason === "NO_LONGER_ELIGIBLE") return "is no longer eligible for this client follow-up";
  if (reason === "SELECTION_MISMATCH") return "does not match the frozen source selection";
  if (reason === "SNAPSHOT_INVALID") return "failed its immutable snapshot check";
  return "failed its source-manifest check";
}

function normalizedDraftText(value: string | null | undefined) {
  return (value ?? "").replace(/\r\n/g, "\n").trim();
}

function markdownText(value: string | null | undefined) {
  return (value ?? "").replace(/\r\n/g, "\n").trim();
}

export function clientFollowUpExportFileName(output: Pick<FollowUpOutput, "title" | "revision">) {
  const slug = output.title
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80) || "quipsly-coaching-follow-up";
  return `${slug}-r${output.revision}.md`;
}

export function clientFollowUpMarkdown(output: FollowUpOutput) {
  const notes = Array.isArray(output.body.notes) ? output.body.notes : [];
  const goals = Array.isArray(output.body.goals) ? output.body.goals : [];
  const tasks = Array.isArray(output.body.tasks) ? output.body.tasks : [];
  const lines = [
    `# ${markdownText(output.title)}`,
    "",
    `For: ${markdownText(output.recipient.label)}`,
    `Revision: ${output.revision}`,
    `Status: ${output.status}`,
    `Content SHA-256: ${output.contentSha256}`,
  ];
  if (output.releasedAt) lines.push(`Released: ${output.releasedAt}`);
  if (markdownText(output.intro)) lines.push("", markdownText(output.intro));
  if (notes.length) {
    lines.push("", "## Notes");
    for (const note of notes) {
      lines.push("", `### ${markdownText(note.title) || "Session note"}`, "", markdownText(note.body));
      if (note.sourceAnchor) lines.push(`Source: ${formatMediaTime(note.sourceAnchor.startSeconds)}-${formatMediaTime(note.sourceAnchor.endSeconds)}${speakerEvidenceMarkdown(note.sourceAnchor)}`);
    }
  }
  if (goals.length) {
    lines.push("", "## Goals");
    for (const goal of goals) {
      lines.push("", `- [${goal.status === "ACHIEVED" ? "x" : " "}] ${markdownText(goal.title)}${goal.targetAt ? ` (target ${goal.targetAt})` : ""}`);
      if (markdownText(goal.description)) lines.push(`  ${markdownText(goal.description)}`);
      if (goal.sourceAnchor) lines.push(`  Source: ${formatMediaTime(goal.sourceAnchor.startSeconds)}-${formatMediaTime(goal.sourceAnchor.endSeconds)}${speakerEvidenceMarkdown(goal.sourceAnchor)}`);
    }
  }
  if (tasks.length) {
    lines.push("", "## Commitments");
    for (const task of tasks) {
      lines.push("", `- [${task.status === "DONE" ? "x" : " "}] ${markdownText(task.title)}${task.dueAt ? ` (due ${task.dueAt})` : ""}`);
      if (markdownText(task.detail)) lines.push(`  ${markdownText(task.detail)}`);
      if (task.sourceAnchor) lines.push(`  Source: ${formatMediaTime(task.sourceAnchor.startSeconds)}-${formatMediaTime(task.sourceAnchor.endSeconds)}${speakerEvidenceMarkdown(task.sourceAnchor)}`);
    }
  }
  if (markdownText(output.nextSessionFocus)) {
    lines.push("", "## Bring into the next session", "", markdownText(output.nextSessionFocus));
  }
  lines.push("", "---", "Prepared from a reviewed Quipsly client-safe snapshot. Private notes and unreviewed transcript candidates are excluded.", "");
  return lines.join("\n");
}

function speakerEvidenceMarkdown(anchor: FollowUpSourceAnchor) {
  const evidence = transcriptSpeakerEvidenceCopy(anchor.speakerAuthority);
  return evidence ? ` · Speaker evidence: ${evidence.label}` : "";
}

function selectionMatches(
  selected: Set<string>,
  frozen: Array<{ id: string }>,
) {
  return selected.size === frozen.length
    && frozen.every((item) => selected.has(item.id));
}

function FollowUpSourceLink({ anchor, recordLabel }: { anchor: FollowUpSourceAnchor | null | undefined; recordLabel: string }) {
  if (!anchor) return null;
  return <div className="mt-2">
    <TranscriptSpeakerEvidenceBadge authority={anchor.speakerAuthority} />
    <a
      href={`/sessions/${encodeURIComponent(anchor.roomId)}?mode=transcript#transcript-segment-${encodeURIComponent(anchor.segmentId)}`}
      className="mt-2 flex min-h-11 w-fit items-center gap-2 rounded-full border border-sky-200 bg-white px-3 py-2 text-xs font-black text-sky-900 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
      aria-label={`Return to exact source for ${recordLabel} at ${formatMediaTime(anchor.startSeconds)}`}
    >
      <Play size={14} aria-hidden="true" />
      Exact source · {formatMediaTime(anchor.startSeconds)}–{formatMediaTime(anchor.endSeconds)}
    </a>
  </div>;
}

function FollowUpArtifact({ output }: { output: FollowUpOutput }) {
  const notes = Array.isArray(output.body.notes) ? output.body.notes : [];
  const goals = Array.isArray(output.body.goals) ? output.body.goals : [];
  const tasks = Array.isArray(output.body.tasks) ? output.body.tasks : [];
  return (
    <article
      className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm"
      aria-label={`Client follow-up ${output.title}`}
      data-testid="client-follow-up-artifact"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-800">
            {output.status === "RELEASED"
              ? "Released in Quipsly"
              : "Private coach draft"}
          </p>
          <h3 className="mt-1 font-serif text-3xl font-black text-[#283c31]">
            {output.title}
          </h3>
          <p className="mt-1 text-xs font-bold text-[#5c7163]">
            For {output.recipient.label} · revision {output.revision}
            {output.releasedAt
              ? ` · released ${formatDate(output.releasedAt)}`
              : ""}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-emerald-900">
          <ShieldCheck size={14} aria-hidden="true" /> Client-safe snapshot
        </span>
      </div>
      {output.intro ? (
        <p className="mt-5 whitespace-pre-wrap text-sm font-semibold leading-6 text-[#4d6255]">
          {output.intro}
        </p>
      ) : null}
      {notes.length ? (
        <section
          className="mt-5"
          aria-labelledby={`follow-up-notes-${output.id}`}
        >
          <h4
            id={`follow-up-notes-${output.id}`}
            className="text-xs font-black uppercase tracking-[0.14em] text-[#466052]"
          >
            What we want to keep
          </h4>
          <div className="mt-2 space-y-2">
            {notes.map((note) => (
              <div
                key={note.id}
                className="rounded-xl border border-emerald-100 bg-emerald-50/45 p-3"
              >
                <p className="font-black text-[#283c31]">
                  {note.title || "Session note"}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm font-semibold leading-5 text-[#53675a]">
                  {note.body}
                </p>
                <FollowUpSourceLink
                  anchor={note.sourceAnchor}
                  recordLabel={note.title || "Session note"}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {goals.length ? (
        <section
          className="mt-5"
          aria-labelledby={`follow-up-goals-${output.id}`}
        >
          <h4
            id={`follow-up-goals-${output.id}`}
            className="text-xs font-black uppercase tracking-[0.14em] text-[#466052]"
          >
            Goals
          </h4>
          <div className="mt-2 space-y-2">
            {goals.map((goal) => (
              <div
                key={goal.id}
                className="rounded-xl border border-sky-100 bg-sky-50/55 p-3"
              >
                <p className="font-black text-sky-950">{goal.title}</p>
                {goal.description ? (
                  <p className="mt-1 text-sm font-semibold text-sky-900">
                    {goal.description}
                  </p>
                ) : null}
                <p className="mt-1 text-[10px] font-black uppercase tracking-wide text-sky-800">
                  {goal.status}
                  {goal.targetAt
                    ? ` · target ${formatDate(goal.targetAt)}`
                    : ""}
                </p>
                <FollowUpSourceLink
                  anchor={goal.sourceAnchor}
                  recordLabel={goal.title}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {tasks.length ? (
        <section
          className="mt-5"
          aria-labelledby={`follow-up-tasks-${output.id}`}
        >
          <h4
            id={`follow-up-tasks-${output.id}`}
            className="text-xs font-black uppercase tracking-[0.14em] text-[#466052]"
          >
            Commitments
          </h4>
          <div className="mt-2 space-y-2">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="rounded-xl border border-amber-100 bg-amber-50/55 p-3"
              >
                <p className="font-black text-amber-950">{task.title}</p>
                {task.detail ? (
                  <p className="mt-1 text-sm font-semibold text-amber-900">
                    {task.detail}
                  </p>
                ) : null}
                <p className="mt-1 text-[10px] font-black uppercase tracking-wide text-amber-800">
                  {task.status}
                  {task.dueAt ? ` · due ${formatDate(task.dueAt)}` : ""}
                </p>
                <FollowUpSourceLink
                  anchor={task.sourceAnchor}
                  recordLabel={task.title}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {output.nextSessionFocus ? (
        <section className="mt-5 rounded-xl border border-violet-200 bg-violet-50 p-4">
          <h4 className="text-xs font-black uppercase tracking-[0.14em] text-violet-900">
            Bring into the next Session
          </h4>
          <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-5 text-violet-950">
            {output.nextSessionFocus}
          </p>
        </section>
      ) : null}
      <p className="mt-5 break-all font-mono text-[9px] text-[#789080]">
        Content SHA-256 {output.contentSha256}
      </p>
    </article>
  );
}

export function SessionClientFollowUpCard({ roomId }: { roomId: string }) {
  const [snapshot, setSnapshot] = useState<FollowUpResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [intro, setIntro] = useState("");
  const [nextSessionFocus, setNextSessionFocus] = useState("");
  const [noteIds, setNoteIds] = useState<Set<string>>(new Set());
  const [taskIds, setTaskIds] = useState<Set<string>>(new Set());
  const [goalIds, setGoalIds] = useState<Set<string>>(new Set());
  const openReceiptAttemptRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(roomId)}/client-follow-up`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as FollowUpResponse;
      if (!response.ok || !payload.ok)
        throw new Error(
          payload.error ||
            "Quipsly could not load this private client follow-up.",
        );
      setSnapshot(payload);
      if (payload.role === "COACH" && payload.room) {
        if (payload.output) {
          setTitle(payload.output.title);
          setIntro(payload.output.intro || "");
          setNextSessionFocus(payload.output.nextSessionFocus || "");
          const eligibleNoteIds = new Set(
            payload.eligible?.notes.map((item) => item.id) ?? [],
          );
          const eligibleTaskIds = new Set(
            payload.eligible?.tasks.map((item) => item.id) ?? [],
          );
          const eligibleGoalIds = new Set(
            payload.eligible?.goals.map((item) => item.id) ?? [],
          );
          setNoteIds(
            selectedState(
              (payload.output.body.notes ?? [])
                .map((item) => item.id)
                .filter((id) => eligibleNoteIds.has(id)),
            ),
          );
          setTaskIds(
            selectedState(
              (payload.output.body.tasks ?? [])
                .map((item) => item.id)
                .filter((id) => eligibleTaskIds.has(id)),
            ),
          );
          setGoalIds(
            selectedState(
              (payload.output.body.goals ?? [])
                .map((item) => item.id)
                .filter((id) => eligibleGoalIds.has(id)),
            ),
          );
        } else {
          setTitle(`Follow-up — ${payload.room.title}`);
          setIntro("");
          setNextSessionFocus("");
          setNoteIds(
            selectedState(payload.eligible?.notes.map((item) => item.id) ?? []),
          );
          setTaskIds(
            selectedState(payload.eligible?.tasks.map((item) => item.id) ?? []),
          );
          setGoalIds(
            selectedState(payload.eligible?.goals.map((item) => item.id) ?? []),
          );
        }
      }
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Quipsly could not load this private client follow-up.",
      );
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedCount = noteIds.size + taskIds.size + goalIds.size;
  const hasUnsavedDraftChanges = useMemo(() => {
    const output = snapshot?.output;
    if (!output || output.status !== "DRAFT") return false;
    return normalizedDraftText(title) !== normalizedDraftText(output.title)
      || normalizedDraftText(intro) !== normalizedDraftText(output.intro)
      || normalizedDraftText(nextSessionFocus) !== normalizedDraftText(output.nextSessionFocus)
      || !selectionMatches(noteIds, output.body.notes ?? [])
      || !selectionMatches(goalIds, output.body.goals ?? [])
      || !selectionMatches(taskIds, output.body.tasks ?? []);
  }, [goalIds, intro, nextSessionFocus, noteIds, snapshot?.output, taskIds, title]);
  const sourcesReady = snapshot?.output?.status === "DRAFT"
    && snapshot.readiness?.releaseAllowed === true
    && snapshot.readiness.checkedRevision === snapshot.output.revision;
  const releaseReady = sourcesReady && !hasUnsavedDraftChanges;

  const opened = useMemo(
    () =>
      snapshot?.output?.deliveryEvents.some(
        (event) => event.kind === "OPENED_IN_APP",
      ) === true,
    [snapshot?.output],
  );

  async function mutate(
    action:
      | "CREATE_DRAFT"
      | "UPDATE_DRAFT"
      | "RELEASE"
      | "REVOKE"
      | "ACKNOWLEDGE_OPEN",
  ) {
    setBusy(action);
    setNotice(null);
    try {
      const output = snapshot?.output;
      const body: Record<string, unknown> = {
        action,
        clientRequestId: crypto.randomUUID(),
      };
      if (action === "CREATE_DRAFT" || action === "UPDATE_DRAFT") {
        Object.assign(body, {
          title,
          intro,
          nextSessionFocus,
          noteIds: [...noteIds],
          taskIds: [...taskIds],
          goalIds: [...goalIds],
        });
        if (action === "UPDATE_DRAFT") {
          if (!output || output.status !== "DRAFT") {
            throw new Error("Refresh before revising this private draft.");
          }
          Object.assign(body, {
            outputId: output.id,
            expectedRevision: output.revision,
          });
        }
      } else {
        if (!output)
          throw new Error("Refresh before changing this client follow-up.");
        Object.assign(body, {
          outputId: output.id,
          expectedRevision: output.revision,
        });
      }
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(roomId)}/client-follow-up`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload = (await response.json()) as FollowUpResponse & {
        idempotentReplay?: boolean;
      };
      if (!response.ok || !payload.ok) {
        if (payload.code === "FOLLOW_UP_SOURCE_CHANGED") await load();
        throw new Error(
          payload.error || "The client follow-up operation was not confirmed.",
        );
      }
      setNotice(
        action === "CREATE_DRAFT" || action === "UPDATE_DRAFT"
          ? action === "CREATE_DRAFT"
            ? "Private draft created from the selected client-safe records. The client cannot see it yet."
            : "Private draft revised with an immutable history entry. The client still cannot see it."
          : action === "RELEASE"
            ? "Released inside this client’s private Quipsly Session. No email, message, calendar event, or publication action occurred."
            : action === "REVOKE"
              ? "In-app visibility revoked. The source notes, goals, tasks, revisions, and delivery history remain intact."
              : "Opened in Quipsly.",
      );
      await load();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "The client follow-up operation was not confirmed.",
      );
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    const output = snapshot?.output;
    if (snapshot?.role !== "CLIENT" || !output || opened) return;
    const receiptKey = `${output.id}:${output.revision}:${output.contentSha256}`;
    if (openReceiptAttemptRef.current === receiptKey) return;
    openReceiptAttemptRef.current = receiptKey;
    void mutate("ACKNOWLEDGE_OPEN");
  }, [opened, snapshot?.output, snapshot?.role]);

  async function exportFollowUp() {
    const output = snapshot?.output;
    if (!output) return;
    setBusy("EXPORT");
    setNotice(null);
    const filename = clientFollowUpExportFileName(output);
    const file = new File([clientFollowUpMarkdown(output)], filename, {
      type: "text/markdown;charset=utf-8",
    });
    const shareData = {
      title: output.title,
      text: `Quipsly coaching follow-up for ${output.recipient.label}`,
      files: [file],
    };
    let handoffNotice = "The exact client-safe file was prepared.";
    try {
      if (
        typeof navigator.share === "function" &&
        (typeof navigator.canShare !== "function" || navigator.canShare(shareData))
      ) {
        try {
          await navigator.share(shareData);
          handoffNotice = "The system share sheet accepted the exact client-safe file. Quipsly does not claim who received it.";
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            setNotice("Sharing was canceled. The client-safe file and source records remain unchanged.");
            return;
          }
          handoffNotice = "The exact client-safe file was prepared, but this embedded browser blocked the system share sheet. Open Quipsly in Safari or Chrome and choose this action again.";
        }
      } else {
        try {
          const url = URL.createObjectURL(file);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = filename;
          anchor.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
          handoffNotice = "The exact client-safe follow-up file was downloaded. External delivery is not confirmed.";
        } catch {
          handoffNotice = "The exact client-safe file was prepared, but this embedded browser blocked the download. Open Quipsly in Safari or Chrome and choose this action again.";
        }
      }
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(roomId)}/client-follow-up`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "EXPORT",
            clientRequestId: crypto.randomUUID(),
            outputId: output.id,
            expectedRevision: output.revision,
            expectedContentSha256: output.contentSha256,
          }),
        },
      );
      const payload = (await response.json()) as FollowUpResponse;
      if (!response.ok || !payload.ok || !payload.output) {
        throw new Error(payload.error || "Quipsly could not record the exact file export receipt.");
      }
      await load();
      setNotice(`${handoffNotice} The export receipt is bound to revision ${output.revision} and content hash ${output.contentSha256.slice(0, 12)}….`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setNotice("Sharing was canceled. The client-safe file and source records remain unchanged.");
      } else {
        setNotice(`${handoffNotice} ${error instanceof Error ? error.message : "Quipsly could not record the exact file export receipt."}`);
      }
    } finally {
      setBusy(null);
    }
  }

  if (loading && !snapshot)
    return (
      <section className="rounded-2xl border border-emerald-200 bg-white p-6 text-sm font-bold text-emerald-950">
        <RotateCcw
          className="mr-2 inline animate-spin"
          size={16}
          aria-hidden="true"
        />
        Loading the private follow-up boundary…
      </section>
    );
  if (!snapshot?.role || !snapshot.room)
    return (
      <section
        className="rounded-2xl border border-amber-200 bg-amber-50 p-6"
        role="status"
      >
        <LockKeyhole className="text-amber-800" aria-hidden="true" />
        <h2 className="mt-3 font-serif text-2xl font-black text-amber-950">
          Client follow-up unavailable
        </h2>
        <p className="mt-2 text-sm font-semibold text-amber-900">
          {notice ||
            "This account is not the assigned coach or intended client for this Session."}
        </p>
      </section>
    );

  return (
    <section
      id="client-follow-up"
      className="rounded-2xl border border-emerald-200 bg-emerald-50/35 p-5 md:p-6"
      aria-labelledby="client-follow-up-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-white p-2.5 text-emerald-800">
            <ClipboardCheck aria-hidden="true" />
          </span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-800">
              Coaching follow-up
            </p>
            <h2
              id="client-follow-up-heading"
              className="mt-1 font-serif text-3xl font-black text-[#283c31]"
            >
              Client follow-up
            </h2>
            <p className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-[#5c7163]">
              {snapshot.role === "COACH"
                ? `Choose the notes, goals, and tasks to share with ${snapshot.room.client.label}. You can review a private draft before sharing.`
                : `Follow-ups shared with ${snapshot.room.client.label} appear here. Private coach notes stay private.`}
            </p>
          </div>
        </div>
        <span className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-emerald-900">
          {snapshot.role === "COACH" ? "Assigned coach" : "Intended client"}
        </span>
      </div>

      {notice ? (
        <p
          role="status"
          className="mt-4 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-xs font-bold leading-5 text-emerald-950"
        >
          {notice}
        </p>
      ) : null}

      {snapshot.role === "CLIENT" ? (
        snapshot.output ? (
          <div className="mt-5 space-y-4">
            <FollowUpArtifact output={snapshot.output} />
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void exportFollowUp()}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-emerald-950 disabled:opacity-45"
            >
              <Share2 size={15} aria-hidden="true" />
              {busy === "EXPORT" ? "Preparing file…" : "Share follow-up file"}
            </button>
            {opened ? (
              <p className="inline-flex items-center gap-2 text-xs font-bold text-emerald-800">
                <Eye size={15} aria-hidden="true" />
                Opened in Quipsly
              </p>
            ) : null}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-emerald-300 bg-white/65 p-6">
            <LockKeyhole className="text-emerald-700" aria-hidden="true" />
            <h3 className="mt-3 font-serif text-2xl font-black text-[#283c31]">
              Nothing released yet
            </h3>
            <p className="mt-2 text-sm font-semibold text-[#5c7163]">
              Private coach drafts are intentionally invisible. This space will
              show only a reviewed follow-up released to this exact account.
            </p>
          </div>
        )
      ) : (
        <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_1fr]">
          <div className="rounded-2xl border border-emerald-200 bg-white p-5">
            <h3 className="font-serif text-2xl font-black text-[#283c31]">
              Assemble from approved records
            </h3>
            <div className="mt-4 grid gap-3">
              <label className="text-[10px] font-black uppercase tracking-wide text-emerald-900">
                Title
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={500}
                  className="mt-1 block min-h-11 w-full rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold normal-case tracking-normal"
                />
              </label>
              <label className="text-[10px] font-black uppercase tracking-wide text-emerald-900">
                Opening note
                <textarea
                  value={intro}
                  onChange={(event) => setIntro(event.target.value)}
                  maxLength={4_000}
                  rows={4}
                  placeholder="A deliberate message for the client…"
                  className="mt-1 block w-full rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold normal-case tracking-normal"
                />
              </label>
              <label className="text-[10px] font-black uppercase tracking-wide text-emerald-900">
                Bring into the next Session
                <textarea
                  value={nextSessionFocus}
                  onChange={(event) => setNextSessionFocus(event.target.value)}
                  maxLength={4_000}
                  rows={3}
                  placeholder="What should we return to together?"
                  className="mt-1 block w-full rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold normal-case tracking-normal"
                />
              </label>
            </div>

            <div className="mt-5 space-y-5">
              <fieldset>
                <legend className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-emerald-900">
                  <ShieldCheck size={15} aria-hidden="true" />
                  Client-safe notes
                </legend>
                <div className="mt-2 space-y-2">
                  {snapshot.eligible?.notes.length ? (
                    snapshot.eligible.notes.map((note) => (
                      <label
                        key={note.id}
                        className="flex cursor-pointer items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50/45 p-3"
                      >
                        <input
                          type="checkbox"
                          checked={noteIds.has(note.id)}
                          onChange={() =>
                            setNoteIds((current) => toggle(current, note.id))
                          }
                          className="mt-1"
                        />
                        <span>
                          <span className="block text-sm font-black text-[#283c31]">
                            {note.title || "Session note"}
                          </span>
                          <span className="mt-1 block line-clamp-3 text-xs font-semibold leading-5 text-[#5c7163]">
                            {note.body}
                          </span>
                          {note.sourceAnchor ? (
                            <span className="mt-1 block">
                              <span className="block text-[10px] font-black uppercase tracking-wide text-sky-800">Includes exact source {formatMediaTime(note.sourceAnchor.startSeconds)}–{formatMediaTime(note.sourceAnchor.endSeconds)}</span>
                              <TranscriptSpeakerEvidenceBadge authority={note.sourceAnchor.speakerAuthority} />
                            </span>
                          ) : null}
                        </span>
                      </label>
                    ))
                  ) : (
                    <p className="text-xs font-semibold text-[#6b7f70]">
                      No deliberate note has client-safe visibility.
                    </p>
                  )}
                </div>
              </fieldset>
              <fieldset>
                <legend className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-sky-900">
                  <Target size={15} aria-hidden="true" />
                  Client-owned goals
                </legend>
                <div className="mt-2 space-y-2">
                  {snapshot.eligible?.goals.length ? (
                    snapshot.eligible.goals.map((goal) => (
                      <label
                        key={goal.id}
                        className="flex cursor-pointer items-start gap-3 rounded-xl border border-sky-100 bg-sky-50/55 p-3"
                      >
                        <input
                          type="checkbox"
                          checked={goalIds.has(goal.id)}
                          onChange={() =>
                            setGoalIds((current) => toggle(current, goal.id))
                          }
                          className="mt-1"
                        />
                        <span>
                          <span className="block text-sm font-black text-sky-950">
                            {goal.title}
                          </span>
                          <span className="mt-1 block text-xs font-semibold text-sky-900">
                            {goal.status}
                            {goal.targetAt
                              ? ` · target ${formatDate(goal.targetAt)}`
                              : ""}
                          </span>
                          {goal.sourceAnchor ? (
                            <span className="mt-1 block">
                              <span className="block text-[10px] font-black uppercase tracking-wide text-sky-800">Includes exact source {formatMediaTime(goal.sourceAnchor.startSeconds)}–{formatMediaTime(goal.sourceAnchor.endSeconds)}</span>
                              <TranscriptSpeakerEvidenceBadge authority={goal.sourceAnchor.speakerAuthority} />
                            </span>
                          ) : null}
                        </span>
                      </label>
                    ))
                  ) : (
                    <p className="text-xs font-semibold text-[#6b7f70]">
                      No goal is owned by this client in the Session.
                    </p>
                  )}
                </div>
              </fieldset>
              <fieldset>
                <legend className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-amber-900">
                  <CheckCircle2 size={15} aria-hidden="true" />
                  Client-owned commitments
                </legend>
                <div className="mt-2 space-y-2">
                  {snapshot.eligible?.tasks.length ? (
                    snapshot.eligible.tasks.map((task) => (
                      <label
                        key={task.id}
                        className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-100 bg-amber-50/55 p-3"
                      >
                        <input
                          type="checkbox"
                          checked={taskIds.has(task.id)}
                          onChange={() =>
                            setTaskIds((current) => toggle(current, task.id))
                          }
                          className="mt-1"
                        />
                        <span>
                          <span className="block text-sm font-black text-amber-950">
                            {task.title}
                          </span>
                          <span className="mt-1 block text-xs font-semibold text-amber-900">
                            {task.status}
                            {task.dueAt
                              ? ` · due ${formatDate(task.dueAt)}`
                              : ""}
                          </span>
                          {task.sourceAnchor ? (
                            <span className="mt-1 block">
                              <span className="block text-[10px] font-black uppercase tracking-wide text-sky-800">Includes exact source {formatMediaTime(task.sourceAnchor.startSeconds)}–{formatMediaTime(task.sourceAnchor.endSeconds)}</span>
                              <TranscriptSpeakerEvidenceBadge authority={task.sourceAnchor.speakerAuthority} />
                            </span>
                          ) : null}
                        </span>
                      </label>
                    ))
                  ) : (
                    <p className="text-xs font-semibold text-[#6b7f70]">
                      No committed task is assigned to this client in the
                      Session.
                    </p>
                  )}
                </div>
              </fieldset>
            </div>
            <p className="mt-5 text-xs font-bold leading-5 text-emerald-950">
              {selectedCount} item{selectedCount === 1 ? "" : "s"} selected.
              Only notes marked client-safe and work owned by this client can be shared.
            </p>
            {snapshot.output?.status === "DRAFT" ? (
              <p className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold leading-5 text-sky-950">
                Editing private revision {snapshot.output.revision}. Saving
                appends history; it does not release or overwrite an earlier
                revision.
              </p>
            ) : null}
            <button
              type="button"
              disabled={
                busy !== null ||
                !title.trim() ||
                (selectedCount === 0 &&
                  !intro.trim() &&
                  !nextSessionFocus.trim())
              }
              onClick={() =>
                void mutate(
                  snapshot.output?.status === "DRAFT"
                    ? "UPDATE_DRAFT"
                    : "CREATE_DRAFT",
                )
              }
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#283c31] px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-45"
            >
              <ClipboardCheck size={15} aria-hidden="true" />
              {busy === "CREATE_DRAFT"
                ? "Creating private draft…"
                : busy === "UPDATE_DRAFT"
                  ? "Saving private revision…"
                  : snapshot.output?.status === "DRAFT"
                    ? "Save private draft changes"
                    : snapshot.output?.status === "RELEASED"
                      ? "Prepare a new draft"
                      : "Create private draft"}
            </button>
          </div>

          <div className="space-y-4">
            {snapshot.output ? (
              <>
                <FollowUpArtifact output={snapshot.output} />
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void exportFollowUp()}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-emerald-950 disabled:opacity-45"
                >
                  <Download size={15} aria-hidden="true" />
                  {busy === "EXPORT" ? "Preparing file…" : "Download or share follow-up"}
                </button>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-emerald-300 bg-white/65 p-6">
                <LockKeyhole className="text-emerald-700" aria-hidden="true" />
                <h3 className="mt-3 font-serif text-2xl font-black text-[#283c31]">
                  No draft yet
                </h3>
                <p className="mt-2 text-sm font-semibold text-[#5c7163]">
                  Create a draft to freeze and inspect the exact client-visible
                  snapshot before release.
                </p>
              </div>
            )}
            {snapshot.output?.status === "DRAFT" ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                {sourcesReady && !hasUnsavedDraftChanges ? (
                  <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-emerald-950" data-testid="client-follow-up-release-ready">
                    <p className="text-xs font-black">Ready to share</p>
                    <p className="mt-1 text-xs font-semibold leading-5">All {snapshot.readiness?.selectedCount ?? 0} selected items still match this private draft.</p>
                  </div>
                ) : sourcesReady ? (
                  <div className="rounded-xl border border-amber-300 bg-amber-100 p-3 text-amber-950" role="alert" data-testid="client-follow-up-unsaved-changes">
                    <p className="text-xs font-black">Save edits before release</p>
                    <p className="mt-1 text-xs font-semibold leading-5">The release controls still point to private revision {snapshot.output.revision}, not the unsaved editor values. Save a new private revision or restore the editor to this exact snapshot before confirming.</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-rose-950" role="alert" data-testid="client-follow-up-release-held">
                    <p className="text-xs font-black">Release held — review current sources</p>
                    {snapshot.readiness?.changes.length ? (
                      <ul className="mt-2 space-y-1 text-xs font-semibold leading-5">
                        {snapshot.readiness.changes.map((change, index) => <li key={`${change.kind}:${change.id}:${change.reason}:${index}`}><span className="font-black">{change.kind === "FOLLOW_UP" ? "Follow-up" : change.kind.charAt(0) + change.kind.slice(1).toLowerCase()} · {change.label}</span> {readinessChangeLabel(change.reason)}.</li>)}
                      </ul>
                    ) : <p className="mt-1 text-xs font-semibold leading-5">Quipsly could not verify this draft against current canonical records. Save a current private revision before release.</p>}
                    <p className="mt-2 text-xs font-bold leading-5">Review the current selections on the left, then save private draft changes. Nothing has been released.</p>
                  </div>
                )}
                <button
                  type="button"
                  disabled={!releaseReady || busy !== null}
                  onClick={() => void mutate("RELEASE")}
                  className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-900 px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-45"
                >
                  <Send size={15} aria-hidden="true" />
                  {busy === "RELEASE"
                    ? "Releasing in Quipsly…"
                    : `Share with ${snapshot.room.client.label}`}
                </button>
              </div>
            ) : null}
            {snapshot.output?.status === "RELEASED" ? (
              <div className="rounded-2xl border border-emerald-200 bg-white p-4">
                <p className="text-xs font-bold leading-5 text-emerald-950">
                  {opened
                    ? "Recipient-confirmed open receipt exists for this content hash."
                    : "Released in app; no recipient-confirmed open receipt yet."}
                </p>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void mutate("REVOKE")}
                  className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-xs font-black uppercase tracking-wide text-rose-900 disabled:opacity-45"
                >
                  <RotateCcw size={15} aria-hidden="true" />
                  {busy === "REVOKE" ? "Stopping sharing…" : "Stop sharing"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <p className="mt-5 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-xs font-bold leading-5 text-emerald-950">
        <LockKeyhole className="mr-2 inline" size={14} aria-hidden="true" />
        This surface changes Quipsly visibility only. It never emails, texts,
        publishes, schedules, bills, changes consent, or rewrites the source
        note, goal, or task.
      </p>
    </section>
  );
}
