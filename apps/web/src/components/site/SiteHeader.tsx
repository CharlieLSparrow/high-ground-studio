import Link from "next/link";
import SocialLinks from "./SocialLinks";
import AuthButtons from "./AuthButtons";

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[rgba(10,21,24,0.55)] backdrop-blur-[14px]">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-6 py-4">
        <Link
          href="/"
          className="text-lg font-extrabold tracking-[-0.03em] text-[var(--text-light)] no-underline"
        >
          High Ground Odyssey
        </Link>

        <div className="flex items-center gap-4">
          <SocialLinks />
          <AuthButtons />
        </div>
      </div>
    </header>
  );
}