"use client";

import { useEffect, useRef, useState } from "react";
import { Download, MonitorSmartphone, Smartphone } from "lucide-react";
import { captureAppDeepLink } from "@/lib/capture-universal-link";
import { clearSessionEntry, savedSessionEntry, selectSessionEntry } from "@/lib/session-entry-client";

const CAPTURE_TESTFLIGHT_URL = "https://testflight.apple.com/join/XwRRcYUm";

function isAppleMobileBrowser() {
  return /iPhone|iPod|iPad/i.test(navigator.userAgent)
    || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

export function CaptureAppHandoff({
  roomId,
  sessionTitle,
  joinedFromInvitation = false,
  captureOpenFallback = false,
  onContinueInBrowser,
  allowAutomaticBrowserEntry = true,
}: {
  roomId: string;
  sessionTitle?: string;
  joinedFromInvitation?: boolean;
  captureOpenFallback?: boolean;
  onContinueInBrowser?: () => void;
  allowAutomaticBrowserEntry?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [preferApp, setPreferApp] = useState(false);
  const [fallback, setFallback] = useState(captureOpenFallback);
  const openedRoom = useRef<string | null>(null);
  const openBrowser = useRef(onContinueInBrowser);
  openBrowser.current = onContinueInBrowser;

  useEffect(() => {
    const url = new URL(window.location.href);
    const explicitBrowser = url.searchParams.get("entry") === "browser";
    if (explicitBrowser) {
      url.searchParams.delete("entry");
      window.history.replaceState(window.history.state, "", url);
    }
    if (captureOpenFallback) clearSessionEntry();
    const saved = savedSessionEntry();
    const app = !explicitBrowser && !captureOpenFallback
      && (saved === "CAPTURE_APP" || (saved === null && isAppleMobileBrowser()));
    setPreferApp(app);
    setFallback(captureOpenFallback);
    setReady(true);
    // Opening the lobby is not joining the call or starting a recording.
    // Desktop guests go directly to device preview, without a device-choice form.
    if (!app && !captureOpenFallback && allowAutomaticBrowserEntry
      && openBrowser.current && openedRoom.current !== roomId) {
      openedRoom.current = roomId;
      selectSessionEntry(roomId, "BROWSER");
      openBrowser.current();
    }
  }, [roomId, captureOpenFallback, allowAutomaticBrowserEntry]);

  function continueInBrowser() {
    const url = new URL(window.location.href);
    url.searchParams.delete("open");
    url.searchParams.delete("entry");
    window.history.replaceState(window.history.state, "", url);
    setFallback(false);
    setPreferApp(false);
    selectSessionEntry(roomId, "BROWSER");
    onContinueInBrowser?.();
  }

  const primary = "bg-primary text-primary-foreground hover:opacity-90";
  const secondary = "border border-border bg-background text-foreground hover:bg-muted";
  const action = "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
  const browserAction = <button type="button" onClick={continueInBrowser} disabled={!ready}
    className={`${action} ${preferApp ? secondary : primary} disabled:opacity-50`}>
    <MonitorSmartphone size={18} aria-hidden="true" />
    {fallback ? "Join in this browser" : "Open call lobby"}
  </button>;
  const appAction = <a href={captureAppDeepLink(roomId)} onClick={() => selectSessionEntry(roomId, "CAPTURE_APP")}
    className={`${action} ${preferApp ? primary : secondary}`}>
    <Smartphone size={18} aria-hidden="true" /> {fallback ? "Try Capture again" : "Open Quipsly Capture"}
  </a>;

  return (
    <section aria-labelledby="capture-handoff-heading" aria-busy={!ready}
      data-session-entry-ready={ready ? "true" : "false"}
      className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm sm:p-8">
      {joinedFromInvitation ? <p className="mb-2 text-sm text-muted-foreground">Invitation accepted</p> : null}
      <h2 id="capture-handoff-heading" className="text-2xl font-semibold">{sessionTitle || "Join your session"}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {fallback ? "Capture didn’t open. You can join in your browser, or install the app and try again."
          : preferApp ? "Open in Quipsly Capture or join here."
          : "Check your microphone and camera, then join when you’re ready."}
      </p>
      <div className="mt-6 flex flex-col gap-3">
        {preferApp ? <>{appAction}{browserAction}</> : <>{browserAction}{appAction}</>}
      </div>
      <a href={CAPTURE_TESTFLIGHT_URL} target="_blank" rel="noreferrer"
        onClick={() => selectSessionEntry(roomId, "TESTFLIGHT")}
        className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground underline underline-offset-4">
        <Download size={16} aria-hidden="true" /> {fallback ? "Install or update Capture" : "Get Capture for iPhone or iPad"}
      </a>
    </section>
  );
}
