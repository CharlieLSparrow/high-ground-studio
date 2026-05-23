import { StudioAccessShell } from "../studio-access-shell";
import { StudioNav } from "../studio-nav";
import {
  cardClassName,
  cn,
  labelClassName,
  monoMetaClassName,
  panelClassName,
  panelCopyClassName,
  panelTitleClassName,
  StudioChip,
  StudioGlyph,
} from "../studio-ui";
import { getStudioAccessState } from "@/lib/server/studio-access";

export const dynamic = "force-dynamic";

type StudioCapability = {
  id: string;
  title: string;
  lane: string;
  status: "live" | "prototype" | "planned";
  summary: string;
  next: string;
};

type StudioSpineStage = {
  title: string;
  focus: string;
  surfaces: string[];
};

const capabilityTone: Record<
  StudioCapability["status"],
  "tag" | "source" | "review"
> = {
  live: "tag",
  planned: "review",
  prototype: "source",
};

const spine: StudioSpineStage[] = [
  {
    title: "Research",
    focus: "sources, quotes, examples, principle maps, and Quipsly context",
    surfaces: ["Tagging Desk", "Research assistant", "Quote database"],
  },
  {
    title: "Structure",
    focus: "book chapters, talks, episodes, campaigns, and reusable outlines",
    surfaces: ["Structure Mode", "Writing Desk", "Manuscript Desk"],
  },
  {
    title: "Produce",
    focus: "drafts, scripts, recording prep, audio/video edits, and review packets",
    surfaces: ["Manuscript Desk", "Show Prep", "Studio exports"],
  },
  {
    title: "Publish",
    focus: "site projections, social posts, schedules, direct publishing, and embeds",
    surfaces: ["HGO staging", "Content calendar", "WorldHub embeds"],
  },
  {
    title: "Learn",
    focus: "analytics, SEO, marketing loops, supporter signals, and coaching follow-up",
    surfaces: ["WorldHub", "Analytics", "Campaign review"],
  },
];

const capabilities: StudioCapability[] = [
  {
    id: "book-writing",
    title: "Book Writing",
    lane: "Writing",
    status: "live",
    summary:
      "Learning to Lead drafts, manuscript snapshots, structure regions, and export handoff.",
    next: "Turn manuscript exports into staged content project packets.",
  },
  {
    id: "speech-writing",
    title: "Speech Writing",
    lane: "Writing",
    status: "prototype",
    summary:
      "Reuse the same source, structure, quote, and example model for talks and scripts.",
    next: "Add talk-shaped project templates beside book-shaped templates.",
  },
  {
    id: "podcast-production",
    title: "Podcast Audio / Video",
    lane: "Production",
    status: "prototype",
    summary:
      "Connect show prep, source clips, talking points, and episode projection review.",
    next: "Create a production checklist model before media editing integrations.",
  },
  {
    id: "travel-video",
    title: "Travel Video",
    lane: "Production",
    status: "planned",
    summary:
      "Plan footage, story arcs, voiceover, edit notes, publishing targets, and follow-up posts.",
    next: "Define a lightweight asset and shot-list contract.",
  },
  {
    id: "social-schedule",
    title: "Social Schedule",
    lane: "Distribution",
    status: "planned",
    summary:
      "Turn long-form work into platform-specific excerpts, captions, and posting windows.",
    next: "Model content calendar items without calling social APIs.",
  },
  {
    id: "analytics-seo",
    title: "Analytics / SEO",
    lane: "Marketing",
    status: "planned",
    summary:
      "Track search intent, page outcomes, content gaps, campaigns, and audience signals.",
    next: "Start with manual metrics snapshots and SEO briefs.",
  },
  {
    id: "quipsly-ai",
    title: "Quipsly AI",
    lane: "Research",
    status: "planned",
    summary:
      "Use quote, principle, example, and research context as agent inputs instead of loose chat.",
    next: "Define agent task packets before connecting live APIs.",
  },
  {
    id: "direct-publishing",
    title: "Kindle / Audible Path",
    lane: "Publishing",
    status: "planned",
    summary:
      "Prepare future package exports for book, audio, metadata, description, and review assets.",
    next: "Document export package requirements before provider automation.",
  },
  {
    id: "worldhub-follow-through",
    title: "WorldHub Follow-through",
    lane: "Business",
    status: "prototype",
    summary:
      "Connect finished content to coaching offers, memberships, merch, Patreon, and embeds.",
    next: "Keep provider adapters out until entitlements and offers are stable.",
  },
];

const guardrails = [
  "No provider publishing calls",
  "No social account credentials",
  "No payment providers",
  "No production schema mutation",
  "No public manuscript exposure",
];

export default async function StudioContentStudioPage() {
  const access = await getStudioAccessState();

  if (!access.isSignedIn) {
    return <StudioAccessShell mode="signed-out" redirectTo="/content-studio" />;
  }

  if (!access.canAccess) {
    return (
      <StudioAccessShell
        mode="denied"
        email={access.actorLabel || undefined}
        roles={access.roles}
        redirectTo="/content-studio"
      />
    );
  }

  return (
    <main className="min-h-screen px-3.5 py-4 md:px-6 md:py-6">
      <div className="mx-auto grid w-full max-w-[1220px] gap-4">
        <header
          className={cn(
            panelClassName,
            "grid gap-4 p-5 md:grid-cols-[1fr_auto]",
          )}
        >
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <StudioGlyph />
              <div>
                <p className={labelClassName}>Content Management Studio</p>
                <h1 className="m-0 max-w-[900px] text-[clamp(2rem,4vw,3.5rem)] leading-[0.96] tracking-normal text-studio-ink">
                  One spine for research, writing, production, publishing, and
                  business follow-through.
                </h1>
              </div>
            </div>
            <p className="m-0 max-w-[840px] text-[0.98rem] leading-relaxed text-studio-muted">
              The near-term Studio goal is a working internal command surface
              for books, speeches, podcasts, video, social schedules,
              analytics, SEO, marketing, Quipsly-assisted research, and
              WorldHub-powered offers.
            </p>
          </div>

          <div className="self-start">
            <StudioNav />
          </div>
        </header>

        <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className={cn(panelClassName, "grid gap-4")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className={labelClassName}>Production Spine</p>
                <h2 className={panelTitleClassName}>Idea to audience loop</h2>
              </div>
              <StudioChip tone="tag">Homer-ready path</StudioChip>
            </div>

            <div className="grid gap-3 lg:grid-cols-5">
              {spine.map((stage, index) => (
                <article
                  className={cn(cardClassName, "grid min-h-[238px] gap-3 p-3")}
                  key={stage.title}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-black text-studio-dim">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <StudioChip tone={index < 3 ? "tag" : "review"}>
                      {index < 3 ? "active" : "future"}
                    </StudioChip>
                  </div>
                  <div>
                    <h3 className="m-0 text-[1.05rem] leading-tight text-studio-ink">
                      {stage.title}
                    </h3>
                    <p className={panelCopyClassName}>{stage.focus}</p>
                  </div>
                  <div className="mt-auto grid gap-1.5">
                    {stage.surfaces.map((surface) => (
                      <span className={monoMetaClassName} key={surface}>
                        {surface}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>

          <aside className={cn(panelClassName, "grid content-start gap-4")}>
            <div>
              <p className={labelClassName}>Release Guardrails</p>
              <h2 className={panelTitleClassName}>Fast, reversible, private</h2>
              <p className={panelCopyClassName}>
                This shell is static planning state. It does not change
                persistence, credentials, public publishing, or provider
                behavior.
              </p>
            </div>

            <div className="grid gap-2">
              {guardrails.map((guardrail) => (
                <div
                  className="rounded-lg border border-studio-line bg-black/15 px-3 py-2 text-sm font-bold text-studio-muted"
                  key={guardrail}
                >
                  {guardrail}
                </div>
              ))}
            </div>
          </aside>
        </section>

        <section className={cn(panelClassName, "grid gap-4")}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className={labelClassName}>Capability Map</p>
              <h2 className={panelTitleClassName}>What attaches to the spine</h2>
            </div>
            <StudioChip tone="source">{capabilities.length} tracked lanes</StudioChip>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {capabilities.map((capability) => (
              <article
                className={cn(cardClassName, "grid min-h-[260px] gap-3 p-4")}
                key={capability.id}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StudioChip tone={capabilityTone[capability.status]}>
                    {capability.status}
                  </StudioChip>
                  <span className="font-mono text-[0.72rem] font-bold uppercase text-studio-dim">
                    {capability.lane}
                  </span>
                </div>

                <div>
                  <h3 className="m-0 text-[1.15rem] leading-tight text-studio-ink">
                    {capability.title}
                  </h3>
                  <p className={panelCopyClassName}>{capability.summary}</p>
                </div>

                <div className="mt-auto border-t border-studio-line pt-3">
                  <p className={labelClassName}>Next Slice</p>
                  <p className="m-0 mt-2 text-sm leading-relaxed text-studio-muted">
                    {capability.next}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
