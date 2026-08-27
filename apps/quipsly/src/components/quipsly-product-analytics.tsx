"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect, useState } from "react";

import {
  analyticsSurfaceForPath,
  buildAnalyticsConsentCookie,
  parseAnalyticsConsentCookie,
  privacySafeAnalyticsPath,
  type QuipslyAnalyticsConsent,
  type QuipslyProductEventName,
  type QuipslyProductEventParameters,
} from "@/lib/product-analytics";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const CONSENT_STORAGE_KEY = "quipsly.analytics-consent.v1";
let persistAuthenticatedProductEvents = false;
let googleAnalyticsEnabled = false;

export function trackQuipslyProductEvent(
  eventName: QuipslyProductEventName,
  parameters: QuipslyProductEventParameters = {},
) {
  if (typeof window === "undefined") return;
  if (googleAnalyticsEnabled) window.gtag?.("event", eventName, parameters);
  if (!persistAuthenticatedProductEvents) return;
  void fetch("/api/product-analytics/events", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventName, parameters }),
    keepalive: true,
  }).catch(() => undefined);
}

function persistAnalyticsConsent(granted: boolean) {
  const consent: QuipslyAnalyticsConsent = granted ? "granted" : "denied";
  try {
    document.cookie = buildAnalyticsConsentCookie({
      consent,
      hostname: window.location.hostname,
      secure: window.location.protocol === "https:",
    });
    window.localStorage.setItem(CONSENT_STORAGE_KEY, consent);
  } catch {
    // The current-page choice still applies when storage is blocked.
  }
}

function AnalyticsConsentChoice({ onChoice }: { onChoice: (granted: boolean) => void }) {
  return (
    <aside
      aria-label="Analytics choice"
      className="fixed inset-x-3 bottom-3 z-[120] mx-auto flex max-w-2xl flex-col gap-3 rounded-2xl border border-[#d7c4a6] bg-[#fffaf2] p-4 text-[#3d2a1e] shadow-2xl sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm leading-5">
        <strong className="block">Help us make Quipsly easier.</strong>
        Share privacy-safe product-use analytics. Session content, names, emails, notes, and recordings are never included.
      </p>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          className="rounded-full border border-[#d7c4a6] px-4 py-2 text-xs font-black"
          onClick={() => onChoice(false)}
        >
          No thanks
        </button>
        <button
          type="button"
          className="rounded-full bg-[#3d2a1e] px-4 py-2 text-xs font-black text-white"
          onClick={() => onChoice(true)}
        >
          Allow analytics
        </button>
      </div>
    </aside>
  );
}

export function AnalyticsPrivacyButton({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new Event("quipsly:open-analytics-consent"))}
    >
      Analytics privacy choice
    </button>
  );
}

function AnalyticsNavigation({
  measurementId,
}: {
  measurementId: string;
}) {
  const pathname = usePathname();
  useEffect(() => {
    const googleAuthStarted = () => trackQuipslyProductEvent("login_started", {
      surface: "sign_in",
      method: "google",
    });
    const passwordAuthStarted = () => trackQuipslyProductEvent("login_started", {
      surface: "sign_in",
      method: "email",
    });
    window.addEventListener("quipsly:google-auth-start", googleAuthStarted);
    window.addEventListener("quipsly:password-auth-start", passwordAuthStarted);
    return () => {
      window.removeEventListener("quipsly:google-auth-start", googleAuthStarted);
      window.removeEventListener("quipsly:password-auth-start", passwordAuthStarted);
    };
  }, []);
  useEffect(() => {
    const pagePath = privacySafeAnalyticsPath(pathname);
    window.gtag?.("event", "page_view", {
      page_location: `https://nest.quipsly.com${pagePath}`,
      page_path: pagePath,
      page_title: `Quipsly ${analyticsSurfaceForPath(pathname)}`,
      send_to: measurementId,
    });
  }, [measurementId, pathname]);
  return null;
}

function AuthenticatedProductEventPersistence({ authenticated }: { authenticated: boolean }) {
  useEffect(() => {
    persistAuthenticatedProductEvents = authenticated;
    return () => { persistAuthenticatedProductEvents = false; };
  }, [authenticated]);
  return null;
}

export function QuipslyProductAnalytics({
  measurementId,
  authenticated = false,
}: {
  measurementId?: string | null;
  authenticated?: boolean;
}) {
  const exactMeasurementId = measurementId?.trim() || "";
  const [consent, setConsent] = useState<"unknown" | "granted" | "denied">("unknown");
  const [showChoice, setShowChoice] = useState(false);

  useEffect(() => {
    try {
      const sharedConsent = parseAnalyticsConsentCookie(document.cookie);
      if (sharedConsent) {
        setConsent(sharedConsent);
        window.localStorage.setItem(CONSENT_STORAGE_KEY, sharedConsent);
        return;
      }
      const stored = window.localStorage.getItem(CONSENT_STORAGE_KEY);
      if (stored === "granted" || stored === "denied") {
        setConsent(stored);
        document.cookie = buildAnalyticsConsentCookie({
          consent: stored,
          hostname: window.location.hostname,
          secure: window.location.protocol === "https:",
        });
        return;
      }
    } catch {
      // Ask on each visit when the browser does not make storage available.
    }
    if (/^G-[A-Z0-9]+$/.test(exactMeasurementId)) setShowChoice(true);
  }, [exactMeasurementId]);

  useEffect(() => {
    const reopen = () => setShowChoice(true);
    window.addEventListener("quipsly:open-analytics-consent", reopen);
    return () => window.removeEventListener("quipsly:open-analytics-consent", reopen);
  }, []);

  const choose = (granted: boolean) => {
    persistAnalyticsConsent(granted);
    setConsent(granted ? "granted" : "denied");
    setShowChoice(false);
  };

  const measurementEnabled = /^G-[A-Z0-9]+$/.test(exactMeasurementId) && consent === "granted";

  useEffect(() => {
    googleAnalyticsEnabled = measurementEnabled;
    return () => { googleAnalyticsEnabled = false; };
  }, [measurementEnabled]);

  const bootstrap = `
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    window.gtag = gtag;
    gtag('consent', 'default', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      functionality_storage: 'granted',
      security_storage: 'granted'
    });
  `;
  const configure = `
    window.gtag('js', new Date());
    window.gtag('config', ${JSON.stringify(exactMeasurementId)}, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false
    });
  `;

  return (
    <>
      <AuthenticatedProductEventPersistence authenticated={authenticated} />
      {measurementEnabled ? (
        <>
          <Script id="quipsly-analytics-consent" strategy="afterInteractive">{bootstrap}</Script>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(exactMeasurementId)}`} strategy="afterInteractive" />
          <Script id="quipsly-analytics-config" strategy="afterInteractive">{configure}</Script>
          <AnalyticsNavigation measurementId={exactMeasurementId} />
        </>
      ) : null}
      {showChoice ? <AnalyticsConsentChoice onChoice={choose} /> : null}
    </>
  );
}
