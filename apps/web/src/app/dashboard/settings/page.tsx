import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import GlassPanel from "@/components/ui/GlassPanel";
import PageContainer from "@/components/ui/PageContainer";
import PageEyebrow from "@/components/ui/PageEyebrow";
import { buildSignInHref } from "@/lib/content-access";
import { prisma } from "@/lib/prisma";
import { redirectToWelcomeIfNeeded } from "@/lib/server/welcome";

import { updateMarketingPreferencesAction } from "./actions";

export default async function DashboardSettingsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect(buildSignInHref("/dashboard/settings"));
  }

  redirectToWelcomeIfNeeded(session, "/dashboard/settings");

  const user = await prisma.user.findUnique({
    where: {
      id: session.user.id,
    },
    select: {
      id: true,
      name: true,
      primaryEmail: true,
      newsletterOptIn: true,
      announcementsOptIn: true,
    },
  });

  if (!user) {
    redirect("/");
  }

  const displayName = user.name?.trim() || user.primaryEmail;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#08171b_0%,#10272d_16%,#18383d_40%,#6f5636_78%,#f3eadb_100%)] pb-20">
      <PageContainer className="pt-10">
        <div className="mx-auto max-w-[760px] space-y-8">
          <GlassPanel className="p-6 text-[var(--text-light)]">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <PageEyebrow>Dashboard</PageEyebrow>
              <PageEyebrow>Settings</PageEyebrow>
            </div>

            <h1 className="m-0 text-[clamp(2.2rem,5vw,4rem)] leading-[0.98] tracking-[-0.04em] text-[var(--text-light)]">
              Email preferences for {displayName}
            </h1>

            <p className="mb-0 mt-5 max-w-[640px] text-[1rem] leading-7 text-[rgba(245,239,230,0.88)]">
              Keep this narrow and useful: choose whether High Ground Odyssey
              should send you longer-form newsletter updates, direct project
              announcements, or both.
            </p>

            <div className="mt-6">
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/30 hover:text-[var(--accent)]"
              >
                Back to dashboard
              </Link>
            </div>
          </GlassPanel>

          <GlassPanel className="p-6 text-[var(--text-light)]">
            <PageEyebrow>Notifications</PageEyebrow>

            <h2 className="m-0 mt-3 text-[1.7rem] leading-tight tracking-[-0.03em] text-[var(--text-light)]">
              What should we send you?
            </h2>

            <form action={updateMarketingPreferencesAction} className="mt-6 space-y-5">
              <label className="block rounded-2xl border border-white/10 bg-white/6 p-5">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    name="newsletterOptIn"
                    defaultChecked={user.newsletterOptIn}
                    className="mt-1 h-4 w-4"
                  />

                  <div>
                    <div className="text-[1rem] font-bold text-[var(--text-light)]">
                      Newsletter
                    </div>
                    <div className="mt-2 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.84)]">
                      Occasional thoughtful updates, new writing, and project
                      momentum that is worth reading instead of merely sent.
                    </div>
                  </div>
                </div>
              </label>

              <label className="block rounded-2xl border border-white/10 bg-white/6 p-5">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    name="announcementsOptIn"
                    defaultChecked={user.announcementsOptIn}
                    className="mt-1 h-4 w-4"
                  />

                  <div>
                    <div className="text-[1rem] font-bold text-[var(--text-light)]">
                      Announcements
                    </div>
                    <div className="mt-2 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.84)]">
                      Important launches, major updates, and the practical
                      messages people reasonably expect to hear about.
                    </div>
                  </div>
                </div>
              </label>

              <div className="rounded-2xl border border-dashed border-white/10 bg-white/4 p-5 text-[0.95rem] leading-7 text-[rgba(245,239,230,0.82)]">
                These choices update your existing user record. Nothing here
                changes billing, account identity, or coaching access.
              </div>

              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-full border border-flare/35 bg-flare/18 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] transition hover:border-flare/50 hover:bg-flare/24"
              >
                Save preferences
              </button>
            </form>
          </GlassPanel>
        </div>
      </PageContainer>
    </main>
  );
}
