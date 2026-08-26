"use client";

import type {
  QuipslyCoachingFormDefinition,
  QuipslyCoachingFormField,
} from "@high-ground/quipsly-domain/coaching-forms";
import {
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FilePlus2,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type Person = { id: string; name: string; email: string | null } | null;
type Relationship = {
  id: string;
  title: string;
  client: Person;
  upcomingSessions: Array<{
    id: string;
    scheduledStart: string;
    room: { id: string; title: string } | null;
  }>;
};
type Template = {
  id: string;
  title: string;
  description: string | null;
  purpose: QuipslyCoachingFormDefinition["purpose"];
  status: string;
  publishedRevision: number;
  definition: QuipslyCoachingFormDefinition;
  assignmentCount: number;
  updatedAt: string;
};
type Assignment = {
  id: string;
  status: "ASSIGNED" | "IN_PROGRESS" | "SUBMITTED" | "CANCELED";
  timing: string;
  dueAt: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  template: {
    id: string;
    title: string;
    description: string | null;
    purpose: QuipslyCoachingFormDefinition["purpose"];
    revision: number;
    definition: QuipslyCoachingFormDefinition;
  };
  engagement: { id: string; title: string };
  booking: { id: string; scheduledStart: string } | null;
  room: { id: string; title: string } | null;
  assignedBy: Person;
  assignedTo: Person;
  viewerRole: "CLIENT" | "COACH";
  response: {
    revision: number;
    state: "DRAFT" | "SUBMITTED";
    answers: Record<string, unknown>;
    submittedAt: string | null;
  } | null;
  boundaries: {
    clientCanEditOwnResponse: boolean;
    coachCanReadSubmittedResponse: boolean;
    coachCanReadDraftResponse: false;
  };
};
type Workflows = {
  schema: string;
  actor: { id: string; isCoach: boolean };
  starters: QuipslyCoachingFormDefinition[];
  relationships: Relationship[];
  templates: Template[];
  assignments: Assignment[];
};

type RequestState = {
  tone: "idle" | "busy" | "success" | "error";
  message: string;
};
const idle: RequestState = { tone: "idle", message: "" };

function formatDate(
  value: string | null,
  options?: Intl.DateTimeFormatOptions,
) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(
    undefined,
    options ?? {
      month: "short",
      day: "numeric",
      year:
        date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    },
  ).format(date);
}

function purposeLabel(purpose: QuipslyCoachingFormDefinition["purpose"]) {
  return (
    {
      INTAKE: "Intake",
      PRE_SESSION: "Before a Session",
      POST_SESSION: "After a Session",
      REFLECTION: "Reflection",
      ASSESSMENT: "Assessment",
      FEEDBACK: "Feedback",
    } as const
  )[purpose];
}

function assignmentTiming(purpose: QuipslyCoachingFormDefinition["purpose"]) {
  if (purpose === "INTAKE") return "ENGAGEMENT_START";
  if (purpose === "PRE_SESSION") return "BEFORE_SESSION";
  if (purpose === "POST_SESSION" || purpose === "FEEDBACK")
    return "AFTER_SESSION";
  return "ON_DEMAND";
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    result?: T;
  };
  if (!response.ok || !payload.ok || payload.result === undefined) {
    throw new Error(payload.error || "Quipsly could not finish that action.");
  }
  return payload.result;
}

export function CoachingFormsClient() {
  const searchParams = useSearchParams();
  const linkedAssignmentId = searchParams.get("assignment");
  const linkedRelationshipId = searchParams.get("relationship");
  const [workflows, setWorkflows] = useState<Workflows | null>(null);
  const [loadState, setLoadState] = useState<RequestState>({
    tone: "busy",
    message: "Loading your private forms…",
  });
  const [actionState, setActionState] = useState<RequestState>(idle);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  );
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<
    string | null
  >(linkedAssignmentId);

  const load = useCallback(async () => {
    setLoadState({ tone: "busy", message: "Loading your private forms…" });
    try {
      const result = await api<Workflows>("/api/coaching/forms");
      setWorkflows(result);
      setLoadState(idle);
      if (
        linkedAssignmentId &&
        result.assignments.some((item) => item.id === linkedAssignmentId)
      ) {
        setSelectedAssignmentId(linkedAssignmentId);
      } else if (linkedRelationshipId) {
        const relationshipAssignment = result.assignments.find(
          (item) =>
            item.engagement.id === linkedRelationshipId &&
            item.viewerRole === "CLIENT" &&
            item.status !== "CANCELED",
        );
        if (relationshipAssignment)
          setSelectedAssignmentId(relationshipAssignment.id);
      }
    } catch (error) {
      setLoadState({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Forms are temporarily unavailable.",
      });
    }
  }, [linkedAssignmentId, linkedRelationshipId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addStarter(definition: QuipslyCoachingFormDefinition) {
    setActionState({ tone: "busy", message: `Adding ${definition.title}…` });
    try {
      const result = await api<{ template: { id: string } }>(
        "/api/coaching/forms",
        {
          method: "POST",
          body: JSON.stringify({
            action: "PUBLISH_TEMPLATE",
            requestId: crypto.randomUUID(),
            definition,
          }),
        },
      );
      await load();
      setSelectedTemplateId(result.template.id);
      setActionState({
        tone: "success",
        message: `${definition.title} is ready to send.`,
      });
    } catch (error) {
      setActionState({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "The form could not be added.",
      });
    }
  }

  if (!workflows) {
    return (
      <section
        className="mt-6 rounded-3xl border border-[#e3d4b9] bg-white p-8 text-center shadow-sm"
        aria-live="polite"
      >
        {loadState.tone === "busy" ? (
          <LoaderCircle
            className="mx-auto animate-spin text-violet-800"
            aria-hidden="true"
          />
        ) : (
          <LockKeyhole className="mx-auto text-amber-800" aria-hidden="true" />
        )}
        <p className="mt-3 font-black text-[#4b3a27]">{loadState.message}</p>
        {loadState.tone === "error" ? (
          <button
            type="button"
            onClick={() => void load()}
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-violet-800 px-5 font-black text-white"
          >
            <RefreshCw size={16} /> Try again
          </button>
        ) : null}
      </section>
    );
  }

  const clientAssignments = workflows.assignments.filter(
    (item) => item.viewerRole === "CLIENT",
  );
  const coachAssignments = workflows.assignments.filter(
    (item) => item.viewerRole === "COACH",
  );
  const selectedAssignment =
    workflows.assignments.find((item) => item.id === selectedAssignmentId) ??
    null;
  const selectedTemplate =
    workflows.templates.find((item) => item.id === selectedTemplateId) ?? null;
  const starterKeys = new Set(
    workflows.templates.map((item) => item.definition.key),
  );

  return (
    <div className="mt-6 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.12fr)_minmax(22rem,0.88fr)]">
      <div className="min-w-0 space-y-6">
        {clientAssignments.length ? (
          <ClientAssignments
            assignments={clientAssignments}
            selected={
              selectedAssignment?.viewerRole === "CLIENT"
                ? selectedAssignment
                : null
            }
            onSelect={setSelectedAssignmentId}
            onSaved={async (message) => {
              await load();
              setActionState({ tone: "success", message });
            }}
            onError={(message) => setActionState({ tone: "error", message })}
          />
        ) : null}

        {workflows.actor.isCoach ? (
          <section
            className="rounded-[2rem] border border-[#e3d4b9] bg-white p-5 shadow-sm sm:p-7"
            aria-labelledby="form-library-title"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.17em] text-violet-800">
                  Reusable library
                </p>
                <h2
                  id="form-library-title"
                  className="mt-2 font-serif text-3xl font-black text-[#34291d]"
                >
                  Start with something thoughtful.
                </h2>
                <p className="mt-2 max-w-2xl font-semibold leading-6 text-[#765f40]">
                  Use a short Quipsly starting point, then send its fixed
                  version to the right client and Session.
                </p>
              </div>
              <span className="rounded-full bg-violet-50 px-3 py-2 text-xs font-black text-violet-900">
                {workflows.templates.length} in your library
              </span>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {workflows.starters.map((starter) => {
                const alreadyAdded = starterKeys.has(starter.key);
                const existing = workflows.templates.find(
                  (item) => item.definition.key === starter.key,
                );
                return (
                  <article
                    key={starter.key}
                    className="flex min-h-64 flex-col rounded-3xl border border-[#eadfc9] bg-[#fffaf0] p-5"
                  >
                    <span className="w-fit rounded-full bg-amber-100 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-amber-950">
                      {purposeLabel(starter.purpose)}
                    </span>
                    <h3 className="mt-4 font-serif text-2xl font-black text-[#3d3122]">
                      {starter.title}
                    </h3>
                    <p className="mt-2 flex-1 text-sm font-semibold leading-6 text-[#765f40]">
                      {starter.description}
                    </p>
                    <p className="mt-3 text-xs font-bold text-[#8a7458]">
                      {starter.fields.length} gentle questions
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        alreadyAdded && existing
                          ? setSelectedTemplateId(existing.id)
                          : void addStarter(starter)
                      }
                      disabled={actionState.tone === "busy"}
                      className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-violet-800 px-4 text-sm font-black text-white disabled:opacity-50"
                    >
                      {alreadyAdded ? (
                        <>
                          <Send size={16} /> Send to a client
                        </>
                      ) : (
                        <>
                          <FilePlus2 size={16} /> Add to library
                        </>
                      )}
                    </button>
                  </article>
                );
              })}
            </div>

            {workflows.templates.length ? (
              <div className="mt-7 border-t border-[#eee3cf] pt-6">
                <h3 className="font-serif text-2xl font-black text-[#3d3122]">
                  Your published forms
                </h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {workflows.templates.map((template) => (
                    <button
                      type="button"
                      key={template.id}
                      onClick={() => setSelectedTemplateId(template.id)}
                      className={`flex min-h-24 items-center justify-between gap-4 rounded-2xl border p-4 text-left transition ${selectedTemplateId === template.id ? "border-violet-500 bg-violet-50" : "border-[#e4d6bd] bg-white hover:border-violet-300"}`}
                    >
                      <span>
                        <span className="block text-[10px] font-black uppercase tracking-wide text-violet-800">
                          {purposeLabel(template.purpose)} · v
                          {template.publishedRevision}
                        </span>
                        <span className="mt-1 block font-black text-[#3d3122]">
                          {template.title}
                        </span>
                        <span className="mt-1 block text-xs font-semibold text-[#806d55]">
                          Sent {template.assignmentCount} time
                          {template.assignmentCount === 1 ? "" : "s"}
                        </span>
                      </span>
                      <ChevronRight
                        size={19}
                        className="shrink-0 text-violet-700"
                        aria-hidden="true"
                      />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {workflows.actor.isCoach ? (
          <CoachAssignmentHistory assignments={coachAssignments} />
        ) : null}
      </div>

      <aside className="min-w-0 space-y-6 xl:sticky xl:top-24 xl:self-start">
        {selectedTemplate ? (
          <AssignFormPanel
            template={selectedTemplate}
            relationships={workflows.relationships}
            initialRelationshipId={linkedRelationshipId}
            onAssigned={async (message) => {
              await load();
              setSelectedTemplateId(null);
              setActionState({ tone: "success", message });
            }}
            onCancel={() => setSelectedTemplateId(null)}
            onError={(message) => setActionState({ tone: "error", message })}
          />
        ) : selectedAssignment?.viewerRole === "CLIENT" ? (
          <div className="rounded-3xl border border-violet-200 bg-violet-50 p-5 text-sm font-semibold leading-6 text-violet-950">
            <LockKeyhole size={18} aria-hidden="true" />
            <p className="mt-2 font-black">Your draft is yours.</p>
            <p className="mt-1">
              Your coach sees answers only after you choose “
              {selectedAssignment.template.definition.submitLabel}.”
            </p>
          </div>
        ) : (
          <section className="rounded-[2rem] border border-[#e3d4b9] bg-[#3d3122] p-6 text-[#fffaf0] shadow-sm">
            <Sparkles className="text-amber-300" aria-hidden="true" />
            <h2 className="mt-4 font-serif text-3xl font-black">
              One place, one next step.
            </h2>
            <p className="mt-3 font-semibold leading-7 text-[#eadfcf]">
              Forms stay attached to the exact relationship and optional
              Session. No extra portal, hidden email ritual, or surprise
              sharing.
            </p>
          </section>
        )}
        {actionState.message ? <Status state={actionState} /> : null}
      </aside>
    </div>
  );
}

function ClientAssignments(props: {
  assignments: Assignment[];
  selected: Assignment | null;
  onSelect: (id: string) => void;
  onSaved: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const outstanding = props.assignments.filter(
    (item) => item.status !== "SUBMITTED" && item.status !== "CANCELED",
  );
  const completed = props.assignments.filter(
    (item) => item.status === "SUBMITTED",
  );
  const selected = props.selected ?? outstanding[0] ?? null;
  return (
    <section
      className="min-w-0 rounded-[2rem] border border-[#e3d4b9] bg-white p-5 shadow-sm sm:p-7"
      aria-labelledby="forms-for-you-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.17em] text-emerald-800">
            For you
          </p>
          <h2
            id="forms-for-you-title"
            className="mt-2 font-serif text-3xl font-black text-[#34291d]"
          >
            {outstanding.length
              ? `${outstanding.length} reflection${outstanding.length === 1 ? "" : "s"} to complete`
              : "You’re caught up."}
          </h2>
        </div>
        {completed.length ? (
          <span className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-900">
            <Check size={14} className="mr-1 inline" /> {completed.length}{" "}
            shared
          </span>
        ) : null}
      </div>
      {props.assignments.length > 1 ? (
        <div
          className="mt-5 flex max-w-full gap-2 overflow-x-auto pb-2"
          aria-label="Assigned forms"
        >
          {props.assignments
            .filter((item) => item.status !== "CANCELED")
            .map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => props.onSelect(item.id)}
                className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-black ${selected?.id === item.id ? "border-violet-700 bg-violet-800 text-white" : "border-[#decfb4] bg-[#fffaf0] text-[#5e4931]"}`}
              >
                {item.template.title}
                {item.status === "SUBMITTED" ? " · Shared" : ""}
              </button>
            ))}
        </div>
      ) : null}
      {selected ? (
        <ResponseForm
          key={`${selected.id}:${selected.response?.revision ?? 0}`}
          assignment={selected}
          onSaved={props.onSaved}
          onError={props.onError}
        />
      ) : (
        <p className="mt-5 rounded-2xl bg-emerald-50 p-5 font-semibold leading-6 text-emerald-950">
          There are no forms waiting for you. Your coach can send one inside the
          same relationship when it is genuinely useful.
        </p>
      )}
    </section>
  );
}

function ResponseForm(props: {
  assignment: Assignment;
  onSaved: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const definition = props.assignment.template.definition;
  const [answers, setAnswers] = useState<Record<string, unknown>>(
    props.assignment.response?.answers ?? {},
  );
  const [busy, setBusy] = useState<"DRAFT" | "SUBMITTED" | null>(null);
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const alreadySubmitted = props.assignment.status === "SUBMITTED";

  async function save(state: "DRAFT" | "SUBMITTED") {
    if (state === "SUBMITTED") {
      const required = new Set(
        definition.fields
          .filter(
            (field) =>
              field.required &&
              (answers[field.id] === undefined ||
                answers[field.id] === null ||
                answers[field.id] === ""),
          )
          .map((field) => field.id),
      );
      setMissing(required);
      if (required.size) {
        props.onError(
          "Answer the highlighted questions before sharing this form.",
        );
        return;
      }
    }
    setBusy(state);
    try {
      await api(
        `/api/coaching/forms/${encodeURIComponent(props.assignment.id)}/response`,
        {
          method: "PUT",
          body: JSON.stringify({
            requestId: crypto.randomUUID(),
            state,
            answers,
          }),
        },
      );
      await props.onSaved(
        state === "DRAFT"
          ? "Draft saved privately."
          : alreadySubmitted
            ? "Your updated answers are shared."
            : "Your answers are shared with your coach.",
      );
    } catch (error) {
      props.onError(
        error instanceof Error
          ? error.message
          : "Your answers could not be saved.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-6">
      <div className="rounded-3xl bg-[#fffaf0] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wide text-violet-800">
              {purposeLabel(definition.purpose)} · From{" "}
              {props.assignment.assignedBy?.name || "your coach"}
            </span>
            <h3 className="mt-2 font-serif text-3xl font-black text-[#34291d]">
              {definition.title}
            </h3>
            <p className="mt-2 max-w-2xl font-semibold leading-6 text-[#765f40]">
              {definition.description}
            </p>
          </div>
          {props.assignment.dueAt ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-2 text-xs font-black text-[#6f5638]">
              <Clock3 size={14} /> Due {formatDate(props.assignment.dueAt)}
            </span>
          ) : null}
        </div>
        {alreadySubmitted ? (
          <p className="mt-5 flex items-center gap-2 rounded-2xl bg-emerald-100 p-4 text-sm font-black text-emerald-950">
            <CheckCircle2 size={18} /> Shared{" "}
            {formatDate(props.assignment.submittedAt, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            . You can correct and resubmit below.
          </p>
        ) : null}
        <div className="mt-6 space-y-6">
          {definition.fields.map((field) => (
            <AnswerField
              key={field.id}
              field={field}
              value={answers[field.id]}
              invalid={missing.has(field.id)}
              onChange={(value) => {
                setAnswers((current) => ({ ...current, [field.id]: value }));
                setMissing((current) => {
                  const next = new Set(current);
                  next.delete(field.id);
                  return next;
                });
              }}
            />
          ))}
        </div>
        <div className="mt-7 flex flex-wrap gap-3 border-t border-[#e6d8bf] pt-5">
          {!alreadySubmitted ? (
            <button
              type="button"
              onClick={() => void save("DRAFT")}
              disabled={busy !== null}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-violet-300 bg-white px-5 text-sm font-black text-violet-950 disabled:opacity-50"
            >
              {busy === "DRAFT" ? (
                <LoaderCircle size={16} className="animate-spin" />
              ) : (
                <LockKeyhole size={16} />
              )}{" "}
              Save private draft
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void save("SUBMITTED")}
            disabled={busy !== null}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-violet-800 px-5 text-sm font-black text-white shadow-sm disabled:opacity-50"
          >
            {busy === "SUBMITTED" ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}{" "}
            {alreadySubmitted
              ? "Share updated answers"
              : definition.submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function AnswerField(props: {
  field: QuipslyCoachingFormField;
  value: unknown;
  invalid: boolean;
  onChange: (value: unknown) => void;
}) {
  const field = props.field;
  const id = `coaching-form-field-${field.id}`;
  const label = (
    <>
      <span>{field.label}</span>
      {field.required ? (
        <span className="ml-1 text-violet-800" aria-label="required">
          *
        </span>
      ) : null}
    </>
  );
  const className = `mt-2 min-h-12 w-full rounded-2xl border bg-white px-4 py-3 font-semibold text-[#3d3122] outline-none focus:ring-2 focus:ring-violet-500 ${props.invalid ? "border-red-500" : "border-[#d9c9ad]"}`;
  return (
    <fieldset className={props.invalid ? "rounded-2xl bg-red-50 p-3" : ""}>
      {field.type === "BOOLEAN" ||
      field.type === "SINGLE_SELECT" ||
      field.type === "MULTI_SELECT" ||
      field.type === "SCALE" ? (
        <legend className="text-sm font-black text-[#4b3a27]">{label}</legend>
      ) : (
        <label htmlFor={id} className="text-sm font-black text-[#4b3a27]">
          {label}
        </label>
      )}
      {field.help ? (
        <p className="mt-1 text-xs font-semibold leading-5 text-[#806d55]">
          {field.help}
        </p>
      ) : null}
      {field.type === "SHORT_TEXT" ? (
        <input
          id={id}
          value={typeof props.value === "string" ? props.value : ""}
          placeholder={field.placeholder || undefined}
          maxLength={field.maximumLength || undefined}
          onChange={(event) => props.onChange(event.target.value)}
          className={className}
        />
      ) : null}
      {field.type === "LONG_TEXT" ? (
        <textarea
          id={id}
          value={typeof props.value === "string" ? props.value : ""}
          placeholder={field.placeholder || undefined}
          maxLength={field.maximumLength || undefined}
          rows={4}
          onChange={(event) => props.onChange(event.target.value)}
          className={className}
        />
      ) : null}
      {field.type === "NUMBER" ? (
        <input
          id={id}
          type="number"
          value={typeof props.value === "number" ? props.value : ""}
          min={field.minimum ?? undefined}
          max={field.maximum ?? undefined}
          onChange={(event) =>
            props.onChange(
              event.target.value === "" ? "" : Number(event.target.value),
            )
          }
          className={className}
        />
      ) : null}
      {field.type === "DATE" ? (
        <input
          id={id}
          type="date"
          value={typeof props.value === "string" ? props.value : ""}
          onChange={(event) => props.onChange(event.target.value)}
          className={className}
        />
      ) : null}
      {field.type === "SCALE" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {Array.from(
            { length: (field.maximum ?? 10) - (field.minimum ?? 0) + 1 },
            (_, index) => (field.minimum ?? 0) + index,
          ).map((number) => (
            <button
              type="button"
              key={number}
              onClick={() => props.onChange(number)}
              aria-pressed={props.value === number}
              className={`min-h-11 min-w-11 rounded-full border text-sm font-black ${props.value === number ? "border-violet-800 bg-violet-800 text-white" : "border-[#d8c7a9] bg-white text-[#5b472f]"}`}
            >
              {number}
            </button>
          ))}
        </div>
      ) : null}
      {field.type === "BOOLEAN" ? (
        <div className="mt-3 flex gap-2">
          {([true, false] as const).map((choice) => (
            <button
              type="button"
              key={String(choice)}
              onClick={() => props.onChange(choice)}
              aria-pressed={props.value === choice}
              className={`min-h-11 rounded-full border px-5 text-sm font-black ${props.value === choice ? "border-violet-800 bg-violet-800 text-white" : "border-[#d8c7a9] bg-white text-[#5b472f]"}`}
            >
              {choice ? "Yes" : "No"}
            </button>
          ))}
        </div>
      ) : null}
      {field.type === "SINGLE_SELECT" ? (
        <div className="mt-3 grid gap-2">
          {field.options?.map((option) => (
            <label
              key={option}
              className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border px-4 font-semibold ${props.value === option ? "border-violet-600 bg-violet-50" : "border-[#d8c7a9] bg-white"}`}
            >
              <input
                type="radio"
                name={id}
                checked={props.value === option}
                onChange={() => props.onChange(option)}
                className="h-4 w-4 accent-violet-800"
              />
              {option}
            </label>
          ))}
        </div>
      ) : null}
      {field.type === "MULTI_SELECT" ? (
        <div className="mt-3 grid gap-2">
          {field.options?.map((option) => {
            const selected =
              Array.isArray(props.value) && props.value.includes(option);
            return (
              <label
                key={option}
                className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border px-4 font-semibold ${selected ? "border-violet-600 bg-violet-50" : "border-[#d8c7a9] bg-white"}`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => {
                    const current = Array.isArray(props.value)
                      ? props.value.filter(
                          (item): item is string => typeof item === "string",
                        )
                      : [];
                    props.onChange(
                      selected
                        ? current.filter((item) => item !== option)
                        : [...current, option],
                    );
                  }}
                  className="h-4 w-4 accent-violet-800"
                />
                {option}
              </label>
            );
          })}
        </div>
      ) : null}
      {props.invalid ? (
        <p className="mt-2 text-xs font-black text-red-800">
          Answer this question before sharing.
        </p>
      ) : null}
    </fieldset>
  );
}

function AssignFormPanel(props: {
  template: Template;
  relationships: Relationship[];
  initialRelationshipId: string | null;
  onAssigned: (message: string) => Promise<void>;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [relationshipId, setRelationshipId] = useState(
    props.relationships.some((item) => item.id === props.initialRelationshipId)
      ? props.initialRelationshipId || ""
      : (props.relationships[0]?.id ?? ""),
  );
  const relationship =
    props.relationships.find((item) => item.id === relationshipId) ?? null;
  const [bookingId, setBookingId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setBookingId("");
  }, [relationshipId]);
  async function assign() {
    if (!relationship) {
      props.onError("Choose a coaching client first.");
      return;
    }
    const booking =
      relationship.upcomingSessions.find((item) => item.id === bookingId) ??
      null;
    setBusy(true);
    try {
      await api("/api/coaching/forms", {
        method: "POST",
        body: JSON.stringify({
          action: "ASSIGN_FORM",
          requestId: crypto.randomUUID(),
          templateId: props.template.id,
          engagementId: relationship.id,
          bookingId: booking?.id || null,
          callRoomId: booking?.room?.id || null,
          timing: assignmentTiming(props.template.purpose),
          dueAt: dueDate ? `${dueDate}T23:59:59` : null,
        }),
      });
      await props.onAssigned(
        `${props.template.title} was sent to ${relationship.client?.name || "your client"}.`,
      );
    } catch (error) {
      props.onError(
        error instanceof Error ? error.message : "The form could not be sent.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="rounded-[2rem] border border-violet-300 bg-white p-6 shadow-lg"
      aria-labelledby="send-form-title"
    >
      <p className="text-xs font-black uppercase tracking-[0.17em] text-violet-800">
        Send privately
      </p>
      <h2
        id="send-form-title"
        className="mt-2 font-serif text-3xl font-black text-[#34291d]"
      >
        {props.template.title}
      </h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-[#765f40]">
        The assigned client gets this exact version. Future edits never rewrite
        what they received.
      </p>
      {props.relationships.length ? (
        <div className="mt-6 space-y-5">
          <label className="block text-sm font-black text-[#4b3a27]">
            Client
            <select
              value={relationshipId}
              onChange={(event) => setRelationshipId(event.target.value)}
              className="mt-2 min-h-12 w-full rounded-2xl border border-[#d8c7a9] bg-white px-4 font-semibold"
            >
              <option value="">Choose a client</option>
              {props.relationships
                .filter((item) => item.client)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.client?.name || item.client?.email || item.title}
                  </option>
                ))}
            </select>
          </label>
          <label className="block text-sm font-black text-[#4b3a27]">
            Session{" "}
            <span className="font-semibold text-[#8a7458]">(optional)</span>
            <select
              value={bookingId}
              onChange={(event) => setBookingId(event.target.value)}
              className="mt-2 min-h-12 w-full rounded-2xl border border-[#d8c7a9] bg-white px-4 font-semibold"
            >
              <option value="">Relationship only</option>
              {relationship?.upcomingSessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.room?.title || "Coaching Session"} ·{" "}
                  {formatDate(session.scheduledStart, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-black text-[#4b3a27]">
            Due date{" "}
            <span className="font-semibold text-[#8a7458]">(optional)</span>
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className="mt-2 min-h-12 w-full rounded-2xl border border-[#d8c7a9] bg-white px-4 font-semibold"
            />
          </label>
        </div>
      ) : (
        <div className="mt-6 rounded-2xl bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950">
          Invite a client first. Forms stay inside an exact coaching
          relationship instead of becoming free-floating links.
        </div>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void assign()}
          disabled={busy || !relationship}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-violet-800 px-5 text-sm font-black text-white disabled:opacity-50"
        >
          {busy ? (
            <LoaderCircle size={16} className="animate-spin" />
          ) : (
            <Send size={16} />
          )}{" "}
          Send form
        </button>
        <button
          type="button"
          onClick={props.onCancel}
          className="min-h-11 rounded-full border border-[#d8c7a9] px-5 text-sm font-black text-[#5b472f]"
        >
          Cancel
        </button>
      </div>
    </section>
  );
}

function CoachAssignmentHistory({
  assignments,
}: {
  assignments: Assignment[];
}) {
  const ordered = useMemo(
    () =>
      [...assignments].sort(
        (left, right) =>
          Number(right.status === "SUBMITTED") -
          Number(left.status === "SUBMITTED"),
      ),
    [assignments],
  );
  return (
    <section
      className="rounded-[2rem] border border-[#e3d4b9] bg-white p-5 shadow-sm sm:p-7"
      aria-labelledby="sent-forms-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.17em] text-sky-800">
            Client responses
          </p>
          <h2
            id="sent-forms-title"
            className="mt-2 font-serif text-3xl font-black text-[#34291d]"
          >
            Sent forms
          </h2>
        </div>
        <span className="rounded-full bg-sky-50 px-3 py-2 text-xs font-black text-sky-950">
          {assignments.length} total
        </span>
      </div>
      {ordered.length ? (
        <div className="mt-5 space-y-3">
          {ordered.map((assignment) => (
            <details
              key={assignment.id}
              className="group rounded-2xl border border-[#e2d4bc] bg-[#fffdf8] open:border-violet-300"
            >
              <summary className="flex min-h-20 cursor-pointer list-none items-center justify-between gap-4 p-4">
                <span>
                  <span className="block text-[10px] font-black uppercase tracking-wide text-violet-800">
                    {assignment.status === "SUBMITTED"
                      ? "Shared by client"
                      : assignment.status === "IN_PROGRESS"
                        ? "Client draft in progress"
                        : "Waiting for client"}
                  </span>
                  <span className="mt-1 block font-black text-[#3d3122]">
                    {assignment.template.title}
                  </span>
                  <span className="mt-1 block text-xs font-semibold text-[#806d55]">
                    {assignment.assignedTo?.name ||
                      assignment.assignedTo?.email ||
                      "Client"}
                    {assignment.dueAt
                      ? ` · Due ${formatDate(assignment.dueAt)}`
                      : ""}
                  </span>
                </span>
                {assignment.status === "SUBMITTED" ? (
                  <ClipboardCheck className="shrink-0 text-emerald-700" />
                ) : (
                  <Clock3 className="shrink-0 text-amber-700" />
                )}
              </summary>
              {assignment.response?.state === "SUBMITTED" ? (
                <div className="border-t border-[#eadfc9] p-4">
                  <ResponseReadback assignment={assignment} />
                </div>
              ) : (
                <p className="border-t border-[#eadfc9] p-4 text-sm font-semibold leading-6 text-[#765f40]">
                  Draft answers remain private. You’ll see the reflection here
                  after the client submits it.
                </p>
              )}
            </details>
          ))}
        </div>
      ) : (
        <p className="mt-5 rounded-2xl bg-sky-50 p-5 text-sm font-semibold leading-6 text-sky-950">
          Sent forms will appear here with a clear waiting or shared state.
        </p>
      )}
    </section>
  );
}

function ResponseReadback({ assignment }: { assignment: Assignment }) {
  const answers = assignment.response?.answers || {};
  return (
    <dl className="space-y-4">
      {assignment.template.definition.fields
        .filter((field) => answers[field.id] !== undefined)
        .map((field) => (
          <div key={field.id}>
            <dt className="text-xs font-black uppercase tracking-wide text-[#806d55]">
              {field.label}
            </dt>
            <dd className="mt-1 whitespace-pre-wrap font-semibold leading-6 text-[#3d3122]">
              {Array.isArray(answers[field.id])
                ? (answers[field.id] as unknown[]).join(", ")
                : typeof answers[field.id] === "boolean"
                  ? answers[field.id]
                    ? "Yes"
                    : "No"
                  : String(answers[field.id])}
            </dd>
          </div>
        ))}
    </dl>
  );
}

function Status({ state }: { state: RequestState }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-2xl border p-4 text-sm font-black ${state.tone === "error" ? "border-red-200 bg-red-50 text-red-900" : state.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-violet-200 bg-violet-50 text-violet-950"}`}
    >
      {state.tone === "success" ? (
        <CheckCircle2 size={17} className="mr-2 inline" />
      ) : state.tone === "busy" ? (
        <LoaderCircle size={17} className="mr-2 inline animate-spin" />
      ) : null}
      {state.message}
    </div>
  );
}
