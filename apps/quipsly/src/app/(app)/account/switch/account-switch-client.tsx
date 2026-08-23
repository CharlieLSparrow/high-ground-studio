"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase/firebase";
import {
  GoogleAuthProvider,
  linkWithPopup,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  unlink,
  type User,
} from "firebase/auth";
import {
  CheckCircle2,
  FlaskConical,
  Link2,
  LogOut,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";

type AccountSwitchClientProps = {
  callbackUrl: string;
  currentUser: {
    email: string;
    name: string | null;
    image: string | null;
    isStaff: boolean;
  } | null;
};

export function AccountSwitchClient({
  callbackUrl,
  currentUser,
}: AccountSwitchClientProps) {
  const [status, setStatus] = useState<
    "idle" | "switching" | "signing-out" | "linking-google"
  >("idle");
  const [firebaseUser, setFirebaseUser] = useState<User | null>(auth.currentUser);
  const [firebaseStateReady, setFirebaseStateReady] = useState(false);
  const [identityMessage, setIdentityMessage] = useState("");
  const router = useRouter();
  useEffect(() => onAuthStateChanged(auth, (user) => {
    setFirebaseUser(user);
    setFirebaseStateReady(true);
  }), []);

  const firebaseProviderIds = new Set(
    firebaseUser?.providerData.map((provider) => provider.providerId) ?? [],
  );
  const googleConnected = firebaseProviderIds.has("google.com");
  const passwordConnected = firebaseProviderIds.has("password");

  async function connectGoogleAccount() {
    const user = auth.currentUser;
    const email = user?.email?.trim().toLowerCase();
    if (!user || !email) {
      setIdentityMessage(
        "Sign in again before adding Google to this account.",
      );
      return;
    }

    setStatus("linking-google");
    setIdentityMessage("Opening Google...");
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: "select_account",
      login_hint: email,
    });

    try {
      const result = await linkWithPopup(user, provider);
      const googleProfile = result.user.providerData.find(
        (entry) => entry.providerId === "google.com",
      );
      const linkedEmail = googleProfile?.email?.trim().toLowerCase();

      if (linkedEmail !== email) {
        await unlink(result.user, "google.com");
        setFirebaseUser(auth.currentUser);
        setIdentityMessage(
          `Google opened ${linkedEmail || "a different email"}. Nothing was changed. Choose ${email} to connect this account.`,
        );
        return;
      }

      const idToken = await result.user.getIdToken(true);
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(
          String(payload.error || "Quipsly could not refresh the identity ledger."),
        );
      }

      setFirebaseUser(result.user);
      setIdentityMessage(
        `Google is now connected to ${email}.`,
      );
      router.refresh();
    } catch (error: any) {
      const code = String(error?.code || "");
      if (code === "auth/popup-closed-by-user") {
        setIdentityMessage("Google linking was closed. No account change was made.");
      } else if (
        code === "auth/credential-already-in-use"
        || code === "auth/account-exists-with-different-credential"
      ) {
        setIdentityMessage(
          "That Google account is already connected to another Quipsly account. Nothing was changed.",
        );
      } else if (code === "auth/provider-already-linked") {
        setFirebaseUser(auth.currentUser);
        setIdentityMessage("Google is already connected to this Firebase login.");
      } else {
        setIdentityMessage(
          `Google could not be connected: ${String(error?.message || "unknown provider error")}`,
        );
      }
    } finally {
      setStatus("idle");
    }
  }

  async function switchGoogleAccount() {
    setStatus("switching");
    await fetch("/api/auth/session", { method: "DELETE" });
    await firebaseSignOut(auth);
    router.push(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  async function signOut() {
    setStatus("signing-out");
    await fetch("/api/auth/session", { method: "DELETE" });
    await firebaseSignOut(auth);
    router.push("/");
    router.refresh();
  }

  return (
    <section className="mx-auto grid min-h-[74vh] max-w-3xl place-items-center px-4 py-10 text-[#3d3122]">
      <div className="w-full rounded-[32px] border border-[#ead8ba] bg-white/95 p-7 shadow-2xl shadow-amber-950/10 md:p-10">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-[#a96735]">
          Account
        </p>
        <h1 className="mt-4 font-serif text-4xl font-black leading-tight md:text-5xl">
          Your Quipsly account
        </h1>
        <p className="mt-4 text-base leading-7 text-[#6f5a43]">
          Check the email below, then continue or choose another account.
        </p>

        <div className="mt-7 rounded-3xl border border-[#ead8ba] bg-[#fffaf3] p-5">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 overflow-hidden rounded-2xl border border-white bg-[#ebdcc8] shadow-sm">
              {currentUser?.image ? (
                <img
                  src={currentUser.image}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <img
                  src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(currentUser?.email || "quipsly")}`}
                  alt=""
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-serif text-2xl font-black">
                  {currentUser?.name || "Current Quipsly user"}
                </h2>
                {currentUser?.isStaff ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-800">
                    <ShieldCheck className="h-3 w-3" />
                    Staff
                  </span>
                ) : null}
              </div>
              <p className="mt-1 break-all text-sm font-bold text-[#7a654f]">
                {currentUser?.email || "No current session"}
              </p>
              <p className="mt-2 text-sm leading-6 text-[#8b765f]">This is the account you are using now.</p>
            </div>
          </div>
        </div>

        <details className="mt-4 rounded-3xl border border-cyan-200 bg-cyan-50 p-5 text-cyan-950">
          <summary className="cursor-pointer list-none text-sm font-black">
            Sign-in options
          </summary>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                <h2
                  id="sign-in-methods-heading"
                  className="text-xs font-black uppercase tracking-[0.16em]"
                >
                  Sign-in methods
                </h2>
              </div>
              {!firebaseStateReady ? (
                <p className="mt-2 text-sm leading-6">
                  Checking your sign-in options...
                </p>
              ) : googleConnected ? (
                <p className="mt-2 text-sm leading-6">
                  Google is connected{passwordConnected ? ", and you can also use your password" : ""}.
                </p>
              ) : firebaseUser ? (
                <p className="mt-2 text-sm leading-6">
                  {passwordConnected ? "You currently sign in with a password." : "Google is not connected yet."}
                </p>
              ) : (
                <p className="mt-2 text-sm leading-6">
                  Sign in again to change how you sign in.
                </p>
              )}
              {identityMessage ? (
                <p role="status" aria-live="polite" className="mt-3 rounded-2xl border border-cyan-300 bg-white/70 px-4 py-3 text-sm leading-6">
                  {identityMessage}
                </p>
              ) : null}
            </div>

            {firebaseStateReady && firebaseUser && !googleConnected ? (
              <button
                type="button"
                onClick={connectGoogleAccount}
                disabled={status !== "idle"}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-cyan-950 px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:bg-cyan-900 disabled:cursor-wait disabled:opacity-60"
              >
                <Link2 className="h-4 w-4" />
                {status === "linking-google" ? "Connecting Google..." : "Connect Google"}
              </button>
            ) : null}
          </div>
        </details>

        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <Link
            href={callbackUrl}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#3d2a1e] px-5 py-3 text-sm font-black text-white shadow-lg shadow-amber-950/15 transition hover:bg-[#24180f]"
          >
            <CheckCircle2 className="h-4 w-4" />
            Continue
          </Link>
          <button
            type="button"
            onClick={switchGoogleAccount}
            disabled={status !== "idle"}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-[#ead8ba] bg-white px-5 py-3 text-sm font-black text-[#7b512d] transition hover:bg-[#fff8ec] disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCcw className="h-4 w-4" />
            {status === "switching" ? "Opening sign-in..." : "Use another account"}
          </button>
        </div>

        <button
          type="button"
          onClick={signOut}
          disabled={status !== "idle"}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#ead8ba] bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-[#7b512d] transition hover:bg-[#fff8ec] disabled:cursor-wait disabled:opacity-60"
        >
          <LogOut className="h-4 w-4" />
          {status === "signing-out" ? "Signing out..." : "Sign out"}
        </button>

        {currentUser?.isStaff ? (
          <details className="mt-6 rounded-2xl border border-[#ead8ba] bg-[#fffaf3] px-4 py-3 text-sm text-[#6f5a43]">
            <summary className="cursor-pointer list-none text-xs font-black uppercase tracking-[0.14em] text-[#8c6b4a]">
              Admin tools
            </summary>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/admin/users"
                className="inline-flex items-center gap-2 rounded-full border border-[#ead8ba] bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#7b512d]"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Admin users
              </Link>
              <Link
                href="/admin/auth-diagnostics"
                className="inline-flex items-center gap-2 rounded-full border border-[#ead8ba] bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#7b512d]"
              >
                <FlaskConical className="h-3.5 w-3.5" />
                Diagnostics
              </Link>
            </div>
          </details>
        ) : null}
      </div>
    </section>
  );
}
