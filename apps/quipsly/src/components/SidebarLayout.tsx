"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { auth } from "@/lib/firebase/firebase";
import { signOut as firebaseSignOut } from "firebase/auth";
import {
  CalendarCheck2,
  Inbox,
  LayoutDashboard,
  Search,
  ScanSearch,
  Rocket,
  Settings,
  Film,
  BarChart2,
  ImageIcon,
  Share2,
  ShieldCheck,
  UserCog,
  ChevronDown,
  LogOut,
  RefreshCcw,
  UserRound,
  CalendarDays,
  Library,
  MoreHorizontal,
  Podcast,
  ListChecks,
  BellRing,
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

const primaryNavItems: NavItem[] = [
  { name: "Today", href: "/today", icon: CalendarCheck2 },
  { name: "Inbox", href: "/inbox", icon: Inbox },
  { name: "Work", href: "/work", icon: ListChecks },
  { name: "Sessions", href: "/coaching/sessions", icon: Podcast, activePrefixes: ["/coaching", "/sessions"] },
  { name: "Library", href: "/library", icon: Library, activePrefixes: ["/library", "/collections", "/notebooks", "/read", "/research", "/media"] },
  { name: "Calendar", href: "/schedule", icon: CalendarDays },
];

const secondaryNavItems: NavItem[] = [
  { name: "Search all", href: "/find", icon: ScanSearch },
  { name: "Nests", href: "/projects", icon: LayoutDashboard, activePrefixes: ["/projects", "/nests", "/create"] },
  { name: "Research", href: "/research", icon: Search },
  { name: "Media", href: "/media", icon: Film, activePrefixes: ["/media"] },
  { name: "Podcast desk", href: "/podcast", icon: Podcast },
  { name: "Publishing", href: "/publishing", icon: Rocket },
  { name: "Art Foundry", href: "/art-foundry", icon: ImageIcon },
  { name: "Outputs", href: "/outputs", icon: Share2 },
  { name: "Analytics", href: "/analytics", icon: BarChart2 },
  { name: "Beta", href: "/beta-readiness", icon: ShieldCheck },
];

const adminNavItems: NavItem[] = [
  { name: "Users", href: "/admin/users", icon: UserCog },
];

function isNavItemActive(item: NavItem, pathname: string) {
  const activePrefixes = item.activePrefixes ?? [item.href];
  return activePrefixes.some((prefix) => pathname.startsWith(prefix));
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
  const currentPath = pathname || "/today";
  const moreNavItems = showAdminTools
    ? [...secondaryNavItems, ...adminNavItems]
    : secondaryNavItems;
  const isMoreActive = moreNavItems.some((item) => isNavItemActive(item, currentPath));

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

          <nav className="hidden md:flex items-center gap-1" aria-label="Primary workspace">
            {primaryNavItems.map((item) => {
              const isActive = isNavItemActive(item, currentPath);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all text-sm font-semibold",
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
            <details className="group relative">
              <summary
                className={cn(
                  "flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition-all",
                  isMoreActive
                    ? "bg-[#8c6b4a] text-white shadow-sm"
                    : "text-[#5e4b33] hover:bg-[#ebdcc8] hover:text-[#3d3122]",
                )}
              >
                <MoreHorizontal className={cn("h-4 w-4", isMoreActive ? "text-amber-100" : "text-[#8c6b4a]")} />
                More
                <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
              </summary>
              <nav aria-label="More workspace tools" className="absolute left-0 top-11 z-50 grid w-64 gap-1 rounded-2xl border border-[#ead8ba] bg-white p-2 shadow-2xl shadow-amber-950/15">
                {moreNavItems.map((item) => {
                  const isActive = isNavItemActive(item, currentPath);
                  return (
                    <Link key={item.href} href={item.href} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition", isActive ? "bg-[#8c6b4a] text-white" : "text-[#5e4b33] hover:bg-[#fff8ec]")}>
                      <item.icon className={cn("h-4 w-4", isActive ? "text-amber-100" : "text-[#8c6b4a]")} />
                      {item.name}
                    </Link>
                  );
                })}
              </nav>
            </details>
          </nav>
        </div>

        <div className="flex items-center gap-3 md:gap-4">
          <a
            href="https://quipsly.com/support"
            className="hidden rounded-full border border-[#e8dcc4] bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#8c6b4a] shadow-sm transition hover:border-amber-400/50 hover:bg-[#fff8ec] lg:inline-flex"
          >
            Support beta
          </a>
          <Link href="/settings" className="relative p-2 rounded-full hover:bg-[#ebdcc8] text-[#8c6b4a] hover:text-[#3d3122] transition-colors hidden md:block" aria-label="Settings">
            <Settings className="w-5 h-5" />
          </Link>
          <Link href="/find" className="relative rounded-full p-2 text-[#8c6b4a] transition-colors hover:bg-[#ebdcc8] hover:text-[#3d3122]" aria-label="Search all Quipsly"><ScanSearch className="h-5 w-5" /></Link>
          <Link href="/work?view=attention" className="relative rounded-full p-2 text-[#8c6b4a] transition-colors hover:bg-[#ebdcc8] hover:text-[#3d3122]" aria-label="Open attention queue"><BellRing className="h-5 w-5" /></Link>
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
          {primaryNavItems.slice(0, 4).map((item) => {
            const isActive = isNavItemActive(item, currentPath);
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
          <details className="group relative h-full w-full">
            <summary className={cn("flex h-full w-full cursor-pointer list-none flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-semibold transition", isMoreActive || isNavItemActive(primaryNavItems[4], currentPath) ? "text-[#8c6b4a]" : "text-[#8c6b4a]/60")}>
              <MoreHorizontal className="h-5 w-5" />
              More
            </summary>
            <nav aria-label="More mobile tools" className="absolute bottom-[4.5rem] right-0 grid w-[min(92vw,320px)] grid-cols-2 gap-1 rounded-2xl border border-[#ead8ba] bg-white p-2 shadow-2xl shadow-amber-950/20">
              {[...primaryNavItems.slice(4), ...moreNavItems, { name: "Settings", href: "/settings", icon: Settings }].map((item) => {
                const isActive = isNavItemActive(item, currentPath);
                return (
                  <Link key={item.href} href={item.href} className={cn("flex items-center gap-2 rounded-xl px-3 py-3 text-xs font-bold", isActive ? "bg-[#8c6b4a] text-white" : "text-[#5e4b33] hover:bg-[#fff8ec]")}>
                    <item.icon className={cn("h-4 w-4", isActive ? "text-amber-100" : "text-[#8c6b4a]")} />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          </details>
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

  const router = useRouter();

  async function switchAccount() {
    await fetch("/api/auth/session", { method: "DELETE" });
    await firebaseSignOut(auth);
    router.push(`/login?callbackUrl=${encodeURIComponent(currentPath || "/projects")}`);
  }

  async function signOutOnly() {
    await fetch("/api/auth/session", { method: "DELETE" });
    await firebaseSignOut(auth);
    router.push("/");
    router.refresh();
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
            Switch account
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
