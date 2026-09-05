"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  getRedirectResult,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
} from "firebase/auth";

import { auth } from "@/lib/firebase/firebase";
import {
  cleanQuipslyCallbackUrl,
  cleanQuipslyInviteToken,
  cleanSessionInviteToken,
  finishQuipslyFirebaseSignIn,
  quipslyEmailActionSettings,
} from "@/lib/firebase/quipsly-session";

function friendlyFirebaseAuthError(error: any) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");

  if (code === "auth/email-already-in-use") {
    return "That email already has an account. Sign in instead, or reset your password.";
  }

  if (code === "auth/user-not-found" || code === "auth/invalid-credential" || code === "auth/wrong-password") {
    return "That email/password did not open a Quipsly account. Check the password, use recovery, or create a free account.";
  }

  if (code === "auth/weak-password") {
    return "Use at least 8 characters for your password. A short phrase works well.";
  }

  if (code === "auth/invalid-email") {
    return "That email address does not look valid yet.";
  }

  if (
    code === "auth/too-many-requests" ||
    code === "auth/quota-exceeded" ||
    /rate exceeded|too many requests|resource exhausted/i.test(message)
  ) {
    return "Sign-in is temporarily busy. Wait a minute before trying again, or use Google or password recovery instead of repeating the same attempt.";
  }

  if (code === "auth/unauthorized-domain" || message.includes("redirect_uri_mismatch")) {
    return "Google sign-in is not available here right now. Use email and password instead.";
  }

  if (code === "auth/popup-closed-by-user") {
    return "Google sign-in was closed before it finished. No account changes were made.";
  }

  if (
    code === "auth/account-exists-with-different-credential"
    || code === "auth/credential-already-in-use"
  ) {
    return "That email already uses another sign-in method. Sign in with it first, then add Google from Account settings.";
  }

  if (code === "auth/operation-not-allowed") {
    return "Google sign-in is unavailable right now. Email and password are still available.";
  }

  return message || "Firebase could not finish that auth step.";
}

export function LoginClient({
  callbackUrl,
  inviteToken,
  sessionInviteToken,
  initialError,
}: {
  callbackUrl: string;
  inviteToken?: string;
  sessionInviteToken?: string;
  initialError?: string;
}) {
  const safeCallbackUrl = cleanQuipslyCallbackUrl(callbackUrl);
  const loginContext = safeCallbackUrl.startsWith("/sessions/")
    ? {
        eyebrow: "Private Quipsly Session",
        signInTitle: "Open your Session",
        description: "Sign in to join your private Session.",
      }
    : safeCallbackUrl.startsWith("/coaching")
      ? {
          eyebrow: "Quipsly Coaching",
          signInTitle: "Continue to coaching",
          description: "Your schedule, Sessions, recordings, notes, goals, and tasks will be waiting for you.",
        }
      : {
          eyebrow: "Quipsly",
          signInTitle: "Welcome back",
          description: "Open your projects, notes, and Sessions.",
        };
  const safeInviteToken = cleanQuipslyInviteToken(inviteToken);
  const safeSessionInviteToken = cleanSessionInviteToken(sessionInviteToken);
  const initialMessage =
    initialError === "google-link-required"
      ? "That email already uses another sign-in method. Sign in with it first, then add Google from Account settings."
      : initialError === "google-one-tap-failed"
        ? "Google could not finish the quick sign-in. Use the Google button below to choose an account explicitly, or continue with email."
        : initialError === "email-verified"
          ? "Your email is verified. You can sign in now."
          : initialError === "password-reset"
            ? "Your password is updated. Sign in with the new password."
            : "";
  const emailInputRef = useRef<HTMLInputElement>(null);
  const [passwordMode, setPasswordMode] = useState<"signin" | "create">("signin");
  const [message, setMessage] = useState(initialMessage);
  const [isPasswordSigningIn, setIsPasswordSigningIn] = useState(false);
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(false);
  const [officialGoogleButtonReady, setOfficialGoogleButtonReady] = useState(false);
  const [clientAuthReady, setClientAuthReady] = useState(false);

  useEffect(() => {
    setClientAuthReady(true);
  }, []);

  useEffect(() => {
    const markReady = () => setOfficialGoogleButtonReady(true);
    window.addEventListener("quipsly:google-button-rendered", markReady);
    if (
      document
        .getElementById("quipsly-google-signin-button")
        ?.childElementCount
    ) {
      markReady();
    }
    return () => {
      window.removeEventListener("quipsly:google-button-rendered", markReady);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    getRedirectResult(auth)
      .then((result) => {
        const user = result?.user ?? auth.currentUser;
        if (!user || cancelled) return;
        setMessage(
          result?.user ? "Signed in. Opening Quipsly..." : "Finishing sign-in...",
        );
        return finishQuipslyFirebaseSignIn({
          user,
          callbackUrl: safeCallbackUrl,
          inviteToken: safeInviteToken,
          sessionInviteToken: safeSessionInviteToken,
        });
      })
      .catch((error) => {
        if (!cancelled) {
          setMessage(`Google sign-in did not complete: ${friendlyFirebaseAuthError(error)}`);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function signInWithGoogle() {
    setIsGoogleSigningIn(true);
    setMessage("Opening Google...");
    window.dispatchEvent(new Event("quipsly:google-auth-start"));

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    try {
      const result = await signInWithPopup(auth, provider);
      await finishQuipslyFirebaseSignIn({
        user: result.user,
        callbackUrl: safeCallbackUrl,
        inviteToken: safeInviteToken,
        sessionInviteToken: safeSessionInviteToken,
      });
    } catch (error: any) {
      if (error?.code === "auth/popup-blocked") {
        await signInWithRedirect(auth, provider);
        return;
      }

      setMessage(`Google sign-in failed: ${friendlyFirebaseAuthError(error)}`);
      setIsGoogleSigningIn(false);
    }
  }

  async function handlePasswordAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const trimmedEmail = String(formData.get("email") ?? "").trim().toLowerCase();
    const submittedPassword = String(formData.get("password") ?? "");

    if (!trimmedEmail) {
      setMessage("Enter the email address you want Quipsly to use as your account identity.");
      return;
    }

    if (passwordMode === "create" && submittedPassword.length < 8) {
      setMessage("Use at least 8 characters for a new Quipsly password. A short phrase is better than a tiny secret.");
      return;
    }

    window.dispatchEvent(new Event("quipsly:password-auth-start"));

    setIsPasswordSigningIn(true);
    setMessage(
      passwordMode === "create"
        ? "Creating your account..."
        : "Signing in...",
    );

    try {
      const result = passwordMode === "create"
        ? await createUserWithEmailAndPassword(auth, trimmedEmail, submittedPassword)
        : await signInWithEmailAndPassword(auth, trimmedEmail, submittedPassword);
      if (passwordMode === "create" && !safeSessionInviteToken) {
        const verificationSent = await sendEmailVerification(
          result.user,
          quipslyEmailActionSettings({
            origin: window.location.origin,
            callbackUrl: safeCallbackUrl,
            inviteToken: safeInviteToken,
            sessionInviteToken: safeSessionInviteToken,
            action: "verify",
          }),
        )
          .then(() => true)
          .catch(() => false);
        await signOut(auth);
        setPasswordMode("signin");
        setMessage(verificationSent
          ? "Check your inbox and click the verification link. Then come back and sign in."
          : "Your account was created, but the verification email could not be sent. Try signing in again in a moment to request a new link.");
        setIsPasswordSigningIn(false);
        return;
      }
      await finishQuipslyFirebaseSignIn({
        user: result.user,
        callbackUrl: safeCallbackUrl,
        inviteToken: safeInviteToken,
        sessionInviteToken: safeSessionInviteToken,
      });
    } catch (error: any) {
      setMessage(
        `${passwordMode === "create" ? "Account creation" : "Email/password sign-in"} failed: ${friendlyFirebaseAuthError(error)}`,
      );
      setIsPasswordSigningIn(false);
    }
  }

  async function recoverPassword() {
    const trimmedEmail = String(emailInputRef.current?.value ?? "").trim().toLowerCase();

    if (!trimmedEmail) {
      setMessage("Enter your email address first.");
      return;
    }

    setIsRecoveringPassword(true);
    setMessage("Sending a password reset email...");

    try {
      await sendPasswordResetEmail(
        auth,
        trimmedEmail,
        quipslyEmailActionSettings({
          origin: window.location.origin,
          callbackUrl: safeCallbackUrl,
          inviteToken: safeInviteToken,
          sessionInviteToken: safeSessionInviteToken,
          action: "reset",
        }),
      );
      setMessage("If an account exists for that email, a reset link is on the way.");
    } catch (error: any) {
      setMessage(`Password recovery could not start: ${friendlyFirebaseAuthError(error)}`);
    } finally {
      setIsRecoveringPassword(false);
    }
  }

  const busy = isGoogleSigningIn || isPasswordSigningIn || isRecoveringPassword;
  const createAccountDescription = safeCallbackUrl.startsWith("/sessions/")
    ? "Create your account to open this Session and keep its shared work together."
    : safeCallbackUrl.startsWith("/coaching")
      ? "Start scheduling Sessions, inviting clients, and keeping your coaching work together."
      : "Create one account for your projects, notes, and Sessions.";

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#092a25] px-4 py-10 text-[#38291f]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(246,199,116,0.2),transparent_32%),radial-gradient(circle_at_82%_16%,rgba(115,202,172,0.18),transparent_30%),linear-gradient(135deg,#092a25,#1d3427_52%,#4a2e1f)]" />
      <section className="relative w-full max-w-md rounded-[32px] border border-white/20 bg-[#fffaf1]/98 p-6 shadow-2xl shadow-black/30 backdrop-blur md:p-8">
        <a
          href="/"
          className="inline-flex items-center gap-2 text-sm font-black text-[#315d4e]"
        >
          <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-xl bg-[#315d4e] text-lg text-white">
            Q
          </span>
          Quipsly
        </a>

        <p className="mt-7 text-[10px] font-black uppercase tracking-[0.2em] text-[#315d4e]">{loginContext.eyebrow}</p>
        <h1 className="mt-2 font-serif text-4xl font-black tracking-tight">
          {passwordMode === "create" ? "Create your account" : loginContext.signInTitle}
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#715840]">
          {passwordMode === "create"
            ? createAccountDescription
            : loginContext.description}
        </p>

        {safeInviteToken || safeSessionInviteToken ? (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-950">
            Use the email address that received this invite.
          </div>
        ) : null}

        <div
          id="quipsly-google-signin-button"
          className="mt-6 flex min-h-11 w-full items-center justify-center overflow-hidden rounded"
        />
        {!officialGoogleButtonReady ? (
          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={busy}
            className="mt-2 flex w-full items-center justify-center rounded-xl border border-[#747775] bg-white px-5 py-3 text-sm font-black text-[#1f1f1f] shadow-sm transition hover:bg-[#f8f9fa] disabled:cursor-wait disabled:opacity-60"
          >
            {isGoogleSigningIn ? "Opening Google..." : "Continue with Google"}
          </button>
        ) : null}

        <div className="my-5 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.16em] text-[#967f65]">
          <span className="h-px flex-1 bg-[#dfcfb6]" />
          or continue with email
          <span className="h-px flex-1 bg-[#dfcfb6]" />
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-xl border border-[#dfcfb6] bg-[#f4ead8] p-1 text-sm font-bold">
          <button
            type="button"
            onClick={() => {
              setPasswordMode("signin");
              setMessage("");
            }}
            className={`rounded-lg px-3 py-2.5 transition ${passwordMode === "signin" ? "bg-white text-[#315d4e] shadow-sm" : "text-[#72563d] hover:bg-white/60"}`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setPasswordMode("create");
              setMessage("");
            }}
            className={`rounded-lg px-3 py-2.5 transition ${passwordMode === "create" ? "bg-white text-[#315d4e] shadow-sm" : "text-[#72563d] hover:bg-white/60"}`}
          >
            Create account
          </button>
        </div>

        <form method="post" onSubmit={handlePasswordAuth} className="mt-5 grid gap-4">
          <label className="grid gap-2 text-sm font-bold text-[#5b4530]">
            Email
            <input
              ref={emailInputRef}
              name="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@example.com"
              className="rounded-xl border border-[#d9c39d] bg-white px-4 py-3 text-base font-medium text-[#2f2118] outline-none transition focus:border-[#3b7d67] focus:ring-2 focus:ring-[#3b7d67]/20"
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-[#5b4530]">
            Password
            <input
              name="password"
              type="password"
              required
              minLength={passwordMode === "create" ? 8 : undefined}
              autoComplete={passwordMode === "create" ? "new-password" : "current-password"}
              placeholder={passwordMode === "create" ? "At least 8 characters" : "Your password"}
              className="rounded-xl border border-[#d9c39d] bg-white px-4 py-3 text-base font-medium text-[#2f2118] outline-none transition focus:border-[#3b7d67] focus:ring-2 focus:ring-[#3b7d67]/20"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !clientAuthReady}
            className="rounded-xl bg-[#315d4e] px-5 py-3.5 text-sm font-black text-white transition hover:bg-[#214236] disabled:cursor-wait disabled:opacity-60"
          >
            {!clientAuthReady
              ? "Loading secure sign-in…"
              : isPasswordSigningIn
              ? passwordMode === "create" ? "Creating account..." : "Signing in..."
              : passwordMode === "create" ? "Create account" : "Sign in with email"}
          </button>
        </form>

        {passwordMode === "signin" ? (
          <button
            type="button"
            disabled={busy}
            onClick={recoverPassword}
            className="mt-3 w-full px-4 py-2 text-sm font-bold text-[#315d4e] transition hover:text-[#214236] disabled:cursor-wait disabled:opacity-60"
          >
            {isRecoveringPassword ? "Sending reset email..." : "Forgot password?"}
          </button>
        ) : null}

        {message ? (
          <p
            role="status"
            aria-live="polite"
            data-testid="quipsly-login-status"
            className="mt-4 rounded-xl border border-[#ead7b7] bg-white/70 px-4 py-3 text-sm leading-6 text-[#715840]"
          >
            {message}
          </p>
        ) : null}

        <p className="mt-5 text-center text-xs leading-5 text-[#806b54]">
          By continuing, you agree to Quipsly&apos;s{" "}
          <a className="font-bold underline underline-offset-2" href="/terms">Terms</a>
          {" "}and{" "}
          <a className="font-bold underline underline-offset-2" href="/privacy">Privacy Policy</a>.
          {" "}Need help?{" "}
          <a className="font-bold underline underline-offset-2" href="/support">Contact support</a>.
        </p>
      </section>
    </main>
  );
}
