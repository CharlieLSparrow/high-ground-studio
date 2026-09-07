"use client";

import Link from "next/link";
import { CollaborationThread } from "@/components/session-thread";

type WorkspaceClientProps = {
  projectSlug: string;
  projectName: string;
  canPost: boolean;
};

export function WorkspaceClient({ projectSlug, projectName, canPost }: WorkspaceClientProps) {
  const base = `/nests/${encodeURIComponent(projectSlug)}`;
  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <CollaborationThread
        projectSlug={projectSlug}
        threadKey="default"
        collaborationTitle={projectName}
        heading="Conversation"
        scopeLabel={projectName}
        scopeDescription="A shared conversation for everyone with access to this Nest. Keep client conversations in their private client spaces."
        canPost={canPost}
      />
      <aside aria-label="Work in this Nest" className="space-y-3">
        <h2 className="font-semibold text-foreground">Work in this Nest</h2>
        <p className="text-sm text-muted-foreground">Your conversation and work belong to the same place.</p>
        {[
          ["Notes", "notes"],
          ["Tasks and goals", "work"],
          ["Sessions", "sessions"],
          ["Media", "media"],
        ].map(([label, view]) => (
          <Link key={view} href={`${base}?view=${view}`} className="flex min-h-12 items-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-card-foreground hover:bg-accent">{label}</Link>
        ))}
        <Link href={`${base}/settings`} className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline">Nest settings</Link>
      </aside>
    </div>
  );
}
