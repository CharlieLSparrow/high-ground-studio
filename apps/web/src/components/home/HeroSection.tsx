import Link from "next/link";
import AuthButtons from "@/components/site/AuthButtons";

export default function HeroSection() {
  return (
    <section className="relative flex min-h-[90vh] w-full flex-col items-center justify-center overflow-hidden bg-void px-6 text-center">
      <div className="absolute inset-0 z-0">
        <div
          className="h-full w-full animate-slow-pan bg-[url('/hero-bg.jpg')] bg-cover bg-center opacity-30 mix-blend-luminosity"
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,var(--color-void)_100%)] opacity-90" />
        <div className="absolute inset-0 bg-gradient-to-b from-void/40 via-transparent to-void" />
      </div>

      <div className="relative z-10 max-w-[960px]">
        <div className="mb-4 text-[12px] font-extrabold uppercase tracking-[0.2em] text-[rgba(245,239,230,0.72)]">
          High Ground Odyssey
        </div>

        <h1 className="mb-6 text-[clamp(3.5rem,9vw,7rem)] font-black leading-[0.88] tracking-[-0.06em] text-subject drop-shadow-2xl">
          LEADERSHIP, LEGACY, <br />
          <span className="text-flare">AND THE STORIES THAT SHAPE US</span>
        </h1>

        <p className="mx-auto mb-10 max-w-[680px] text-[clamp(1.1rem,2.2vw,1.4rem)] font-medium leading-relaxed text-[rgba(245,239,230,0.92)]">
          A home for episodes, paired reading, and coaching built for people
          trying to lead with more clarity, steadiness, and courage.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <div className="scale-110">
            <AuthButtons />
          </div>
          <Link
            href="/library"
            className="rounded-full border border-white/15 bg-white/8 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/35 hover:text-[var(--accent)]"
          >
            Explore the library
          </Link>
          <a
            href="https://buy.stripe.com/test_coaching_link" 
            target="_blank" 
            rel="noreferrer"
            className="rounded-full border border-white/15 bg-white/8 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/35 hover:text-[var(--accent)]"
          >
            Book Coaching
          </a>
        </div>

        <p className="mx-auto mb-0 mt-6 max-w-[640px] text-[1rem] leading-7 text-[rgba(245,239,230,0.84)]">
          Sign in via Patreon to save your place, access the Interactive Reader, and follow the
          journey as new episodes, reflections, and coaching tools are released.
        </p>
      </div>
      <div className="absolute bottom-12 h-1 w-12 rounded-full bg-flare/30 blur-sm" />
    </section>
  );
}
