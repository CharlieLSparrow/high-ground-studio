"use client";

import { Suspense, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut as firebaseSignOut } from "firebase/auth";
import { Home, CalendarDays, FolderOpen, NotebookPen, UserRound, Search, Plus, Mic, FilePlus2, LogOut, Settings, LifeBuoy, LoaderCircle, type LucideIcon } from "lucide-react";
import { auth } from "@/lib/firebase/firebase";
import { cn } from "@/app/(app)/studio-ui";
import { NestChatPanel } from "@/components/NestChatPanel";
import { WorkspaceMenu } from "./WorkspaceMenu";
import { createPersonalNote } from "./workspace-create-actions";
import { workspaceSections, workspaceSectionForPath, type WorkspaceSectionId, type WorkspaceDestination } from "./workspace-navigation";

type CurrentUser = { email: string; name: string | null; image: string | null; isStaff: boolean };
const icons: Record<WorkspaceSectionId, LucideIcon> = { home: Home, sessions: CalendarDays, nests: FolderOpen, notes: NotebookPen, account: UserRound };
const menuClass = "absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-quipsly-divider bg-quipsly-surface p-2 text-quipsly-ink shadow-xl";
const menuItemClass = "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium hover:bg-quipsly-surface-muted focus-visible:outline-2 focus-visible:outline-quipsly-peacock-700";

export function SidebarLayout({ children, showPlatformAdminTools = false, showSupportTools = false, showProductOperations = false, currentUser = null }: {
  children: React.ReactNode;
  showPlatformAdminTools?: boolean;
  showSupportTools?: boolean;
  showProductOperations?: boolean;
  currentUser?: CurrentUser | null;
}) {
  const currentPath = usePathname() || "/today";
  const section = workspaceSectionForPath(currentPath);
  const operationalLinks: WorkspaceDestination[] = [
    ...(showSupportTools ? [{ label: "Customer support", href: "/admin/support" }] : []),
    ...(showProductOperations ? [{ label: "Product operations", href: "/admin/product-ops" }] : []),
    ...(showPlatformAdminTools ? [
      { label: "Users", href: "/admin/users" },
      { label: "Release health", href: "/beta-readiness" },
      { label: "Account deletion", href: "/admin/account-deletion" },
    ] : []),
  ];

  return <div className="flex h-dvh min-w-0 w-full flex-col overflow-hidden bg-quipsly-canvas font-sans text-quipsly-ink">
    <a href="#workspace-content" className="sr-only z-[100] rounded-lg bg-quipsly-surface p-3 focus:not-sr-only focus:absolute focus:left-4 focus:top-4">Skip to content</a>
    <header className="relative z-40 flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-quipsly-divider bg-quipsly-surface px-4 lg:px-6">
      <Link href="/today" aria-label="Quipsly home" className="flex shrink-0 items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-quipsly-peacock-700">
        <img src="/quipsly-app-icon.png" alt="" className="h-9 w-9 rounded-xl object-cover" />
        <span className="hidden font-serif text-xl font-bold sm:block">Quipsly</span>
      </Link>
      <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary workspace">
        {workspaceSections.map((item) => {
          const Icon = icons[item.id];
          return <Link key={item.id} href={item.href} aria-current={section.id === item.id ? "page" : undefined}
            className={cn("flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-quipsly-peacock-700", section.id === item.id ? "bg-quipsly-surface-muted text-quipsly-ink" : "text-quipsly-muted hover:bg-quipsly-surface-muted")}>
            <Icon className="h-4 w-4" aria-hidden="true" />{item.label}
          </Link>;
        })}
      </nav>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
        <Link href="/find" aria-label="Search Quipsly" className="flex h-11 w-11 items-center justify-center rounded-xl text-quipsly-muted hover:bg-quipsly-surface-muted focus-visible:outline-2 focus-visible:outline-quipsly-peacock-700"><Search className="h-5 w-5" aria-hidden="true" /></Link>
        <CreateMenu />
        <AccountMenu currentUser={currentUser} currentPath={currentPath} operationalLinks={operationalLinks} />
      </div>
    </header>

    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <nav aria-label={`${section.label} tools`} className="flex min-h-12 shrink-0 items-center gap-1 overflow-x-auto border-b border-quipsly-divider bg-quipsly-surface/60 px-4 lg:px-6">
        {section.destinations.map((item) => <Link key={item.href} href={item.href} aria-current={currentPath === item.href ? "page" : undefined}
          className={cn("flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm focus-visible:outline-2 focus-visible:outline-quipsly-peacock-700", currentPath === item.href ? "font-semibold text-quipsly-ink underline decoration-quipsly-peacock-700 decoration-2 underline-offset-8" : "text-quipsly-muted hover:text-quipsly-ink")}>
          {item.label}
        </Link>)}
      </nav>
      <main id="workspace-content" tabIndex={-1} className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-x-none p-4 pb-8 outline-none lg:p-6">
        {children}
      </main>
    </div>

    <nav aria-label="Mobile workspace" className="z-40 shrink-0 border-t border-quipsly-divider bg-quipsly-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className="grid min-h-16 grid-cols-5">
        {workspaceSections.map((item) => {
          const Icon = icons[item.id];
          return <Link key={item.id} href={item.href} aria-current={section.id === item.id ? "page" : undefined}
            className={cn("flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 text-xs font-medium focus-visible:outline-2 focus-visible:outline-quipsly-peacock-700", section.id === item.id ? "text-quipsly-peacock-700" : "text-quipsly-muted")}>
            <span className={cn("rounded-xl px-4 py-1", section.id === item.id && "bg-quipsly-surface-muted")}><Icon className="h-5 w-5" aria-hidden="true" /></span>
            {item.label}
          </Link>;
        })}
      </div>
    </nav>
    <Suspense fallback={null}><NestChatPanel /></Suspense>
  </div>;
}

function CreateMenu() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return <WorkspaceMenu label="Create" trigger={<><Plus className="h-4 w-4" aria-hidden="true" /><span>Create</span></>}
    triggerClassName="bg-quipsly-peacock-700 px-3 text-sm font-semibold text-white hover:brightness-110">
    <div className={menuClass}>
      <button type="button" disabled={pending} className={`${menuItemClass} disabled:opacity-60`} onClick={() => {
        setError(null);
        startTransition(async () => {
          try { const note = await createPersonalNote(); router.push(note.href); }
          catch { setError("We couldn't create your note. Try again."); }
        });
      }}>{pending ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> : <FilePlus2 className="h-5 w-5" aria-hidden="true" />}<span>{pending ? "Creating note…" : "New note"}<span className="block text-xs font-normal text-quipsly-muted">In your home nest</span></span></button>
      {error && <p role="alert" className="px-3 py-2 text-sm text-quipsly-ink">{error}</p>}
      <Link href="https://quipsly.com/open/capture/write" className={menuItemClass}><Mic className="h-5 w-5" aria-hidden="true" /><span>Speak to write<span className="block text-xs font-normal text-quipsly-muted">Open Quipsly Capture</span></span></Link>
      <Link href="/coaching/sessions" className={menuItemClass}><CalendarDays className="h-5 w-5" aria-hidden="true" />New session</Link>
      <Link href="/projects" className={menuItemClass}><FolderOpen className="h-5 w-5" aria-hidden="true" />New nest</Link>
    </div>
  </WorkspaceMenu>;
}

function AccountMenu({ currentUser, currentPath, operationalLinks }: { currentUser: CurrentUser | null; currentPath: string; operationalLinks: WorkspaceDestination[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const displayName = currentUser?.name || currentUser?.email || "Account";
  const initials = displayName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  async function signOut() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/session", { method: "DELETE" });
      if (!response.ok) throw new Error("Session sign out failed");
      await firebaseSignOut(auth);
      router.push("/");
      router.refresh();
    } catch {
      setError("We couldn't sign you out. Please try again.");
      setBusy(false);
    }
  }
  return <WorkspaceMenu label="Your account" triggerClassName="h-11 w-11 rounded-full border border-quipsly-divider bg-quipsly-surface-muted" trigger={
    currentUser?.image ? <img src={currentUser.image} alt="" className="h-9 w-9 rounded-full object-cover" /> : <span className="text-sm font-semibold">{initials}</span>
  }>
    <div className={`${menuClass} max-h-[calc(100dvh-10rem)] overflow-y-auto`}>
      <div className="border-b border-quipsly-divider px-3 py-3"><p className="truncate font-semibold">{displayName}</p><p className="break-all text-xs text-quipsly-muted">{currentUser?.email}</p></div>
      <Link href="/settings" className={menuItemClass}><Settings className="h-4 w-4" aria-hidden="true" />Account settings</Link>
      <a href="https://quipsly.com/support" className={menuItemClass}><LifeBuoy className="h-4 w-4" aria-hidden="true" />Get support</a>
      {operationalLinks.length > 0 && <nav aria-label="Administration" className="my-2 border-y border-quipsly-divider py-2">{operationalLinks.map((item) => <Link key={item.href} href={item.href} className={menuItemClass}>{item.label}</Link>)}</nav>}
      <Link href={`/account/switch?callbackUrl=${encodeURIComponent(currentPath)}`} className={menuItemClass}><UserRound className="h-4 w-4" aria-hidden="true" />Switch account</Link>
      <button type="button" disabled={busy} onClick={signOut} className={`${menuItemClass} disabled:opacity-60`}><LogOut className="h-4 w-4" aria-hidden="true" />{busy ? "Signing out…" : "Sign out"}</button>
      {error && <p role="alert" className="px-3 py-2 text-sm">{error}</p>}
    </div>
  </WorkspaceMenu>;
}
