import { Prisma } from "@prisma/client";

type Kind = "NOTE" | "TASK" | "GOAL";
type Cursor = { v: 1; space: string; actor: string; q: string; kind: string; item: string; at: string; id: string; itemKind: Kind };
type Row = { id: string; kind: Kind; updatedAt: string };
const kinds: Kind[] = ["NOTE", "TASK", "GOAL"];

/** Removed records must not consume the visible page before filtering. */
export function activeCoachingWorkWhere() {
  return { OR: [
    { sourceJson: { path: ["relationshipWorkRemoval", "active"], equals: Prisma.AnyNull } },
    { NOT: { sourceJson: { path: ["relationshipWorkRemoval", "active"], equals: true } } },
  ] };
}

export function coachingWorkPage(params: URLSearchParams, space: string, actor: string) {
  const q = (params.get("q") || "").trim().replace(/\s+/g, " ");
  const kind = (params.get("kind") || "ALL").toUpperCase();
  const item = params.get("item") || "";
  const size = Number(params.get("pageSize") || 100);
  if (q.length > 200 || item.length > 240 || !["ALL", ...kinds].includes(kind) || !Number.isSafeInteger(size) || size < 1 || size > 100) {
    throw new Error("INVALID_WORK_QUERY");
  }
  let cursor: Cursor | null = null;
  const encoded = params.get("cursor");
  if (encoded) {
    if (encoded.length > 2000) throw new Error("INVALID_WORK_CURSOR");
    try {
      const value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
      if (value.v !== 1 || value.space !== space || value.actor !== actor || value.q !== q || value.kind !== kind || value.item !== item ||
          typeof value.id !== "string" || !value.id || value.id.length > 240 || !kinds.includes(value.itemKind) ||
          typeof value.at !== "string" || new Date(value.at).toISOString() !== value.at) throw new Error();
      cursor = value;
    } catch { throw new Error("INVALID_WORK_CURSOR"); }
  }

  function where(itemKind: Kind) {
    const bodyField = itemKind === "NOTE" ? "body" : itemKind === "TASK" ? "detail" : "description";
    const ownerField = itemKind === "NOTE" ? "authorUser" : itemKind === "TASK" ? "assignedUser" : "owner";
    const conditions: object[] = [activeCoachingWorkWhere()];
    if (item) conditions.push({id: item});
    if (kind !== "ALL" && kind !== itemKind) conditions.push({ id: { in: [] } });
    for (const term of q.split(" ").filter(Boolean)) {
      const contains = { contains: term, mode: "insensitive" };
      conditions.push({ OR: [{ title: contains }, { [bodyField]: contains },
        { [ownerField]: { is: { OR: [{ name: contains }, { primaryEmail: contains }] } } },
        { tagLinks: { some: { tag: { label: contains } } } },
      ] });
    }
    if (cursor) {
      // Descending (updatedAt, kind, id) creates an exact boundary even when
      // records share timestamps. ID order within a model stays database-owned.
      conditions.push({ OR: [
        { updatedAt: { lt: new Date(cursor.at) } },
        ...(itemKind === cursor.itemKind ? [{ updatedAt: new Date(cursor.at), id: { lt: cursor.id } }] : []),
        ...(itemKind < cursor.itemKind ? [{ updatedAt: new Date(cursor.at) }] : []),
      ] });
    }
    return { AND: conditions };
  }

  return {
    size, q, kind, where,
    orderBy: [{ updatedAt: "desc" as const }, { id: "desc" as const }],
    take: size + 1,
    result<T extends Row>(rows: T[]) {
      const ordered = [...rows].sort((a, b) => {
        // Stable sort preserves each model's SQL id ordering; do not replace
        // database collation with JavaScript string ordering for tied IDs.
        for (const field of ["updatedAt", "kind"] as const) {
          if (a[field] !== b[field]) return a[field] > b[field] ? -1 : 1;
        }
        return 0;
      });
      const entries = ordered.slice(0, size);
      const last = entries.at(-1);
      const nextCursor = ordered.length > size && last ? Buffer.from(JSON.stringify({
        v: 1, space, actor, q, kind, item, at: last.updatedAt, id: last.id, itemKind: last.kind,
      } satisfies Cursor)).toString("base64url") : null;
      return { entries, page: { nextCursor, pageSize: size, query: q, kind } };
    },
  };
}
