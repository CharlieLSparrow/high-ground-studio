"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn, labelClassName } from "./studio-ui";

const activeLinkClassName =
  "border-studio-tag/60 bg-studio-tag/15 text-studio-tag";

const inactiveLinkClassName =
  "border-studio-line-strong bg-studio-ink/5 text-studio-ink hover:border-studio-tag/55 hover:bg-studio-tag/10 hover:text-studio-tag";

const disabledLinkClassName =
  "cursor-not-allowed border-studio-line bg-black/15 text-studio-dim";

const linkBaseClassName =
  "inline-flex min-h-9 items-center justify-center rounded-lg border px-3 py-1.5 text-[0.78rem] font-black";

const primaryLinks = [
  {
    href: "/content-studio",
    label: "Content Studio",
  },
  {
    href: "/",
    label: "Tagging Desk",
  },
  {
    href: "/write",
    label: "Writing Desk",
  },
  {
    href: "/structure",
    label: "Structure Mode",
  },
  {
    href: "/manuscript",
    label: "Manuscript Desk",
  },
  {
    href: "/content-studio",
    label: "Content Studio",
  },
];

const futureLinks = ["Projections", "Sources"];

export function StudioNav() {
  const pathname = usePathname();

  return (
    <nav
      className="grid min-w-[min(100%,420px)] gap-2 rounded-lg border border-studio-line bg-black/10 p-2"
      aria-label="Studio navigation"
    >
      <div className="flex items-center justify-between gap-3">
        <p className={labelClassName}>Studio</p>
        <span className="font-mono text-[0.72rem] leading-tight text-studio-dim">
          private
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {primaryLinks.map((link) => {
          const isActive = pathname === link.href;

          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={cn(
                linkBaseClassName,
                isActive ? activeLinkClassName : inactiveLinkClassName,
              )}
              href={link.href}
              key={link.href}
            >
              {link.label}
            </Link>
          );
        })}

        {futureLinks.map((label) => (
          <span
            aria-disabled="true"
            className={cn(linkBaseClassName, disabledLinkClassName)}
            key={label}
          >
            {label}
          </span>
        ))}
      </div>
    </nav>
  );
}
