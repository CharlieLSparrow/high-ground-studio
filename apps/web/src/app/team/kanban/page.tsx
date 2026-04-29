import Link from "next/link";

import GlassPanel from "@/components/ui/GlassPanel";
import PageEyebrow from "@/components/ui/PageEyebrow";
import {
  getKanbanBoard,
  KANBAN_PRIORITIES,
  KANBAN_STATUSES,
  type KanbanCard,
  type KanbanStatus,
} from "@/lib/server/kanban";

import {
  createKanbanCardAction,
  updateKanbanStatusAction,
} from "./actions";

// What this file does:
// Renders the internal kanban board as a server component. It reads the board
// from the canonical JSON file, applies lightweight filters from the URL, and
// presents a form-based UI for adding cards and moving them between states.
//
// Why this matters:
// The page is intentionally just a view over file-backed state. No client-side
// sync engine. No shadow cache pretending to be the truth. If Charlie edits the
// JSON, this page should calmly reflect that reality rather than starting a
// philosophical argument.
//
// Best practice (the "textbook" version):
// Keep the read model close to the source of truth, especially for internal
// tools where debuggability matters more than front-end wizardry.
//
// What we are doing instead (and why):
// A server-rendered view over the canonical board file. This keeps the
// cognitive map short: file -> helper -> page. No extra state temple.
//
// Tradeoff:
// We gain honesty and ease of inspection.
// We sacrifice some snappy client-side interactivity.
//
// Question for Future Charlie:
// Why is this page so unapologetically server-first?
//
// Answer:
// Because the point is trustworthy planning, not an elaborate illusion of
// liveness. The UI should feel like a competent clerk, not Moist von Lipwig
// promising the post office can definitely outrun causality this time.
//
// What it looks like now:
// One server-rendered page, URL-based filters, form posts for mutation, and a
// small number of cards.
//
// What it turns into later:
// Potentially richer filtering, edit surfaces, or specialized views once the
// board becomes a daily operational tool instead of a careful planning wall.
//
// Signal to evolve it:
// When users want saved filters, multi-step edits, history, or card density
// that makes one long page groan like an overburdened shelf.
//
// Footnote:
// The board file is the royal archive. This page is the brass-framed window in
// the hallway. A nice window is useful. A window that claims to be the archive
// is how you wake up trapped in a fable about mirrors.
type SearchParams = Promise<{
  success?: string;
  error?: string;
  area?: string;
  tag?: string;
}>;

// Friendly labels and descriptions live here so the rendering code can stay
// focused on structure instead of turning into a thesaurus with hydration.
const statusLabels: Record<KanbanStatus, string> = {
  backlog: "Backlog",
  todo: "Todo",
  doing: "Doing",
  done: "Done",
};

const statusDescriptions: Record<KanbanStatus, string> = {
  backlog: "Ideas and decisions parked until there is room to act.",
  todo: "Ready enough to schedule without more architecture work first.",
  doing: "Active work underway right now.",
  done: "Completed work worth keeping visible for context.",
};

// Query-string feedback keeps the interaction cycle simple: submit, redirect,
// re-render with a visible result. No toast orchestra required.
//
// Right now, this is enough because there is one page and a tiny set of
// mutations.
// In a more mature system, a shared status/flash component might emerge.
function StatusMessage({
  success,
  error,
}: {
  success?: string;
  error?: string;
}) {
  if (!success && !error) {
    return null;
  }

  const isError = Boolean(error);
  const message = error ?? success ?? "";

  return (
    <div
      className={[
        "mb-6 rounded-2xl border px-4 py-3 text-sm font-medium",
        isError
          ? "border-red-400/25 bg-red-400/10 text-red-100"
          : "border-emerald-400/25 bg-emerald-400/10 text-emerald-100",
      ].join(" ")}
    >
      {message}
    </div>
  );
}

function buildFilterHref({
  area,
  tag,
}: {
  area?: string;
  tag?: string;
}) {
  const search = new URLSearchParams();

  if (area) {
    search.set("area", area);
  }

  if (tag) {
    search.set("tag", tag);
  }

  const query = search.toString();
  return query ? `/team/kanban?${query}` : "/team/kanban";
}

// Route URLs and external URLs are clickable. Plain repo paths stay visible as
// code because they are references, not navigation targets inside the app.
//
// Best practice (the "textbook" version):
// Preserve the semantics of the underlying data rather than flattening every
// reference into "a link is a link."
function renderLink(link: { label: string; href: string }) {
  const isRoute = link.href.startsWith("/");
  const isExternal = link.href.startsWith("http://") || link.href.startsWith("https://");

  if (isRoute || isExternal) {
    return (
      <Link
        href={link.href}
        className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs font-semibold text-[rgba(245,239,230,0.88)] no-underline transition hover:border-[rgba(255,122,24,0.35)] hover:text-[var(--accent)]"
      >
        {link.label}
      </Link>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/6 px-3 py-2 text-xs leading-5 text-[rgba(245,239,230,0.82)]">
      <div className="font-semibold text-[rgba(245,239,230,0.94)]">{link.label}</div>
      <code className="break-all text-[rgba(245,239,230,0.72)]">{link.href}</code>
    </div>
  );
}

// Small metadata chips let the board show useful planning context without
// turning every card into a novel with shoulder pads.
function CardMeta({ label, value }: { label: string; value: string }) {
  if (!value) {
    return null;
  }

  return (
    <div className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.8)]">
      {label}: {value}
    </div>
  );
}

// What this does:
// Renders one card plus its status-move form.
//
// Why this matters:
// The card is the unit of planning truth the UI understands. It is intentionally
// dumb about persistence; the form posts back to a server action, which keeps
// mutation authority on the server side where the sharp objects are supervised.
//
// What we are doing instead (and why):
// Rendering plus form wiring in one component, rather than a fleet of smaller
// abstractions. That keeps the board approachable for Charlie today.
//
// Signal to evolve it:
// If cards gain edit modes, comments, or per-field permissions, this component
// will start to resemble a traveling circus and should be split with intent.
function KanbanCardView({ card }: { card: KanbanCard }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/6 p-5 shadow-glass">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="m-0 text-[1.05rem] leading-tight tracking-[-0.02em] text-[var(--text-light)]">
            {card.title}
          </h3>

          {card.summary ? (
            <p className="mb-0 mt-3 text-sm leading-6 text-[rgba(245,239,230,0.86)]">
              {card.summary}
            </p>
          ) : null}
        </div>

        <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
          {card.updatedAt.slice(0, 10)}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <CardMeta label="Type" value={card.type} />
        <CardMeta label="Area" value={card.area} />
        <CardMeta label="Priority" value={card.priority} />
        <CardMeta label="Owner" value={card.owner} />
      </div>

      {card.nextStep ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.66)]">
            Next step
          </div>
          <div className="text-sm leading-6 text-[rgba(245,239,230,0.9)]">
            {card.nextStep}
          </div>
        </div>
      ) : null}

      {card.links.length > 0 ? (
        <div className="mt-4 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.66)]">
            Links and paths
          </div>
          <div className="flex flex-wrap gap-2">
            {card.links.map((link) => (
              <div key={`${card.id}-${link.label}-${link.href}`}>{renderLink(link)}</div>
            ))}
          </div>
        </div>
      ) : null}

      {card.tags.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {card.tags.map((tag) => (
            <Link
              key={`${card.id}-${tag}`}
              href={buildFilterHref({ tag })}
              className="rounded-full border border-flare/18 bg-flare/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-flare no-underline transition hover:border-flare/35"
            >
              #{tag}
            </Link>
          ))}
        </div>
      ) : null}

      <form action={updateKanbanStatusAction} className="mt-5 flex items-center gap-3">
        <input type="hidden" name="cardId" value={card.id} />
        <select
          name="status"
          defaultValue={card.status}
          className="min-w-[132px] rounded-2xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-[var(--text-light)] outline-none"
        >
          {KANBAN_STATUSES.map((status) => (
            <option key={status} value={status} className="text-black">
              {statusLabels[status]}
            </option>
          ))}
        </select>

        <button
          type="submit"
          className="rounded-2xl border border-white/12 bg-white/8 px-3 py-2 text-sm font-semibold text-[var(--text-light)] transition hover:border-[rgba(255,122,24,0.35)] hover:text-[var(--accent)]"
        >
          Update
        </button>
      </form>
    </div>
  );
}

// What this does:
// Loads the canonical board, derives filter options, applies the current area
// and tag filters from the URL, and groups the surviving cards into the four
// board columns.
//
// Interview lens:
// This is a clean server-component pattern: fetch on the server, derive view
// state on the server, and send the browser an already-decided page instead of
// making it reconstruct the war map from scratch.
//
// Best practice (the "textbook" version):
// Put read-model derivation close to the fetch when the derivation is simple
// and page-specific.
//
// What we are doing instead (and why):
// Exactly that. The derived filter vocabulary and grouped status columns live
// here because they belong to this view, not to the persistence layer.
//
// Future complexity wearing a fake mustache:
// "I am just one more little derived view." That is how pages slowly turn into
// private spreadsheet engines if no one calls time on the experiment.
export default async function TeamKanbanPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { success, error, area, tag } = await searchParams;
  const board = await getKanbanBoard();

  // These become the filter vocabulary visible to the user. They are derived
  // from real cards instead of from a separate registry, which keeps the board
  // from growing a second source of truth in the basement.
  //
  // If ignored:
  // A separate hard-coded registry for areas and tags would eventually disagree
  // with the actual cards, at which point the Librarian starts making that
  // horrified orangutan noise.
  const areas = [...new Set(board.cards.map((card) => card.area).filter(Boolean))].sort();
  const tags = [...new Set(board.cards.flatMap((card) => card.tags))].sort();

  // Filtering happens before grouping so every column reflects the same slice
  // of reality. Otherwise the board becomes one of those maps where the roads
  // on the left side and the roads on the right side were drawn by feuding
  // cousins.
  const filteredCards = board.cards.filter((card) => {
    if (area && card.area !== area) {
      return false;
    }

    if (tag && !card.tags.includes(tag)) {
      return false;
    }

    return true;
  });

  // Grouping by status is a pure view concern. The source JSON is a flat list,
  // which keeps editing simple for both humans and AI.
  const cardsByStatus = Object.fromEntries(
    KANBAN_STATUSES.map((status) => [
      status,
      filteredCards.filter((card) => card.status === status),
    ]),
  ) as Record<KanbanStatus, KanbanCard[]>;

  return (
    <section className="space-y-8">
      <StatusMessage success={success} error={error} />

      <section className="grid gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <GlassPanel className="p-6 text-[var(--text-light)]">
          <div className="mb-4">
            <PageEyebrow>Kanban</PageEyebrow>
          </div>

          <h2 className="m-0 text-[1.7rem] leading-tight tracking-[-0.03em] text-[var(--text-light)]">
            Internal work board
          </h2>

          <p className="mb-0 mt-4 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.88)]">
            Simple file-backed planning board for real work already in this repo.
            The JSON file is the source of truth. The UI can add basic cards and
            move them across the four working states without turning this app
            into Jira.
          </p>

          {/* Future Chuck note:
              This path is worth leaving visible on the page because it teaches
              the mental model: the UI is a clerk's desk sitting in front of a
              file, not a magical hidden datastore. */}
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/6 p-4 text-sm leading-6 text-[rgba(245,239,230,0.88)]">
            Data file:
            <div className="mt-2">
              <code>apps/web/content/internal/kanban/board.json</code>
            </div>
          </div>

          {/* What this form does:
              Collects the few fields needed to create a useful planning card.
              The server action owns validation and the actual mutation. */}
          <form action={createKanbanCardAction} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="title"
                className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
              >
                Title
              </label>
              <input
                id="title"
                name="title"
                type="text"
                required
                className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none placeholder:text-[rgba(245,239,230,0.4)]"
                placeholder="Migrate values into canonical packet"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label
                  htmlFor="status"
                  className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
                >
                  Status
                </label>
                <select
                  id="status"
                  name="status"
                  defaultValue="backlog"
                  className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none"
                >
                  {KANBAN_STATUSES.map((status) => (
                    <option key={status} value={status} className="text-black">
                      {statusLabels[status]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="priority"
                  className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
                >
                  Priority
                </label>
                <select
                  id="priority"
                  name="priority"
                  defaultValue="medium"
                  className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none"
                >
                  {KANBAN_PRIORITIES.map((priority) => (
                    <option key={priority} value={priority} className="text-black">
                      {priority}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label
                  htmlFor="type"
                  className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
                >
                  Type
                </label>
                <input
                  id="type"
                  name="type"
                  type="text"
                  className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none placeholder:text-[rgba(245,239,230,0.4)]"
                  placeholder="packet-migration"
                />
              </div>

              <div>
                <label
                  htmlFor="area"
                  className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
                >
                  Area
                </label>
                <input
                  id="area"
                  name="area"
                  type="text"
                  className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none placeholder:text-[rgba(245,239,230,0.4)]"
                  placeholder="episodes"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="owner"
                className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
              >
                Owner
              </label>
              <input
                id="owner"
                name="owner"
                type="text"
                className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none placeholder:text-[rgba(245,239,230,0.4)]"
                placeholder="charlie"
              />
            </div>

            <div>
              <label
                htmlFor="summary"
                className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
              >
                Summary
              </label>
              <textarea
                id="summary"
                name="summary"
                rows={4}
                className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none placeholder:text-[rgba(245,239,230,0.4)]"
                placeholder="One paragraph on what this item is and why it matters."
              />
            </div>

            <div>
              <label
                htmlFor="nextStep"
                className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
              >
                Next step
              </label>
              <input
                id="nextStep"
                name="nextStep"
                type="text"
                className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none placeholder:text-[rgba(245,239,230,0.4)]"
                placeholder="Choose the next packet candidate and migrate it."
              />
            </div>

            <div>
              <label
                htmlFor="tags"
                className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
              >
                Tags
              </label>
              <input
                id="tags"
                name="tags"
                type="text"
                className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none placeholder:text-[rgba(245,239,230,0.4)]"
                placeholder="packet, migration, public-sync-candidate"
              />
            </div>

            <div>
              <label
                htmlFor="links"
                className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
              >
                Links or paths
              </label>
              <textarea
                id="links"
                name="links"
                rows={4}
                className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none placeholder:text-[rgba(245,239,230,0.4)]"
                placeholder={"packet | apps/web/content/episodes/learning-to-lead/values/packet.mdx\npublic page | /episodes/look-for-lessons"}
              />
              <p className="mb-0 mt-2 text-xs leading-6 text-[rgba(245,239,230,0.65)]">
                One per line. Use <code>label | value</code>. Route links can start
                with <code>/</code>. Repo paths can stay as plain paths.
              </p>
            </div>

            <button
              type="submit"
              className="w-full rounded-2xl border border-flare/25 bg-flare/15 px-4 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] transition hover:border-flare/40 hover:bg-flare/20"
            >
              Add story
            </button>
          </form>
        </GlassPanel>

        <div className="space-y-6">
          <GlassPanel className="p-6 text-[var(--text-light)]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <PageEyebrow>Filters</PageEyebrow>
                <h2 className="m-0 text-[1.3rem] leading-tight tracking-[-0.03em] text-[var(--text-light)]">
                  Focus the board
                </h2>
              </div>

              <div className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm font-semibold text-[rgba(245,239,230,0.88)]">
                {filteredCards.length} visible cards
              </div>
            </div>

            {/* Filters are URL-driven on purpose. That makes the board state
                linkable, refresh-safe, and easy to reason about without a
                client-state maze. */}
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.66)]">
                  By area
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={buildFilterHref({ tag })}
                    className={[
                      "rounded-full border px-3 py-1.5 text-xs font-semibold no-underline transition",
                      !area
                        ? "border-flare/35 bg-flare/12 text-flare"
                        : "border-white/10 bg-white/6 text-[rgba(245,239,230,0.88)] hover:border-flare/35 hover:text-flare",
                    ].join(" ")}
                  >
                    All areas
                  </Link>

                  {areas.map((areaValue) => (
                    <Link
                      key={areaValue}
                      href={buildFilterHref({ area: areaValue, tag })}
                      className={[
                        "rounded-full border px-3 py-1.5 text-xs font-semibold no-underline transition",
                        area === areaValue
                          ? "border-flare/35 bg-flare/12 text-flare"
                          : "border-white/10 bg-white/6 text-[rgba(245,239,230,0.88)] hover:border-flare/35 hover:text-flare",
                      ].join(" ")}
                    >
                      {areaValue}
                    </Link>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.66)]">
                  By tag
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={buildFilterHref({ area })}
                    className={[
                      "rounded-full border px-3 py-1.5 text-xs font-semibold no-underline transition",
                      !tag
                        ? "border-flare/35 bg-flare/12 text-flare"
                        : "border-white/10 bg-white/6 text-[rgba(245,239,230,0.88)] hover:border-flare/35 hover:text-flare",
                    ].join(" ")}
                  >
                    All tags
                  </Link>

                  {tags.map((tagValue) => (
                    <Link
                      key={tagValue}
                      href={buildFilterHref({ area, tag: tagValue })}
                      className={[
                        "rounded-full border px-3 py-1.5 text-xs font-semibold no-underline transition",
                        tag === tagValue
                          ? "border-flare/35 bg-flare/12 text-flare"
                          : "border-white/10 bg-white/6 text-[rgba(245,239,230,0.88)] hover:border-flare/35 hover:text-flare",
                      ].join(" ")}
                    >
                      #{tagValue}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </GlassPanel>

          <div className="grid gap-6 xl:grid-cols-2 2xl:grid-cols-4">
            {KANBAN_STATUSES.map((status) => (
              <GlassPanel key={status} className="p-5 text-[var(--text-light)]">
                {/* Each column is a rendered view over the same flat board list.
                    Tasks migrate between swamps by changing one status value,
                    not by teleporting into a different storage system. */}
                <div className="mb-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <PageEyebrow>{statusLabels[status]}</PageEyebrow>
                    <div className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-semibold text-[rgba(245,239,230,0.85)]">
                      {cardsByStatus[status].length}
                    </div>
                  </div>

                  <p className="mb-0 text-sm leading-6 text-[rgba(245,239,230,0.76)]">
                    {statusDescriptions[status]}
                  </p>
                </div>

                <div className="space-y-4">
                  {cardsByStatus[status].length > 0 ? (
                    cardsByStatus[status].map((card) => (
                      <KanbanCardView key={card.id} card={card} />
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-white/4 px-4 py-5 text-sm leading-6 text-[rgba(245,239,230,0.7)]">
                      No cards in {statusLabels[status].toLowerCase()} for the
                      current filter.
                    </div>
                  )}
                </div>
              </GlassPanel>
            ))}
          </div>
        </div>
      </section>
    </section>
  );
}
