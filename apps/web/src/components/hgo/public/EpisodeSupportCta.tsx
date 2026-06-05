import Link from "next/link";
import { auth } from "@/auth";
import type { HgoPublicEpisodePacket } from "@/lib/hgo/public-episode-packet";

const fallbackPatreonUrl = "https://www.patreon.com/c/HighGroundOdyssey";

export async function EpisodeSupportCta({
  packet,
  compact = false,
}: {
  packet?: HgoPublicEpisodePacket;
  compact?: boolean;
}) {
  const session = await auth();
  const user = session?.user;
  const patreonUrl = (process.env.NEXT_PUBLIC_PATREON_URL || fallbackPatreonUrl).trim();
  const episodeLabel = packet ? `Episode ${packet.episodeNumber}` : "High Ground Odyssey";

  return (
    <section className={`w-full bg-zinc-950 px-6 lg:px-8 ${compact ? "py-10" : "py-14"}`}>
      <div className="mx-auto max-w-5xl overflow-hidden rounded-[2rem] border border-amber-400/20 bg-[linear-gradient(135deg,rgba(245,158,11,0.16),rgba(24,24,27,0.96)_44%,rgba(9,9,11,1))] p-6 shadow-2xl shadow-black/30 sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.22em] text-amber-300">
              {user ? "Beta Access Active" : "Support the expedition"}
            </div>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl">
              {user 
                ? `Welcome back, ${user.name || user.email?.split("@")[0]}`
                : `Help keep ${episodeLabel} and the next stories moving.`
              }
            </h2>
            <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-300">
              {user 
                ? "You have access to the member dashboard. Open the interactive reader on any episode to highlight passages and save them to your study library."
                : "Patreon support helps fund the episodes, companion writing, research notes, and the tools we are building around High Ground Odyssey. Sign in to unlock interactive reading."
              }
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            {user ? (
              <>
                {packet?.slug && (
                  <Link
                    href={`/episodes/${packet.slug}/read`}
                    className="inline-flex items-center justify-center rounded-full bg-amber-500 px-6 py-3 text-sm font-black uppercase tracking-[0.1em] text-zinc-950 shadow-[0_20px_60px_rgba(245,158,11,0.25)] transition hover:-translate-y-0.5 hover:bg-amber-400"
                  >
                    Open Interactive Reader
                  </Link>
                )}
                <Link
                  href="/dashboard"
                  className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/10 px-6 py-3 text-sm font-black uppercase tracking-[0.1em] text-zinc-100 transition hover:border-amber-400/60 hover:bg-amber-400/10"
                >
                  Go to Dashboard
                </Link>
              </>
            ) : (
              <>
                <a
                  href={patreonUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-full bg-[#ff424d] px-6 py-3 text-sm font-black uppercase tracking-[0.1em] text-white shadow-[0_20px_60px_rgba(255,66,77,0.25)] transition hover:-translate-y-0.5 hover:bg-[#ff5962]"
                >
                  Join the Patreon
                </a>
                <Link
                  href="/api/auth/signin"
                  className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/10 px-6 py-3 text-sm font-black uppercase tracking-[0.1em] text-zinc-100 transition hover:border-amber-400/60 hover:bg-amber-400/10"
                >
                  Sign in with Patreon
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

