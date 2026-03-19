import Link from "next/link";
import PageContainer from "@/components/ui/PageContainer";
import PageEyebrow from "@/components/ui/PageEyebrow";
import PaperCard from "@/components/ui/PaperCard";

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
      <PageContainer className="pb-20 pt-7">
        <div className="mb-6">
          <Link
            href="/"
            className="text-[14px] tracking-[0.04em] text-[rgba(255,255,255,0.82)] no-underline transition hover:text-[var(--accent)]"
          >
            ← Back to High Ground Odyssey
          </Link>
        </div>

        <header className="mb-7 text-[var(--text-light)]">
          <PageEyebrow>High Ground Odyssey</PageEyebrow>

          <h1 className="m-0 text-[clamp(2.2rem,5vw,4rem)] leading-[1.02] tracking-[-0.03em]">
            {title}
          </h1>

          {description ? (
            <p className="mb-0 mt-4 max-w-[760px] text-[1.08rem] leading-7 text-[rgba(245,239,230,0.88)]">
              {description}
            </p>
          ) : null}
        </header>

        <PaperCard className="max-w-[820px]">
          <div className="prose-hgo">{children}</div>
        </PaperCard>
      </PageContainer>
    </main>
  );
}