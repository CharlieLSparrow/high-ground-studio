"use client";

import { useMemo, useState } from "react";
import {
  ClipboardPaste,
  Copy,
  Download,
  FileJson,
  FileText,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import GlassPanel from "@/components/ui/GlassPanel";
import PageEyebrow from "@/components/ui/PageEyebrow";
import {
  createHgoEpisodePublishDraftFrontmatterFileName,
  createHgoEpisodePublishDraftMdxFileName,
  parseHgoEpisodePublishDraftPacketJson,
  type HgoEpisodePublishDraftPacketValidationResult,
} from "@/lib/hgo/publish-draft-packet";

const samplePlaceholder = `{
  "packetKind": "hgo-episode-publish-draft-v1",
  "createdAt": "2026-05-24T00:00:00.000Z",
  "source": {},
  "episodePage": {},
  "proposedFiles": {},
  "frontmatter": {},
  "mdxDraft": "",
  "reviewState": {},
  "safety": {}
}`;

function downloadTextFile(fileName: string, value: string, type: string) {
  const blob = new Blob([value], { type });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = href;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

function ValidationList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "error" | "warning";
}) {
  if (!items.length) {
    return null;
  }

  const toneClassName =
    tone === "error"
      ? "border-rose-300/30 bg-rose-300/10 text-rose-50"
      : "border-amber-200/30 bg-amber-200/10 text-amber-50";

  return (
    <section className={`rounded-2xl border p-4 ${toneClassName}`}>
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase">
        <TriangleAlert aria-hidden="true" className="h-4 w-4" />
        {title}
      </div>
      <ul className="m-0 space-y-1 pl-5 text-sm leading-6">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function SafetyFlagGrid({
  parsed,
}: {
  parsed: Extract<
    HgoEpisodePublishDraftPacketValidationResult,
    { ok: true }
  >;
}) {
  const rows = Object.entries(parsed.packet.safety);

  return (
    <section className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-emerald-50">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase">
        <ShieldCheck aria-hidden="true" className="h-4 w-4" />
        Safety Flags
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map(([key, value]) => (
          <div
            className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-sm"
            key={key}
          >
            <span className="break-words text-emerald-50/85">{key}</span>
            <span className="rounded-full border border-emerald-200/25 bg-emerald-300/10 px-2 py-1 text-xs font-semibold">
              {value ? "yes" : "no"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function HgoPublishDraftLabClient() {
  const [packetJson, setPacketJson] = useState("");
  const [message, setMessage] = useState("");
  const parsed = useMemo(
    () =>
      packetJson.trim()
        ? parseHgoEpisodePublishDraftPacketJson(packetJson)
        : null,
    [packetJson],
  );
  const validParsed = parsed?.ok ? parsed : null;
  const frontmatterJson = validParsed
    ? JSON.stringify(validParsed.packet.frontmatter, null, 2)
    : "";

  function copyToClipboard(label: string, value: string) {
    setMessage("");

    if (!navigator.clipboard?.writeText) {
      setMessage("Clipboard access is not available in this browser.");
      return;
    }

    void navigator.clipboard
      .writeText(value)
      .then(() => setMessage(`${label} copied to clipboard.`))
      .catch(() => setMessage(`${label} copy failed.`));
  }

  function loadFromClipboard() {
    setMessage("");

    if (!navigator.clipboard?.readText) {
      setMessage("Clipboard read access is not available in this browser.");
      return;
    }

    void navigator.clipboard
      .readText()
      .then((value) => {
        setPacketJson(value);
        setMessage("Clipboard packet loaded.");
      })
      .catch(() => setMessage("Clipboard read failed."));
  }

  return (
    <section className="space-y-6">
      <GlassPanel className="p-6 text-[var(--text-light)]">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <PageEyebrow>HGO</PageEyebrow>
          <PageEyebrow>Draft Packet Lab</PageEyebrow>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)] lg:items-start">
          <div>
            <h2 className="m-0 max-w-[860px] text-[clamp(2rem,4vw,3.4rem)] leading-none text-[var(--text-light)]">
              Review a publish-draft packet
            </h2>
            <p className="mb-0 mt-4 max-w-[780px] text-[1rem] leading-7 text-[rgba(245,239,230,0.88)]">
              Paste a private HGO publish-draft packet to verify its safety
              boundary, inspect the generated MDX, and export the frontmatter
              without writing public content.
            </p>
          </div>

          <section className="rounded-2xl border border-fuchsia-200/20 bg-fuchsia-300/10 p-4 text-fuchsia-50">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase">
              <FileJson aria-hidden="true" className="h-4 w-4" />
              Packet State
            </div>
            <p className="m-0 text-sm leading-6">
              {validParsed
                ? "Valid private draft packet."
                : parsed
                  ? "Packet needs attention."
                  : "No packet loaded."}
            </p>
          </section>
        </div>
      </GlassPanel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-white/10 bg-black/15 p-4 text-[rgba(245,239,230,0.86)]">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase">
                <FileJson aria-hidden="true" className="h-4 w-4 text-[var(--accent)]" />
                Packet JSON
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm font-semibold text-[var(--text-light)] transition hover:border-[rgba(255,122,24,0.35)] hover:text-[var(--accent)]"
                  onClick={loadFromClipboard}
                  type="button"
                >
                  <ClipboardPaste aria-hidden="true" className="h-4 w-4" />
                  Paste Clipboard
                </button>
                <button
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm font-semibold text-[var(--text-light)] transition hover:border-[rgba(255,122,24,0.35)] hover:text-[var(--accent)]"
                  onClick={() => setPacketJson("")}
                  type="button"
                >
                  Clear
                </button>
              </div>
            </div>

            <textarea
              className="min-h-[320px] w-full resize-y rounded-2xl border border-white/10 bg-black/30 p-4 font-mono text-xs leading-5 text-[var(--text-light)] outline-none transition focus:border-[rgba(255,122,24,0.5)]"
              onChange={(event) => setPacketJson(event.target.value)}
              placeholder={samplePlaceholder}
              spellCheck={false}
              value={packetJson}
            />

            {message ? (
              <p className="m-0 mt-3 rounded-xl border border-white/10 bg-white/6 p-3 text-sm font-semibold text-[rgba(245,239,230,0.82)]">
                {message}
              </p>
            ) : null}
          </section>

          {parsed ? (
            <>
              <ValidationList
                items={parsed.errors}
                title="Errors"
                tone="error"
              />
              <ValidationList
                items={parsed.warnings}
                title="Warnings"
                tone="warning"
              />
            </>
          ) : null}

          {validParsed ? (
            <section className="rounded-2xl border border-white/10 bg-black/15 p-4 text-[rgba(245,239,230,0.86)]">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase">
                  <FileText aria-hidden="true" className="h-4 w-4 text-[var(--accent)]" />
                  MDX Draft
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm font-semibold text-[var(--text-light)] transition hover:border-[rgba(255,122,24,0.35)] hover:text-[var(--accent)]"
                    onClick={() =>
                      copyToClipboard("MDX draft", validParsed.packet.mdxDraft)
                    }
                    type="button"
                  >
                    <Copy aria-hidden="true" className="h-4 w-4" />
                    Copy MDX
                  </button>
                  <button
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm font-semibold text-[var(--text-light)] transition hover:border-[rgba(255,122,24,0.35)] hover:text-[var(--accent)]"
                    onClick={() =>
                      downloadTextFile(
                        createHgoEpisodePublishDraftMdxFileName(
                          validParsed.packet,
                        ),
                        validParsed.packet.mdxDraft,
                        "text/markdown;charset=utf-8",
                      )
                    }
                    type="button"
                  >
                    <Download aria-hidden="true" className="h-4 w-4" />
                    Download MDX
                  </button>
                </div>
              </div>
              <pre className="max-h-[520px] overflow-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-xs leading-5 text-[var(--text-light)]">
                {validParsed.packet.mdxDraft}
              </pre>
            </section>
          ) : null}
        </div>

        <aside className="space-y-4">
          {validParsed ? (
            <>
              <section className="rounded-2xl border border-white/10 bg-black/15 p-4 text-[rgba(245,239,230,0.86)]">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase">
                  <FileJson aria-hidden="true" className="h-4 w-4 text-[var(--accent)]" />
                  Identity
                </div>
                <dl className="m-0 grid gap-3 text-sm leading-6">
                  {[
                    ["Route", validParsed.packet.episodePage.proposedRoute],
                    ["Slug", validParsed.packet.episodePage.slug],
                    ["Artifact", validParsed.packet.source.artifactId],
                    ["Hash", validParsed.packet.source.artifactHash],
                    [
                      "Private draft",
                      validParsed.packet.proposedFiles.privateDraftPath,
                    ],
                    [
                      "Deferred public",
                      validParsed.packet.proposedFiles.deferredPublicPath,
                    ],
                  ].map(([label, value]) => (
                    <div className="min-w-0" key={label}>
                      <dt className="text-xs font-semibold uppercase text-[rgba(245,239,230,0.58)]">
                        {label}
                      </dt>
                      <dd className="m-0 mt-1 break-words text-[var(--text-light)]">
                        <code>{value}</code>
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section className="rounded-2xl border border-white/10 bg-black/15 p-4 text-[rgba(245,239,230,0.86)]">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase">
                    <FileJson aria-hidden="true" className="h-4 w-4 text-[var(--accent)]" />
                    Frontmatter
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm font-semibold text-[var(--text-light)] transition hover:border-[rgba(255,122,24,0.35)] hover:text-[var(--accent)]"
                      onClick={() =>
                        copyToClipboard("Frontmatter", frontmatterJson)
                      }
                      type="button"
                    >
                      <Copy aria-hidden="true" className="h-4 w-4" />
                      Copy
                    </button>
                    <button
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm font-semibold text-[var(--text-light)] transition hover:border-[rgba(255,122,24,0.35)] hover:text-[var(--accent)]"
                      onClick={() =>
                        downloadTextFile(
                          createHgoEpisodePublishDraftFrontmatterFileName(
                            validParsed.packet,
                          ),
                          frontmatterJson,
                          "application/json;charset=utf-8",
                        )
                      }
                      type="button"
                    >
                      <Download aria-hidden="true" className="h-4 w-4" />
                      Download
                    </button>
                  </div>
                </div>
                <pre className="max-h-[360px] overflow-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-xs leading-5 text-[var(--text-light)]">
                  {frontmatterJson}
                </pre>
              </section>

              <SafetyFlagGrid parsed={validParsed} />
            </>
          ) : (
            <section className="rounded-2xl border border-white/10 bg-black/15 p-4 text-sm leading-6 text-[rgba(245,239,230,0.82)]">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase">
                <ShieldCheck aria-hidden="true" className="h-4 w-4 text-[var(--accent)]" />
                Private Boundary
              </div>
              <p className="m-0">
                Valid draft packets must stay in private review mode, keep all
                write/publish/provider safety flags false, and keep the private
                draft target under `apps/web/content/_staging/`.
              </p>
            </section>
          )}
        </aside>
      </div>
    </section>
  );
}
