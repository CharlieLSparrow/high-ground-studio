"use client";

import type {
  QuipslyCoachingFormDefinition,
  QuipslyCoachingFormField,
  QuipslyCoachingFormFieldType,
} from "@high-ground/quipsly-domain/coaching-forms";
import { QUIPSLY_COACHING_FORM_DEFINITION_SCHEMA } from "@high-ground/quipsly-domain/coaching-forms";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Copy,
  Eye,
  FilePlus2,
  LoaderCircle,
  LockKeyhole,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
type AutomationOverride = {
  id: string;
  action: "SEND_NOW" | "SKIP" | "CLEAR";
  reason: string | null;
  revision: number;
  createdAt: string;
};
type AutomationPolicy = {
  id: string;
  status: "ACTIVE" | "PAUSED";
  trigger: "BEFORE_SESSION" | "AFTER_SESSION";
  versionMode: "LATEST_PUBLISHED" | "PINNED_VERSION";
  pinnedTemplateVersion: { id: string; revision: number } | null;
  releaseOffsetMinutes: number;
  dueOffsetMinutes: number;
  revision: number;
  template: { id: string; title: string; publishedRevision: number };
  relationship: { id: string; title: string; client: Person };
  sessions: Array<{
    id: string;
    status: string;
    scheduledStart: string;
    scheduledEnd: string;
    room: { id: string; title: string; endedAt: string | null } | null;
    eligibleAt: string | null;
    dueAt: string | null;
    assignmentCreated: boolean;
    override: AutomationOverride | null;
  }>;
  receipts: Array<{
    id: string;
    trigger: "BEFORE_SESSION" | "AFTER_SESSION";
    eventAt: string;
    eligibleAt: string;
    dueAt: string;
    manualOverride: boolean;
    createdAt: string;
    assignment: { id: string; status: Assignment["status"] };
    templateRevision: number;
    booking: { id: string; scheduledStart: string };
  }>;
};
type Workflows = {
  schema: string;
  actor: { id: string; isCoach: boolean };
  starters: QuipslyCoachingFormDefinition[];
  relationships: Relationship[];
  templates: Template[];
  assignments: Assignment[];
  automation: {
    schema: string;
    policies: AutomationPolicy[];
  };
};

type RequestState = {
  tone: "idle" | "busy" | "success" | "error";
  message: string;
};
const idle: RequestState = { tone: "idle", message: "" };
type BuilderSeed = {
  mode: "CREATE" | "EDIT" | "DUPLICATE";
  templateId: string | null;
  publishedRevision: number | null;
  definition: QuipslyCoachingFormDefinition;
};

const FIELD_TYPE_LABELS: Record<QuipslyCoachingFormFieldType, string> = {
  SHORT_TEXT: "Short answer",
  LONG_TEXT: "Long answer",
  NUMBER: "Number",
  SCALE: "Scale",
  BOOLEAN: "Yes or no",
  SINGLE_SELECT: "Choose one",
  MULTI_SELECT: "Choose several",
  DATE: "Date",
};

function customKey(prefix = "custom") {
  return `${prefix}-${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
}

function newCustomDefinition(): QuipslyCoachingFormDefinition {
  return {
    schema: QUIPSLY_COACHING_FORM_DEFINITION_SCHEMA,
    key: customKey(),
    title: "Untitled coaching form",
    description: "",
    purpose: "REFLECTION",
    submitLabel: "Share with my coach",
    fields: [],
  };
}

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
  const [builderSeed, setBuilderSeed] = useState<BuilderSeed | null>(null);

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

  if (builderSeed && workflows.actor.isCoach) {
    return (
      <FormBuilder
        key={`${builderSeed.mode}:${builderSeed.templateId || builderSeed.definition.key}`}
        actorId={workflows.actor.id}
        seed={builderSeed}
        onCancel={() => setBuilderSeed(null)}
        onPublished={async (templateId, message) => {
          await load();
          setBuilderSeed(null);
          setSelectedTemplateId(templateId);
          setActionState({ tone: "success", message });
        }}
      />
    );
  }

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
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-violet-50 px-3 py-2 text-xs font-black text-violet-900">
                  {workflows.templates.length} in your library
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setBuilderSeed({
                      mode: "CREATE",
                      templateId: null,
                      publishedRevision: null,
                      definition: newCustomDefinition(),
                    })
                  }
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#3d3122] px-4 text-sm font-black text-white"
                >
                  <Plus size={16} /> Create your own
                </button>
              </div>
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
                    <article
                      key={template.id}
                      className={`min-w-0 rounded-2xl border p-4 transition ${selectedTemplateId === template.id ? "border-violet-500 bg-violet-50" : "border-[#e4d6bd] bg-white"}`}
                    >
                      <span className="block text-[10px] font-black uppercase tracking-wide text-violet-800">
                        {purposeLabel(template.purpose)} · v
                        {template.publishedRevision}
                      </span>
                      <h4 className="mt-1 break-words font-black text-[#3d3122]">
                        {template.title}
                      </h4>
                      <span className="mt-1 block text-xs font-semibold text-[#806d55]">
                        Sent {template.assignmentCount} time
                        {template.assignmentCount === 1 ? "" : "s"}
                      </span>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedTemplateId(template.id)}
                          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-violet-800 px-4 text-sm font-black text-white"
                        >
                          <Send size={15} /> Send
                        </button>
                        <button
                          type="button"
                          aria-label={`Edit ${template.title}`}
                          onClick={() =>
                            setBuilderSeed({
                              mode: "EDIT",
                              templateId: template.id,
                              publishedRevision: template.publishedRevision,
                              definition: structuredClone(template.definition),
                            })
                          }
                          className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#d8c7aa] bg-white px-3 text-[#5a452e]"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Duplicate ${template.title}`}
                          onClick={() =>
                            setBuilderSeed({
                              mode: "DUPLICATE",
                              templateId: null,
                              publishedRevision: null,
                              definition: {
                                ...structuredClone(template.definition),
                                key: customKey("copy"),
                                title: `${template.title} copy`,
                              },
                            })
                          }
                          className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#d8c7aa] bg-white px-3 text-[#5a452e]"
                        >
                          <Copy size={16} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {workflows.actor.isCoach ? (
          <FormAutomationWorkspace
            templates={workflows.templates}
            relationships={workflows.relationships}
            policies={workflows.automation.policies}
            onChanged={async (message) => {
              await load();
              setActionState({ tone: "success", message });
            }}
            onError={(message) => setActionState({ tone: "error", message })}
          />
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

function FormBuilder(props: {
  actorId: string;
  seed: BuilderSeed;
  onCancel: () => void;
  onPublished: (templateId: string, message: string) => Promise<void>;
}) {
  const [definition, setDefinition] =
    useState<QuipslyCoachingFormDefinition>(() =>
      structuredClone(props.seed.definition),
    );
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(
    props.seed.definition.fields[0]?.id ?? null,
  );
  const [newFieldType, setNewFieldType] =
    useState<QuipslyCoachingFormFieldType>("LONG_TEXT");
  const newFieldTypeRef = useRef<QuipslyCoachingFormFieldType>("LONG_TEXT");
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, unknown>>(
    {},
  );
  const [status, setStatus] = useState<RequestState>(idle);
  const [draftReady, setDraftReady] = useState(false);
  const draftKey = `quipsly:coaching-form-builder:${props.actorId}:${props.seed.templateId || props.seed.definition.key}`;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(draftKey);
      if (stored) {
        const candidate = JSON.parse(stored) as Partial<QuipslyCoachingFormDefinition>;
        if (
          candidate.schema === QUIPSLY_COACHING_FORM_DEFINITION_SCHEMA &&
          candidate.key === props.seed.definition.key &&
          typeof candidate.title === "string" &&
          Array.isArray(candidate.fields)
        ) {
          setDefinition(candidate as QuipslyCoachingFormDefinition);
          setSelectedFieldId(candidate.fields[0]?.id ?? null);
          setStatus({
            tone: "success",
            message: "Your unfinished browser draft was restored.",
          });
        }
      }
    } catch {
      localStorage.removeItem(draftKey);
    } finally {
      setDraftReady(true);
    }
  }, [draftKey, props.seed.definition.key]);

  useEffect(() => {
    if (!draftReady) return;
    localStorage.setItem(draftKey, JSON.stringify(definition));
  }, [definition, draftKey, draftReady]);

  function updateDefinition(
    patch: Partial<QuipslyCoachingFormDefinition>,
  ) {
    setDefinition((current) => ({ ...current, ...patch }));
  }

  function updateField(
    fieldId: string,
    patch: Partial<QuipslyCoachingFormField>,
  ) {
    setDefinition((current) => ({
      ...current,
      fields: current.fields.map((field) =>
        field.id === fieldId ? { ...field, ...patch } : field,
      ),
    }));
  }

  function addField() {
    const fieldType = newFieldTypeRef.current;
    const id = `question-${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
    const choices = ["SINGLE_SELECT", "MULTI_SELECT"].includes(fieldType)
      ? { options: ["First choice", "Second choice"] }
      : {};
    const range = fieldType === "SCALE" ? { minimum: 0, maximum: 10 } : {};
    const field: QuipslyCoachingFormField = {
      id,
      type: fieldType,
      label: "New question",
      required: false,
      ...choices,
      ...range,
    };
    setDefinition((current) => ({
      ...current,
      fields: [...current.fields, field],
    }));
    setSelectedFieldId(id);
  }

  function moveField(fieldId: string, direction: -1 | 1) {
    setDefinition((current) => {
      const fields = [...current.fields];
      const index = fields.findIndex((field) => field.id === fieldId);
      const next = index + direction;
      if (index < 0 || next < 0 || next >= fields.length) return current;
      [fields[index], fields[next]] = [fields[next], fields[index]];
      return { ...current, fields };
    });
  }

  function duplicateField(fieldId: string) {
    setDefinition((current) => {
      const index = current.fields.findIndex((field) => field.id === fieldId);
      if (index < 0 || current.fields.length >= 40) return current;
      const copy = {
        ...current.fields[index],
        id: `question-${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`,
        label: `${current.fields[index].label} copy`,
      };
      const fields = [...current.fields];
      fields.splice(index + 1, 0, copy);
      setSelectedFieldId(copy.id);
      return { ...current, fields };
    });
  }

  function removeField(fieldId: string) {
    setDefinition((current) => {
      const fields = current.fields.filter((field) => field.id !== fieldId);
      setSelectedFieldId((selected) =>
        selected === fieldId ? fields[0]?.id ?? null : selected,
      );
      return { ...current, fields };
    });
    setPreviewAnswers((current) => {
      const next = { ...current };
      delete next[fieldId];
      return next;
    });
  }

  async function publish() {
    if (!definition.title.trim()) {
      setStatus({ tone: "error", message: "Give this form a clear title." });
      return;
    }
    if (!definition.fields.length) {
      setStatus({
        tone: "error",
        message: "Add at least one useful question before publishing.",
      });
      return;
    }
    const unnamed = definition.fields.find((field) => !field.label.trim());
    if (unnamed) {
      setSelectedFieldId(unnamed.id);
      setStatus({ tone: "error", message: "Every question needs a label." });
      return;
    }
    setStatus({ tone: "busy", message: "Publishing an immutable version…" });
    try {
      const result = await api<{
        template: { id: string };
        version: { revision: number };
      }>("/api/coaching/forms", {
        method: "POST",
        body: JSON.stringify({
          action: "PUBLISH_TEMPLATE",
          requestId: crypto.randomUUID(),
          templateId: props.seed.templateId,
          definition,
        }),
      });
      localStorage.removeItem(draftKey);
      await props.onPublished(
        result.template.id,
        `${definition.title} version ${result.version.revision} is published and ready to send.`,
      );
    } catch (error) {
      setStatus({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "This version could not be published.",
      });
    }
  }

  const revisionLabel = props.seed.publishedRevision
    ? `Version ${props.seed.publishedRevision + 1}`
    : "First version";

  return (
    <section
      className="mt-6 min-w-0 overflow-hidden rounded-[2rem] border border-[#dfceb0] bg-white shadow-sm"
      aria-labelledby="form-builder-title"
    >
      <header className="border-b border-[#eadfc9] bg-[#3d3122] p-5 text-[#fffaf0] sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.17em] text-amber-300">
              {props.seed.mode === "EDIT"
                ? "New immutable version"
                : props.seed.mode === "DUPLICATE"
                  ? "Independent copy"
                  : "Custom coaching form"}
            </p>
            <h2
              id="form-builder-title"
              className="mt-2 break-words font-serif text-3xl font-black sm:text-4xl"
            >
              Build something your clients will actually finish.
            </h2>
            <p className="mt-2 max-w-3xl font-semibold leading-6 text-[#eadfcf]">
              Keep it short, ask one thing at a time, and preview the exact
              client experience before publishing. Existing assignments never
              change when you publish a new version.
            </p>
          </div>
          <button
            type="button"
            onClick={props.onCancel}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/30 px-4 text-sm font-black"
          >
            <X size={16} /> Back to library
          </button>
        </div>
      </header>

      <div className="grid min-w-0 lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)]">
        <div className="min-w-0 space-y-6 p-5 sm:p-7">
          <section aria-labelledby="form-details-title">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3
                id="form-details-title"
                className="font-serif text-2xl font-black text-[#3d3122]"
              >
                Form details
              </h3>
              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-900">
                <Save size={13} className="mr-1 inline" /> Draft saved on this
                device
              </span>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <BuilderTextField
                id="coaching-form-builder-title"
                label="Title"
                value={definition.title}
                maximumLength={160}
                onChange={(title) => updateDefinition({ title })}
              />
              <label className="text-sm font-black text-[#4b3a27]">
                Use
                <select
                  value={definition.purpose}
                  onChange={(event) =>
                    updateDefinition({
                      purpose: event.target
                        .value as QuipslyCoachingFormDefinition["purpose"],
                    })
                  }
                  className="mt-2 min-h-12 w-full rounded-2xl border border-[#d9c9ad] bg-white px-4 font-semibold"
                >
                  {(
                    [
                      "INTAKE",
                      "PRE_SESSION",
                      "POST_SESSION",
                      "REFLECTION",
                      "ASSESSMENT",
                      "FEEDBACK",
                    ] as const
                  ).map((purpose) => (
                    <option key={purpose} value={purpose}>
                      {purposeLabel(purpose)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="sm:col-span-2">
                <BuilderTextField
                  id="coaching-form-builder-description"
                  label="Short introduction"
                  value={definition.description}
                  maximumLength={2_000}
                  multiline
                  onChange={(description) => updateDefinition({ description })}
                />
              </div>
              <BuilderTextField
                id="coaching-form-builder-submit-label"
                label="Share button"
                value={definition.submitLabel}
                maximumLength={80}
                onChange={(submitLabel) => updateDefinition({ submitLabel })}
              />
            </div>
          </section>

          <section aria-labelledby="form-questions-title">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3
                  id="form-questions-title"
                  className="font-serif text-2xl font-black text-[#3d3122]"
                >
                  Questions
                </h3>
                <p className="mt-1 text-sm font-semibold text-[#806d55]">
                  {definition.fields.length}/40 · Reorder with the arrow buttons.
                </p>
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap justify-end gap-2 sm:flex-none">
                <label className="sr-only" htmlFor="coaching-form-new-field-type">
                  New question type
                </label>
                <select
                  id="coaching-form-new-field-type"
                  value={newFieldType}
                  onChange={(event) => {
                    const type =
                      event.target.value as QuipslyCoachingFormFieldType;
                    newFieldTypeRef.current = type;
                    setNewFieldType(type);
                  }}
                  className="min-h-11 min-w-0 flex-1 rounded-full border border-[#d9c9ad] bg-white px-3 text-sm font-black sm:flex-none"
                >
                  {Object.entries(FIELD_TYPE_LABELS).map(([type, label]) => (
                    <option key={type} value={type}>
                      {label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addField}
                  disabled={definition.fields.length >= 40}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-violet-800 px-4 text-sm font-black text-white disabled:opacity-50"
                >
                  <Plus size={16} /> Add
                </button>
              </div>
            </div>

            {definition.fields.length ? (
              <div className="mt-4 space-y-3">
                {definition.fields.map((field, index) => (
                  <BuilderFieldCard
                    key={field.id}
                    field={field}
                    index={index}
                    count={definition.fields.length}
                    expanded={selectedFieldId === field.id}
                    onExpand={() => setSelectedFieldId(field.id)}
                    onChange={(patch) => updateField(field.id, patch)}
                    onMove={(direction) => moveField(field.id, direction)}
                    onDuplicate={() => duplicateField(field.id)}
                    onRemove={() => removeField(field.id)}
                  />
                ))}
              </div>
            ) : (
              <button
                type="button"
                onClick={addField}
                className="mt-4 flex min-h-32 w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed border-violet-200 bg-violet-50/50 p-5 text-center text-violet-950"
              >
                <Plus size={24} />
                <span className="mt-2 font-black">Add your first question</span>
                <span className="mt-1 text-sm font-semibold">
                  Long answer is a comfortable place to begin.
                </span>
              </button>
            )}
          </section>
        </div>

        <aside className="min-w-0 border-t border-[#eadfc9] bg-[#fffaf0] p-5 sm:p-7 lg:border-l lg:border-t-0">
          <div className="lg:sticky lg:top-24">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.17em] text-violet-800">
              <Eye size={16} /> Client preview
            </p>
            <div className="mt-4 rounded-3xl border border-[#e4d6bd] bg-white p-5 shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-wide text-violet-800">
                {purposeLabel(definition.purpose)}
              </span>
              <h3 className="mt-2 break-words font-serif text-3xl font-black text-[#34291d]">
                {definition.title.trim() || "Untitled coaching form"}
              </h3>
              {definition.description ? (
                <p className="mt-2 whitespace-pre-wrap font-semibold leading-6 text-[#765f40]">
                  {definition.description}
                </p>
              ) : null}
              <div className="mt-6 space-y-6">
                {definition.fields.map((field) => (
                  <AnswerField
                    key={field.id}
                    field={field}
                    value={previewAnswers[field.id]}
                    invalid={false}
                    onChange={(value) =>
                      setPreviewAnswers((current) => ({
                        ...current,
                        [field.id]: value,
                      }))
                    }
                  />
                ))}
                {!definition.fields.length ? (
                  <p className="rounded-2xl bg-[#f4eddf] p-4 text-sm font-semibold text-[#765f40]">
                    Questions appear here as you add them.
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                disabled
                className="mt-6 min-h-11 w-full rounded-full bg-violet-800 px-4 text-sm font-black text-white opacity-80"
              >
                {definition.submitLabel.trim() || "Share with my coach"}
              </button>
            </div>
            <div className="mt-5 rounded-3xl bg-[#3d3122] p-5 text-[#fffaf0]">
              <p className="text-xs font-black uppercase tracking-wide text-amber-300">
                {revisionLabel}
              </p>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#eadfcf]">
                Publishing freezes this version for future assignments. Clients
                already assigned an earlier version keep exactly what they
                received.
              </p>
              <button
                type="button"
                onClick={() => void publish()}
                disabled={status.tone === "busy"}
                className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-amber-300 px-5 font-black text-[#3d3122] disabled:opacity-50"
              >
                {status.tone === "busy" ? (
                  <LoaderCircle size={17} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={17} />
                )}
                Publish {revisionLabel.toLowerCase()}
              </button>
            </div>
            {status.message ? <Status state={status} /> : null}
          </div>
        </aside>
      </div>
    </section>
  );
}

function BuilderTextField(props: {
  id: string;
  label: string;
  value: string;
  maximumLength: number;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  const className =
    "mt-2 min-h-12 w-full rounded-2xl border border-[#d9c9ad] bg-white px-4 py-3 font-semibold text-[#3d3122] outline-none focus:ring-2 focus:ring-violet-500";
  return (
    <label htmlFor={props.id} className="block text-sm font-black text-[#4b3a27]">
      {props.label}
      {props.multiline ? (
        <textarea
          id={props.id}
          value={props.value}
          maxLength={props.maximumLength}
          rows={3}
          onChange={(event) => props.onChange(event.target.value)}
          className={className}
        />
      ) : (
        <input
          id={props.id}
          value={props.value}
          maxLength={props.maximumLength}
          onChange={(event) => props.onChange(event.target.value)}
          className={className}
        />
      )}
    </label>
  );
}

function BuilderFieldCard(props: {
  field: QuipslyCoachingFormField;
  index: number;
  count: number;
  expanded: boolean;
  onExpand: () => void;
  onChange: (patch: Partial<QuipslyCoachingFormField>) => void;
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const field = props.field;
  const choices = ["SINGLE_SELECT", "MULTI_SELECT"].includes(field.type);
  const ranged = ["NUMBER", "SCALE"].includes(field.type);
  const textField = ["SHORT_TEXT", "LONG_TEXT"].includes(field.type);
  return (
    <article className="min-w-0 rounded-3xl border border-[#e2d4bb] bg-[#fffaf0] p-4">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={props.onExpand}
          aria-expanded={props.expanded}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block text-[10px] font-black uppercase tracking-wide text-violet-800">
            {props.index + 1}. {FIELD_TYPE_LABELS[field.type]}
            {field.required ? " · Required" : ""}
          </span>
          <span className="mt-1 block truncate font-black text-[#3d3122]">
            {field.label || "Untitled question"}
          </span>
        </button>
        <button
          type="button"
          aria-label={`Move ${field.label} up`}
          onClick={() => props.onMove(-1)}
          disabled={props.index === 0}
          className="min-h-11 min-w-11 rounded-full border border-[#d8c7aa] bg-white disabled:opacity-30"
        >
          <ArrowUp size={16} className="mx-auto" />
        </button>
        <button
          type="button"
          aria-label={`Move ${field.label} down`}
          onClick={() => props.onMove(1)}
          disabled={props.index === props.count - 1}
          className="min-h-11 min-w-11 rounded-full border border-[#d8c7aa] bg-white disabled:opacity-30"
        >
          <ArrowDown size={16} className="mx-auto" />
        </button>
      </div>
      {props.expanded ? (
        <div className="mt-4 grid gap-4 border-t border-[#e6d8bf] pt-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <BuilderTextField
              id={`builder-label-${field.id}`}
              label="Question"
              value={field.label}
              maximumLength={240}
              onChange={(label) => props.onChange({ label })}
            />
          </div>
          <div className="sm:col-span-2">
            <BuilderTextField
              id={`builder-help-${field.id}`}
              label="Optional help text"
              value={field.help || ""}
              maximumLength={1_000}
              multiline
              onChange={(help) => props.onChange({ help: help || null })}
            />
          </div>
          {textField ? (
            <>
              <BuilderTextField
                id={`builder-placeholder-${field.id}`}
                label="Optional placeholder"
                value={field.placeholder || ""}
                maximumLength={240}
                onChange={(placeholder) =>
                  props.onChange({ placeholder: placeholder || null })
                }
              />
              <label className="text-sm font-black text-[#4b3a27]">
                Maximum characters
                <input
                  type="number"
                  min={1}
                  max={field.type === "SHORT_TEXT" ? 500 : 10_000}
                  value={field.maximumLength ?? (field.type === "SHORT_TEXT" ? 500 : 4_000)}
                  onChange={(event) =>
                    props.onChange({ maximumLength: Number(event.target.value) })
                  }
                  className="mt-2 min-h-12 w-full rounded-2xl border border-[#d9c9ad] bg-white px-4 font-semibold"
                />
              </label>
            </>
          ) : null}
          {choices ? (
            <label className="sm:col-span-2 text-sm font-black text-[#4b3a27]">
              Choices, one per line
              <textarea
                value={(field.options || []).join("\n")}
                rows={4}
                onChange={(event) =>
                  props.onChange({
                    options: event.target.value
                      .split("\n")
                      .map((value) => value.trim())
                      .filter(Boolean),
                  })
                }
                className="mt-2 min-h-12 w-full rounded-2xl border border-[#d9c9ad] bg-white px-4 py-3 font-semibold"
              />
            </label>
          ) : null}
          {ranged ? (
            <>
              <label className="text-sm font-black text-[#4b3a27]">
                Minimum
                <input
                  type="number"
                  value={field.minimum ?? ""}
                  onChange={(event) =>
                    props.onChange({
                      minimum: event.target.value
                        ? Number(event.target.value)
                        : null,
                    })
                  }
                  className="mt-2 min-h-12 w-full rounded-2xl border border-[#d9c9ad] bg-white px-4 font-semibold"
                />
              </label>
              <label className="text-sm font-black text-[#4b3a27]">
                Maximum
                <input
                  type="number"
                  value={field.maximum ?? ""}
                  onChange={(event) =>
                    props.onChange({
                      maximum: event.target.value
                        ? Number(event.target.value)
                        : null,
                    })
                  }
                  className="mt-2 min-h-12 w-full rounded-2xl border border-[#d9c9ad] bg-white px-4 font-semibold"
                />
              </label>
            </>
          ) : null}
          <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-[#d9c9ad] bg-white px-4 text-sm font-black text-[#4b3a27]">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(event) =>
                props.onChange({ required: event.target.checked })
              }
              className="h-5 w-5 accent-violet-700"
            />
            Required before sharing
          </label>
          <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={props.onDuplicate}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d8c7aa] bg-white px-4 text-sm font-black text-[#5a452e]"
            >
              <Copy size={15} /> Duplicate
            </button>
            <button
              type="button"
              onClick={props.onRemove}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 text-sm font-black text-red-900"
            >
              <Trash2 size={15} /> Remove
            </button>
          </div>
        </div>
      ) : null}
    </article>
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

function FormAutomationWorkspace(props: {
  templates: Template[];
  relationships: Relationship[];
  policies: AutomationPolicy[];
  onChanged: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState(props.templates[0]?.id ?? "");
  const [relationshipId, setRelationshipId] = useState(
    props.relationships[0]?.id ?? "",
  );
  const [trigger, setTrigger] = useState<AutomationPolicy["trigger"]>(
    "BEFORE_SESSION",
  );
  const [versionMode, setVersionMode] = useState<
    AutomationPolicy["versionMode"]
  >("LATEST_PUBLISHED");
  const [releaseOffsetMinutes, setReleaseOffsetMinutes] = useState(-1_440);
  const [dueOffsetMinutes, setDueOffsetMinutes] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  function reset() {
    setOpen(false);
    setEditingPolicyId(null);
    setTemplateId(props.templates[0]?.id ?? "");
    setRelationshipId(props.relationships[0]?.id ?? "");
    setTrigger("BEFORE_SESSION");
    setVersionMode("LATEST_PUBLISHED");
    setReleaseOffsetMinutes(-1_440);
    setDueOffsetMinutes(0);
  }

  function beginEdit(policy: AutomationPolicy) {
    setEditingPolicyId(policy.id);
    setTemplateId(policy.template.id);
    setRelationshipId(policy.relationship.id);
    setTrigger(policy.trigger);
    setVersionMode(policy.versionMode);
    setReleaseOffsetMinutes(policy.releaseOffsetMinutes);
    setDueOffsetMinutes(policy.dueOffsetMinutes);
    setOpen(true);
  }

  function changeTrigger(value: AutomationPolicy["trigger"]) {
    setTrigger(value);
    if (value === "BEFORE_SESSION") {
      setReleaseOffsetMinutes(-1_440);
      setDueOffsetMinutes(0);
    } else {
      setReleaseOffsetMinutes(0);
      setDueOffsetMinutes(2_880);
    }
  }

  async function savePolicy(
    patch?: Partial<Pick<AutomationPolicy, "status">>,
    sourcePolicy?: AutomationPolicy,
  ) {
    const identityPolicy = sourcePolicy ??
      props.policies.find((item) => item.id === editingPolicyId) ??
      null;
    const selectedTemplate = props.templates.find(
      (item) => item.id === (identityPolicy?.template.id || templateId),
    );
    const submittedVersionMode = sourcePolicy
      ? sourcePolicy.versionMode
      : versionMode;
    const payload = {
      action: "SAVE_AUTOMATION_POLICY",
      requestId: crypto.randomUUID(),
      policyId: identityPolicy?.id || editingPolicyId,
      templateId: identityPolicy?.template.id || templateId,
      engagementId: identityPolicy?.relationship.id || relationshipId,
      trigger: identityPolicy?.trigger || trigger,
      status: patch?.status || identityPolicy?.status || "ACTIVE",
      versionMode: submittedVersionMode,
      pinnedTemplateVersionId:
        submittedVersionMode === "PINNED_VERSION"
          ? sourcePolicy?.pinnedTemplateVersion?.id || null
          : null,
      releaseOffsetMinutes:
        sourcePolicy?.releaseOffsetMinutes ?? releaseOffsetMinutes,
      dueOffsetMinutes: sourcePolicy?.dueOffsetMinutes ?? dueOffsetMinutes,
    };
    if (!payload.templateId || !payload.engagementId) {
      props.onError("Choose a form and client before saving this rhythm.");
      return;
    }
    const operation = identityPolicy?.id || editingPolicyId || "new";
    setBusy(`policy:${operation}`);
    try {
      await api("/api/coaching/forms", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!sourcePolicy) reset();
      await props.onChanged(
        patch?.status === "PAUSED"
          ? `${identityPolicy?.template.title || selectedTemplate?.title || "Form"} automation is paused.`
          : patch?.status === "ACTIVE"
            ? `${identityPolicy?.template.title || selectedTemplate?.title || "Form"} automation is active.`
            : `${selectedTemplate?.title || "Form"} now follows this client’s Session rhythm.`,
      );
    } catch (error) {
      props.onError(
        error instanceof Error
          ? error.message
          : "The automation rule could not be saved.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function override(
    policy: AutomationPolicy,
    bookingId: string,
    overrideAction: "SEND_NOW" | "SKIP" | "CLEAR",
  ) {
    setBusy(`override:${policy.id}:${bookingId}`);
    try {
      await api("/api/coaching/forms", {
        method: "POST",
        body: JSON.stringify({
          action: "SAVE_AUTOMATION_OVERRIDE",
          requestId: crypto.randomUUID(),
          policyId: policy.id,
          bookingId,
          overrideAction,
        }),
      });
      await props.onChanged(
        overrideAction === "SEND_NOW"
          ? `${policy.template.title} was sent now.`
          : overrideAction === "SKIP"
            ? `This Session will skip ${policy.template.title}.`
            : `${policy.template.title} is back on its ordinary schedule.`,
      );
    } catch (error) {
      props.onError(
        error instanceof Error
          ? error.message
          : "That Session override could not be saved.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function reconcile() {
    setBusy("reconcile");
    try {
      const result = await api<{
        created: number;
        alreadyAssigned: number;
        waitingForTime: number;
      }>("/api/coaching/forms", {
        method: "POST",
        body: JSON.stringify({ action: "RECONCILE_AUTOMATION" }),
      });
      await props.onChanged(
        result.created
          ? `${result.created} due form${result.created === 1 ? " was" : "s were"} assigned.`
          : "All automatic forms are on schedule.",
      );
    } catch (error) {
      props.onError(
        error instanceof Error
          ? error.message
          : "The automation schedule could not be checked.",
      );
    } finally {
      setBusy(null);
    }
  }

  const canCreate = props.templates.length > 0 && props.relationships.length > 0;
  return (
    <section
      className="min-w-0 rounded-[2rem] border border-[#d7c6e8] bg-[#faf7ff] p-5 shadow-sm sm:p-7"
      aria-labelledby="form-automation-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.17em] text-violet-800">
            Automatic rhythm
          </p>
          <h2
            id="form-automation-title"
            className="mt-2 font-serif text-3xl font-black text-[#34291d]"
          >
            Set it once. Stay in control.
          </h2>
          <p className="mt-2 max-w-2xl font-semibold leading-6 text-[#765f40]">
            Quipsly can place the right reflection before or after each
            confirmed Session. Every send keeps a visible receipt and exact
            form version.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void reconcile()}
            disabled={busy !== null || !props.policies.length}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-violet-300 bg-white px-4 text-sm font-black text-violet-950 disabled:opacity-40"
          >
            <RefreshCw
              size={15}
              className={busy === "reconcile" ? "animate-spin" : ""}
            />{" "}
            Check schedule
          </button>
          <button
            type="button"
            onClick={() => {
              reset();
              setOpen(true);
            }}
            disabled={!canCreate}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-violet-800 px-4 text-sm font-black text-white disabled:opacity-40"
          >
            <Plus size={16} /> Add rhythm
          </button>
        </div>
      </div>

      {!canCreate ? (
        <p className="mt-5 rounded-2xl bg-white p-4 text-sm font-semibold leading-6 text-[#6f583c]">
          Publish a form and invite a coaching client before adding an automatic
          rhythm.
        </p>
      ) : null}

      {open ? (
        <div className="mt-6 min-w-0 rounded-3xl border border-violet-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wide text-violet-800">
                {editingPolicyId ? "Edit rhythm" : "New rhythm"}
              </p>
              <h3 className="mt-1 font-serif text-2xl font-black text-[#3d3122]">
                What should happen around each Session?
              </h3>
            </div>
            <button
              type="button"
              onClick={reset}
              aria-label="Close automation setup"
              className="min-h-11 min-w-11 rounded-full border border-[#d8c7aa] bg-white"
            >
              <X size={17} className="mx-auto" />
            </button>
          </div>
          <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2">
            <label className="min-w-0 text-sm font-black text-[#4b3a27]">
              Form
              <select
                value={templateId}
                disabled={Boolean(editingPolicyId)}
                onChange={(event) => setTemplateId(event.target.value)}
                className="mt-2 min-h-12 w-full min-w-0 rounded-2xl border border-[#d9c9ad] bg-white px-4 font-semibold disabled:bg-stone-100"
              >
                {props.templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.title} · v{template.publishedRevision}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-0 text-sm font-black text-[#4b3a27]">
              Client
              <select
                value={relationshipId}
                disabled={Boolean(editingPolicyId)}
                onChange={(event) => setRelationshipId(event.target.value)}
                className="mt-2 min-h-12 w-full min-w-0 rounded-2xl border border-[#d9c9ad] bg-white px-4 font-semibold disabled:bg-stone-100"
              >
                {props.relationships.map((relationship) => (
                  <option key={relationship.id} value={relationship.id}>
                    {relationship.client?.name ||
                      relationship.client?.email ||
                      relationship.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-0 text-sm font-black text-[#4b3a27]">
              When
              <select
                value={trigger}
                disabled={Boolean(editingPolicyId)}
                onChange={(event) =>
                  changeTrigger(
                    event.target.value as AutomationPolicy["trigger"],
                  )
                }
                className="mt-2 min-h-12 w-full min-w-0 rounded-2xl border border-[#d9c9ad] bg-white px-4 font-semibold disabled:bg-stone-100"
              >
                <option value="BEFORE_SESSION">Before every Session</option>
                <option value="AFTER_SESSION">After every completed Session</option>
              </select>
            </label>
            <label className="min-w-0 text-sm font-black text-[#4b3a27]">
              Timing
              {trigger === "BEFORE_SESSION" ? (
                <select
                  value={releaseOffsetMinutes}
                  onChange={(event) =>
                    setReleaseOffsetMinutes(Number(event.target.value))
                  }
                  className="mt-2 min-h-12 w-full min-w-0 rounded-2xl border border-[#d9c9ad] bg-white px-4 font-semibold"
                >
                  <option value={-1_440}>Send 1 day before</option>
                  <option value={-2_880}>Send 2 days before</option>
                  <option value={-4_320}>Send 3 days before</option>
                  <option value={-10_080}>Send 1 week before</option>
                  <option value={0}>Send at Session start</option>
                </select>
              ) : (
                <select
                  value={dueOffsetMinutes}
                  onChange={(event) =>
                    setDueOffsetMinutes(Number(event.target.value))
                  }
                  className="mt-2 min-h-12 w-full min-w-0 rounded-2xl border border-[#d9c9ad] bg-white px-4 font-semibold"
                >
                  <option value={1_440}>Send when complete · due in 1 day</option>
                  <option value={2_880}>Send when complete · due in 2 days</option>
                  <option value={4_320}>Send when complete · due in 3 days</option>
                  <option value={10_080}>Send when complete · due in 1 week</option>
                </select>
              )}
            </label>
            <label className="sm:col-span-2 flex min-h-14 items-center gap-3 rounded-2xl border border-[#d9c9ad] bg-[#fffaf0] px-4 text-sm font-black text-[#4b3a27]">
              <input
                type="checkbox"
                checked={versionMode === "LATEST_PUBLISHED"}
                onChange={(event) =>
                  setVersionMode(
                    event.target.checked
                      ? "LATEST_PUBLISHED"
                      : "PINNED_VERSION",
                  )
                }
                className="h-5 w-5 accent-violet-700"
              />
              Use the latest published version for future Sessions
            </label>
          </div>
          <p className="mt-4 rounded-2xl bg-violet-50 p-4 text-sm font-semibold leading-6 text-violet-950">
            Existing assignments never change. “Latest” only affects a future
            Session when its form is actually assigned.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void savePolicy()}
              disabled={busy !== null}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-violet-800 px-5 text-sm font-black text-white disabled:opacity-50"
            >
              {busy?.startsWith("policy:") ? (
                <LoaderCircle size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}{" "}
              Save rhythm
            </button>
            <button
              type="button"
              onClick={reset}
              className="min-h-11 rounded-full border border-[#d8c7a9] px-5 text-sm font-black text-[#5b472f]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {props.policies.length ? (
        <div className="mt-6 grid min-w-0 gap-4">
          {props.policies.map((policy) => (
            <article
              key={policy.id}
              className="min-w-0 rounded-3xl border border-[#ded0eb] bg-white p-5"
            >
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wide ${policy.status === "ACTIVE" ? "bg-emerald-100 text-emerald-900" : "bg-stone-200 text-stone-700"}`}
                  >
                    {policy.status === "ACTIVE" ? "Active" : "Paused"}
                  </span>
                  <h3 className="mt-2 break-words font-serif text-2xl font-black text-[#3d3122]">
                    {policy.template.title}
                  </h3>
                  <p className="mt-1 text-sm font-semibold text-[#765f40]">
                    {policy.relationship.client?.name ||
                      policy.relationship.client?.email ||
                      policy.relationship.title}
                    {" · "}
                    {automationTimingLabel(policy)}
                  </p>
                  <p className="mt-1 text-xs font-bold text-[#8a7458]">
                    {policy.versionMode === "LATEST_PUBLISHED"
                      ? "Uses latest published version"
                      : `Keeps version ${policy.pinnedTemplateVersion?.revision || policy.template.publishedRevision}`}
                    {policy.receipts.length
                      ? ` · ${policy.receipts.length} receipt${policy.receipts.length === 1 ? "" : "s"}`
                      : " · No forms sent yet"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => beginEdit(policy)}
                    disabled={busy !== null}
                    className="min-h-11 rounded-full border border-[#d8c7aa] bg-white px-4 text-sm font-black text-[#5b472f]"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void savePolicy(
                        {
                          status:
                            policy.status === "ACTIVE" ? "PAUSED" : "ACTIVE",
                        },
                        policy,
                      )
                    }
                    disabled={busy !== null}
                    className="min-h-11 rounded-full border border-violet-300 bg-violet-50 px-4 text-sm font-black text-violet-950 disabled:opacity-50"
                  >
                    {policy.status === "ACTIVE" ? "Pause" : "Resume"}
                  </button>
                </div>
              </div>

              {policy.sessions.length ? (
                <details className="mt-5 rounded-2xl border border-[#e6dcef] bg-[#fcfaff]">
                  <summary className="min-h-12 cursor-pointer list-none px-4 py-3 text-sm font-black text-violet-950">
                    Upcoming and completed Sessions · manual control
                  </summary>
                  <div className="space-y-3 border-t border-[#e6dcef] p-3">
                    {policy.sessions.map((session) => {
                      const overrideBusy =
                        busy === `override:${policy.id}:${session.id}`;
                      const skipped = session.override?.action === "SKIP";
                      return (
                        <div
                          key={session.id}
                          className="min-w-0 rounded-2xl bg-white p-3"
                        >
                          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="block break-words text-sm font-black text-[#493824]">
                                {formatDate(session.scheduledStart, {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                })}
                              </span>
                              <span className="mt-1 block text-xs font-semibold text-[#806d55]">
                                {session.assignmentCreated
                                  ? "Assigned · receipt retained"
                                  : skipped
                                    ? "Skipped by coach"
                                    : session.eligibleAt
                                      ? `Scheduled ${formatDate(session.eligibleAt, { dateStyle: "medium", timeStyle: "short" })}`
                                      : "Waiting for Session completion"}
                              </span>
                            </div>
                            {!session.assignmentCreated ? (
                              <div className="flex flex-wrap gap-2">
                                {skipped ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void override(policy, session.id, "CLEAR")
                                    }
                                    disabled={overrideBusy}
                                    className="min-h-11 rounded-full border border-[#d8c7aa] px-3 text-xs font-black text-[#5b472f]"
                                  >
                                    Restore schedule
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void override(
                                          policy,
                                          session.id,
                                          "SEND_NOW",
                                        )
                                      }
                                      disabled={overrideBusy}
                                      className="min-h-11 rounded-full bg-violet-800 px-3 text-xs font-black text-white disabled:opacity-50"
                                    >
                                      Send now
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void override(policy, session.id, "SKIP")
                                      }
                                      disabled={overrideBusy}
                                      className="min-h-11 rounded-full border border-[#d8c7aa] px-3 text-xs font-black text-[#5b472f] disabled:opacity-50"
                                    >
                                      Skip once
                                    </button>
                                  </>
                                )}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              ) : null}
            </article>
          ))}
        </div>
      ) : !open && canCreate ? (
        <p className="mt-5 rounded-2xl border border-dashed border-violet-300 bg-white p-5 text-sm font-semibold leading-6 text-[#6f583c]">
          No automatic rhythms yet. Manual sending still works exactly as it
          does now.
        </p>
      ) : null}
    </section>
  );
}

function automationTimingLabel(policy: AutomationPolicy) {
  if (policy.trigger === "BEFORE_SESSION") {
    if (policy.releaseOffsetMinutes === 0) return "when a Session is confirmed";
    const days = Math.abs(policy.releaseOffsetMinutes) / 1_440;
    return `${days} day${days === 1 ? "" : "s"} before each Session`;
  }
  if (policy.releaseOffsetMinutes === 0) {
    const dueDays = policy.dueOffsetMinutes / 1_440;
    return `after completion · due in ${dueDays} day${dueDays === 1 ? "" : "s"}`;
  }
  return "after each completed Session";
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
