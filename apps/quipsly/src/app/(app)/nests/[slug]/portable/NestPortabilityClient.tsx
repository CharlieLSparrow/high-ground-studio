"use client";

import { useState, useTransition } from "react";
import { ArchiveRestore, CheckCircle2, Download, FileJson2, ShieldCheck, Upload } from "lucide-react";
import { useRouter } from "next/navigation";

type RestorePlan = {
  manifestSha256: string;
  sourceNestSlug: string;
  tagCreates: number;
  tagReuses: number;
  tagSlugCollisions: number;
  aliasCreates: number;
  aliasReuses: number;
  aliasesDeferred: number;
  mergeLinksPreservedAsHistory: number;
  noteCreates: number;
  noteReuses: number;
  blockCreates: number;
  spanCreates: number;
  taskCreates: number;
  taskReuses: number;
  goalCreates: number;
  goalReuses: number;
  progressReceiptCreates: number;
  goalTaskLinkCreates: number;
  planBlockCreates: number;
  planBlockReuses: number;
  remindersDeferred: number;
  recurrenceSeriesDeferred: number;
  planBlocksCanceledForSafety: number;
  overwrites: number;
  sourceMutations: number;
  externalSideEffects: number;
};

type Notice = {
  tone: "neutral" | "success" | "error";
  message: string;
};

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function NestPortabilityClient({
  projectSlug,
  projectName,
}: {
  projectSlug: string;
  projectName: string;
}) {
  const router = useRouter();
  const [fileName, setFileName] = useState("");
  const [bundle, setBundle] = useState<unknown>(null);
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [planSha256, setPlanSha256] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [applied, setApplied] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function chooseFile(file?: File) {
    setFileName(file?.name ?? "");
    setBundle(null);
    setPlan(null);
    setPlanSha256("");
    setNotice(null);
    setApplied(false);
    if (!file) return;
    if (file.size > 30 * 1024 * 1024) {
      setNotice({ tone: "error", message: "That file is larger than the 30 MB restore limit." });
      return;
    }
    try {
      const raw = await file.text();
      setBundle(JSON.parse(raw));
      setNotice({
        tone: "neutral",
        message: "The file is loaded in this browser. Validate its manifest and destination plan before restoring anything.",
      });
    } catch {
      setNotice({ tone: "error", message: "That file is not valid JSON. Nothing was sent or restored." });
    }
  }

  function send(mode: "validate" | "apply") {
    if (!bundle) return;
    if (mode === "apply" && !/^[a-f0-9]{64}$/.test(planSha256)) {
      setPlan(null);
      setNotice({ tone: "error", message: "Validate this package again before applying it." });
      return;
    }
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/nests/${encodeURIComponent(projectSlug)}/portable-restore?mode=${mode}`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...(mode === "apply" ? { "x-quipsly-restore-plan-sha256": planSha256 } : {}),
            },
            body: JSON.stringify(bundle),
          },
        );
        const result = await response.json() as {
          ok?: boolean;
          error?: string;
          plan?: RestorePlan;
          planSha256?: string;
        };
        if (!response.ok || !result.ok) {
          if (mode === "apply") {
            setPlan(null);
            setPlanSha256("");
            setApplied(false);
          }
          setNotice({
            tone: "error",
            message: mode === "apply"
              ? `${result.error || "Nest did not confirm the restore."} Validate again before retrying.`
              : result.error || "Quipsly could not verify this Nest package.",
          });
          return;
        }
        if (mode === "validate") {
          if (!result.plan || !/^[a-f0-9]{64}$/.test(result.planSha256 || "")) {
            setPlan(null);
            setPlanSha256("");
            setNotice({ tone: "error", message: "Nest did not return a complete reviewed-plan receipt." });
            return;
          }
          setPlan(result.plan);
          setPlanSha256(result.planSha256 || "");
          setApplied(false);
          setNotice({
            tone: "success",
            message: "Manifest, references, and destination checks passed. Review the complete no-overwrite plan before applying it.",
          });
          return;
        }
        if (
          result.planSha256 !== planSha256
          || !result.plan
          || JSON.stringify(result.plan) !== JSON.stringify(plan)
        ) {
          setPlan(null);
          setPlanSha256("");
          setApplied(false);
          setNotice({ tone: "error", message: "The applied receipt did not match the reviewed plan. Validate again before retrying." });
          return;
        }
        setPlan(result.plan);
        setApplied(true);
        setNotice({
          tone: "success",
          message: "Restore confirmed. Notes and work have stable private identities; active reminders and recurrence were not recreated, and imported focus blocks are canceled snapshots.",
        });
        router.refresh();
      } catch {
        setPlan(null);
        setPlanSha256("");
        setApplied(false);
        setNotice({
          tone: "error",
          message: "Nest did not confirm the restore. Validate again before retrying; stable identities prevent overwrites.",
        });
      }
    });
  }

  const noticeTone = notice?.tone === "error"
    ? "border-red-200 bg-red-50 text-red-950"
    : notice?.tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
      : "border-sky-200 bg-sky-50 text-sky-950";
  const unsafePlan = plan
    ? plan.overwrites !== 0 || plan.sourceMutations !== 0 || plan.externalSideEffects !== 0
    : true;

  return (
    <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <section aria-labelledby="export-nest-heading" className="rounded-3xl border border-[#dfcfb4] bg-white p-5 shadow-sm md:p-7">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-amber-50 p-3 text-amber-900"><Download size={22} aria-hidden="true" /></span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8a653d]">Verified download</p>
            <h2 id="export-nest-heading" className="mt-1 font-serif text-2xl font-black">Export this Nest</h2>
          </div>
        </div>
        <p className="mt-4 text-sm font-semibold leading-6 text-[#715f48]">
          Download {projectName}&apos;s canonical tag vocabulary and aliases, note documents with exact tag anchors,
          and your project tasks, goals, progress links, and focus-block history.
        </p>
        <a
          href={`/api/nests/${encodeURIComponent(projectSlug)}/portable-export`}
          className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#3d3122] px-4 text-xs font-black uppercase tracking-[0.12em] text-white outline-none hover:bg-[#241a13] focus-visible:ring-4 focus-visible:ring-amber-200"
        >
          <FileJson2 size={16} aria-hidden="true" /> Download verified JSON
        </a>
        <div className="mt-5 rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-4">
          <h3 className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-[#68472c]">
            <ShieldCheck size={15} aria-hidden="true" /> Deliberate boundaries
          </h3>
          <ul className="mt-3 space-y-2 text-xs font-semibold leading-5 text-[#715f48]">
            <li>Media bytes, Sessions, collaborators&apos; assignments, credentials, and provider data are excluded.</li>
            <li>Reminder and recurrence settings remain inspectable snapshots, not newly active alerts.</li>
            <li>The SHA-256 manifest covers every included record and reference.</li>
          </ul>
        </div>
      </section>

      <section aria-labelledby="restore-nest-heading" className="rounded-3xl border border-sky-200 bg-[linear-gradient(145deg,#f5fbff,#fffdfa)] p-5 shadow-sm md:p-7">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-sky-100 p-3 text-sky-900"><ArchiveRestore size={22} aria-hidden="true" /></span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-800">Preview, then apply</p>
            <h2 id="restore-nest-heading" className="mt-1 font-serif text-2xl font-black">Restore into this Nest</h2>
          </div>
        </div>
        <p className="mt-4 text-sm font-semibold leading-6 text-[#536777]">
          Choose a Quipsly Nest JSON package. Validation is read-only. Apply creates private, deterministic copies and
          reuses them on retry; it never replaces a destination note, tag, task, or goal.
        </p>
        <label className="mt-5 flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-sky-300 bg-white px-4 text-xs font-black text-sky-950 outline-none focus-within:ring-4 focus-within:ring-sky-200">
          <Upload size={16} aria-hidden="true" />
          <span className="truncate">{fileName || "Choose a Quipsly Nest JSON file"}</span>
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(event) => void chooseFile(event.target.files?.[0])}
          />
        </label>
        {notice ? (
          <p role="status" className={`mt-4 rounded-xl border p-3 text-xs font-semibold leading-5 ${noticeTone}`}>
            {notice.message}
          </p>
        ) : null}
        <button
          type="button"
          disabled={!bundle || isPending}
          onClick={() => send("validate")}
          className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-sky-900 bg-white px-4 text-xs font-black uppercase tracking-[0.12em] text-sky-950 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {isPending && !plan ? "Validating…" : "Validate restore plan"}
        </button>

        {plan ? (
          <div className="mt-4 rounded-2xl border border-sky-200 bg-white p-4 text-xs font-semibold leading-5 text-[#405666]">
            <div className="flex items-center gap-2 text-sky-950">
              <CheckCircle2 size={16} aria-hidden="true" />
              <h3 className="font-black uppercase tracking-[0.12em]">Verified plan</h3>
            </div>
            <p className="mt-2 break-all font-mono text-[10px] text-[#617786]">SHA-256 {plan.manifestSha256}</p>
            <dl className="mt-4 grid gap-x-4 gap-y-2 sm:grid-cols-2">
              <div><dt className="font-black text-[#2f4555]">Vocabulary</dt><dd>{countLabel(plan.tagCreates, "tag")} + {countLabel(plan.aliasCreates, "alias", "aliases")} created; {countLabel(plan.tagReuses + plan.aliasReuses, "vocabulary route")} reused</dd></div>
              <div><dt className="font-black text-[#2f4555]">Notes</dt><dd>{countLabel(plan.noteCreates, "note")}, {countLabel(plan.blockCreates, "block")}, {countLabel(plan.spanCreates, "exact tag anchor")} created</dd></div>
              <div><dt className="font-black text-[#2f4555]">Tasks</dt><dd>{plan.taskCreates} created · {plan.taskReuses} reused · {countLabel(plan.remindersDeferred, "reminder")} deferred</dd></div>
              <div><dt className="font-black text-[#2f4555]">Goals</dt><dd>{plan.goalCreates} created · {plan.goalReuses} reused · {countLabel(plan.progressReceiptCreates, "progress receipt")}</dd></div>
              <div><dt className="font-black text-[#2f4555]">Relationships</dt><dd>{countLabel(plan.goalTaskLinkCreates, "goal-task link")} · {countLabel(plan.planBlockCreates, "focus-block snapshot")}</dd></div>
              <div><dt className="font-black text-[#2f4555]">Conflicts</dt><dd>{countLabel(plan.tagSlugCollisions, "tag")} versioned · {countLabel(plan.aliasesDeferred, "alias", "aliases")} deferred</dd></div>
            </dl>
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-950">
              Canceled-history focus blocks: {plan.planBlocksCanceledForSafety}; recurrence snapshots: {plan.recurrenceSeriesDeferred}.
              {" "}Nothing schedules a notification or external calendar event.
            </div>
            <p className="mt-3 font-black text-[#2f4555]">
              {plan.overwrites} overwrites · {plan.sourceMutations} source mutations · {plan.externalSideEffects} external effects
            </p>
            <button
              type="button"
              disabled={isPending || unsafePlan || applied}
              onClick={() => send("apply")}
              className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-sky-950 px-4 text-xs font-black uppercase tracking-[0.12em] text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isPending ? "Restoring…" : applied ? "Restore confirmed" : "Apply verified restore"}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
