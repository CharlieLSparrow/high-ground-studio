"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

export function CoachingClientCreate({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <details id="add-client" open={initiallyOpen} className="mt-5 rounded-2xl border border-[#dfcfb4] bg-[#fffdf8] p-4 sm:p-5">
    <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-base font-bold text-[#354b36]"><Plus size={18} aria-hidden="true" /> Add client</summary>
    <form className="mt-4 grid max-w-xl gap-4" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      setBusy(true);
      setError("");
      try {
        const response = await fetch("/api/coaching/engagements", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: form.get("email"), name: form.get("name") }),
        });
        const result = await response.json();
        if (!response.ok || !result.space?.href) throw new Error(result.error || "We couldn’t create the client space.");
        router.push(result.space.href);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Please try again.");
      } finally { setBusy(false); }
    }}>
      <p className="text-sm text-[#765f40]">Create a space for shared notes, tasks, and conversation. Schedule a call whenever you’re ready.</p>
      <label className="text-sm font-semibold">Client email<input name="email" type="email" required maxLength={254} autoComplete="email" className="mt-1 block min-h-11 w-full rounded-xl border border-[#dfcfb4] bg-white px-3 text-[#34291d]" /></label>
      <label className="text-sm font-semibold">Name (optional)<input name="name" maxLength={200} autoComplete="name" className="mt-1 block min-h-11 w-full rounded-xl border border-[#dfcfb4] bg-white px-3 text-[#34291d]" /></label>
      <p className="text-xs text-[#765f40]">Shared with this client’s account. No email or calendar invitation is sent by this step.</p>
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      <button disabled={busy} className="min-h-11 rounded-full bg-[#354b36] px-5 py-3 text-sm font-bold text-white disabled:opacity-60">{busy ? "Creating…" : "Create client space"}</button>
    </form>
  </details>;
}
