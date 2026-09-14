import Link from "next/link";
import { ArrowUpRight, Users } from "lucide-react";
import type { SharedClientSpaceList } from "@/lib/server/shared-client-spaces";

export function SharedClientSpaces({ result, unavailable = false }: { result: SharedClientSpaceList; unavailable?: boolean }) {
  if (!unavailable && !result.spaces.length) return null;
  return <section aria-labelledby="shared-client-spaces-heading" className="mb-8">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 id="shared-client-spaces-heading" className="font-serif text-2xl font-semibold text-foreground">Coaching spaces</h2>
        <p className="mt-1 text-sm text-muted-foreground">Your conversations, sessions, notes, and next steps together.</p>
      </div>
      {result.hasMore && <Link href="/coaching/engagements" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">View all coaching spaces</Link>}
    </div>
    {unavailable ? <div role="status" className="rounded-2xl border border-border bg-card p-5 text-foreground">
      <p>Couldn’t load your coaching spaces.</p>
      <Link href="/projects" className="mt-2 inline-flex min-h-11 items-center font-semibold text-primary hover:underline">Try again</Link>
    </div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {result.spaces.map(space => <Link key={space.id} href={space.href} aria-label={`Open ${space.title}`}
        className="group flex min-w-0 items-start justify-between gap-4 rounded-2xl border border-border bg-card p-5 text-foreground shadow-sm transition hover:bg-accent">
        <div className="min-w-0">
          <h3 className="font-serif text-xl font-semibold [overflow-wrap:anywhere]">{space.title}</h3>
          <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground"><Users aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="[overflow-wrap:anywhere]">{space.people.length ? `With ${space.people.join(", ")}` : "Ready for your next conversation"}</span></p>
        </div>
        <ArrowUpRight aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" />
      </Link>)}
    </div>}
  </section>;
}
