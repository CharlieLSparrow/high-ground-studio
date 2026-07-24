import { createHash } from "node:crypto";

export function normalizeWorkTagLabel(value: unknown) {
  if (typeof value !== "string") return "";
  const label = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .replace(/^#+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  return label.length <= 80 ? label : "";
}

export function workTagSlug(label: string) {
  const normalized = label.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const readable = normalized
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  if (readable) return readable;
  return `tag-${createHash("sha256").update(label.normalize("NFKC").toLowerCase()).digest("hex").slice(0, 12)}`;
}
