import Link from "next/link";

export default function DocsPageShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#10282d_0%,#17363d_24%,#284840_60%,#f3eadb_60%,#f3eadb_100%)]">
      <div className="mx-auto max-w-[1100px] px-5 pb-20 pt-7">
        <div className="mb-6">
          <Link
            href="/"
            className="text-[14px] tracking-[0.04em] text-[rgba(255,255,255,0.82)] no-underline hover:text-[var(--accent)]"
          >
            ← Back to High Ground Odyssey
          </Link>
        </div>

        <header className="mb-7 text-[var(--text-light)]">
          <div className="mb-[18px] inline-block rounded-full border border-white/12 bg-white/10 px-3 py-2 text-[12px] uppercase tracking-[0.08em]">
            High Ground Odyssey
          </div>

          <h1 className="m-0 text-[clamp(2.2rem,5vw,4rem)] leading-[1.02] tracking-[-0.03em]">
            {title}
          </h1>

          {description ? (
            <p className="mb-0 mt-4 max-w-[760px] text-[1.08rem] leading-7 text-[rgba(245,239,230,0.88)]">
              {description}
            </p>
          ) : null}
        </header>

        <article className="max-w-[820px] rounded-[28px] border border-[rgba(32,32,32,0.06)] bg-[var(--paper-strong)] px-[30px] py-10 text-[var(--text-dark)] shadow-[0_24px_70px_rgba(0,0,0,0.16)]">
          <div className="prose-hgo">{children}</div>
        </article>
      </div>
    </main>
  );
}