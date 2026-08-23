"use client";

import { useEffect, useRef, useState } from "react";
import {
  Download,
  ExternalLink,
  MonitorSmartphone,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

import type { SessionEntryChoice } from "@/lib/session-entry-choice";
import { captureUniversalLink } from "@/lib/capture-universal-link";

const CAPTURE_TESTFLIGHT_URL = "https://testflight.apple.com/join/XwRRcYUm";
const SESSION_ENTRY_PREFERENCE_KEY = "quipsly.session-entry-preference.v1";

type EntryChoiceMetrics = {
  BROWSER: number;
  CAPTURE_APP: number;
  TESTFLIGHT: number;
};

function prefersCaptureOnThisDevice() {
  const userAgent = window.navigator.userAgent;
  return /iPhone|iPod/i.test(userAgent);
}

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
  const captureURL = captureUniversalLink(roomId);
  const [metrics, setMetrics] = useState<EntryChoiceMetrics | null>(null);
  const [step, setStep] = useState<"choose" | "preferred">("choose");
  const [preferredEntry, setPreferredEntry] = useState<"BROWSER" | "CAPTURE_APP" | null>(null);
  const [captureRecommended, setCaptureRecommended] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const continueInBrowserRef = useRef(onContinueInBrowser);
  const openedRememberedBrowserRef = useRef(false);
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
    rememberEntry("BROWSER");
    onContinueInBrowser?.();
    window.setTimeout(clearBrowserEntryIntent, 15_000);
  }

  function rememberEntry(choice: "BROWSER" | "CAPTURE_APP") {
    window.localStorage.setItem(SESSION_ENTRY_PREFERENCE_KEY, choice);
    setPreferredEntry(choice);
  }

  function chooseAnotherDevice() {
    window.localStorage.removeItem(SESSION_ENTRY_PREFERENCE_KEY);
    setPreferredEntry(null);
    setStep("choose");
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
    setCaptureRecommended(prefersCaptureOnThisDevice());
    const saved = window.localStorage.getItem(SESSION_ENTRY_PREFERENCE_KEY);
    if (saved === "BROWSER" || saved === "CAPTURE_APP") {
      setPreferredEntry(saved);
      setStep("preferred");
    }
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
    if (window.localStorage.getItem(SESSION_ENTRY_PREFERENCE_KEY) === "BROWSER") {
      clearBrowserEntryIntent();
      return;
    }
    continueInBrowserRef.current?.();
    clearBrowserEntryIntent();
  }, []);

  useEffect(() => {
    if (
      !interactive
      || preferredEntry !== "BROWSER"
      || step !== "preferred"
      || openedRememberedBrowserRef.current
    ) return;
    openedRememberedBrowserRef.current = true;
    continueInBrowserRef.current?.();
  }, [interactive, preferredEntry, step]);

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
            {joinedFromInvitation ? "Join your Session" : "Ready to join?"}
          </h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#765f40]">
            {captureRecommended
              ? "Open the Session in Quipsly Capture, or continue in this browser."
              : "Continue in this browser. Quipsly Capture is also available on iPhone."}
          </p>
        </div>
      </div>

      <div className="mt-5 min-h-44 rounded-2xl border border-white/90 bg-white p-3 shadow-sm sm:p-4">
        {step === "preferred" && preferredEntry ? (
          <div aria-label="Your usual Session device">
            <p className="px-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-800">
              Remembered on this device
            </p>
            <div className="mt-3 flex min-h-24 items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <span className="rounded-xl bg-white p-2 text-emerald-800 shadow-sm">
                {preferredEntry === "BROWSER" ? <MonitorSmartphone size={22} aria-hidden="true" /> : <Smartphone size={22} aria-hidden="true" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-black text-[#3d3122]">
                  {preferredEntry === "BROWSER" ? "Continue in this browser" : "Open Quipsly Capture"}
                </span>
                <span className="mt-0.5 block text-xs font-semibold leading-5 text-[#765f40]">
                  {preferredEntry === "BROWSER"
                    ? "Your call lobby opens automatically."
                    : "Open this Session on your iPhone."}
                </span>
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {preferredEntry === "BROWSER" ? (
                <button
                  type="button"
                  onClick={continueInBrowser}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-violet-800 px-5 text-xs font-black uppercase tracking-wide text-white"
                >
                  <MonitorSmartphone size={16} aria-hidden="true" /> Open call lobby
                </button>
              ) : (
                <a
                  href={captureURL}
                  onClick={() => {
                    rememberEntry("CAPTURE_APP");
                    recordChoice("CAPTURE_APP");
                  }}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-violet-800 px-5 text-xs font-black uppercase tracking-wide text-white"
                >
                  <ExternalLink size={15} aria-hidden="true" /> Open Capture
                </a>
              )}
              <button
                type="button"
                onClick={chooseAnotherDevice}
                className="inline-flex min-h-12 items-center rounded-full px-4 text-xs font-black text-[#5b472f]"
              >
                Use another device
              </button>
            </div>
          </div>
        ) : step === "choose" ? (
          <div aria-label="Choose a device for this Session">
            <p className="px-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#765f40]">
              {captureRecommended ? "Recommended on this iPhone" : "Recommended on this device"}
            </p>
            <div className="mt-3 space-y-2">
              {captureRecommended ? (
                <>
                  <a
                    href={captureURL}
                    onClick={() => {
                      rememberEntry("CAPTURE_APP");
                      recordChoice("CAPTURE_APP");
                    }}
                    className="flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-violet-800 px-5 text-sm font-black text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-800"
                  >
                    <ExternalLink size={18} aria-hidden="true" /> Open Quipsly Capture
                  </a>
                  <button
                    type="button"
                    disabled={!interactive}
                    onClick={continueInBrowser}
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-sky-200 bg-white px-4 text-xs font-black text-sky-950 disabled:cursor-wait disabled:opacity-60"
                  >
                    <MonitorSmartphone size={16} aria-hidden="true" /> Join in browser
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={!interactive}
                    onClick={continueInBrowser}
                    className="flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-violet-800 px-5 text-sm font-black text-white disabled:cursor-wait disabled:opacity-60"
                  >
                    <MonitorSmartphone size={18} aria-hidden="true" /> Join call
                  </button>
                  <a
                    href={captureURL}
                    onClick={() => {
                      rememberEntry("CAPTURE_APP");
                      recordChoice("CAPTURE_APP");
                    }}
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-violet-200 bg-white px-4 text-xs font-black text-violet-950"
                  >
                    <Smartphone size={16} aria-hidden="true" /> Use Quipsly Capture on iPhone
                  </a>
                </>
              )}
            </div>
            <a
              href={CAPTURE_TESTFLIGHT_URL}
              target="_blank"
              rel="noreferrer"
              onClick={() => recordChoice("TESTFLIGHT")}
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-xs font-black text-violet-900"
            >
              <Download size={15} aria-hidden="true" /> Need the iPhone app? Get the beta
            </a>
          </div>
        ) : null}
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
