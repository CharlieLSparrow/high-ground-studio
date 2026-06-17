"use client";

import { useMemo, useState } from "react";
import {
  Database,
  ExternalLink,
  Image as ImageIcon,
  Layers3,
  Tags,
  Target,
} from "lucide-react";

export type ImageFocusItem = {
  seq?: number | string | null;
  filename?: string | null;
  label?: string | null;
  imageDate?: string | null;
  site?: string | null;
  queueLabel?: string | null;
  copiedRelativePath?: string | null;
  thumbDataUrl?: string | null;
  previewDataUrl?: string | null;
  thumbUrl?: string | null;
  previewUrl?: string | null;
  workbenchUrl?: string | null;
  workbookMatchCount?: number | string | null;
  workbookLinkCount?: number | string | null;
  markCount?: number | string | null;
  tileBoundaryPresent?: boolean | null;
  knownPercent?: number | string | null;
  unknownPercent?: number | string | null;
  stackKey?: string | null;
  stackCount?: number | string | null;
  coverRows?: Array<{
    className?: string | null;
    percent?: number | string | null;
  }> | null;
};

type ImageFocusStageProps = {
  items: ImageFocusItem[];
  workbenchUrl: string;
  imageCount: string;
  tiedCount: string;
  reviewCount: string;
  imageProxyBase?: string;
  publicMediaBase?: string;
  imageProxyToken?: string;
};

function cleanBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function addImageProxyAuth(url: string, imageProxyToken?: string) {
  if (!imageProxyToken) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}token=${encodeURIComponent(imageProxyToken)}`;
}

function normalizeImageUrl(
  rawUrl: string,
  workbenchUrl: string,
  imageProxyBase?: string,
  publicMediaBase?: string,
  imageProxyToken?: string,
) {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.startsWith("data:")) return trimmed;

  const base = cleanBaseUrl(workbenchUrl);
  const proxyBase = cleanBaseUrl(imageProxyBase || process.env.NEXT_PUBLIC_REEFBALL_IMAGE_PROXY_BASE || "");
  const mediaBase = cleanBaseUrl(publicMediaBase || process.env.NEXT_PUBLIC_REEFBALL_PUBLIC_MEDIA_BASE_URL || "");

  if (!base && !proxyBase && !mediaBase) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") {
      if (mediaBase) {
        const localImage = parsed.pathname.match(/^\/(?:api\/)?(preview|thumb|media)\/([0-9]+)\.jpg$/);
        if (localImage) {
          const kind = localImage[1];
          const seq = localImage[2].padStart(4, "0");
          const size = kind === "preview" ? parsed.searchParams.get("size") || "1800" : "";
          const path = kind === "thumb" ? "thumbs" : kind === "media" ? "media" : `previews-${size}`;
          return `${mediaBase}/${path}/${seq}.jpg`;
        }
        return `${mediaBase}/${trimmed.replace(/^\/+/, "").replace(/^api\//, "")}`;
      }
      if (proxyBase) {
        const localImage = parsed.pathname.match(/^\/(?:api\/)?(preview|thumb|media)\/([0-9]+)\.jpg$/);
        if (localImage) {
          const kind = localImage[1];
          const seq = localImage[2].padStart(4, "0");
          const size = kind === "preview" ? parsed.searchParams.get("size") || "1800" : "";
          const maybeSize = size ? `&size=${encodeURIComponent(size)}` : "";
          return addImageProxyAuth(`${proxyBase}?kind=${encodeURIComponent(kind)}&seq=${encodeURIComponent(seq)}${maybeSize}`, imageProxyToken);
        }
        return addImageProxyAuth(`${proxyBase}?source=${encodeURIComponent(trimmed)}`, imageProxyToken);
      }
      const mapped = new URL(parsed.pathname + parsed.search + parsed.hash, base);
      return mapped.toString();
    }
    return trimmed;
  } catch {
    if (trimmed.startsWith("/")) {
      return trimmed;
    }
    if (base) {
      try {
        return new URL(trimmed, base).toString();
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
}

function seqValue(item: ImageFocusItem) {
  const value = Number(item.seq ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function numberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function numberLabel(value: unknown) {
  return numberValue(value).toLocaleString();
}

function percentLabel(value: unknown) {
  return `${numberValue(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}

function imageCandidateUrls(
  item: ImageFocusItem,
  workbenchUrl: string,
  kind: "thumb" | "preview",
  imageProxyBase?: string,
  publicMediaBase?: string,
  imageProxyToken?: string,
) {
  const candidates: string[] = [];
  const embedded = kind === "thumb" ? item.thumbDataUrl : item.previewDataUrl;
  const explicit = kind === "thumb" ? item.thumbUrl : item.previewUrl;

  if (explicit) candidates.push(explicit);

  if (kind === "preview") {
    if (item.thumbUrl) candidates.push(item.thumbUrl);
    if (item.thumbDataUrl) candidates.push(item.thumbDataUrl);
    if (embedded) candidates.push(embedded);
  } else if (embedded) {
    candidates.push(embedded);
  }

  // Fallbacks for environments where the expected URL family is missing.
  if (kind === "thumb" && item.previewUrl) candidates.push(item.previewUrl);
  if (kind === "thumb" && item.previewDataUrl && item.previewDataUrl !== embedded) {
    candidates.push(item.previewDataUrl);
  }

  const seq = seqValue(item);
  const base = cleanBaseUrl(workbenchUrl);
  const proxyBase = cleanBaseUrl(imageProxyBase || process.env.NEXT_PUBLIC_REEFBALL_IMAGE_PROXY_BASE || "");
  const mediaBase = cleanBaseUrl(publicMediaBase || process.env.NEXT_PUBLIC_REEFBALL_PUBLIC_MEDIA_BASE_URL || "");
  if (seq) {
    if (base) {
      if (kind === "thumb") candidates.push(`${base}/api/thumb/${seq}.jpg`);
      else candidates.push(`${base}/api/preview/${seq}.jpg?size=1800`);
    }
    if (mediaBase) {
      if (kind === "thumb") candidates.push(`${mediaBase}/thumbs/${seq.toString().padStart(4, "0")}.jpg`);
      else candidates.push(`${mediaBase}/previews-1800/${seq.toString().padStart(4, "0")}.jpg`);
    }
    if (proxyBase) {
      if (kind === "thumb") {
        candidates.push(addImageProxyAuth(`${proxyBase}?kind=thumb&seq=${encodeURIComponent(seq.toString().padStart(4, "0"))}`, imageProxyToken));
      } else {
        candidates.push(addImageProxyAuth(`${proxyBase}?kind=preview&seq=${encodeURIComponent(seq.toString().padStart(4, "0"))}&size=1800`, imageProxyToken));
      }
    }
  }

  const normalized = candidates
    .map((value) => normalizeImageUrl(value, workbenchUrl, imageProxyBase, publicMediaBase, imageProxyToken))
    .filter((value): value is string => Boolean(value && value.length > 0));
  return Array.from(new Set(normalized));
}

function workbenchImageUrl(item: ImageFocusItem, workbenchUrl: string) {
  if (item.workbenchUrl) return item.workbenchUrl;

  const seq = seqValue(item);
  const base = cleanBaseUrl(workbenchUrl);
  if (!base) return "";
  return seq ? `${base}/?seq=${seq}` : `${base}/`;
}

function imageTitle(item: ImageFocusItem) {
  return item.label || item.filename || (seqValue(item) ? `Image ${seqValue(item)}` : "Selected image");
}

function imageSubtitle(item: ImageFocusItem) {
  return [
    item.filename,
    item.imageDate,
    item.site,
    item.queueLabel,
  ].filter(Boolean).join(" · ");
}

function uniqueCoverRows(item: ImageFocusItem) {
  const rows = Array.isArray(item.coverRows) ? item.coverRows : [];
  return rows
    .filter((row) => row?.className)
    .slice(0, 5);
}

export function ImageFocusStage({
  items,
  workbenchUrl,
  imageCount,
  tiedCount,
  reviewCount,
  imageProxyBase,
  publicMediaBase,
  imageProxyToken,
}: ImageFocusStageProps) {
  const [activeSeq, setActiveSeq] = useState(() => seqValue(items[0] ?? {}));
  const [failedImageIndexes, setFailedImageIndexes] = useState<Record<string, number>>({});

  const activeItem = useMemo(() => {
    return items.find((item) => seqValue(item) === activeSeq) ?? items[0];
  }, [activeSeq, items]);
  const activeSeqValue = seqValue(activeItem ?? {});
  const activePreviewUrls = activeItem ? imageCandidateUrls(activeItem, workbenchUrl, "preview", imageProxyBase, publicMediaBase, imageProxyToken) : [];
  const activePreviewFailureKey = activeSeqValue ? `preview:${activeSeqValue}` : "preview:none";
  const activePreviewIndex = failedImageIndexes[activePreviewFailureKey] ?? 0;
  const activePreviewUrl = activePreviewIndex < activePreviewUrls.length ? activePreviewUrls[activePreviewIndex] ?? "" : "";

  const activeWorkbenchUrl = activeItem ? workbenchImageUrl(activeItem, workbenchUrl) : cleanBaseUrl(workbenchUrl);
  const coverRows = activeItem ? uniqueCoverRows(activeItem) : [];

  if (!items.length) {
    return (
      <section className="overflow-hidden rounded-3xl border border-[#d8cab0] bg-white shadow-sm">
        <div className="grid min-h-[420px] place-items-center bg-[#f3eadb] p-8 text-center">
          <div className="max-w-xl">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-[#d8cab0] bg-white text-[#8c6b4a]">
              <ImageIcon size={28} />
            </div>
            <h2 className="mt-5 font-serif text-3xl font-black text-[#3d3122]">Images are the center of this Nest</h2>
            <p className="mt-3 text-sm leading-6 text-[#6b5b45]">
              Import the latest local packet to fill this stage with reef-ball images, review queues, and annotation context.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-[#26352f] bg-[#1f2825] text-white shadow-sm">
      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="flex min-h-[520px] flex-col">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 p-4 md:p-5">
            <div>
              <div className="text-[11px] font-black uppercase text-[#9cd6cf]">Image review stage</div>
              <h2 className="mt-1 font-serif text-3xl font-black">{imageTitle(activeItem)}</h2>
              <p className="mt-1 text-sm leading-6 text-white/70">{imageSubtitle(activeItem)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {activePreviewUrl ? (
                <a
                  href={activePreviewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black uppercase text-white transition hover:bg-white/15"
                >
                  <ImageIcon size={14} />
                  Image
                </a>
              ) : null}
              {activeWorkbenchUrl ? (
                <a
                  href={activeWorkbenchUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-[#e7fff8] px-4 py-2 text-xs font-black uppercase text-[#17322c] transition hover:bg-white"
                >
                  <ExternalLink size={14} />
                  Workbench
                </a>
              ) : null}
            </div>
          </div>

          <div className="grid flex-1 place-items-center bg-[#111615] p-3 md:p-5">
            <div className="relative grid h-full min-h-[360px] w-full place-items-center overflow-hidden rounded-2xl border border-white/10 bg-black">
              {activePreviewUrl ? (
                  <img
                    src={activePreviewUrl}
                    alt={imageTitle(activeItem)}
                    className="max-h-[72vh] w-full object-contain"
                    onError={() => {
                    if (!activeItem) return;
                      setFailedImageIndexes((current) => ({
                        ...current,
                        [activePreviewFailureKey]: (current[activePreviewFailureKey] ?? 0) + 1,
                      }));
                    }}
                  />
                ) : null}
              {activePreviewUrl ? null : (
                <div className="grid max-w-md place-items-center p-8 text-center">
                  <div className="grid h-16 w-16 place-items-center rounded-2xl border border-white/10 bg-white/5 text-white/70">
                    <ImageIcon size={28} />
                  </div>
              <h3 className="mt-5 font-serif text-2xl font-black">Local image preview unavailable</h3>
                  <p className="mt-3 text-sm leading-6 text-white/60">
                    The Nest has the image record, but this browser needs the local reef-ball workbench running to render the HDD photo.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-white/10 p-3 md:p-4">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {items.map((item) => {
                const seq = seqValue(item);
                    const thumbUrls = imageCandidateUrls(item, workbenchUrl, "thumb", imageProxyBase, publicMediaBase, imageProxyToken);
                const thumbFailureKey = `thumb:${seq || item.filename || "no-seq"}`;
                const thumbIndex = failedImageIndexes[thumbFailureKey] ?? 0;
                const thumb = thumbIndex < thumbUrls.length ? thumbUrls[thumbIndex] ?? "" : "";
                const selected = seq === seqValue(activeItem);
                return (
                  <button
                    key={`${seq}-${item.queueLabel || item.filename || "image"}`}
                    type="button"
                    onClick={() => setActiveSeq(seq)}
                    className={`h-24 w-24 shrink-0 overflow-hidden rounded-xl border transition ${selected ? "border-[#9cd6cf] ring-2 ring-[#9cd6cf]/40" : "border-white/10 hover:border-white/35"}`}
                    aria-label={`Select ${imageTitle(item)}`}
                  >
                    {thumb ? (
                      <img
                        src={thumb}
                        alt=""
                        className="h-full w-full object-cover"
                        onError={() => {
                          setFailedImageIndexes((current) => ({
                            ...current,
                            [thumbFailureKey]: Math.min((current[thumbFailureKey] ?? 0) + 1, thumbUrls.length),
                          }));
                        }}
                      />
                    ) : (
                      <span className="grid h-full w-full place-items-center bg-white/5 text-xs font-black text-white/60">
                        {seq || "IMG"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <aside className="border-t border-white/10 bg-[#fdfaf6] p-5 text-[#3d3122] xl:border-l xl:border-t-0">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Images", value: imageCount },
              { label: "Tied", value: tiedCount },
              { label: "Reviews", value: reviewCount },
            ].map((metric) => (
              <div key={metric.label} className="rounded-2xl border border-[#eadfca] bg-white p-3">
                <div className="font-serif text-2xl font-black">{metric.value}</div>
                <div className="text-[10px] font-black uppercase text-[#8c6b4a]">{metric.label}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 space-y-3">
            <div className="rounded-2xl border border-[#eadfca] bg-white p-4">
              <div className="flex items-center gap-2 text-xs font-black uppercase text-[#8c6b4a]">
                <Target size={14} />
                Review target
              </div>
              <div className="mt-2 font-serif text-2xl font-black">{imageTitle(activeItem)}</div>
              <div className="mt-1 text-sm leading-6 text-[#6b5b45]">{imageSubtitle(activeItem) || "No visible label yet"}</div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-[#eadfca] bg-white p-4">
                <div className="flex items-center gap-2 text-xs font-black uppercase text-[#8c6b4a]">
                  <Database size={14} />
                  Workbook
                </div>
                <div className="mt-2 font-serif text-2xl font-black">{numberLabel(activeItem?.workbookLinkCount || activeItem?.workbookMatchCount)}</div>
                <div className="mt-1 text-xs text-[#6b5b45]">row links</div>
              </div>
              <div className="rounded-2xl border border-[#eadfca] bg-white p-4">
                <div className="flex items-center gap-2 text-xs font-black uppercase text-[#8c6b4a]">
                  <Layers3 size={14} />
                  Marks
                </div>
                <div className="mt-2 font-serif text-2xl font-black">{numberLabel(activeItem?.markCount)}</div>
                <div className="mt-1 text-xs text-[#6b5b45]">{activeItem?.tileBoundaryPresent ? "tile traced" : "needs tile"}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-[#eadfca] bg-white p-4">
              <div className="flex items-center gap-2 text-xs font-black uppercase text-[#8c6b4a]">
                <Tags size={14} />
                Cover estimate
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <div className="font-serif text-2xl font-black">{percentLabel(activeItem?.knownPercent)}</div>
                  <div className="text-xs text-[#6b5b45]">known</div>
                </div>
                <div>
                  <div className="font-serif text-2xl font-black">{percentLabel(activeItem?.unknownPercent)}</div>
                  <div className="text-xs text-[#6b5b45]">unknown</div>
                </div>
              </div>
              {coverRows.length ? (
                <div className="mt-3 space-y-2">
                  {coverRows.map((row) => (
                    <div key={`${row.className}-${row.percent}`} className="flex items-center justify-between gap-3 rounded-xl bg-[#fffaf3] px-3 py-2 text-xs">
                      <span className="truncate font-black">{row.className}</span>
                      <span className="font-mono">{percentLabel(row.percent)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {activeItem?.stackKey ? (
              <div className="rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-4 text-xs leading-5 text-[#6b5b45]">
                <div className="font-black uppercase text-[#8c6b4a]">Stack key</div>
                <div className="mt-1 break-all font-mono">{activeItem.stackKey}</div>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </section>
  );
}
