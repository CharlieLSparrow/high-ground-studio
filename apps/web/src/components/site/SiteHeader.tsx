import Link from "next/link";
import SocialLinks from "./SocialLinks";
import AuthButtons from "./AuthButtons";
import ModeSwitcher from "./ModeSwitcher";
import { useCart } from "@/components/cart/CartContext"; 

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[rgba(10,21,24,0.55)] backdrop-blur-[14px]">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="text-lg font-extrabold tracking-[-0.03em] text-[var(--text-light)] no-underline"
          >
            High Ground Odyssey
          </Link>

          <nav className="hidden md:flex items-center gap-4">
            <Link
              href="/library"
              className="text-sm font-semibold text-[rgba(245,239,230,0.84)] no-underline transition hover:text-[var(--accent)]"
            >
              Library
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <ModeSwitcher />
          <SocialLinks />
          <AuthButtons />
          
          <button
            className="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20"
          >
            Cart
          </button>
        </div>
      </div>
    </header>
  );
}
