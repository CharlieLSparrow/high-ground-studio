"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { auth } from "@/lib/firebase/firebase";
import { signOut as firebaseSignOut } from "firebase/auth";
import {
  Activity,
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
  ShieldAlert,
  UserCog,
  ChevronDown,
  LogOut,
  UserRound,
  CalendarDays,
  Library,
  AudioLines,
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
  { name: "Audio Studio", href: "/audio", icon: AudioLines },
  { name: "Transcription lab", href: "/transcription", icon: AudioLines },
  { name: "Podcast desk", href: "/podcast", icon: Podcast },
  { name: "Publishing", href: "/publishing", icon: Rocket },
  { name: "Art Foundry", href: "/art-foundry", icon: ImageIcon },
  { name: "Outputs", href: "/outputs", icon: Share2 },
  { name: "Analytics", href: "/analytics", icon: BarChart2 },
];

const platformAdminNavItems: NavItem[] = [
  { name: "Release health", href: "/beta-readiness", icon: ShieldCheck },
  { name: "Users", href: "/admin/users", icon: UserCog },
  {
    name: "Account deletion",
    href: "/admin/account-deletion",
    icon: ShieldAlert,
  },
];

function isNavItemActive(item: NavItem, pathname: string) {
  const activePrefixes = item.activePrefixes ?? [item.href];
  return activePrefixes.some((prefix) => pathname.startsWith(prefix));
}

export function SidebarLayout({
  children,
  showPlatformAdminTools = false,
  showSupportTools = false,
  showProductOperations = false,
  currentUser = null,
}: {
  children: React.ReactNode;
  showPlatformAdminTools?: boolean;
  showSupportTools?: boolean;
  showProductOperations?: boolean;
  currentUser?: {
    email: string;
    name: string | null;
    image: string | null;
    isStaff: boolean;
  } | null;
}) {
  const pathname = usePathname();
  const currentPath = pathname || "/today";
  const operationalNavItems: NavItem[] = [
    ...(showSupportTools ? [{ name: "Customer support", href: "/admin/support", icon: UserCog }] : []),
    ...(showProductOperations ? [{ name: "Product operations", href: "/admin/product-ops", icon: Activity }] : []),
    ...(showPlatformAdminTools ? platformAdminNavItems : []),
  ];
  const moreNavItems = [...secondaryNavItems, ...operationalNavItems];
  const isMoreActive = moreNavItems.some((item) => isNavItemActive(item, currentPath));

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-quipsly-canvas font-sans text-quipsly-ink">
      {/* Sleek Top Header */}
      <header className="relative z-20 flex h-[60px] shrink-0 items-center justify-between border-b border-quipsly-divider bg-quipsly-surface/92 px-4 backdrop-blur-md md:px-6">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-quipsly-surface-muted mix-blend-multiply">
              <img src="/quipsly-app-icon.png" alt="Quipsly Character" className="w-full h-full object-cover" />
            </div>
            <span className="text-lg font-bold tracking-wide text-quipsly-ink">Quipsly</span>
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
                      ? "bg-gradient-to-r from-quipsly-peacock-700 to-quipsly-fern-600 text-[#fff7e8] shadow-sm"
                      : "text-quipsly-muted hover:bg-quipsly-surface-muted hover:text-quipsly-ink"
                  )}
                >
                  <item.icon className={cn("h-4 w-4", isActive ? "text-quipsly-brass-100" : "text-quipsly-peacock-700")} />
                  {item.name}
                </Link>
              );
            })}
            <details className="group relative">
              <summary
                className={cn(
                  "flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition-all",
                  isMoreActive
                    ? "bg-gradient-to-r from-quipsly-peacock-700 to-quipsly-fern-600 text-[#fff7e8] shadow-sm"
                    : "text-quipsly-muted hover:bg-quipsly-surface-muted hover:text-quipsly-ink",
                )}
              >
                <MoreHorizontal className={cn("h-4 w-4", isMoreActive ? "text-quipsly-brass-100" : "text-quipsly-peacock-700")} />
                More
                <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
              </summary>
              <nav aria-label="More workspace tools" className="absolute left-0 top-11 z-50 grid w-64 gap-1 rounded-2xl border border-quipsly-divider bg-quipsly-surface p-2 shadow-2xl shadow-amber-950/15">
                {moreNavItems.map((item) => {
                  const isActive = isNavItemActive(item, currentPath);
                  return (
                    <Link key={item.href} href={item.href} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition", isActive ? "bg-gradient-to-r from-quipsly-peacock-700 to-quipsly-fern-600 text-[#fff7e8]" : "text-quipsly-muted hover:bg-quipsly-surface-muted")}>
                      <item.icon className={cn("h-4 w-4", isActive ? "text-quipsly-brass-100" : "text-quipsly-peacock-700")} />
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
            className="hidden rounded-full border border-quipsly-divider bg-quipsly-surface px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-quipsly-peacock-700 shadow-sm transition hover:border-quipsly-brass-400/50 hover:bg-quipsly-surface-muted lg:inline-flex"
          >
            Get support
          </a>
          <Link href="/settings" className="relative hidden rounded-full p-2 text-quipsly-peacock-700 transition-colors hover:bg-quipsly-surface-muted hover:text-quipsly-ink md:block" aria-label="Settings">
            <Settings className="w-5 h-5" />
          </Link>
          <Link href="/find" className="relative rounded-full p-2 text-quipsly-peacock-700 transition-colors hover:bg-quipsly-surface-muted hover:text-quipsly-ink" aria-label="Search all Quipsly"><ScanSearch className="h-5 w-5" /></Link>
          <Link href="/work?view=attention" className="relative rounded-full p-2 text-quipsly-peacock-700 transition-colors hover:bg-quipsly-surface-muted hover:text-quipsly-ink" aria-label="Open attention queue"><BellRing className="h-5 w-5" /></Link>
          <AccountSwitcher currentUser={currentUser} currentPath={currentPath} />
        </div>
      </header>

      {/* Main Content */}
      <main className="relative min-h-0 flex-1 overflow-hidden bg-quipsly-canvas">
        {/* Soft sunlight glow background */}
        <div className="pointer-events-none absolute left-0 top-0 h-64 w-full bg-[radial-gradient(circle_at_22%_0%,rgba(80,112,63,0.18),transparent_42%),radial-gradient(circle_at_78%_0%,rgba(40,85,77,0.16),transparent_38%)] blur-[72px]" />

        <div className="h-full overflow-y-auto custom-scrollbar p-4 md:p-6 pb-24 md:pb-6">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-quipsly-divider bg-quipsly-surface/95 pb-safe backdrop-blur-md md:hidden">
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
                    ? "text-quipsly-peacock-700"
                    : "text-quipsly-muted hover:bg-quipsly-surface-muted/50 hover:text-quipsly-peacock-700"
                )}
              >
                <item.icon className={cn("h-5 w-5", isActive ? "text-quipsly-peacock-700" : "text-quipsly-muted")} />
                {item.name}
              </Link>
            );
          })}
          <details className="group relative h-full w-full">
            <summary className={cn("flex h-full w-full cursor-pointer list-none flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-semibold transition", isMoreActive || isNavItemActive(primaryNavItems[4], currentPath) ? "text-quipsly-peacock-700" : "text-quipsly-muted")}>
              <MoreHorizontal className="h-5 w-5" />
              More
            </summary>
            <nav aria-label="More mobile tools" className="absolute bottom-[4.5rem] right-0 grid w-[min(92vw,320px)] grid-cols-2 gap-1 rounded-2xl border border-quipsly-divider bg-quipsly-surface p-2 shadow-2xl shadow-amber-950/20">
              {[...primaryNavItems.slice(4), ...moreNavItems, { name: "Settings", href: "/settings", icon: Settings }].map((item) => {
                const isActive = isNavItemActive(item, currentPath);
                return (
                  <Link key={item.href} href={item.href} className={cn("flex items-center gap-2 rounded-xl px-3 py-3 text-xs font-bold", isActive ? "bg-gradient-to-r from-quipsly-peacock-700 to-quipsly-fern-600 text-[#fff7e8]" : "text-quipsly-muted hover:bg-quipsly-surface-muted")}>
                    <item.icon className={cn("h-4 w-4", isActive ? "text-quipsly-brass-100" : "text-quipsly-peacock-700")} />
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
  } | null;
  currentPath: string;
}) {
  const email = currentUser?.email || "";
  const avatar =
    currentUser?.image ||
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(email || "QuipslyUser")}`;

  const router = useRouter();

  async function signOut() {
    await fetch("/api/auth/session", { method: "DELETE" });
    await firebaseSignOut(auth);
    router.push("/");
    router.refresh();
  }

  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-quipsly-divider bg-quipsly-surface px-2 py-1 shadow-sm transition hover:bg-quipsly-surface-muted">
        <span className="h-8 w-8 overflow-hidden rounded-full border border-quipsly-surface bg-quipsly-surface-muted">
          <img src={avatar} alt="" className="h-full w-full object-cover" />
        </span>
        <span className="hidden max-w-[150px] truncate text-left text-xs font-bold leading-tight text-quipsly-ink xl:block">
          {currentUser?.name || email || "Account"}
          <span className="block truncate text-[10px] font-semibold text-quipsly-muted">
            {email || "Choose user"}
          </span>
        </span>
        <ChevronDown className="hidden h-4 w-4 text-quipsly-muted transition group-open:rotate-180 md:block" />
      </summary>

      <div className="absolute right-0 top-12 z-50 w-[320px] rounded-3xl border border-quipsly-divider bg-quipsly-surface p-4 text-quipsly-ink shadow-2xl shadow-amber-950/20">
        <div className="flex items-start gap-3">
          <span className="h-11 w-11 overflow-hidden rounded-2xl border border-quipsly-surface bg-quipsly-surface-muted shadow-sm">
            <img src={avatar} alt="" className="h-full w-full object-cover" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-serif text-lg font-black">
              {currentUser?.name || "Signed-in user"}
            </p>
            <p className="break-all text-xs font-bold text-quipsly-muted">
              {email || "No email in session"}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {currentUser?.isStaff ? (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-emerald-800">
                  Staff
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-2">
          <Link
            href={`/account/switch?callbackUrl=${encodeURIComponent(currentPath || "/projects")}`}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-quipsly-peacock-700 to-quipsly-fern-600 px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-[#fff7e8] transition hover:saturate-125"
          >
            <UserRound className="h-4 w-4" />
            Switch account
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-quipsly-divider bg-quipsly-surface px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-quipsly-muted transition hover:bg-quipsly-surface-muted"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>
    </details>
  );
}
