import Link from "next/link";
import {
  Archive,
  Compass,
  Database,
  Feather,
  FileSearch,
  ListChecks,
  ScrollText,
  UserRound,
} from "lucide-react";

import { PageCompanions } from "./PageCompanions";

export function BrandLockup() {
  return (
    <Link className="brand-lockup" href="/" aria-label="QuipLore home">
      <span className="brand-mark" aria-hidden="true">
        <Feather size={22} />
      </span>
      <span>QuipLore</span>
    </Link>
  );
}

export function AppShell({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="app-nav" aria-label="QuipLore navigation">
        <div>
          <BrandLockup />
          <p className="nav-kicker">Discovery, curation, and source memory.</p>
        </div>

        <nav className="nav-section" aria-label="Primary">
          <span className="nav-label">Explore</span>
          <Link className="nav-link" href="/" title="Open QuipStream">
            <Compass size={17} aria-hidden="true" />
            <span>QuipStream</span>
          </Link>
          <Link
            className="nav-link"
            href="/quotes/imagination-more-important-than-knowledge"
            title="Open a Quote Passport"
          >
            <ScrollText size={17} aria-hidden="true" />
            <span>Passport</span>
          </Link>
          <Link
            className="nav-link"
            href="/people/albert-einstein"
            title="Open a quotable person page"
          >
            <UserRound size={17} aria-hidden="true" />
            <span>Person</span>
          </Link>
          <Link
            className="nav-link"
            href="/lorelists/curiosity-without-cliche"
            title="Open a Lorelist"
          >
            <ListChecks size={17} aria-hidden="true" />
            <span>Lorelist</span>
          </Link>
        </nav>

        <nav className="nav-section" aria-label="Platform">
          <span className="nav-label">Quipsly</span>
          <Link className="nav-link" href="/stream" title="Open full stream">
            <Archive size={17} aria-hidden="true" />
            <span>Full Stream</span>
          </Link>
          <Link
            className="nav-link"
            href="/research"
            title="Open Quipsly Research Desk"
          >
            <FileSearch size={17} aria-hidden="true" />
            <span>Research</span>
          </Link>
          <Link
            className="nav-link"
            href="/api"
            title="Open Quipsly API Explorer"
          >
            <Database size={17} aria-hidden="true" />
            <span>API Explorer</span>
          </Link>
        </nav>

        <p className="nav-note">
          Prototype state is local to this browser session. No account, database,
          or cloud resource is touched in this build.
        </p>
      </aside>
      <main className="main-canvas">
        <PageCompanions />
        {children}
      </main>
    </div>
  );
}
