"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, LockKeyhole, Target } from "lucide-react";

export type Preparation = {
  roomId: string;
  bookingId: string;
  role: "client" | "coach";
  revision: number;
  client: {
    focus: string;
    desiredOutcome: string;
    successMeasure: string;
    progressScore: number | null;
    update: string;
    submittedAt: string | null;
  };
  coachPrivate: null | {
    note: string;
    preparedAt: string | null;
  };
};

type ClientDraft = Preparation["client"];

const EMPTY_CLIENT: ClientDraft = {
  focus: "",
  desiredOutcome: "",
  successMeasure: "",
  progressScore: null,
  update: "",
  submittedAt: null,
};

export function CoachingSessionPlanCard({ roomId }: { roomId: string }) {
  const [preparation, setPreparation] = useState<Preparation | null>(null);
  const [clientDraft, setClientDraft] = useState<ClientDraft>(EMPTY_CLIENT);
  const [coachDraft, setCoachDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [saving, setSaving] = useState<"client" | "coach" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const loadSequence = useRef(0);
  const pendingSave = useRef<null | {
    lane: "client" | "coach";
    fingerprint: string;
    requestId: string;
  }>(null);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(roomId)}/preparation`,
        { cache: "no-store" },
      );
      const payload = await response.json().catch(() => null);
      if (sequence !== loadSequence.current) return;
      if (response.status === 404) {
        setUnavailable(true);
        return;
      }
      if (!response.ok || payload?.ok !== true || !payload.preparation) {
        throw new Error(payload?.error || "Preparation could not be loaded.");
      }
      const next = payload.preparation as Preparation;
      setPreparation(next);
      setClientDraft(next.client);
      setCoachDraft(next.coachPrivate?.note || "");
    } catch (cause) {
      if (sequence !== loadSequence.current) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Preparation could not be loaded.",
      );
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveClient(draft: ClientDraft) {
    const body = {
      operation: "SAVE_CLIENT",
      focus: draft.focus,
      desiredOutcome: draft.desiredOutcome,
      successMeasure: draft.successMeasure,
      progressScore: draft.progressScore,
      update: draft.update,
    };
    await save("client", body);
  }

  async function saveCoach(note: string) {
    await save("coach", { operation: "SAVE_COACH", note });
  }

  async function save(
    lane: "client" | "coach",
    body: Record<string, unknown>,
  ) {
    const fingerprint = JSON.stringify(body);
    const requestId =
      pendingSave.current?.lane === lane &&
      pendingSave.current.fingerprint === fingerprint
        ? pendingSave.current.requestId
        : crypto.randomUUID();
    pendingSave.current = { lane, fingerprint, requestId };
    setSaving(lane);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(roomId)}/preparation`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, requestId }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true || !payload.preparation) {
        throw new Error(payload?.error || "Preparation could not be saved.");
      }
      pendingSave.current = null;
      const next = payload.preparation as Preparation;
      setPreparation(next);
      setClientDraft(next.client);
      setCoachDraft(next.coachPrivate?.note || "");
      setMessage(
        lane === "client"
          ? "Your Session plan is saved. You can change it anytime."
          : "Private coach prep saved.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Preparation could not be saved. Your text is still here; try again.",
      );
    } finally {
      setSaving(null);
    }
  }

  if (unavailable) return null;

  return (
    <details className="rounded-2xl border border-violet-200 bg-white p-3 shadow-sm sm:p-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-1 text-[#3d3122]">
        <span className="flex items-center gap-3 text-sm font-black">
          <span className="rounded-xl bg-violet-50 p-2 text-violet-700">
            <Target className="h-5 w-5" aria-hidden="true" />
          </span>
          Plan this session
        </span>
        <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-violet-900">
          Optional
        </span>
      </summary>
      <div className="mt-3 border-t border-violet-100 pt-4">
        <h3 id="coaching-session-plan-heading" className="font-serif text-xl font-black text-[#3d3122]">
          What would make this session useful?
        </h3>
        <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-[#765f40]">
          Add a focus before the call if it helps. Nothing here is required to join.
        </p>

        {loading ? (
          <p className="mt-4 text-sm font-semibold text-stone-600" role="status">
            Loading your Session plan…
          </p>
        ) : preparation?.role === "client" ? (
          <ClientPlanForm
            draft={clientDraft}
            disabled={saving !== null}
            onChange={setClientDraft}
            onSave={(draft) => void saveClient(draft)}
          />
        ) : preparation?.role === "coach" ? (
          <CoachPlanForm
            client={preparation.client}
            note={coachDraft}
            disabled={saving !== null}
            onNoteChange={setCoachDraft}
            onSave={(note) => void saveCoach(note)}
          />
        ) : null}

        {message ? (
          <p
            className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-900"
            role="status"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {message}
          </p>
        ) : null}
        {error ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm font-bold text-rose-900" role="alert">
            <p>{error}</p>
            {!preparation ? (
              <button
                type="button"
                className="mt-2 min-h-11 underline underline-offset-4"
                onClick={() => void load()}
              >
                Try again
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </details>
  );
}

function ClientPlanForm({
  draft,
  disabled,
  onChange,
  onSave,
}: {
  draft: ClientDraft;
  disabled: boolean;
  onChange: (next: ClientDraft) => void;
  onSave: (draft: ClientDraft) => void;
}) {
  const field = <Key extends keyof ClientDraft>(key: Key, value: ClientDraft[Key]) =>
    onChange({ ...draft, [key]: value });
  return (
    <form
      className="mt-5 grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const progress = String(form.get("progressScore") || "");
        onSave({
          ...draft,
          focus: String(form.get("focus") || ""),
          desiredOutcome: String(form.get("desiredOutcome") || ""),
          successMeasure: String(form.get("successMeasure") || ""),
          update: String(form.get("update") || ""),
          progressScore: progress === "" ? null : Number(progress),
        });
      }}
    >
      <label className="grid gap-2 text-sm font-black text-[#3d3122]">
        What would make this Session useful?
        <textarea
          name="focus"
          value={draft.focus}
          onChange={(event) => field("focus", event.target.value)}
          maxLength={2_000}
          rows={3}
          placeholder="The situation, decision, or goal you want to focus on"
          className="min-h-24 rounded-xl border border-[#d8c7a8] bg-[#fffdf8] px-3 py-3 text-base font-medium leading-6 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
        />
      </label>
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="grid gap-2 text-sm font-black text-[#3d3122]">
          What would you like to leave with?
          <textarea
            name="desiredOutcome"
            value={draft.desiredOutcome}
            onChange={(event) => field("desiredOutcome", event.target.value)}
            maxLength={2_000}
            rows={2}
            placeholder="Clarity, a decision, a plan, or another useful result"
            className="rounded-xl border border-[#d8c7a8] bg-[#fffdf8] px-3 py-3 text-base font-medium leading-6 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
          />
        </label>
        <label className="grid gap-2 text-sm font-black text-[#3d3122]">
          How will you know the Session helped?
          <textarea
            name="successMeasure"
            value={draft.successMeasure}
            onChange={(event) => field("successMeasure", event.target.value)}
            maxLength={2_000}
            rows={2}
            placeholder="What will feel different by the end?"
            className="rounded-xl border border-[#d8c7a8] bg-[#fffdf8] px-3 py-3 text-base font-medium leading-6 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
          />
        </label>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_12rem]">
        <label className="grid gap-2 text-sm font-black text-[#3d3122]">
          What has changed since last time?
          <textarea
            name="update"
            value={draft.update}
            onChange={(event) => field("update", event.target.value)}
            maxLength={4_000}
            rows={2}
            placeholder="Wins, obstacles, experiments, or anything the coach should know"
            className="rounded-xl border border-[#d8c7a8] bg-[#fffdf8] px-3 py-3 text-base font-medium leading-6 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
          />
        </label>
        <label className="grid content-start gap-2 text-sm font-black text-[#3d3122]">
          Progress (optional)
          <select
            name="progressScore"
            value={draft.progressScore ?? ""}
            onChange={(event) =>
              field(
                "progressScore",
                event.target.value === "" ? null : Number(event.target.value),
              )
            }
            className="min-h-12 rounded-xl border border-[#d8c7a8] bg-[#fffdf8] px-3 text-base font-bold outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
          >
            <option value="">Not set</option>
            {Array.from({ length: 11 }, (_, score) => (
              <option key={score} value={score}>
                {score} / 10
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={disabled}
          className="min-h-12 rounded-full bg-violet-700 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-violet-800 disabled:cursor-wait disabled:opacity-60"
        >
          {disabled ? "Saving…" : "Save Session plan"}
        </button>
        <p className="text-xs font-semibold text-stone-600">
          Shared only with your assigned coach · editable anytime
        </p>
      </div>
    </form>
  );
}

function CoachPlanForm({
  client,
  note,
  disabled,
  onNoteChange,
  onSave,
}: {
  client: Preparation["client"];
  note: string;
  disabled: boolean;
  onNoteChange: (value: string) => void;
  onSave: (note: string) => void;
}) {
  const hasClientPlan = Boolean(
    client.submittedAt ||
      client.focus ||
      client.desiredOutcome ||
      client.successMeasure ||
      client.update ||
      client.progressScore !== null,
  );
  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-violet-100 bg-violet-50/55 p-4" aria-labelledby="client-check-in-heading">
        <p className="text-[10px] font-black uppercase tracking-wide text-violet-800">
          Shared by the client
        </p>
        <h4 id="client-check-in-heading" className="mt-1 text-base font-black text-[#3d3122]">
          Client check-in
        </h4>
        {hasClientPlan ? (
          <dl className="mt-3 grid gap-3 text-sm">
            <PlanAnswer label="Focus" value={client.focus} />
            <PlanAnswer label="Desired result" value={client.desiredOutcome} />
            <PlanAnswer label="Success looks like" value={client.successMeasure} />
            <PlanAnswer label="Since last time" value={client.update} />
            {client.progressScore !== null ? (
              <PlanAnswer label="Progress" value={`${client.progressScore} / 10`} />
            ) : null}
          </dl>
        ) : (
          <p className="mt-3 text-sm font-semibold leading-6 text-[#765f40]">
            No check-in yet. The client can add one here before the call, but it
            never blocks joining.
          </p>
        )}
      </section>
      <form
        className="grid content-start gap-2 rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm font-black text-[#3d3122]"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          onSave(String(form.get("note") || ""));
        }}
      >
        <label htmlFor="private-coach-preparation" className="flex items-center gap-2">
          <LockKeyhole className="h-4 w-4 text-stone-600" aria-hidden="true" />
          Private coach prep
        </label>
        <textarea
          id="private-coach-preparation"
          name="note"
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          maxLength={8_000}
          rows={8}
          placeholder="Context to remember, questions to hold, and anything you want in view during the Session"
          className="rounded-xl border border-stone-300 bg-white px-3 py-3 text-base font-medium leading-6 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
        />
        <span className="text-xs font-semibold text-stone-600">
          Only the assigned coach can read this.
        </span>
        <button
          type="submit"
          disabled={disabled}
          className="mt-1 min-h-12 justify-self-start rounded-full bg-[#3d3122] px-5 py-3 text-sm font-black text-white transition hover:bg-black disabled:cursor-wait disabled:opacity-60"
        >
          {disabled ? "Saving…" : "Save private prep"}
        </button>
      </form>
    </div>
  );
}

function PlanAnswer({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">
        {label}
      </dt>
      <dd className="mt-1 whitespace-pre-wrap font-semibold leading-6 text-[#3d3122]">
        {value}
      </dd>
    </div>
  );
}
