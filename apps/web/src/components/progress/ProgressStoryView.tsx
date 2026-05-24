import {
  BookOpenText,
  Clock3,
  FileText,
  GitCommitHorizontal,
  LinkIcon,
  Radio,
  Rocket,
} from "lucide-react";

import GlassPanel from "@/components/ui/GlassPanel";
import PageEyebrow from "@/components/ui/PageEyebrow";
import type {
  TeamProgressEntry,
  TeamProgressStory,
} from "@/lib/server/team-progress";

type ProgressStoryViewProps = {
  notice: string;
  noticeLabel?: string;
  story: TeamProgressStory;
};

const formatDate = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

function formatEntryDate(value: string) {
  const date = new Date(`${value}T12:00:00.000Z`);
  return formatDate.format(date);
}

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function entryHref(href: string) {
  if (href.startsWith("http://") || href.startsWith("https://")) {
    return href;
  }

  if (href.startsWith("/")) {
    return href;
  }

  return `https://github.com/CharlieLSparrow/high-ground-studio/blob/main/${href}`;
}

function ProgressEntryCard({
  entry,
  index,
}: {
  entry: TeamProgressEntry;
  index: number;
}) {
  const isLatest = index === 0;

  return (
    <article className="grid gap-5 rounded-[24px] border border-white/10 bg-white/8 p-5 text-[var(--text-light)] shadow-glass lg:grid-cols-[180px_minmax(0,1fr)]">
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-semibold text-[rgba(245,239,230,0.82)]">
          <Clock3 aria-hidden="true" className="h-3.5 w-3.5 text-[var(--accent)]" />
          <time dateTime={entry.date}>{formatEntryDate(entry.date)}</time>
        </div>

        {isLatest ? (
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1.5 text-xs font-semibold text-emerald-100">
            <Radio aria-hidden="true" className="h-3.5 w-3.5" />
            Latest
          </div>
        ) : null}

        <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
          <div className="mb-1 text-[11px] font-semibold uppercase text-[rgba(245,239,230,0.62)]">
            Mood
          </div>
          <div className="text-sm font-semibold text-[rgba(245,239,230,0.92)]">
            {entry.mood}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <PageEyebrow>{entry.kicker}</PageEyebrow>
        </div>

        <h2 className="m-0 text-[clamp(1.65rem,3vw,2.6rem)] leading-none text-[var(--text-light)]">
          {entry.title}
        </h2>

        <p className="mb-0 mt-4 text-[1rem] leading-7 text-[rgba(245,239,230,0.9)]">
          {entry.summary}
        </p>

        <div className="mt-5 space-y-4 text-sm leading-7 text-[rgba(245,239,230,0.82)]">
          {entry.body.map((paragraph) => (
            <p key={paragraph} className="m-0">
              {paragraph}
            </p>
          ))}
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(220px,320px)]">
          <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase text-[rgba(245,239,230,0.68)]">
              <GitCommitHorizontal
                aria-hidden="true"
                className="h-4 w-4 text-[var(--accent)]"
              />
              Commits
            </div>

            <div className="space-y-2">
              {entry.commits.map((commit) => (
                <div
                  key={`${entry.id}-${commit.sha}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
                >
                  <code className="rounded-full border border-white/10 bg-white/6 px-2 py-1 text-xs text-[rgba(245,239,230,0.86)]">
                    {commit.sha}
                  </code>
                  <span className="text-[rgba(245,239,230,0.78)]">
                    {commit.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase text-[rgba(245,239,230,0.68)]">
              <LinkIcon
                aria-hidden="true"
                className="h-4 w-4 text-[var(--accent)]"
              />
              Trail
            </div>

            <div className="flex flex-wrap gap-2">
              {entry.links.map((link) => (
                <a
                  key={`${entry.id}-${link.href}`}
                  href={entryHref(link.href)}
                  className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs font-semibold text-[rgba(245,239,230,0.86)] no-underline transition hover:border-[rgba(255,122,24,0.35)] hover:text-[var(--accent)]"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {entry.tags.map((tag) => (
            <span
              key={`${entry.id}-${tag}`}
              className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-[11px] font-semibold uppercase text-[rgba(245,239,230,0.7)]"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}

export default function ProgressStoryView({
  notice,
  noticeLabel = "Build Note",
  story,
}: ProgressStoryViewProps) {
  const entryCount = story.entries.length;
  const commitCount = story.entries.reduce(
    (total, entry) => total + entry.commits.length,
    0,
  );

  return (
    <section className="space-y-8">
      <GlassPanel className="p-6 text-[var(--text-light)]">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <PageEyebrow>Progress</PageEyebrow>
          <PageEyebrow>Story Log</PageEyebrow>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-start">
          <div>
            <h2 className="m-0 max-w-[820px] text-[clamp(2rem,4vw,3.4rem)] leading-none text-[var(--text-light)]">
              The build journal
            </h2>
            <p className="mb-0 mt-4 max-w-[780px] text-[1rem] leading-7 text-[rgba(245,239,230,0.88)]">
              {story.intro}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-[rgba(245,239,230,0.66)]">
                <BookOpenText
                  aria-hidden="true"
                  className="h-4 w-4 text-[var(--accent)]"
                />
                Entries
              </div>
              <div className="text-2xl font-semibold text-[var(--text-light)]">
                {entryCount}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-[rgba(245,239,230,0.66)]">
                <GitCommitHorizontal
                  aria-hidden="true"
                  className="h-4 w-4 text-[var(--accent)]"
                />
                Commits
              </div>
              <div className="text-2xl font-semibold text-[var(--text-light)]">
                {commitCount}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-[rgba(245,239,230,0.66)]">
                <Rocket
                  aria-hidden="true"
                  className="h-4 w-4 text-[var(--accent)]"
                />
                Updated
              </div>
              <div className="text-sm font-semibold leading-6 text-[var(--text-light)]">
                {formatUpdatedAt(story.updatedAt)}
              </div>
            </div>
          </div>
        </div>
      </GlassPanel>

      <div className="rounded-2xl border border-amber-200/20 bg-amber-200/10 px-4 py-3 text-sm leading-6 text-amber-50">
        <div className="flex gap-3">
          <FileText
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 flex-none text-amber-100"
          />
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-100/80">
              {noticeLabel}
            </div>
            <p className="m-0">{notice}</p>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {story.entries.map((entry, index) => (
          <ProgressEntryCard key={entry.id} entry={entry} index={index} />
        ))}
      </div>
    </section>
  );
}
