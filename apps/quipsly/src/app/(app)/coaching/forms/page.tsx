import Link from "next/link";
import { ClipboardList, LockKeyhole } from "lucide-react";

import { CoachingFormsClient } from "@/components/coaching-forms-client";
import { getQuipslySession } from "@/lib/server/quipsly-session";

export const dynamic = "force-dynamic";

export default async function CoachingFormsPage() {
  const session = await getQuipslySession();
  if (!session?.user) {
    return (
      <main className="min-h-full px-5 py-12 sm:px-8">
        <section className="mx-auto max-w-3xl rounded-3xl border border-[#ead8b4] bg-[#fffaf0] p-8">
          <LockKeyhole className="text-violet-800" aria-hidden="true" />
          <h1 className="mt-4 font-serif text-4xl font-black text-[#3d3122]">
            Your coaching forms are private.
          </h1>
          <p className="mt-3 max-w-2xl font-semibold leading-7 text-[#765f40]">
            Sign in to open only the reflections shared within your coaching
            relationships.
          </p>
          <Link
            href="/login?callbackUrl=%2Fcoaching%2Fforms"
            className="mt-6 inline-flex min-h-11 items-center rounded-full bg-violet-800 px-5 font-black text-white"
          >
            Sign in
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-full px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[92rem]">
        <header className="overflow-hidden rounded-[2rem] border border-[#e4d4b6] bg-[#fffaf0] p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-3xl">
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-violet-800">
                <ClipboardList size={17} aria-hidden="true" /> Coaching forms
              </p>
              <h1 className="mt-3 font-serif text-4xl font-black tracking-tight text-[#34291d] sm:text-5xl">
                Reflect without the paperwork maze.
              </h1>
              <p className="mt-4 text-base font-semibold leading-7 text-[#765f40]">
                Intake, prepare, reflect, and follow through in the same private
                coaching space. Draft answers stay private until the client
                submits them.
              </p>
            </div>
            <Link
              href="/coaching"
              className="inline-flex min-h-11 items-center rounded-full border border-[#d8c6a4] bg-white px-5 text-sm font-black text-[#5b472f] hover:bg-[#fff8e9]"
            >
              Back to Today
            </Link>
          </div>
        </header>
        <CoachingFormsClient />
      </div>
    </main>
  );
}
