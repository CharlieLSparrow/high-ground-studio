"use client";

import Link from "next/link";
import {
  CalendarDays,
  ClipboardList,
  Clock3,
  Plus,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";

const coachItems: ReadonlyArray<{
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}> = [
  { href: "/coaching", label: "Today", icon: Clock3, exact: true },
  {
    href: "/coaching/engagements",
    label: "Clients",
    icon: UsersRound,
  },
  { href: "/coaching/sessions", label: "Sessions", icon: CalendarDays },
  { href: "/coaching/forms", label: "Forms", icon: ClipboardList },
];

const clientItems = coachItems
  .filter((item) => item.label !== "Clients")
  .map((item) =>
    item.label === "Sessions" ? { ...item, label: "My sessions" } : item,
  );

export function CoachingSuiteNav({ canSchedule }: { canSchedule: boolean }) {
  const pathname = usePathname();
  const items = canSchedule ? coachItems : clientItems;

  return (
    <nav
      aria-label="Coaching"
      className="sticky top-0 z-30 border-b border-[#e5d8c0] bg-[#fffdf8]/95 px-3 py-2 shadow-[0_1px_0_rgba(91,71,47,0.04)] backdrop-blur sm:px-6"
    >
      <div className="mx-auto flex max-w-[92rem] items-center gap-2">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto" role="list">
          {items.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`${canSchedule && ["Sessions", "Forms"].includes(item.label) ? "hidden sm:inline-flex" : "inline-flex"} min-h-11 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-black transition sm:px-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5f8380] ${
                  active
                    ? "bg-[#dfe9da] text-[#294332] shadow-[inset_0_0_0_1px_rgba(79,111,82,0.12)]"
                    : "text-[#6f5a3f] hover:bg-[#f4ecdd] hover:text-[#3d3122]"
                }`}
              >
                <Icon size={16} aria-hidden="true" /> {item.label}
              </Link>
            );
          })}
        </div>
        {canSchedule ? (
          <Link
            href="/coaching#create-appointment"
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-[#4f6f52] px-4 text-sm font-black text-white shadow-sm transition hover:bg-[#3f5c43] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5f8380]"
          >
            <Plus size={16} aria-hidden="true" />
            <span className="hidden sm:inline">New session</span>
            <span className="sm:hidden">New</span>
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
