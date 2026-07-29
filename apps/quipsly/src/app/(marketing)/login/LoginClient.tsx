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
  type User,
} from "firebase/auth";

import { auth } from "@/lib/firebase/firebase";

function cleanCallbackUrl(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) return "/projects";
  return value;
}

function friendlyFirebaseAuthError(error: any) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");

  if (code === "auth/email-already-in-use") {
    return "That email already has a Firebase login. Switch to Sign in, or use password recovery if you do not remember the password.";
  }

  if (code === "auth/user-not-found" || code === "auth/invalid-credential" || code === "auth/wrong-password") {
    return "That email/password did not open a Quipsly account. Check the password, use recovery, or create a free account.";
  }

  if (code === "auth/weak-password") {
    return "Firebase rejected that password as too weak. Use at least 8 characters; a short phrase is better than a tiny secret.";
  }

  if (code === "auth/invalid-email") {
    return "That email address does not look valid yet.";
  }

  if (code === "auth/too-many-requests") {
    return "Firebase temporarily slowed this account down after repeated attempts. Give it a little time, then try again or use recovery.";
  }

  if (code === "auth/unauthorized-domain" || message.includes("redirect_uri_mismatch")) {
    return "Google sign-in is not configured correctly for this domain yet. Use email/password for now, then fix the Firebase OAuth redirect in Google Cloud.";
  }

  if (code === "auth/popup-closed-by-user") {
    return "Google sign-in was closed before it finished. No account changes were made.";
  }

  if (
    code === "auth/account-exists-with-different-credential"
    || code === "auth/credential-already-in-use"
  ) {
    return "That email already has another Firebase sign-in method. Sign in with that method, then use Account switch → Connect Google so Quipsly preserves one person and one Nest.";
  }

  if (code === "auth/operation-not-allowed") {
    return "Google sign-in is not enabled for this Quipsly Firebase project yet. Email/password remains available.";
  }

  return message || "Firebase could not finish that auth step.";
}

export function LoginClient({
  callbackUrl,
  inviteToken,
}: {
  callbackUrl: string;
  inviteToken?: string;
}) {
  const safeCallbackUrl = cleanCallbackUrl(callbackUrl);
  const safeInviteToken = inviteToken?.startsWith("qinv_") ? inviteToken : "";
  const inviteMessage = safeInviteToken
    ? "You are opening a Quipsly invite. Sign in with the invited email; Quipsly will connect the invite after Firebase proves who you are."
    : "Sign in with Google, sign in with email/password, or create a free Quipsly account. Firebase proves identity; Quipsly creates your Home Nest after sign-in.";
  const emailInputRef = useRef<HTMLInputElement>(null);
  const [passwordMode, setPasswordMode] = useState<"signin" | "create">("signin");
  const [message, setMessage] = useState(inviteMessage);
  const [isPasswordSigningIn, setIsPasswordSigningIn] = useState(false);
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(false);

  async function finishFirebaseSignIn(user: User) {
    await user.reload();
    if (!user.emailVerified) {
      await sendEmailVerification(user).catch(() => undefined);
      await signOut(auth);
      throw new Error("Check your inbox and verify this email before Quipsly creates a session. We sent a fresh verification link when Firebase allowed it.");
    }
    const idToken = await user.getIdToken(true);
    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        idToken,
        inviteToken: safeInviteToken || undefined,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(String(payload.error || "Quipsly could not create a server session."));
    }

    window.location.assign(safeCallbackUrl);
  }

  useEffect(() => {
    let cancelled = false;

    getRedirectResult(auth)
      .then((result) => {
        if (!result?.user || cancelled) return;
        setMessage("Google verified you. Opening your Nest...");
        return finishFirebaseSignIn(result.user);
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
    setMessage("Opening Google through Firebase...");

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    try {
      const result = await signInWithPopup(auth, provider);
      await finishFirebaseSignIn(result.user);
    } catch (error: any) {
      if (
        error?.code === "auth/popup-blocked" ||
        error?.code === "auth/popup-closed-by-user" ||
        error?.code === "auth/cancelled-popup-request"
      ) {
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

    setIsPasswordSigningIn(true);
    setMessage(
      passwordMode === "create"
        ? "Creating your Firebase login, then opening your Quipsly Home Nest..."
        : "Checking your Quipsly login through Firebase...",
    );

    try {
      const result = passwordMode === "create"
        ? await createUserWithEmailAndPassword(auth, trimmedEmail, submittedPassword)
        : await signInWithEmailAndPassword(auth, trimmedEmail, submittedPassword);
      if (passwordMode === "create") {
        const verificationSent = await sendEmailVerification(result.user)
          .then(() => true)
          .catch(() => false);
        await signOut(auth);
        setPasswordMode("signin");
        setMessage(verificationSent
          ? "Account created safely. Check your inbox, verify the address, then return here and sign in. Quipsly will not create a Home Nest or accept an invite until the mailbox is proved."
          : "Account created, but Firebase could not send the verification message just now. Sign in again to request a fresh link; Quipsly remains locked until the mailbox is proved.");
        setIsPasswordSigningIn(false);
        return;
      }
      await finishFirebaseSignIn(result.user);
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
      setMessage("Enter your email address first, then Quipsly can ask Firebase to send a password reset email.");
      return;
    }

    setIsRecoveringPassword(true);
    setMessage("Asking Firebase to send a password reset email...");

    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      setMessage("If that email has a Firebase login, a reset email is on the way. Quipsly does not reveal whether an account exists.");
    } catch (error: any) {
      setMessage(`Password recovery could not start: ${friendlyFirebaseAuthError(error)}`);
    } finally {
      setIsRecoveringPassword(false);
    }
  }

  const busy = isGoogleSigningIn || isPasswordSigningIn || isRecoveringPassword;

  return (
    <main className="min-h-screen overflow-hidden bg-[#092a25] px-5 py-10 text-[#fff8ec]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(246,199,116,0.24),transparent_30%),radial-gradient(circle_at_82%_12%,rgba(115,202,172,0.2),transparent_28%),linear-gradient(135deg,#092a25,#1d3427_48%,#4a2e1f)]" />
      <section className="relative mx-auto grid min-h-[82vh] max-w-6xl items-center gap-8 lg:grid-cols-[1fr_0.9fr]">
        <div className="rounded-[36px] border border-white/12 bg-black/20 p-7 shadow-2xl shadow-black/30 backdrop-blur md:p-10">
          <p className="text-xs font-black uppercase tracking-[0.32em] text-[#ffd37a]">Quipsly Nest sign-in</p>
          <h1 className="mt-5 font-serif text-5xl font-black leading-[0.95] tracking-tight md:text-7xl">
            Come in through the front door. No trapdoors today.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[#e9dcc8]">
            Quipsly owns access by email. Google can prove who you are, Patreon can support beta access, and email/password keeps new writers, trusted collaborators, and operator testing from getting stuck when provider login gets dramatic.
          </p>
          {safeInviteToken ? (
            <div className="mt-6 rounded-3xl border border-[#8bd8b8]/40 bg-[#0f3b32]/75 px-5 py-4 text-sm leading-6 text-[#dff8ee] shadow-lg shadow-black/10">
              <div className="font-black uppercase tracking-[0.18em] text-[#9ef0c4]">Invite mode</div>
              <p className="mt-2">
                This link does not grant access by itself. It only helps Quipsly finish the invite after Firebase confirms
                the same email address that was invited.
              </p>
            </div>
          ) : null}
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={busy}
              className="rounded-full bg-[#fff8ec] px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-[#2f2118] shadow-lg shadow-black/20 transition hover:bg-white"
            >
              {isGoogleSigningIn ? "Opening Google..." : "Sign in with Google"}
            </button>
            <a
              href="https://quipsly.com/support"
              className="rounded-full border border-[#ffcfda]/60 bg-[#4a1722]/50 px-5 py-3 text-center text-sm font-black uppercase tracking-[0.16em] text-[#ffd7de] transition hover:bg-[#5c1d2a]"
            >
              Support beta access
            </a>
          </div>
        </div>

        <div className="rounded-[32px] border border-[#ead7b7]/50 bg-[#fffaf1]/95 p-6 text-[#38291f] shadow-2xl shadow-black/25 md:p-8">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[#95662f]">Direct Quipsly login</p>
          <h2 className="mt-3 font-serif text-3xl font-black">
            {passwordMode === "create" ? "Create a free Quipsly account." : "Use email/password."}
          </h2>
          <p
            role="status"
            aria-live="polite"
            data-testid="quipsly-login-status"
            className="mt-3 rounded-2xl border border-[#ead7b7] bg-white/70 px-4 py-3 text-sm leading-6 text-[#715840]"
          >
            {message}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2 rounded-full border border-[#ead7b7] bg-[#f4ead8] p-1 text-xs font-black uppercase tracking-[0.14em]">
            <button
              type="button"
              onClick={() => {
                setPasswordMode("signin");
                setMessage(safeInviteToken
                  ? "Sign in with the invited email. Quipsly will attach the invite after Firebase proves the account."
                  : "Sign in with an existing Google-created, admin-created, or email/password Quipsly account.");
              }}
              className={`rounded-full px-3 py-2 transition ${passwordMode === "signin" ? "bg-[#315d4e] text-white shadow" : "text-[#72563d] hover:bg-white/70"}`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setPasswordMode("create");
                setMessage(safeInviteToken
                  ? "Create a Firebase login with the invited email. Quipsly will connect the invite and open your assigned Nest."
                  : "Create a free account. Quipsly will add your Home Nest automatically after Firebase verifies the new login.");
              }}
              className={`rounded-full px-3 py-2 transition ${passwordMode === "create" ? "bg-[#315d4e] text-white shadow" : "text-[#72563d] hover:bg-white/70"}`}
            >
              Create account
            </button>
          </div>
          <form method="post" onSubmit={handlePasswordAuth} className="mt-6 grid gap-3">
            <label className="grid gap-2 text-sm font-black uppercase tracking-[0.14em] text-[#72563d]">
              Email
              <input
                ref={emailInputRef}
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="charlie@example.com"
                className="rounded-2xl border border-[#d9c39d] bg-white px-4 py-3 text-base font-bold normal-case tracking-normal text-[#2f2118] outline-none transition focus:border-[#3b7d67]"
              />
            </label>
            <label className="grid gap-2 text-sm font-black uppercase tracking-[0.14em] text-[#72563d]">
              Password
              <input
                name="password"
                type="password"
                required
                autoComplete={passwordMode === "create" ? "new-password" : "current-password"}
                placeholder="Your Quipsly password"
                className="rounded-2xl border border-[#d9c39d] bg-white px-4 py-3 text-base font-bold normal-case tracking-normal text-[#2f2118] outline-none transition focus:border-[#3b7d67]"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-[#315d4e] px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-white transition hover:bg-[#214236] disabled:cursor-wait disabled:opacity-60"
            >
              {isPasswordSigningIn
                ? passwordMode === "create" ? "Creating account..." : "Signing in..."
                : passwordMode === "create" ? "Create free account" : "Sign in with email/password"}
            </button>
          </form>
          <button
            type="button"
            disabled={busy}
            onClick={recoverPassword}
            className="mt-3 w-full rounded-full border border-[#d9c39d] bg-white/70 px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-[#5b4530] transition hover:bg-white disabled:cursor-wait disabled:opacity-60"
          >
            {isRecoveringPassword ? "Sending recovery..." : "Send password reset"}
          </button>

          <p className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-950">
            New Google and email/password users get a free Quipsly account and private Home Nest automatically. Admin-created and invited accounts use the same Firebase-first path.
          </p>
        </div>
      </section>
    </main>
  );
}
