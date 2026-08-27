export type LibraryKind = "SESSION" | "NOTE" | "SOURCE" | "DOCUMENT" | "MEDIA" | "SAVED";

export type LibraryEntry = {
  id: string;
  kind: LibraryKind;
  title: string;
  detail: string;
  projectName: string | null;
  projectSlug: string | null;
  href: string;
  updatedAt: string;
  stateLabel: string;
  badges: string[];
  searchText: string;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function iso(value: Date | string | null | undefined) {
  if (!value) return new Date(0).toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString();
}

function encode(value: string) {
  return encodeURIComponent(value);
}

export function promotedMediaAssetId(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const root = value as Record<string, unknown>;
  const promotion = typeof root.promotion === "object" && root.promotion !== null && !Array.isArray(root.promotion)
    ? root.promotion as Record<string, unknown>
    : {};
  return clean(promotion.mediaAssetId) || null;
}

export function buildLibraryEntries(input: {
  sessions: Array<{
    id: string;
    title?: string | null;
    purpose: string;
    status: string;
    updatedAt: Date | string;
    project?: { name: string; slug: string } | null;
    recordingAssets: Array<{ id: string; fileName?: string | null; kind: string; status: string; durationSeconds?: number | null; localManifestJson?: unknown }>;
    transcriptJobs: Array<{ id: string; status: string; provider: string; updatedAt: Date | string; _count?: { segments: number } }>;
  }>;
  notes?: Array<{
    id: string;
    title?: string | null;
    body: string;
    kind?: string;
    visibility?: string;
    authorUserId?: string | null;
    authorUser?: { name?: string | null; primaryEmail?: string | null } | null;
    sourceJson?: unknown;
    createdAt: Date | string;
    updatedAt: Date | string;
    room: {
      id: string;
      title?: string | null;
      project?: { name: string; slug: string } | null;
    };
    tags: Array<{ id: string; label: string; slug: string }>;
  }>;
  sources: Array<{
    id: string;
    title: string;
    kind: string;
    author?: string | null;
    updatedAt: Date | string;
    project: { name: string; slug: string };
    annotations: Array<{ id: string; kind: string; body: string; exactText?: string | null; visibility: string }>;
  }>;
  documents: Array<{
    id: string;
    title: string;
    sourceLabel?: string | null;
    projectionStatus: string;
    updatedAt: Date | string;
    project: { name: string; slug: string };
    tagLinks?: Array<{ tag: { id: string; label: string; slug: string } }>;
    blocks?: Array<{ id: string; title?: string | null; body: string }>;
    episodeProductions: Array<{ slug: string; title: string; status: string }>;
    _count?: { blocks: number };
  }>;
  media: Array<{
    id: string;
    filename: string;
    mimeType?: string | null;
    duration?: number | null;
    isProxy: boolean;
    updatedAt: Date | string;
    projects: Array<{ id: string; name: string; slug: string }>;
    _count?: { sourceUnits: number; clips: number };
  }>;
  saved?: { collectionCount: number; snippetCount: number; bookmarkCount: number; updatedAt?: Date | string | null } | null;
}) {
  const promotedMediaIds = new Set<string>();
  const entries: LibraryEntry[] = [];

  for (const session of input.sessions) {
    for (const recording of session.recordingAssets) {
      const mediaId = promotedMediaAssetId(recording.localManifestJson);
      if (mediaId) promotedMediaIds.add(mediaId);
    }
    const latestTranscript = [...session.transcriptJobs].sort((left, right) => iso(right.updatedAt).localeCompare(iso(left.updatedAt)))[0] ?? null;
    const verifiedCount = session.recordingAssets.filter((asset) => asset.status === "VERIFIED" || asset.status === "UPLOADED").length;
    const segmentCount = latestTranscript?._count?.segments ?? 0;
    const title = clean(session.title) || "Capture session";
    const recordingNames = session.recordingAssets.map((asset) => clean(asset.fileName)).filter(Boolean);
    entries.push({
      id: `session:${session.id}`,
      kind: "SESSION",
      title,
      detail: `${session.recordingAssets.length} source recording${session.recordingAssets.length === 1 ? "" : "s"}; ${latestTranscript ? `${segmentCount} transcript segment${segmentCount === 1 ? "" : "s"}` : "no transcript yet"}.`,
      projectName: session.project?.name ?? null,
      projectSlug: session.project?.slug ?? null,
      href: `/sessions/${encode(session.id)}`,
      updatedAt: iso(session.updatedAt),
      stateLabel: latestTranscript ? `Transcript ${clean(latestTranscript.status).replaceAll("_", " ")}` : clean(session.status).replaceAll("_", " "),
      badges: [
        `${session.recordingAssets.length} recording${session.recordingAssets.length === 1 ? "" : "s"}`,
        verifiedCount ? `${verifiedCount} verified` : "Verification pending",
        latestTranscript ? `${segmentCount} segments` : "No transcript",
      ],
      searchText: [title, session.purpose, session.status, session.project?.name, ...recordingNames, latestTranscript?.provider].map(clean).join(" "),
    });
  }

  for (const note of input.notes ?? []) {
    const title = clean(note.title) || "Quick note";
    const body = clean(note.body);
    const source = typeof note.sourceJson === "object" && note.sourceJson !== null && !Array.isArray(note.sourceJson)
      ? note.sourceJson as Record<string, unknown>
      : {};
    const capturedOnPhone = source.schema === "quipsly-mobile-quick-entry-v1" && source.surface === "ios-capture";
    const tagBadges = note.tags.map((tag) => `#${clean(tag.label)}`).filter((tag) => tag !== "#");
    entries.push({
      id: `note:${note.id}`,
      kind: "NOTE",
      title,
      detail: body.length > 220 ? `${body.slice(0, 217)}…` : body,
      projectName: note.room.project?.name ?? null,
      projectSlug: note.room.project?.slug ?? null,
      href: `/sessions/${encode(note.room.id)}?mode=notes#session-note-${encode(note.id)}`,
      updatedAt: iso(note.updatedAt),
      stateLabel: `${capturedOnPhone ? "iPhone capture" : clean(note.kind).replaceAll("_", " ").toLowerCase() || "Session note"} · ${clean(note.visibility).replaceAll("_", " ").toLowerCase() || "author private"}`,
      badges: [
        clean(note.room.title) || "Capture session",
        ...tagBadges,
        capturedOnPhone ? "Offline retry safe" : clean(note.authorUser?.name) || "Actor-authored",
      ],
      searchText: [title, body, note.kind, note.visibility, note.authorUser?.name, note.room.title, note.room.project?.name, ...note.tags.flatMap((tag) => [tag.label, tag.slug])].map(clean).join(" "),
    });
  }

  for (const source of input.sources) {
    const title = clean(source.title) || "Untitled source";
    entries.push({
      id: `source:${source.id}`,
      kind: "SOURCE",
      title,
      detail: source.annotations.length
        ? `${source.annotations.length} anchored annotation${source.annotations.length === 1 ? "" : "s"}; preserved source text remains unchanged.`
        : "Preserved source text with no visible annotation yet.",
      projectName: source.project.name,
      projectSlug: source.project.slug,
      href: `/research?source=${encode(source.id)}`,
      updatedAt: iso(source.updatedAt),
      stateLabel: "Immutable source",
      badges: [clean(source.kind).replaceAll("_", " ") || "Source", source.author ? `By ${clean(source.author)}` : "Author not recorded", `${source.annotations.length} annotations`],
      searchText: [title, source.kind, source.author, source.project.name, ...source.annotations.flatMap((annotation) => [annotation.kind, annotation.body, annotation.exactText, annotation.visibility])].map(clean).join(" "),
    });
  }

  for (const document of input.documents) {
    const episode = document.episodeProductions[0] ?? null;
    const blockCount = document._count?.blocks ?? 0;
    const writingNote = clean(document.sourceLabel).toLowerCase().includes("document-kind:note");
    const voiceWriting = clean(document.sourceLabel).toLowerCase().includes("origin:ios-voice-writing");
    const previewBlock = (document.blocks ?? []).find((block) => {
      const body = clean(block.body);
      return body
        && body.toLowerCase() !== "note title"
        && body !== clean(block.title)
        && (!writingNote || body !== clean(document.title));
    }) ?? document.blocks?.[0] ?? null;
    const preview = clean(previewBlock?.body);
    const documentTags = (document.tagLinks ?? []).map((link) => link.tag);
    const tagBadges = documentTags.map((tag) => `#${clean(tag.label)}`).filter((tag) => tag !== "#");
    entries.push({
      id: `document:${document.id}`,
      kind: writingNote ? "NOTE" : "DOCUMENT",
      title: clean(document.title) || "Untitled document",
      detail: writingNote && preview
        ? (preview.length > 220 ? `${preview.slice(0, 217)}…` : preview)
        : episode
        ? `${episode.title} manuscript; ${blockCount} active block${blockCount === 1 ? "" : "s"}.`
        : `${blockCount} active manuscript block${blockCount === 1 ? "" : "s"}.`,
      projectName: document.project.name,
      projectSlug: document.project.slug,
      href: writingNote
        ? `/create?project=${encode(document.project.slug)}&document=${encode(document.id)}${previewBlock ? `&block=${encode(previewBlock.id)}` : ""}`
        : episode
        ? `/read?projectSlug=${encode(document.project.slug)}&episodeSlug=${encode(episode.slug)}`
        : `/create?project=${encode(document.project.slug)}&document=${encode(document.id)}`,
      updatedAt: iso(document.updatedAt),
      stateLabel: voiceWriting ? "Voice note" : writingNote ? "Note" : episode ? `Episode ${clean(episode.status).replaceAll("_", " ")}` : clean(document.projectionStatus).replaceAll("_", " "),
      badges: writingNote
        ? [voiceWriting ? "From Quipsly Capture" : "Writing", ...tagBadges, `${blockCount} section${blockCount === 1 ? "" : "s"}`]
        : [episode ? "Episode manuscript" : "Writing", ...tagBadges, `${blockCount} section${blockCount === 1 ? "" : "s"}`],
      searchText: [document.title, document.projectionStatus, document.project.name, episode?.title, episode?.status, ...documentTags.flatMap((tag) => [tag.label, tag.slug]), ...(document.blocks ?? []).flatMap((block) => [block.title, block.body])].map(clean).join(" "),
    });
  }

  for (const media of input.media) {
    if (promotedMediaIds.has(media.id)) continue;
    const project = media.projects[0] ?? null;
    const sourceUnitCount = media._count?.sourceUnits ?? 0;
    const clipCount = media._count?.clips ?? 0;
    entries.push({
      id: `media:${media.id}`,
      kind: "MEDIA",
      title: clean(media.filename) || "Unnamed media",
      detail: `${media.isProxy ? "Derived proxy" : "Reusable Studio media"}; ${sourceUnitCount} source unit${sourceUnitCount === 1 ? "" : "s"}, ${clipCount} clip${clipCount === 1 ? "" : "s"}.`,
      projectName: project?.name ?? null,
      projectSlug: project?.slug ?? null,
      href: `/media/${encode(media.id)}`,
      updatedAt: iso(media.updatedAt),
      stateLabel: media.isProxy ? "Derived proxy" : "Studio media",
      badges: [clean(media.mimeType) || "Media", media.duration ? `${Math.round(media.duration)} sec` : "Duration not recorded", `${clipCount} clips`],
      searchText: [media.filename, media.mimeType, ...media.projects.map((item) => item.name)].map(clean).join(" "),
    });
  }

  if (input.saved && (input.saved.collectionCount || input.saved.snippetCount || input.saved.bookmarkCount)) {
    entries.push({
      id: "saved:legacy-collections",
      kind: "SAVED",
      title: "Saved snippets and bookmarks",
      detail: "Legacy personal captures remain actor-owned and readable while they are migrated into canonical Nest sources deliberately.",
      projectName: null,
      projectSlug: null,
      href: "/collections",
      updatedAt: iso(input.saved.updatedAt),
      stateLabel: "Legacy personal sources",
      badges: [`${input.saved.collectionCount} collections`, `${input.saved.snippetCount} snippets`, `${input.saved.bookmarkCount} bookmarks`],
      searchText: "saved snippets bookmarks legacy collections personal sources",
    });
  }

  entries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id));
  return {
    entries,
    promotedMediaIds: [...promotedMediaIds].sort(),
    counts: {
      sessions: entries.filter((entry) => entry.kind === "SESSION").length,
      notes: entries.filter((entry) => entry.kind === "NOTE").length,
      sources: entries.filter((entry) => entry.kind === "SOURCE").length,
      documents: entries.filter((entry) => entry.kind === "DOCUMENT").length,
      media: entries.filter((entry) => entry.kind === "MEDIA").length,
      saved: entries.filter((entry) => entry.kind === "SAVED").length,
    },
    boundaries: {
      permissionFilteredBeforeProjection: true,
      immutableSourcesPreserved: true,
      promotedCaptureMediaDeduplicated: true,
      localPhoneRecordingsRemainDeviceOwned: true,
      externalSideEffects: false,
    },
  };
}

export function filterLibraryEntries(entries: LibraryEntry[], input: { query?: string; kind?: string }) {
  const query = clean(input.query).toLocaleLowerCase().slice(0, 200);
  const kind = clean(input.kind).toUpperCase();
  return entries.filter((entry) => {
    if (kind && kind !== "ALL" && entry.kind !== kind) return false;
    if (!query) return true;
    return `${entry.title} ${entry.detail} ${entry.projectName ?? ""} ${entry.stateLabel} ${entry.badges.join(" ")} ${entry.searchText}`.toLocaleLowerCase().includes(query);
  });
}
