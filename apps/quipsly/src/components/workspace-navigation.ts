export type WorkspaceSectionId = "home" | "sessions" | "nests" | "notes" | "account";

export type WorkspaceDestination = { label: string; href: string };
export type WorkspaceSection = WorkspaceDestination & {
  id: WorkspaceSectionId;
  paths: readonly string[];
  destinations: readonly WorkspaceDestination[];
};

export const workspaceSections: readonly WorkspaceSection[] = [
  {
    id: "home", label: "Home", href: "/today",
    paths: ["/today", "/inbox", "/work", "/schedule", "/find"],
    destinations: [
      { label: "Today", href: "/today" },
      { label: "Inbox", href: "/inbox" },
      { label: "Tasks & goals", href: "/work" },
      { label: "Calendar", href: "/schedule" },
    ],
  },
  {
    id: "sessions", label: "Sessions", href: "/coaching/sessions",
    paths: ["/coaching", "/sessions"],
    destinations: [
      { label: "All sessions", href: "/coaching/sessions" },
      { label: "Coaching", href: "/coaching" },
      { label: "Calendar", href: "/schedule" },
    ],
  },
  {
    id: "nests", label: "Nests", href: "/projects",
    paths: ["/projects", "/nests", "/podcast", "/recorder", "/editor", "/audio", "/media", "/asset-manager", "/storyboards", "/publishing", "/outputs", "/content-studio", "/art-foundry"],
    destinations: [
      { label: "Your nests", href: "/projects" },
      { label: "Podcasts", href: "/podcast" },
      { label: "Media", href: "/media" },
      { label: "Publishing", href: "/publishing" },
    ],
  },
  {
    id: "notes", label: "Notes", href: "/library",
    paths: ["/library", "/notes", "/writing", "/create", "/write", "/research", "/collections", "/notebooks", "/read", "/manuscript", "/structure"],
    destinations: [
      { label: "All notes & sources", href: "/library" },
      { label: "Research", href: "/research" },
      { label: "Collections", href: "/collections" },
    ],
  },
  {
    id: "account", label: "Account", href: "/settings",
    paths: ["/settings", "/account", "/admin", "/beta-readiness"],
    destinations: [{ label: "Settings", href: "/settings" }],
  },
];

export function pathIsWithin(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

export function isClientSpacePath(pathname: string): boolean {
  return /^\/coaching\/engagements\/[^/]+(?:\/|$)/.test(pathname);
}

export function workspaceSectionForPath(pathname: string): WorkspaceSection {
  return workspaceSections.find((section) => section.paths.some((root) => pathIsWithin(pathname, root)))
    ?? workspaceSections[0];
}
