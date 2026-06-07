"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { ViewDefinition } from "./types";
import { compileActiveProjectPackages, getEpisodeCandidatesAction, approveEpisodeCandidateAction } from "./actions";

type PublisherModePanelProps = {
  activeView: ViewDefinition;
  documentTitle?: string;
  projectSlug?: string;
  projectId: string;
};

const hgoSiteUrl = (process.env.NEXT_PUBLIC_HGO_SITE_URL || "https://highgroundodyssey.com").replace(/\/$/, "");

const publishingTargets = [
  {
    label: "High Ground Odyssey",
    description: "Publish public episode pages from safe Quipsly packets.",
    href: "/publishing-suite",
  },
  {
    label: "Podcast RSS",
    description: "Package episode notes, transcript material, and publish-ready metadata.",
    href: "/publishing-suite",
  },
  {
    label: "YouTube",
    description: "Move selected quotes, clips, and episode beats toward video publishing.",
    href: "/publishing-suite",
  },
  {
    label: "Social",
    description: "Use quote and media tags as the source pool for short-form posts.",
    href: "/publishing-suite",
  },
];

export default function PublisherModePanel({
  activeView,
  documentTitle,
  projectSlug = "high-ground-odyssey-manuscript",
  projectId,
}: PublisherModePanelProps) {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [compilingState, setCompilingState] = useState<"idle" | "compiling" | "compiled" | "error">("idle");
  const [compileMessage, setCompileMessage] = useState("");

  const loadCandidates = async () => {
    setLoadingCandidates(true);
    try {
      const res = await getEpisodeCandidatesAction(projectId);
      if (res.ok && res.candidates) {
        setCandidates(res.candidates);
        setIsOwner(!!res.isOwner);
      }
    } catch (error) {
      console.error("Failed to load candidates", error);
    }
    setLoadingCandidates(false);
  };

  useEffect(() => {
    if (projectId) {
      loadCandidates();
    }
  }, [projectId]);

  const handleCompile = async () => {
    setCompilingState("compiling");
    setCompileMessage("");
    try {
      const res = await compileActiveProjectPackages(projectId);
      if (res.ok) {
        setCompilingState("compiled");
        setCompileMessage(res.message || "Document compiled successfully.");
        await loadCandidates();
      } else {
        setCompilingState("error");
        setCompileMessage(res.error || "Failed to compile.");
      }
    } catch {
      setCompilingState("error");
      setCompileMessage("An error occurred during compilation.");
    }
  };

  const handlePublish = async (candidateId: string) => {
    try {
      const res = await approveEpisodeCandidateAction(candidateId);
      if (res.ok) {
        await loadCandidates();
      } else {
        alert(res.error || "Failed to publish.");
      }
    } catch {
      alert("Failed to publish.");
    }
  };

  return (
    <section className="mb-6 rounded-2xl border border-[#d3a24f] bg-[#fff5df] p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.22em] text-[#9a5f13]">
            Publisher Mode
          </div>
          <h2 className="mt-1 font-serif text-2xl font-bold text-[#342618]">
            Publish from safe public packets.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6b5b45]">
            Current source: {documentTitle ?? "Untitled manuscript"} / {activeView.name}. The public site only receives approved episode packets, never private operator notes.
          </p>
        </div>
        <div className="rounded-full border border-[#d3a24f] bg-white px-3 py-1 text-xs font-bold text-[#9a5f13]">
          Private operator layer
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-[#e3c88f] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-[#9a5f13]">
              Living Document Compilation
            </div>
            <h3 className="mt-1 font-serif text-xl font-bold text-[#342618]">
              Compile tagged sections into distribution packages
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6b5b45]">
              This action scans your manuscript for `#episode` or `#chapter` tag boundaries and auto-packages their body text, beats, and `#quote` elements into clean distribution drafts.
            </p>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-[#8c6b4a]">
              The public site only queries approved candidates. Use the **Compile Document Outline** button to generate drafts, review them, and publish them to HGO.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCompile}
            disabled={compilingState === "compiling"}
            className="rounded-full border border-[#b87413] bg-[#9a5f13] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#7c4b0d] disabled:cursor-wait disabled:opacity-60 animate-pulse-slow"
          >
            {compilingState === "compiling" ? "Compiling..." : "Compile Document Outline"}
          </button>
        </div>

        {compileMessage && (
          <div className={`mt-3 rounded-xl border px-3 py-2 text-sm ${compilingState === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
            {compileMessage}
          </div>
        )}

        <div className="mt-4 grid gap-2 md:grid-cols-3">
          {loadingCandidates ? (
            <div className="col-span-full text-center py-8 text-xs italic text-[#8c6b4a]">Loading compiled packages...</div>
          ) : candidates.length === 0 ? (
            <div className="col-span-full text-center py-8 text-xs italic text-[#8c6b4a] border border-dashed border-[#e3c88f] rounded-xl bg-[#fffcf5]">
              No compiled packages yet. Use "Compile Document Outline" to start.
            </div>
          ) : (
            candidates.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-[#ead7ad] bg-[#fffaf0] p-3 text-sm flex flex-col justify-between"
              >
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9a5f13]">
                    {c.packet?.kind || "EPISODE"} · {c.candidateStatus}
                  </div>
                  <div className="mt-1 font-bold text-[#3d3122]">{c.projectionTitle}</div>
                  <div className="mt-1 truncate text-xs text-[#6b5b45]">{c.proposedRoute}</div>
                  <p className="mt-2 text-xs text-[#8c6b4a] line-clamp-2">
                    {c.packet?.summary || "No summary extracted."}
                  </p>
                </div>
                <div className="mt-3 space-y-1.5 pt-2 border-t border-[#ead7ad]/40">
                  <div className="flex gap-2">
                    {c.candidateStatus !== "published" ? (
                      <button
                        onClick={() => handlePublish(c.id)}
                        disabled={!isOwner}
                        title={isOwner ? "Publish to public HGO site" : "Publishing requires owner permissions during Beta"}
                        className="flex-1 rounded-lg bg-[#9a5f13] hover:bg-[#7c4b0d] text-white px-2 py-1 text-xs font-bold transition-all text-center shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Publish to HGO
                      </button>
                    ) : (
                      <a
                        href={`${hgoSiteUrl}${c.proposedRoute}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 rounded-lg border border-emerald-600 bg-emerald-50 text-emerald-800 px-2 py-1 text-xs font-bold transition-all text-center"
                      >
                        View Live Site
                      </a>
                    )}
                  </div>
                  <details className="mt-2 text-xs group">
                    <summary className="cursor-pointer font-bold text-[#8c6b4a] hover:text-[#5e4b33]">Preview Generated Page</summary>
                    <div className="mt-2 flex flex-col gap-3 rounded bg-white p-3 shadow-inner border border-[#ead7ad]">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-wider text-emerald-700 mb-1">Public Content Preview</div>
                        <div className="prose prose-sm prose-amber max-w-none">
                          <h4 className="text-base font-serif mb-2 font-bold text-[#3d3122]">{c.packet?.title}</h4>
                          <div
                            className="text-[#3d3122] text-xs whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto"
                            dangerouslySetInnerHTML={{ __html: c.packet?.body || "" }}
                          />
                          {c.packet?.metadata?.domainPacket?.showNotesMarkdown && (
                            <div className="mt-4 border-t border-[#ead7ad]/50 pt-3">
                              <h5 className="text-[10px] font-black uppercase tracking-wider text-emerald-700 mb-1">Extracted Show Notes</h5>
                              <div
                                className="text-[#6b5b45] text-xs whitespace-pre-wrap leading-relaxed max-h-20 overflow-y-auto italic border-l-2 border-[#d3a24f] pl-2"
                                dangerouslySetInnerHTML={{ __html: c.packet.metadata.domainPacket.showNotesMarkdown }}
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      {c.packet?.metadata?.excludedBlocks && c.packet.metadata.excludedBlocks.length > 0 && (
                        <div className="border-t border-rose-100 pt-3">
                          <div className="text-[10px] font-black uppercase tracking-wider text-rose-700 mb-2 flex items-center gap-1">
                            <span className="bg-rose-100 text-rose-800 px-1 rounded">Private</span> Excluded from public packet
                          </div>
                          <ul className="space-y-2">
                            {c.packet.metadata.excludedBlocks.map((ex: any, i: number) => (
                              <li key={i} className="text-[10px] bg-rose-50 border border-rose-100 rounded p-2 text-rose-900">
                                <span className="font-bold block mb-0.5">{ex.reason}:</span>
                                <span className="opacity-80 italic">{ex.preview}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <details className="border-t border-gray-100 pt-3 mt-1">
                        <summary className="cursor-pointer text-[10px] font-bold text-gray-400 hover:text-gray-600">Raw Developer JSON Payload</summary>
                        <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-gray-50 p-2 text-[9px] text-gray-600 border border-gray-200">
                          {JSON.stringify(c.packet, null, 2)}
                        </pre>
                      </details>
                    </div>
                  </details>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 rounded-xl border border-[#ead7ad] bg-[#fffaf0] p-3 text-xs leading-5 text-[#6b5b45]">
          <strong className="text-[#3d3122]">How this publishes right now:</strong>{" "}
          Quipsly sends safe public episode packets directly to the High Ground Odyssey database tables. If you need to make deeper adjustments to meta summaries, add media/audio files, or check YouTube overlays, go to the **Transmitter dashboard** below.
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {publishingTargets.map((target) => (
          <Link
            key={target.label}
            href={target.href}
            className="rounded-xl border border-[#e3c88f] bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#c58b2a] hover:shadow-md"
          >
            <div className="font-serif text-lg font-bold text-[#3d3122]">{target.label}</div>
            <p className="mt-2 text-xs leading-5 text-[#6b5b45]">{target.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
