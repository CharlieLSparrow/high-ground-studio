import Link from "next/link";
import GlassPanel from "@/components/ui/GlassPanel";

type PairedReadingCardProps = {
  eyebrow: string;
  title: string;
  href: string;
  description?: string;
  ctaLabel?: string;
};

export default function PairedReadingCard({
  eyebrow,
  title,
  href,
  description,
  ctaLabel = "Open companion →",
}: PairedReadingCardProps) {
  return (
    <GlassPanel className="p-6 text-[var(--text-light)]">
      <div className="mb-3 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[var(--accent-soft)]">
        {eyebrow}
      </div>

      <h3 className="m-0 text-[1.15rem] font-bold leading-6 text-[var(--text-light)]">
        {title}
      </h3>

      {description ? (
        <p className="mb-0 mt-3 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.88)]">
          {description}
        </p>
      ) : null}

      <div className="mt-4">
        <Link
          href={href}
          className="text-[15px] font-extrabold text-[var(--text-light)] no-underline transition hover:text-[var(--accent)]"
        >
          {ctaLabel}
        </Link>
      </div>
    </GlassPanel>
  );
}