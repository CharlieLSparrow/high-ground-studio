"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Download,
  ExternalLink,
  MonitorSmartphone,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

import type { SessionEntryChoice } from "@/lib/session-entry-choice";

const CAPTURE_TESTFLIGHT_URL = "https://testflight.apple.com/join/XwRRcYUm";

type EntryChoiceMetrics = {
  BROWSER: number;
  CAPTURE_APP: number;
  TESTFLIGHT: number;
};

export function CaptureAppHandoff({
  roomId,
  joinedFromInvitation = false,
  canViewChoiceMetrics = false,
  onContinueInBrowser,
}: {
  roomId: string;
  joinedFromInvitation?: boolean;
  canViewChoiceMetrics?: boolean;
  onContinueInBrowser?: () => void;
}) {
  const captureURL = `quipsly://session/${encodeURIComponent(roomId)}?mode=live`;
  const [metrics, setMetrics] = useState<EntryChoiceMetrics | null>(null);
  const [step, setStep] = useState<"choose" | "capture">("choose");
  const [interactive, setInteractive] = useState(false);
  const continueInBrowserRef = useRef(onContinueInBrowser);
  continueInBrowserRef.current = onContinueInBrowser;

  function clearBrowserEntryIntent() {
    const current = new URL(window.location.href);
    if (current.searchParams.get("entry") !== "browser") return;
    current.searchParams.delete("entry");
    window.history.replaceState(window.history.state, "", current);
  }

  function continueInBrowser() {
    const current = new URL(window.location.href);
    current.searchParams.set("entry", "browser");
    window.history.replaceState(window.history.state, "", current);
    recordChoice("BROWSER");
    onContinueInBrowser?.();
    window.setTimeout(clearBrowserEntryIntent, 15_000);
  }

  function recordChoice(choice: SessionEntryChoice) {
    void fetch(
      `/api/sessions/${encodeURIComponent(roomId)}/entry-choice`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ choice }),
        credentials: "same-origin",
        keepalive: true,
      },
    ).catch(() => undefined);
  }

  useEffect(() => {
    setInteractive(true);
  }, []);

  useEffect(() => {
    if (!canViewChoiceMetrics) return;
    let cancelled = false;
    void fetch(`/api/sessions/${encodeURIComponent(roomId)}/entry-choice`, {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        const packet = await response.json().catch(() => ({}));
        if (!cancelled && response.ok && packet.ok) setMetrics(packet.counts);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [canViewChoiceMetrics, roomId]);

  useEffect(() => {
    const current = new URL(window.location.href);
    if (current.searchParams.get("entry") !== "browser") return;
    continueInBrowserRef.current?.();
    clearBrowserEntryIntent();
  }, []);

  return (
    <section
      className={`rounded-[1.75rem] border p-5 shadow-sm ${joinedFromInvitation ? "border-emerald-200 bg-emerald-50" : "border-sky-200 bg-sky-50/70"}`}
      aria-labelledby="capture-handoff-heading"
      aria-busy={!interactive}
      data-session-entry-ready={interactive ? "true" : "false"}
    >
      <div className="flex max-w-3xl items-start gap-3">
        <span className="rounded-2xl bg-white p-3 text-violet-800 shadow-sm">
          <Smartphone aria-hidden="true" />
        </span>
        <div>
          <p
            className={`text-[10px] font-black uppercase tracking-[0.18em] ${joinedFromInvitation ? "text-emerald-800" : "text-sky-800"}`}
          >
            {joinedFromInvitation
              ? "Invitation accepted"
              : "One Session · your choice of device"}
          </p>
          <h2
            id="capture-handoff-heading"
            className="mt-1 font-serif text-2xl font-black text-[#3d3122]"
          >
            {joinedFromInvitation ? "Join your Session" : "Choose where to join"}
          </h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#765f40]">
            Continue in this browser or open the same Session in Quipsly
            Capture on iPhone.
          </p>
        </div>
      </div>

      <div className="mt-5 min-h-44 rounded-2xl border border-white/90 bg-white p-3 shadow-sm sm:p-4">
        {step === "choose" ? (
          <div aria-label="Choose a device for this Session">
            <p className="px-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#765f40]">
              One choice now · setup comes next
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={!interactive}
                onClick={continueInBrowser}
                className="group flex min-h-24 items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-900 disabled:cursor-wait disabled:opacity-60"
              >
                <span className="rounded-xl bg-white p-2 text-sky-800 shadow-sm">
                  <MonitorSmartphone size={22} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-black text-[#3d3122]">This browser</span>
                  <span className="mt-0.5 block text-xs font-semibold leading-5 text-[#765f40]">
                    Set up and join here
                  </span>
                </span>
                <ChevronRight className="shrink-0 text-sky-800" size={18} aria-hidden="true" />
              </button>

              <button
                type="button"
                disabled={!interactive}
                onClick={() => setStep("capture")}
                className="group flex min-h-24 items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-800 disabled:cursor-wait disabled:opacity-60"
              >
                <span className="rounded-xl bg-white p-2 text-violet-800 shadow-sm">
                  <Smartphone size={22} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-black text-[#3d3122]">iPhone Capture</span>
                  <span className="mt-0.5 block text-xs font-semibold leading-5 text-[#765f40]">
                    Open on this iPhone
                  </span>
                </span>
                <ChevronRight className="shrink-0 text-violet-800" size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : (
          <div aria-label="Open this Session in Quipsly Capture">
            <button
              type="button"
              onClick={() => setStep("choose")}
              className="inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-xs font-black text-violet-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-800"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Change device
            </button>
            <div className="mt-1 flex items-start gap-3 px-1">
              <span className="rounded-xl bg-violet-50 p-2 text-violet-800">
                <Smartphone size={22} aria-hidden="true" />
              </span>
              <div>
                <h3 className="font-black text-[#3d3122]">Continue on this iPhone</h3>
                <p className="mt-1 text-xs font-semibold leading-5 text-[#765f40]">
                  Capture opens this Session so you can check your setup and join.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <a
                href={captureURL}
                onClick={() => recordChoice("CAPTURE_APP")}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-violet-800 px-4 text-xs font-black uppercase tracking-wide text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-800"
              >
                <ExternalLink size={15} aria-hidden="true" />
                Open Capture
              </a>
              <a
                href={CAPTURE_TESTFLIGHT_URL}
                target="_blank"
                rel="noreferrer"
                onClick={() => recordChoice("TESTFLIGHT")}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-violet-300 bg-white px-4 text-xs font-black text-violet-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-800"
              >
                <Download size={15} aria-hidden="true" />
                Get iPhone beta
              </a>
            </div>
            <p className="mt-3 text-[10px] font-bold leading-4 text-[#765f40]">
              First time? Install the public beta, sign in with the invited account, return here, and tap Open Capture.
            </p>
          </div>
        )}
      </div>

      <p className="mt-4 flex gap-2 rounded-xl border border-white/80 bg-white/75 p-3 text-[11px] font-bold leading-5 text-[#5b472f]">
        <ShieldCheck
          size={15}
          className="mt-0.5 shrink-0 text-emerald-700"
          aria-hidden="true"
        />
        Whichever you choose, you’ll enter the same private Session. Joining
        never starts a recording.
      </p>

      {metrics ? (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-white/85 px-3 py-2 text-[11px] font-bold leading-5 text-emerald-950" role="status">
          Session entry signals: {metrics.BROWSER} browser choice ·{" "}
          {metrics.CAPTURE_APP} Capture open {metrics.CAPTURE_APP === 1 ? "attempt" : "attempts"} ·{" "}
          {metrics.TESTFLIGHT} TestFlight {metrics.TESTFLIGHT === 1 ? "visit" : "visits"}.
          Each count deduplicates one person’s repeated taps; the same person
          may try more than one path. These signals are not install proof;
          Apple’s TestFlight metrics remain the install authority.
        </div>
      ) : null}
    </section>
  );
}
