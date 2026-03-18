import { site } from "@/lib/site";

export default function HeroSection() {
  return (
    <section className="mx-auto max-w-[1200px] px-6 pb-10 pt-10">
      <div className="max-w-[780px]">
        <div className="mb-[18px] inline-block rounded-full border border-white/12 bg-white/10 px-[14px] py-[8px] text-[12px] uppercase tracking-[0.08em]">
          {site.title}
        </div>

        <h1 className="m-0 text-[clamp(3rem,7vw,6rem)] leading-[0.92] tracking-[-0.06em] text-[var(--text-light)]">
          Stories worth
          <br />
          climbing for.
        </h1>

        <p className="mb-0 mt-5 max-w-[700px] text-[clamp(1.04rem,2vw,1.18rem)] leading-8 text-[rgba(245,239,230,0.92)]">
          High Ground Odyssey is a podcast and storytelling project about
          leadership, legacy, family, and the lessons hidden inside ordinary
          life. Start with the opening episodes below.
        </p>
      </div>
    </section>
  );
}