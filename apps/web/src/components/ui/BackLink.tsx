import Link from "next/link";

type BackLinkProps = {
  href: string;
  children: React.ReactNode;
  className?: string;
};

export default function BackLink({
  href,
  children,
  className = "",
}: BackLinkProps) {
  return (
    <Link
      href={href}
      className={[
        "inline-flex items-center gap-2 text-[14px] tracking-[0.04em]",
        "text-[rgba(255,255,255,0.82)] no-underline transition",
        "hover:text-[var(--accent)]",
        className,
      ].join(" ")}
    >
      {children}
    </Link>
  );
}