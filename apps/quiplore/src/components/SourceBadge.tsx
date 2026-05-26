import { BookOpen, FileText, Mic2, ScrollText } from "lucide-react";
import { formatSourceType, type SourceWorkProjection } from "@high-ground/quipsly-domain";

export function SourceBadge({
  source,
}: {
  readonly source: SourceWorkProjection;
}) {
  const Icon =
    source.type === "speech" || source.type === "interview"
      ? Mic2
      : source.type === "poem"
        ? ScrollText
        : source.type === "book"
          ? BookOpen
          : FileText;

  return (
    <span className="chip" title={source.sourceNote}>
      <Icon size={14} aria-hidden="true" />
      {formatSourceType(source.type)}
    </span>
  );
}
