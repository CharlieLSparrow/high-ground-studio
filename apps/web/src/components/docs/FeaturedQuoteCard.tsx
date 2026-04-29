import GlassPanel from "@/components/ui/GlassPanel";

type FeaturedQuoteCardProps = {
  quote: string;
  eyebrow?: string;
};

export default function FeaturedQuoteCard({
  quote,
  eyebrow = "Featured Line",
}: FeaturedQuoteCardProps) {
  return (
    <GlassPanel className="border-white/12 bg-[rgba(8,18,22,0.62)] p-6 text-[var(--text-light)]">
      <div className="mb-3 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[rgba(255,186,120,0.96)]">
        {eyebrow}
      </div>

      <blockquote className="m-0 border-l border-[rgba(255,154,61,0.52)] pl-4 text-[1.02rem] italic leading-8 text-[rgba(245,239,230,0.96)]">
        “{quote}”
      </blockquote>
    </GlassPanel>
  );
}
