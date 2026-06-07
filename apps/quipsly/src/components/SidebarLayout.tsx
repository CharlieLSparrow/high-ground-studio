"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signIn, signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Search,
  Rocket,
  Settings,
  Film,
  Bell,
  BarChart2,
  ImageIcon,
  Share2,
  ShieldCheck,
  UserCog,
  ChevronDown,
  LogOut,
  RefreshCcw,
  UserRound,
  type LucideIcon
} from "lucide-react";
import { cn } from "@/app/(app)/studio-ui";
import { NestChatPanel } from "@/components/NestChatPanel";

type NavItem = {
  name: string;
  href: string;
  icon: LucideIcon;
  activePrefixes?: string[];
};

const defaultNavItems: NavItem[] = [
  { name: "The Nest", href: "/projects", icon: LayoutDashboard, activePrefixes: ["/projects", "/nests", "/create"] },
  { name: "Research", href: "/research", icon: Search },
  { name: "Media", href: "/media", icon: Film, activePrefixes: ["/media"] },
  { name: "Art Foundry", href: "/art-foundry", icon: ImageIcon },
  { name: "Outputs", href: "/outputs", icon: Share2 },
  { name: "Publishing", href: "/publishing", icon: Rocket },
  { name: "Analytics", href: "/analytics", icon: BarChart2 },
  { name: "Beta", href: "/beta-readiness", icon: ShieldCheck },
];

const adminNavItems: NavItem[] = [
  { name: "Users", href: "/admin/users", icon: UserCog },
];

function resolveNavItems(showAdminTools: boolean) {
  if (!showAdminTools) return defaultNavItems;
  return [...defaultNavItems, ...adminNavItems];
}

export function SidebarLayout({
  children,
  showAdminTools = false,
  currentUser = null,
}: {
  children: React.ReactNode;
  showAdminTools?: boolean;
  currentUser?: {
    email: string;
    name: string | null;
    image: string | null;
    isStaff: boolean;
    hasBetaAccess: boolean;
  } | null;
}) {
  const pathname = usePathname();
  const navItems = resolveNavItems(showAdminTools);
  const currentPath = pathname || "/projects";

  return (
    <div className="flex flex-col h-screen w-full bg-[#fdfaf6] overflow-hidden text-[#3d3122] font-sans">
      {/* Sleek Top Header */}
      <header className="h-[60px] shrink-0 border-b border-[#e8dcc4] px-4 md:px-6 flex items-center justify-between bg-[#fdfaf6]/90 backdrop-blur-md relative z-20">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden mix-blend-multiply bg-[#f8f3e6]">
              <img src="/quipsly-app-icon.png" alt="Quipsly Character" className="w-full h-full object-cover" />
            </div>
            <span className="font-bold text-lg tracking-wide text-[#3d3122]">Quipsly</span>
          </div>

          <nav className="hidden md:flex items-center gap-2">
            {navItems.map((item) => {
              const activePrefixes = item.activePrefixes ?? [item.href];
              const isActive = activePrefixes.some((prefix) => pathname.startsWith(prefix));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-sm font-semibold",
                    isActive
                      ? "bg-[#8c6b4a] text-white shadow-sm"
                      : "text-[#5e4b33] hover:text-[#3d3122] hover:bg-[#ebdcc8]"
                  )}
                >
                  <item.icon className={cn("w-4 h-4", isActive ? "text-amber-100" : "text-[#8c6b4a]")} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3 md:gap-4">
          <a
            href="https://quipsly.com/support"
            className="hidden rounded-full border border-[#e8dcc4] bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#8c6b4a] shadow-sm transition hover:border-amber-400/50 hover:bg-[#fff8ec] lg:inline-flex"
          >
            Support beta
          </a>
          <button className="md:hidden relative p-2 rounded-full hover:bg-[#ebdcc8] text-[#8c6b4a] hover:text-[#3d3122] transition-colors" aria-label="Search">
            <Search className="w-5 h-5" />
          </button>
          <div className="relative w-64 hidden md:block">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8c6b4a]" />
            <input
              type="text"
              placeholder="Search assets..."
              className="w-full bg-white border border-[#e8dcc4] rounded-full py-1.5 pl-9 pr-4 text-sm text-[#3d3122] placeholder:text-[#8c6b4a]/70 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/50 transition-all shadow-sm"
            />
          </div>
          <button className="relative p-2 rounded-full hover:bg-[#ebdcc8] text-[#8c6b4a] hover:text-[#3d3122] transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-500 rounded-full border border-[#fdfaf6]" />
          </button>
          <Link href="/settings" className="relative p-2 rounded-full hover:bg-[#ebdcc8] text-[#8c6b4a] hover:text-[#3d3122] transition-colors hidden md:block" aria-label="Settings">
            <Settings className="w-5 h-5" />
          </Link>
          <AccountSwitcher currentUser={currentUser} currentPath={currentPath} />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 min-h-0 relative z-10 overflow-hidden bg-[#fdfaf6]">
        {/* Soft sunlight glow background */}
        <div className="absolute top-0 left-0 w-full h-64 bg-amber-100/30 blur-[100px] pointer-events-none" />

        <div className="h-full overflow-y-auto custom-scrollbar p-4 md:p-6 pb-24 md:pb-6">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#fdfaf6]/95 backdrop-blur-md border-t border-[#e8dcc4] pb-safe">
        <div className="flex items-center justify-around h-16 px-2">
          {navItems.map((item) => {
            const activePrefixes = item.activePrefixes ?? [item.href];
            const isActive = activePrefixes.some((prefix) => pathname.startsWith(prefix));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 w-full h-full rounded-lg transition-all text-[10px] font-semibold",
                  isActive
                    ? "text-[#8c6b4a]"
                    : "text-[#8c6b4a]/60 hover:text-[#8c6b4a] hover:bg-[#ebdcc8]/30"
                )}
              >
                <item.icon className={cn("w-5 h-5", isActive ? "text-[#8c6b4a]" : "text-[#8c6b4a]/60")} />
                {item.name}
              </Link>
            );
          })}
        </div>
      </nav>
      <Suspense fallback={null}>
        <NestChatPanel />
      </Suspense>
    </div>
  );
}

function AccountSwitcher({
  currentUser,
  currentPath,
}: {
  currentUser: {
    email: string;
    name: string | null;
    image: string | null;
    isStaff: boolean;
    hasBetaAccess: boolean;
  } | null;
  currentPath: string;
}) {
  const email = currentUser?.email || "";
  const avatar =
    currentUser?.image ||
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(email || "QuipslyUser")}`;

  async function switchAccount() {
    await signOut({ redirect: false });
    await signIn("google", { callbackUrl: currentPath || "/projects" });
  }

  async function signOutOnly() {
    await signOut({ callbackUrl: "/" });
  }

  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-[#e8dcc4] bg-white px-2 py-1 shadow-sm transition hover:bg-[#fff8ec]">
        <span className="h-8 w-8 overflow-hidden rounded-full border border-white bg-[#ebdcc8]">
          <img src={avatar} alt="" className="h-full w-full object-cover" />
        </span>
        <span className="hidden max-w-[150px] truncate text-left text-xs font-bold leading-tight text-[#4f3a28] xl:block">
          {currentUser?.name || email || "Account"}
          <span className="block truncate text-[10px] font-semibold text-[#8c6b4a]">
            {email || "Choose user"}
          </span>
        </span>
        <ChevronDown className="hidden h-4 w-4 text-[#8c6b4a] transition group-open:rotate-180 md:block" />
      </summary>

      <div className="absolute right-0 top-12 z-50 w-[320px] rounded-3xl border border-[#ead8ba] bg-white p-4 text-[#3d3122] shadow-2xl shadow-amber-950/20">
        <div className="flex items-start gap-3">
          <span className="h-11 w-11 overflow-hidden rounded-2xl border border-white bg-[#ebdcc8] shadow-sm">
            <img src={avatar} alt="" className="h-full w-full object-cover" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-serif text-lg font-black">
              {currentUser?.name || "Signed-in user"}
            </p>
            <p className="break-all text-xs font-bold text-[#8c6b4a]">
              {email || "No email in session"}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {currentUser?.isStaff ? (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-emerald-800">
                  Staff
                </span>
              ) : null}
              {currentUser?.hasBetaAccess ? (
                <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-cyan-800">
                  Beta
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <p className="mt-3 rounded-2xl bg-[#fff8ec] px-3 py-2 text-xs leading-5 text-[#7a654f]">
          Switching users changes which Nests, Home Nest assets, and private
          projects are visible. It does not merge identities.
        </p>

        <div className="mt-3 grid gap-2">
          <button
            type="button"
            onClick={switchAccount}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#3d2a1e] px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:bg-[#24180f]"
          >
            <RefreshCcw className="h-4 w-4" />
            Switch Google account
          </button>
          <Link
            href={`/account/switch?callbackUrl=${encodeURIComponent(currentPath || "/projects")}`}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#ead8ba] bg-white px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-[#7b512d] transition hover:bg-[#fff8ec]"
          >
            <UserRound className="h-4 w-4" />
            Account switch page
          </Link>
          <button
            type="button"
            onClick={signOutOnly}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-rose-900 transition hover:bg-rose-100"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>
    </details>
  );
}
