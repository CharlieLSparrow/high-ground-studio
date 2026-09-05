"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, RefreshCw, Trash2 } from "lucide-react";

type DeletionRequest = {
  id: string;
  status: string;
  statusLabel?: string | null;
  statusDetail?: string | null;
  requestedAt?: string | null;
  targetCompletionAt?: string | null;
  completedAt?: string | null;
  active: boolean;
};

type DeletionPayload = {
  ok: boolean;
  error?: string;
  request?: DeletionRequest | null;
  nextAction?: string | null;
  policy?: {
    timing?: string | null;
  } | null;
};

function readableDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

export function AccountDeletionPanel() {
  const [request, setRequest] = useState<DeletionRequest | null>(null);
  const [nextAction, setNextAction] = useState<string | null>(null);
  const [timing, setTiming] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyPayload = useCallback((payload: DeletionPayload) => {
    setRequest(payload.request ?? null);
    setNextAction(payload.nextAction ?? null);
    setTiming(payload.policy?.timing ?? null);
  }, []);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/account/deletion-request", {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json()) as DeletionPayload;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Account deletion status could not be loaded.");
      }
      applyPayload(payload);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Account deletion status could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [applyPayload]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const deleteAccount = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/account/deletion-request", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source: "quipsly-web",
          appSurface: "settings-support",
        }),
      });
      const payload = (await response.json()) as DeletionPayload;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Account deletion could not be started.");
      }
      applyPayload(payload);
      setConfirming(false);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Account deletion could not be started.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const targetDate = readableDate(request?.targetCompletionAt);
  const completedDate = readableDate(request?.completedAt);

  return (
    <section
      aria-labelledby="account-deletion-heading"
      className="rounded-2xl border border-studio-line bg-studio-panel p-6 shadow-studio-panel"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-studio-dim">
            Account
          </p>
          <h3 id="account-deletion-heading" className="mt-1 text-lg font-bold text-studio-ink">
            Delete your Quipsly account
          </h3>
          <p className="mt-2 text-sm leading-6 text-studio-muted">
            Delete your access and eligible personal data without finding every Session or file first.
            Shared or legally required records may be anonymized or retained only when necessary.
          </p>
        </div>
        {(request || error) && (
          <button
            type="button"
            onClick={() => void loadStatus()}
            disabled={loading || submitting}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-studio-line px-4 py-2 text-sm font-bold text-studio-ink transition hover:border-studio-tag disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw size={15} aria-hidden="true" />
            {loading ? "Refreshing…" : "Refresh status"}
          </button>
        )}
      </div>

      {loading && !request ? (
        <p role="status" className="mt-5 text-sm text-studio-muted">Checking deletion status…</p>
      ) : error && !request ? null : confirming ? (
        <div role="alertdialog" aria-labelledby="delete-confirmation-heading" className="mt-5 rounded-xl border border-rose-400/40 bg-rose-400/10 p-5">
          <h4 id="delete-confirmation-heading" className="font-bold text-studio-ink">
            Delete this account?
          </h4>
          <p className="mt-2 text-sm leading-6 text-studio-muted">
            Quipsly will begin deleting your access and eligible personal data immediately. This cannot
            be undone after deletion completes. App Store subscriptions must be canceled separately.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => void deleteAccount()}
              disabled={submitting}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rose-700 px-5 py-2.5 text-sm font-black text-white transition hover:bg-rose-600 disabled:cursor-wait disabled:opacity-60"
            >
              <Trash2 size={15} aria-hidden="true" />
              {submitting ? "Starting deletion…" : "Delete account"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={submitting}
              className="min-h-11 rounded-xl border border-studio-line px-5 py-2.5 text-sm font-bold text-studio-ink disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : request ? (
        <div className="mt-5 rounded-xl border border-studio-line bg-studio-panel/50 p-5">
          <p className="font-bold text-studio-ink">
            {request.statusLabel || request.status}
          </p>
          {request.statusDetail && (
            <p className="mt-2 text-sm leading-6 text-studio-muted">{request.statusDetail}</p>
          )}
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            {completedDate ? (
              <div>
                <dt className="text-studio-dim">Completed</dt>
                <dd className="font-bold text-studio-ink">{completedDate}</dd>
              </div>
            ) : targetDate ? (
              <div>
                <dt className="text-studio-dim">Target completion</dt>
                <dd className="font-bold text-studio-ink">{targetDate}</dd>
              </div>
            ) : null}
          </dl>
          {nextAction && <p className="mt-4 text-sm text-studio-muted">{nextAction}</p>}
          {!request.active && request.status !== "COMPLETED" && (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rose-400/50 px-5 py-2.5 text-sm font-black text-rose-200 transition hover:bg-rose-400/10"
            >
              <Trash2 size={15} aria-hidden="true" /> Start a new deletion request…
            </button>
          )}
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-studio-muted">
              {timing || "Quipsly targets completion within 30 days and handles eligible deletion automatically."}
            </p>
            <a
              href="https://apps.apple.com/account/subscriptions"
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-studio-tag hover:underline"
            >
              Manage Apple subscriptions <ExternalLink size={13} aria-hidden="true" />
            </a>
          </div>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-rose-400/50 px-5 py-2.5 text-sm font-black text-rose-200 transition hover:bg-rose-400/10"
          >
            <Trash2 size={15} aria-hidden="true" /> Delete account…
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-rose-400/40 bg-rose-400/10 p-4 text-sm font-bold text-rose-100">
          {error}
        </p>
      )}
    </section>
  );
}
