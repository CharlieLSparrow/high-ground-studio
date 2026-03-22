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
    <GlassPanel className="p-6 text-[var(--text-light)]">
      <div className="mb-3 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[var(--accent-soft)]">
        {eyebrow}
      </div>

      <blockquote className="m-0 border-l border-[rgba(255,154,61,0.45)] pl-4 text-[1rem] italic leading-8 text-[rgba(245,239,230,0.92)]">
        “{quote}”
      </blockquote>
    </GlassPanel>
  );
}