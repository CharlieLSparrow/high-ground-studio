"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  GoogleAuthProvider,
  inMemoryPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithCredential,
} from "firebase/auth";

import { auth } from "@/lib/firebase/firebase";
import {
  cleanQuipslyCallbackUrl,
  cleanQuipslyInviteToken,
  cleanSessionInviteToken,
  finishQuipslyFirebaseSignIn,
} from "@/lib/firebase/quipsly-session";

type GoogleCredentialResponse = {
  credential?: string;
  select_by?: string;
};

type GoogleOneTapConfiguration = {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  auto_select: boolean;
  context: "signin";
  itp_support: boolean;
  use_fedcm_for_prompt: boolean;
};

type GoogleButtonConfiguration = {
  type: "standard";
  theme: "outline";
  size: "large";
  text: "continue_with";
  shape: "rectangular";
  logo_alignment: "left";
  width: number;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          cancel: () => void;
          initialize: (configuration: GoogleOneTapConfiguration) => void;
          prompt: () => void;
          renderButton: (
            parent: HTMLElement,
            configuration: GoogleButtonConfiguration,
          ) => void;
        };
      };
    };
  }
}

const GOOGLE_ONE_TAP_PATHS = new Set([
  "/",
  "/creator",
  "/login",
  "/pricing",
  "/public/coaching",
  "/quipslys",
  "/waitlist",
  "/welcome",
]);
const DEFAULT_GOOGLE_WEB_CLIENT_ID =
  "249115653261-g6lvadv4e1a64eu50u0glkepamtq709b.apps.googleusercontent.com";

function loginErrorUrl({
  callbackUrl,
  inviteToken,
  sessionInviteToken,
  error,
}: {
  callbackUrl: string;
  inviteToken: string;
  sessionInviteToken: string;
  error: "google-link-required" | "google-one-tap-failed";
}) {
  const params = new URLSearchParams({
    callbackUrl,
    error,
  });
  if (inviteToken) params.set("inviteToken", inviteToken);
  if (sessionInviteToken) params.set("sessionInviteToken", sessionInviteToken);
  return `/login?${params.toString()}`;
}

export function shouldPromptGoogleOneTap(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  return ![
    "127.0.0.1",
    "localhost",
    "::1",
    "[::1]",
  ].includes(normalized);
}

export function GoogleOneTap({
  clientId =
    process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID
    || DEFAULT_GOOGLE_WEB_CLIENT_ID,
}: {
  clientId?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [scriptReady, setScriptReady] = useState(false);
  const [firebaseReady, setFirebaseReady] = useState(false);
  const [firebaseUserPresent, setFirebaseUserPresent] = useState(
    Boolean(auth.currentUser),
  );
  const eligible = GOOGLE_ONE_TAP_PATHS.has(pathname);
  const safeCallbackUrl = useMemo(
    () => cleanQuipslyCallbackUrl(
      pathname === "/login" ? searchParams.get("callbackUrl") : "/projects",
    ),
    [pathname, searchParams],
  );
  const safeInviteToken = useMemo(
    () => cleanQuipslyInviteToken(searchParams.get("inviteToken")),
    [searchParams],
  );
  const safeSessionInviteToken = useMemo(
    () => cleanSessionInviteToken(searchParams.get("sessionInviteToken")),
    [searchParams],
  );

  useEffect(() => onAuthStateChanged(auth, (user) => {
    setFirebaseUserPresent(Boolean(user));
    setFirebaseReady(true);
    if (user) window.google?.accounts?.id?.cancel();
  }), []);

  useEffect(() => {
    const cancelPrompt = () => window.google?.accounts?.id?.cancel();
    window.addEventListener("quipsly:google-auth-start", cancelPrompt);
    return () => {
      window.removeEventListener("quipsly:google-auth-start", cancelPrompt);
      cancelPrompt();
    };
  }, []);

  const handleCredential = useCallback(async (response: GoogleCredentialResponse) => {
    if (!response.credential) {
      window.location.assign(loginErrorUrl({
        callbackUrl: safeCallbackUrl,
        inviteToken: safeInviteToken,
        sessionInviteToken: safeSessionInviteToken,
        error: "google-one-tap-failed",
      }));
      return;
    }

    window.dispatchEvent(new Event("quipsly:google-auth-start"));

    try {
      const hostname = window.location.hostname.toLowerCase();
      if (
        hostname === "quipsly.com"
        || hostname === "www.quipsly.com"
      ) {
        // Marketing and Nest share the secure server cookie, not Firebase
        // browser storage. Keeping this credential in memory avoids leaving a
        // second origin-scoped Firebase login behind after the handoff.
        await setPersistence(auth, inMemoryPersistence);
      }
      const credential = GoogleAuthProvider.credential(response.credential);
      const result = await signInWithCredential(auth, credential);
      await finishQuipslyFirebaseSignIn({
        user: result.user,
        callbackUrl: safeCallbackUrl,
        inviteToken: safeInviteToken,
        sessionInviteToken: safeSessionInviteToken,
      });
    } catch (error: any) {
      const code = String(error?.code || "");
      window.location.assign(loginErrorUrl({
        callbackUrl: safeCallbackUrl,
        inviteToken: safeInviteToken,
        sessionInviteToken: safeSessionInviteToken,
        error:
          code === "auth/account-exists-with-different-credential"
          || code === "auth/credential-already-in-use"
            ? "google-link-required"
            : "google-one-tap-failed",
      }));
    }
  }, [safeCallbackUrl, safeInviteToken, safeSessionInviteToken]);

  useEffect(() => {
    const googleIdentity = window.google?.accounts?.id;
    if (
      !eligible
      || !clientId.trim()
      || !scriptReady
      || !firebaseReady
      || firebaseUserPresent
      || !googleIdentity
    ) {
      return;
    }

    googleIdentity.initialize({
      client_id: clientId.trim(),
      callback: handleCredential,
      auto_select: false,
      context: "signin",
      itp_support: true,
      use_fedcm_for_prompt: true,
    });
    const officialButtonHost = document.getElementById(
      "quipsly-google-signin-button",
    );
    if (pathname === "/login" && officialButtonHost) {
      officialButtonHost.replaceChildren();
      const measuredWidth = Math.round(
        officialButtonHost.getBoundingClientRect().width,
      );
      googleIdentity.renderButton(officialButtonHost, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        logo_alignment: "left",
        width: Math.max(240, Math.min(400, measuredWidth || 360)),
      });
      window.dispatchEvent(new Event("quipsly:google-button-rendered"));
    }
    // Keep Google's standard rendered button available in local development,
    // but do not launch FedCM One Tap where a loopback origin cannot satisfy
    // the production identity handoff. The rejected prompt otherwise appears
    // as a Next.js error overlay and turns local UX testing into a false alarm.
    if (shouldPromptGoogleOneTap(window.location.hostname)) {
      googleIdentity.prompt();
    }

    return () => googleIdentity.cancel();
  }, [
    clientId,
    eligible,
    firebaseReady,
    firebaseUserPresent,
    handleCredential,
    scriptReady,
  ]);

  if (!eligible || !clientId.trim()) return null;

  return (
    <Script
      id="quipsly-google-identity-services"
      src="https://accounts.google.com/gsi/client"
      strategy="afterInteractive"
      onLoad={() => setScriptReady(true)}
      onReady={() => setScriptReady(true)}
    />
  );
}
