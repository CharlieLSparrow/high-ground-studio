import Link from "next/link";

import AuthButtons from "@/components/site/AuthButtons";
import type { LayoutVariant } from "@/lib/layout-variant";
import { getLayoutTextTreatment } from "@/lib/layout-variant-styles";

export default function HeroSection({
  variant = "cinematic",
}: {
  variant?: LayoutVariant;
}) {
  if (variant === "editorial") {
    return (
      <section className="relative flex min-h-[88vh] w-full flex-col items-center justify-center overflow-hidden px-6 py-20 text-center text-[var(--text-light)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#b18254_0%,transparent_32%),linear-gradient(180deg,rgba(28,22,17,0.96)_0%,rgba(71,52,35,0.9)_44%,rgba(241,229,210,0.32)_100%)]" />
        <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(255,255,255,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:32px_32px]" />

        <div className="relative z-10 max-w-[840px]">
          <div
            className={[
              "mb-4 text-[12px] font-extrabold uppercase tracking-[0.2em]",
              getLayoutTextTreatment("editorial", "heroKicker"),
            ].join(" ")}
          >
            High Ground Odyssey
          </div>

          <h1 className="mb-6 text-[clamp(3.2rem,8vw,6rem)] font-black leading-[0.92] tracking-[-0.05em] text-[var(--text-light)]">
            Leadership, legacy, and the stories we pass on.
          </h1>

          <p className="mx-auto mb-10 max-w-[660px] text-[clamp(1.05rem,2vw,1.28rem)] leading-8 text-[rgba(245,239,230,0.88)]">
            Episodes, paired reading, and thoughtful coaching for people trying
            to lead with more steadiness, more courage, and more honesty about
            the road they are actually walking.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <AuthButtons />
            <Link
              href="/library"
              className="rounded-full border border-white/15 bg-white/8 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/35 hover:text-[var(--accent)]"
            >
              Explore the library
            </Link>
            <Link
              href="/coaching"
              className="rounded-full border border-white/15 bg-white/8 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/35 hover:text-[var(--accent)]"
            >
              Explore coaching
            </Link>
          </div>

          <p className="mx-auto mb-0 mt-6 max-w-[640px] text-[0.98rem] leading-7 text-[rgba(245,239,230,0.76)]">
            Sign in to save your place, follow the project as it grows, and
            access member resources as new episodes and tools are released.
          </p>
        </div>
      </section>
    );
  }

  if (variant === "signal") {
    return (
      <section className="relative flex min-h-[82vh] w-full flex-col justify-center overflow-hidden border-b border-white/8 px-6 py-20 text-[var(--text-light)]">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,17,22,0.98)_0%,rgba(15,27,34,0.95)_52%,rgba(217,225,227,0.08)_100%)]" />
        <div className="absolute inset-0 opacity-[0.14] [background-image:linear-gradient(rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:48px_48px]" />

        <div className="relative z-10 mx-auto grid w-full max-w-[1200px] gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <div
              className={[
                "mb-4 text-[12px] font-extrabold uppercase tracking-[0.2em]",
                getLayoutTextTreatment("signal", "heroKicker"),
              ].join(" ")}
            >
              High Ground Odyssey
            </div>

            <h1 className="mb-6 max-w-[760px] text-[clamp(3rem,7vw,5.4rem)] font-black leading-[0.9] tracking-[-0.055em] text-[var(--text-light)]">
              Stories and coaching for the long work of becoming.
            </h1>

            <p className="max-w-[620px] text-[clamp(1rem,1.8vw,1.22rem)] leading-8 text-[rgba(230,236,238,0.82)]">
              Start with the public library, step into coaching when the timing
              is right, and sign in when you want your own place in the journey.
            </p>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.18)] backdrop-blur-[10px]">
            <div className="mb-3 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[rgba(230,236,238,0.72)]">
              Member access
            </div>
            <p className="mb-6 text-[0.98rem] leading-7 text-[rgba(230,236,238,0.82)]">
              Sign in to save your place, track what is open to you, and stay
              connected as new resources and conversations are released.
            </p>
            <div className="flex flex-wrap gap-3">
              <AuthButtons />
              <Link
                href="/library"
                className="rounded-full border border-white/15 bg-white/6 px-4 py-2 text-sm font-semibold text-[var(--text-light)] no-underline transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                Browse episodes
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

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

        <p className="mx-auto mb-10 max-w-[680px] text-[clamp(1.1rem,2.2vw,1.4rem)] font-medium leading-relaxed text-subject-muted">
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
          <Link
            href="/coaching"
            className="rounded-full border border-white/15 bg-white/8 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/35 hover:text-[var(--accent)]"
          >
            Explore coaching
          </Link>
        </div>

        <p className="mx-auto mb-0 mt-6 max-w-[640px] text-[0.98rem] leading-7 text-[rgba(245,239,230,0.76)]">
          Sign in to save your place, access member resources, and follow the
          journey as new episodes, reflections, and coaching tools are released.
        </p>
      </div>
      <div className="absolute bottom-12 h-1 w-12 rounded-full bg-flare/30 blur-sm" />
    </section>
  );
}
