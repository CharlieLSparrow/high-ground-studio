import Link from "next/link";
import { tagChipColors } from "@/lib/tag-color";

export type NavigableTag = {
  id: string;
  label: string;
  isActive?: boolean;
  hexColor?: string | null;
};

export function tagSearchHref(label: string) {
  return `/find?q=${encodeURIComponent(label.trim().replace(/\s+/g, " ").slice(0, 120))}`;
}

export function tagFocusHref(tagId: string) {
  return `/find?tag=${encodeURIComponent(tagId.trim().slice(0, 128))}`;
}

export function TagSearchChips({
  tags,
  label = "Tags",
  className = "mt-3",
}: {
  tags: NavigableTag[];
  label?: string;
  className?: string;
}) {
  if (!tags.length) return null;
  const labels = tags.map((tag) => `${tag.label}${tag.isActive === false ? " (archived)" : ""}`);
  return <div className={`${className} flex flex-wrap gap-1.5`} aria-label={`${label}: ${labels.join(", ")}`}>
    {tags.map((tag) => {
      const archived = tag.isActive === false;
      return <Link
        key={tag.id}
        href={tagFocusHref(tag.id)}
        aria-label={`Find all accessible work tagged ${tag.label}${archived ? " (archived)" : ""}`}
        style={tagChipColors(tag.hexColor)}
        className="inline-flex min-h-8 max-w-full items-center rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-semibold text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [overflow-wrap:anywhere]"
      >
        #{tag.label}{archived ? " · archived" : ""}
      </Link>;
    })}
  </div>;
}
