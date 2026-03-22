import GlassPanel from "@/components/ui/GlassPanel";
import {
  formatContentModeLabel,
  type ContentMode,
} from "@/lib/content-mode";

type InternalViewNoticeProps = {
  mode: ContentMode;
  access?: string;
  status?: string;
  views?: string[];
};

function titleCase(value: string) {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function InternalViewNotice({
  mode,
  access,
  status,
  views = [],
}: InternalViewNoticeProps) {
  const normalizedAccess = access?.toLowerCase() ?? "public";
  const normalizedStatus = status?.toLowerCase() ?? "published";
  const show =
    mode !== "public" ||
    normalizedAccess !== "public" ||
    normalizedStatus !== "published";

  if (!show) {
    return null;
  }

  return (
    <GlassPanel className="p-5 text-[var(--text-light)]">
      <div className="mb-3 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[var(--accent-soft)]">
        Internal View
      </div>

      <p className="m-0 text-[0.96rem] leading-7 text-[rgba(245,239,230,0.88)]">
        You are viewing this page through <strong>{formatContentModeLabel(mode)}</strong>.
        This is a good place for draft-state sanity checks, future-content previews,
        and making sure the right things are visible to the right people.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[0.8rem] text-[rgba(245,239,230,0.9)]">
          Access: {titleCase(normalizedAccess)}
        </span>

        <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[0.8rem] text-[rgba(245,239,230,0.9)]">
          Status: {titleCase(normalizedStatus)}
        </span>

        {views.map((view) => (
          <span
            key={view}
            className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[0.8rem] text-[rgba(245,239,230,0.9)]"
          >
            View: {titleCase(view)}
          </span>
        ))}
      </div>
    </GlassPanel>
  );
}