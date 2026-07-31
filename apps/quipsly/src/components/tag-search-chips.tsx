import Link from "next/link";

export type NavigableTag = {
  id: string;
  label: string;
  isActive?: boolean;
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
        className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-black hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-700 ${archived ? "border-stone-300 bg-stone-100 text-stone-700" : "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-950"}`}
      >
        #{tag.label}{archived ? " · archived" : ""}
      </Link>;
    })}
  </div>;
}
