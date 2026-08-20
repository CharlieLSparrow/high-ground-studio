"use client";

import { useEffect, useState } from "react";
import {
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

  return (
    <section
      className={`rounded-[1.75rem] border p-5 shadow-sm ${joinedFromInvitation ? "border-emerald-200 bg-emerald-50" : "border-sky-200 bg-sky-50/70"}`}
      aria-labelledby="capture-handoff-heading"
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
            {joinedFromInvitation
              ? "Choose how you want to join"
              : "Browser or Quipsly Capture on iPhone"}
          </h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#765f40]">
            Use a browser on your phone, tablet, or desktop, or continue this
            exact Session in Quipsly Capture on iPhone. Both re-check the
            signed-in account before showing private context.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <article className="rounded-2xl border border-sky-200 bg-white p-4">
          <MonitorSmartphone className="text-sky-800" aria-hidden="true" />
          <h3 className="mt-2 font-black text-[#3d3122]">Continue in this browser</h3>
          <p className="mt-1 text-xs font-semibold leading-5 text-[#765f40]">
            Choose this device’s microphone, camera, and headphones, then join
            the live call without installing anything.
          </p>
          <button
            type="button"
            onClick={() => {
              recordChoice("BROWSER");
              onContinueInBrowser?.();
            }}
            className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-sky-900 px-5 text-xs font-black uppercase tracking-wide text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-900"
          >
            <MonitorSmartphone size={15} aria-hidden="true" />
            Continue in browser
          </button>
        </article>

        <article className="rounded-2xl border border-violet-200 bg-white p-4">
          <Smartphone className="text-violet-800" aria-hidden="true" />
          <h3 className="mt-2 font-black text-[#3d3122]">Use Quipsly Capture</h3>
          <p className="mt-1 text-xs font-semibold leading-5 text-[#765f40]">
            Capture re-opens this Session after the app verifies the same
            account. Installing or opening the app never joins or records by
            itself.
          </p>
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
            First time? Get the public TestFlight beta, sign in with the invited
            account, then return here and tap Open Capture.
          </p>
        </article>
      </div>

      <p className="mt-4 flex gap-2 rounded-xl border border-white/80 bg-white/75 p-3 text-[11px] font-bold leading-5 text-[#5b472f]">
        <ShieldCheck
          size={15}
          className="mt-0.5 shrink-0 text-emerald-700"
          aria-hidden="true"
        />
        Browser and Capture are equivalent views of one Session—not two rooms.
        The link grants no access, and joining and recording remain separate,
        explicit actions.
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
