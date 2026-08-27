"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, BookOpen, Bot, Check, ChevronRight, ClipboardList, Download, Feather, HeartHandshake, Loader2, PackageCheck, RotateCcw, ShieldCheck, Sparkles, X } from "lucide-react";
import type { DocumentBoundary, ViewDefinition } from "@/app/(app)/create/types";
import { syncEmbeddingsAction } from "@/app/(app)/create/actions";
import { StoryBibleSidebar } from "./story-bible";

export type { AssistantAction, AssistantActionStatus, AssistantPreviewCard, AssistantChange, AssistantResponse, AssistantSuggestion, AssistantBlockContext } from "./assistant-types";
import type { AssistantAction, AssistantActionStatus, AssistantPreviewCard, AssistantChange, AssistantResponse, AssistantSuggestion, AssistantBlockContext } from "./assistant-types";

function uniqueTags(blocks: AssistantBlockContext[]) {
  return Array.from(new Set(blocks.flatMap((block) => block.tags ?? []))).slice(0, 20);
}

function summarizeRisk(riskLevel: AssistantAction["riskLevel"]) {
  if (riskLevel === "high") return "Changes saved work";
  if (riskLevel === "medium") return "Creates saved work";
  return "No saved-work change";
}

function actionStatusClass(status: AssistantActionStatus) {
  if (["completed", "approved", "applied", "committed"].includes(status)) return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (["ready", "running", "applying", "committing"].includes(status)) return "border-sky-200 bg-sky-50 text-sky-800";
  if (status === "rejected") return "border-slate-200 bg-slate-50 text-slate-600";
  if (status === "undone") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-sky-200 bg-sky-50 text-sky-800";
}

function importantWords(value: string) {
  const stopWords = new Set([
    "about",
    "after",
    "again",
    "could",
    "find",
    "from",
    "have",
    "into",
    "like",
    "material",
    "related",
    "section",
    "should",
    "that",
    "this",
    "what",
    "with",
    "would",
    "quipsly",
  ]);

  return Array.from(new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length > 3 && !stopWords.has(word))
  )).slice(0, 16);
}

function summarizeText(value: string) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return "No text was available to summarize.";
  const sentences = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [cleaned];
  return sentences.slice(0, 2).join(" ").trim().slice(0, 520);
}

function EntityProposalEvidence({ action }: { action: AssistantAction }) {
  if (action.kind !== "PROPOSE_ENTITY" && action.kind !== "PROPOSE_ENTITY_UPDATE") return null;
  const attributes = action.payload.attributes && typeof action.payload.attributes === "object"
    ? action.payload.attributes as Record<string, unknown>
    : {};
  const excerpt = typeof attributes.sourceExcerpt === "string" ? attributes.sourceExcerpt : "";
  const sourceBlockId = typeof action.payload.sourceBlockId === "string"
    ? action.payload.sourceBlockId
    : typeof attributes.sourceBlockId === "string"
      ? attributes.sourceBlockId
      : "";
  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-sky-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-sky-900">
        <span>Exact source evidence</span>
        <span>{sourceBlockId ? "Block attached · rechecked at commit" : "Unique current match required at commit"}</span>
      </div>
      <div className="p-3 text-sm italic leading-6 text-slate-700">
        {excerpt ? `“${excerpt}”` : "No exact excerpt was attached. This proposal cannot become canonical."}
      </div>
    </div>
  );
}

export function QuipslyAssistantSidebar({
  projectId,
  projectSlug,
  documentId,
  documentTitle,
  activeBoundary,
  activeView,
  visibleBlocks,
  projectDocuments,
  patreonHref,
  assistant,
}: {
  projectId: string;
  projectSlug: string;
  documentId?: string;
  documentTitle?: string;
  activeView: ViewDefinition;
  visibleBlocks: AssistantBlockContext[];
  patreonHref?: string;
  activeBoundary?: any;
  projectDocuments?: { id: string; title: string; sourceLabel: string | null; updatedAt: string | Date }[];
  assistant: ReturnType<typeof import("./useQuipslyAssistant").useQuipslyAssistant>;
}) {
  const [activeTab, setActiveTab] = useState<"CHAT" | "STORY_BIBLE">("CHAT");
  const [isOpen, setIsOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportStatusIsError, setExportStatusIsError] = useState(false);
  const [syncingEmbeddings, setSyncingEmbeddings] = useState(false);

  const {
    sessionId,
    message,
    setMessage,
    assistantMessage,
    suggestions,
    actions,
    previews,
    recentChanges,
    status,
    warning,
    recentTags,
    askAssistant,
    approveAction,
    rejectAction,
    undoAction,
    saveAction,
    undoSaveAction,
  } = assistant;

  const contextSummary = useMemo(() => {
    const boundaryLabel = activeBoundary?.label ?? activeView.name;
    return `${projectSlug} / ${boundaryLabel}`;
  }, [activeBoundary?.label, activeView.name, projectSlug]);

  const quickPrompts = useMemo(() => [
    "What outputs could this section become?",
    "Find related examples in this Nest.",
    "Suggest structure cleanup for this section.",
    "Prepare a research packet preview.",
  ], []);
  const visibleActions = useMemo(
    () => actions.filter((action) => !(
      action.status === "completed"
      && action.governance?.decisionPolicy === "READ_ONLY"
    )),
    [actions],
  );



  const exportLedger = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      context: {
        sessionId: sessionId || "offline/local-fallback",
        projectSlug,
        documentId,
        documentTitle,
        activeBoundary,
        activeViewName: activeView.name,
      },
      assistantMessage,
      suggestions,
      actions,
      previews,
      recentChanges,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `quipsly-assistant-ledger-${projectSlug}-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setExportStatusIsError(false);
    setExportStatus("Diagnostic JSON exported.");
    window.setTimeout(() => setExportStatus(null), 3000);
  };

  const handleSyncEmbeddings = async () => {
    setSyncingEmbeddings(true);
    setExportStatusIsError(false);
    setExportStatus("Refreshing the AI research index… Existing results remain available until this finishes.");
    try {
      const res = await syncEmbeddingsAction(projectId);
      if (res.success) {
        setExportStatusIsError(false);
        setExportStatus(`Research index refreshed: ${res.result.syncedBlocks} writing blocks and ${res.result.syncedQuotes} quotes via ${res.result.model}.`);
      } else {
        setExportStatusIsError(true);
        setExportStatus(res.error);
      }
    } catch {
      setExportStatusIsError(true);
      setExportStatus("The research index refresh did not finish. The previous index remains available.");
    } finally {
      setSyncingEmbeddings(false);
      window.setTimeout(() => setExportStatus(null), 4000);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="fixed bottom-[8.75rem] right-4 z-40 flex items-center gap-2 rounded-full border border-[#d3a24f] bg-[#3d3122] px-4 py-3 text-sm font-bold text-white shadow-xl transition-transform hover:scale-[1.02] md:bottom-20 md:right-6"
        aria-expanded={isOpen}
        aria-label={isOpen ? "Close Quipsly assistant panel" : "Open Quipsly assistant"}
      >
        <img src="/quipsly-app-icon.png" alt="Quipsly" className="h-5 w-5 rounded object-cover shadow-sm ring-1 ring-amber-200/50" />
        Quipsly
      </button>

      <aside
        className={`fixed right-0 top-[60px] z-30 h-[calc(100vh-60px)] w-full max-w-[420px] border-l border-[#e8dcc4] bg-[#fffaf1] shadow-2xl transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        aria-label="Quipsly assistant"
      >
        <div className="flex h-full flex-col">
          {/* Top level Tab Switcher */}
          <div className="flex border-b border-[#e8dcc4] bg-white/95 shrink-0">
            <button
              onClick={() => setActiveTab("CHAT")}
              className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 flex justify-center items-center gap-2 ${
                activeTab === "CHAT"
                  ? "border-[#a36f2e] text-[#342618]"
                  : "border-transparent text-[#6b5b45]/60 hover:text-[#6b5b45]"
              }`}
            >
              <img src="/quipsly-app-icon.png" alt="" className="h-4 w-4 rounded-sm opacity-80" />
              Chat
            </button>
            <button
              onClick={() => setActiveTab("STORY_BIBLE")}
              className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 flex justify-center items-center gap-2 ${
                activeTab === "STORY_BIBLE"
                  ? "border-[#a36f2e] text-[#342618]"
                  : "border-transparent text-[#6b5b45]/60 hover:text-[#6b5b45]"
              }`}
            >
              <ClipboardList className="h-4 w-4" />
              Story Bible & Study
            </button>
          </div>

          {activeTab === "CHAT" ? (
            <>
              <div className="border-b border-[#e8dcc4] bg-white/80 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#a36f2e]">
                      <img src="/quipsly-app-icon.png" alt="" className="h-4 w-4 rounded-sm" />
                      Research assistant
                    </div>
                    <h2 className="mt-1 font-serif text-2xl font-black text-[#342618]">Talk to your Quipsly</h2>
                    <p className="mt-1 text-xs leading-5 text-[#6b5b45]">
                      It gathers, drafts, organizes, and compares. Results appear automatically; saved changes are obvious and undoable.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="rounded-full border border-[#e8dcc4] bg-white p-2 text-[#6b5b45] hover:bg-[#f8f1e3]"
                    aria-label="Close Quipsly assistant"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900 flex items-center justify-between gap-2">
                  <span>Context: {contextSummary}</span>
                  {sessionId ? (
                    <span className="font-mono text-[9px] text-[#a36f2e] shrink-0" title={`Active Session ID: ${sessionId}`}>
                      SESS: {sessionId.slice(0, 8)}
                    </span>
                  ) : (
                    <span className="font-mono text-[9px] text-slate-400 shrink-0">
                      OFFLINE/LOCAL
                    </span>
                  )}
                </div>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                <section className="rounded-2xl border border-[#e8dcc4] bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-black text-[#342618]">
                    <Sparkles className="h-4 w-4 text-[#a36f2e]" />
                    Ask for research help
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {quickPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => setMessage(prompt)}
                        className="rounded-full border border-[#e8dcc4] bg-[#fffaf1] px-3 py-1.5 text-[11px] font-bold text-[#6b5b45] transition hover:border-[#d3a24f] hover:bg-amber-50"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    className="mt-3 min-h-24 w-full resize-none rounded-xl border border-[#e1cfad] bg-[#fffaf1] p-3 text-sm leading-6 text-[#3d3122] outline-none focus:border-[#d3a24f] focus:ring-2 focus:ring-amber-100"
                    placeholder="Ask me to find related examples, suggest tags, summarize this section, or prepare a research packet..."
                  />
                  <button
                    type="button"
                    onClick={() => void askAssistant()}
                    disabled={status === "loading"}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#8c6b4a] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#6f5237] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <img src="/quipsly-app-icon.png" alt="" className="h-4 w-4 rounded-sm" />}
                    {status === "loading" ? "Quipsly is gathering..." : "Ask Quipsly"}
                  </button>
                  {warning ? (
                    <div className={`mt-3 rounded-xl border px-3 py-2 text-xs leading-5 ${
                      status === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-amber-200 bg-amber-50 text-amber-900"
                    }`}>
                      {warning}
                    </div>
                  ) : null}
                </section>

                <section className="rounded-2xl border border-[#e8dcc4] bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-black text-[#342618]">
                    <HeartHandshake className="h-4 w-4 text-emerald-700" />
                    Quipsly says
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#5e4b33]">{assistantMessage}</p>
                </section>

                {suggestions.length > 0 ? (
                  <section className="rounded-2xl border border-[#e8dcc4] bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-2 text-sm font-black text-[#342618]">
                      <ClipboardList className="h-4 w-4 text-sky-700" />
                      Suggestions
                    </div>
                    <div className="mt-3 space-y-2">
                      {suggestions.map((suggestion, index) => (
                        <div key={`${suggestion.title}-${index}`} className="rounded-xl border border-sky-100 bg-sky-50/70 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-sm font-bold text-sky-950">{suggestion.title}</div>
                            <div className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-sky-800">
                              {Math.round(suggestion.confidence * 100)}%
                            </div>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-sky-900">{suggestion.detail}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                {visibleActions.length > 0 ? (
                <section className="rounded-2xl border border-[#e8dcc4] bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-black text-[#342618]">
                    <ShieldCheck className="h-4 w-4 text-emerald-700" />
                    Assistant work
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[#8a7356]">
                    Searches and analysis run immediately. Anything that changes saved work has one clear action and can be undone.
                  </p>
                  <div className="mt-3 space-y-3">
                    {visibleActions.map((action) => (
                        <div
                          key={action.id}
                          className={`rounded-xl border p-3 transition-all ${
                            action.status === "completed" || action.status === "approved"
                              ? action.kind === "find-examples" || action.kind === "search-quotes"
                                ? "border-sky-200 bg-sky-50/30"
                                : "border-emerald-200 bg-emerald-50/30"
                              : action.status === "rejected"
                                ? "border-slate-200 bg-slate-50/50 opacity-60"
                                : action.status === "undone"
                                  ? "border-amber-200 bg-amber-50/30"
                                  : "border-[#e8dcc4] bg-[#fffaf1]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-sm font-bold text-[#342618]">{action.label}</div>
                              {action.kind === "find-examples" || action.kind === "search-quotes" ? (
                                <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-sky-700">
                                  Research: {action.kind === "find-examples" ? "Examples" : "Quotes"} (Read-Only Search)
                                </div>
                              ) : action.kind === "propose-output-plan" ? (
                                <div className="mt-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-700">
                                  <PackageCheck className="h-3.5 w-3.5" />
                                  Output plan preview (No publishing)
                                </div>
                              ) : action.governance?.decisionPolicy === "READ_ONLY" ? (
                                <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-sky-700">
                                  Analysis · runs automatically
                                </div>
                              ) : action.governance?.decisionPolicy === "USER_INITIATED" ? (
                                <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-sky-700">
                                  Navigation · opens when chosen
                                </div>
                              ) : (
                                <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-700">
                                  Suggested change · {summarizeRisk(action.riskLevel)}
                                </div>
                              )}
                            </div>
                            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${actionStatusClass(action.status)}`}>
                              {action.status}
                            </span>
                          </div>
                          <div className="mt-2 rounded-lg bg-white/50 p-2">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-[#a36f2e]">Why this suggestion?</div>
                            <p className="mt-1 text-xs leading-5 text-[#6b5b45]">{action.explanation.replace(/^Why this suggestion\?\s*/i, "")}</p>
                          </div>
                          {action.governance ? (
                            <details className="mt-2 rounded-lg border border-sky-200 bg-sky-50/60 px-2 py-1.5 text-[10px] leading-4 text-sky-950">
                              <summary className="flex cursor-pointer list-none items-center gap-1 font-bold uppercase tracking-wide">
                                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                Details · {action.governance.decisionPolicy === "EXPLICIT_APPROVAL" ? "applies only when chosen" : "no approval needed"}
                              </summary>
                              <p className="mt-1 break-all font-mono">{action.governance.capabilityId}</p>
                              <p className="mt-1">Run {action.governance.runId?.slice(-8) || "pending"} · action {action.governance.actionId.slice(-8)} · {action.governance.status.toLowerCase().replaceAll("_", " ")}</p>
                            </details>
                          ) : null}
                          <EntityProposalEvidence action={action} />
                          {action.kind === "PROPOSE_DRAFT" && action.payload?.draftText ? (
                            <div className="mt-3 overflow-hidden rounded-lg border border-emerald-200">
                              <div className="bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-800 border-b border-emerald-200">
                                Proposed Draft
                              </div>
                              <div className="bg-white p-3 text-sm leading-6 text-slate-800 whitespace-pre-wrap">
                                {action.payload.draftText as string}
                              </div>
                            </div>
                          ) : null}
                          {action.kind === "PROPOSE_REWRITE" && action.payload?.rewriteText ? (
                            <div className="mt-3 flex flex-col gap-2">
                              <div className="overflow-hidden rounded-lg border border-slate-200">
                                <div className="bg-slate-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                                  Original Text
                                </div>
                                <div className="bg-white p-3 text-sm leading-6 text-slate-500 line-through whitespace-pre-wrap opacity-70">
                                  {action.payload.originalText as string}
                                </div>
                              </div>
                              <div className="overflow-hidden rounded-lg border border-emerald-200 shadow-sm">
                                <div className="bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-800 border-b border-emerald-200">
                                  What Changed (Rewrite)
                                </div>
                                <div className="bg-white p-3 text-sm leading-6 text-slate-800 whitespace-pre-wrap">
                                  {action.payload.rewriteText as string}
                                </div>
                              </div>
                            </div>
                          ) : null}
                          {action.kind === "CHECK_CONTINUITY" && action.payload?.issueDescription ? (
                            <div className="mt-3 overflow-hidden rounded-lg border border-amber-300">
                              <div className="bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-900 border-b border-amber-300">
                                Continuity Warning
                              </div>
                              <div className="bg-white p-3 text-sm leading-6 text-slate-800">
                                <p className="font-semibold text-amber-800 mb-2">{action.payload.issueDescription as string}</p>
                                {action.payload.violatingExcerpt ? (
                                  <div className="text-xs text-slate-600 border-l-2 border-amber-200 pl-2 italic">"{action.payload.violatingExcerpt as string}"</div>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                          {action.kind === "PROPOSE_CONTINUITY_FIX" && action.payload?.rewriteText ? (
                            <div className="mt-3 flex flex-col gap-2">
                              <div className="overflow-hidden rounded-lg border border-amber-300 shadow-sm">
                                <div className="bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-900 border-b border-amber-300">
                                  Continuity Fix Proposed
                                </div>
                                <div className="bg-white p-3 text-sm leading-6 text-slate-800">
                                  <p className="font-semibold text-amber-800 mb-2">{action.payload.issueDescription as string}</p>
                                </div>
                              </div>
                              <div className="overflow-hidden rounded-lg border border-slate-200">
                                <div className="bg-slate-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                                  Original Text
                                </div>
                                <div className="bg-white p-3 text-sm leading-6 text-slate-500 line-through whitespace-pre-wrap opacity-70">
                                  {action.payload.originalText as string}
                                </div>
                              </div>
                              <div className="overflow-hidden rounded-lg border border-emerald-200 shadow-sm">
                                <div className="bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-800 border-b border-emerald-200">
                                  Fixed Text
                                </div>
                                <div className="bg-white p-3 text-sm leading-6 text-slate-800 whitespace-pre-wrap">
                                  {action.payload.rewriteText as string}
                                </div>
                              </div>
                            </div>
                          ) : null}
                          {action.status === "proposed" ? (
                            <div className="mt-3 flex gap-2">
                              <button
                                type="button"
                                onClick={() => action.kind === "PROPOSE_ENTITY" || action.kind === "PROPOSE_ENTITY_UPDATE"
                                  ? saveAction(action)
                                  : approveAction(action)}
                                className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold text-white ${
                                  action.kind === "find-examples" || action.kind === "search-quotes"
                                    ? "bg-sky-700 hover:bg-sky-800"
                                    : action.kind === "CHECK_CONTINUITY"
                                      ? "bg-amber-600 hover:bg-amber-700"
                                      : "bg-emerald-700 hover:bg-emerald-800"
                                }`}
                              >
                                <Check className="h-3.5 w-3.5" />
                                {action.kind === "PROPOSE_DRAFT" || action.kind === "PROPOSE_REWRITE" || action.kind === "PROPOSE_CONTINUITY_FIX"
                                    ? "Apply persisted edit"
                                    : action.kind === "PROPOSE_ENTITY"
                                      ? "Add to Story Bible"
                                      : action.kind === "PROPOSE_ENTITY_UPDATE"
                                        ? "Apply Story Bible update"
                                        : "Show result"}
                              </button>
                              <button
                                type="button"
                                onClick={() => rejectAction(action)}
                                className="flex items-center gap-1 rounded-lg border border-[#d9c7a5] bg-white px-3 py-1.5 text-xs font-bold text-[#6b5b45] hover:bg-[#f8f1e3]"
                              >
                                <X className="h-3.5 w-3.5" />
                                Dismiss
                              </button>
                            </div>
                          ) : action.status === "ready" && action.governance?.decisionPolicy === "USER_INITIATED" ? (
                            <button
                              type="button"
                              onClick={() => approveAction(action)}
                              className="mt-3 flex items-center gap-1 rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-800"
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                              Open
                            </button>
                          ) : action.status === "ready" || action.status === "running" ? (
                            <div className="mt-3 flex items-center gap-2 text-xs font-bold text-sky-800" role="status">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Finding the useful result…
                            </div>
                          ) : action.status === "completed" ? (
                            <p className="mt-3 text-xs font-bold text-emerald-800">Result ready · no saved work changed.</p>
                          ) : action.status === "approved" ? (
                            <div className="mt-3 flex gap-2">
                              {action.kind === "PROPOSE_ENTITY" || action.kind === "PROPOSE_ENTITY_UPDATE" ? (
                                <button
                                  type="button"
                                  onClick={() => saveAction(action)}
                                  className="flex items-center gap-1 rounded-lg bg-[#a36f2e] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#8b5e27]"
                                >
                                  <BookOpen className="h-3.5 w-3.5" />
                                  Commit to Story Bible
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => undoAction(action)}
                                className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                {action.kind === "find-examples" || action.kind === "search-quotes" ? "Hide Search Results" : "Undo approval"}
                              </button>
                            </div>
                          ) : action.status === "deciding" || action.status === "applying" || action.status === "committing" ? (
                            <div className="mt-3 flex items-center gap-2 text-xs font-bold text-sky-800" role="status">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              {action.status === "deciding"
                                ? "Recording the review decision…"
                                : action.status === "applying"
                                  ? "Saving the manuscript receipt…"
                                  : "Committing the Story Bible receipt…"}
                            </div>
                          ) : action.status === "applied" ? (
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <p className="text-xs font-bold text-emerald-800">Persisted manuscript edit · reversible operation recorded.</p>
                              <button
                                type="button"
                                onClick={() => undoAction(action)}
                                className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Undo persisted edit
                              </button>
                            </div>
                          ) : action.status === "committed" ? (
                            <button
                              type="button"
                              onClick={() => undoSaveAction(action)}
                              className="mt-3 flex items-center gap-1 rounded-lg border border-[#d9c7a5] bg-white px-3 py-1.5 text-xs font-bold text-[#6b5b45] hover:bg-[#f8f1e3]"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Undo Story Bible commit
                            </button>
                          ) : action.status === "saved" ? (
                            <p className="mt-3 text-xs font-bold text-amber-800">Legacy assistant reference · not a canonical Story Bible entity.</p>
                          ) : null}
                        </div>
                      ))}
                  </div>
                </section>
                ) : null}

                {previews.length > 0 ? (
                  <section className="rounded-2xl border border-[#e8dcc4] bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-2 text-sm font-black text-[#342618]">
                      <Sparkles className="h-4 w-4 text-[#a36f2e]" />
                      Results
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[#8a7356]">
                      Read-only results are shown as soon as they are ready. Saved writing changes only through a visible action above.
                    </p>
                    <div className="mt-3 space-y-3">
                      {previews.map((preview) => {
                        const isResearch = preview.kind === "find-examples" || preview.kind === "search-quotes";
                        const isEntityProposal = preview.kind === "PROPOSE_ENTITY" || preview.kind === "PROPOSE_ENTITY_UPDATE";
                        return (
                          <div key={preview.id} className={`rounded-xl border p-3 ${isResearch ? 'border-sky-100 bg-sky-50/50' : 'border-amber-100 bg-amber-50/50'}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="text-sm font-bold text-[#342618]">{preview.title}</div>
                                <div className={`mt-1 text-[11px] font-bold uppercase tracking-[0.12em] ${isResearch ? 'text-sky-700' : 'text-[#a36f2e]'}`}>
                                  {isResearch ? "Research result" : isEntityProposal ? "Story Bible suggestion" : "Read-only result"} / {preview.kind}
                                </div>
                              </div>
                            </div>
                            <div className="mt-2 flex">
                              {isResearch ? (
                                <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800 border border-sky-200">
                                  ℹ️ Research Result: No manuscript changes
                                </span>
                              ) : isEntityProposal ? (
                                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">
                                  Suggestion only · Story Bible unchanged
                                </span>
                              ) : (
                                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200 animate-pulse">
                                  Result only · manuscript unchanged
                                </span>
                              )}
                            </div>
                            <p className="mt-2 text-xs leading-5 text-[#5e4b33]">{preview.detail}</p>
                            {preview.items.length > 0 ? (
                              <div className="mt-3 space-y-2">
                                {preview.items.map((item, index) => (
                                  <div key={`${preview.id}-${index}`} className="rounded-lg border border-white bg-white/80 px-3 py-2">
                                    <div className="text-xs font-black text-[#342618]">{item.label}</div>
                                    {item.detail ? <div className="mt-1 text-[11px] leading-5 text-[#6b5b45]">{item.detail}</div> : null}
                                    {item.source ? (
                                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-sky-100 pt-2 text-[10px] font-bold text-sky-900">
                                        <span>{item.source}</span>
                                        {item.href ? (
                                          <a
                                            href={item.href}
                                            className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 hover:bg-sky-100"
                                          >
                                            Open exact block
                                          </a>
                                        ) : (
                                          <span className="text-slate-500">Identity shown · no direct route</span>
                                        )}
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ) : null}

                <details className="rounded-2xl border border-[#e8dcc4] bg-white p-4 shadow-sm">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-black text-[#342618]">
                    <span className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-[#a36f2e]" />
                      Activity details
                    </span>
                    <span className="rounded-full bg-[#fff3dd] px-2 py-0.5 text-[10px] text-[#8a5b1f]">
                      {recentChanges.length}
                    </span>
                  </summary>
                  <p className="mt-3 text-xs leading-5 text-[#8a7356]">
                    Optional transparency receipts for results, saved changes, dismissals, and undos.
                  </p>
                  <p className="mt-1 text-[11px] leading-4 text-sky-800">
                    Refreshing the research index sends eligible writing blocks and quotes from this Nest to the configured embedding provider. A failed refresh keeps the previous index.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleSyncEmbeddings}
                        disabled={syncingEmbeddings}
                        className="shrink-0 flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-[11px] font-bold text-sky-800 hover:bg-sky-100 disabled:opacity-50"
                      >
                        {syncingEmbeddings ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                        {syncingEmbeddings ? "Refreshing…" : "Refresh AI research index"}
                      </button>
                      <button
                        type="button"
                        onClick={exportLedger}
                        className="shrink-0 flex items-center gap-1 rounded-full border border-[#d9c7a5] bg-[#fffaf1] px-3 py-1.5 text-[11px] font-bold text-[#6b5b45] hover:bg-[#f8f1e3]"
                      >
                        <Download className="h-3 w-3" />
                        Export Diagnostic Ledger
                      </button>
                  </div>
                  {exportStatus ? (
                    <div className={`mt-2 rounded-lg border px-3 py-2 text-xs font-bold ${exportStatusIsError ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`} role="status">
                      {exportStatus}
                    </div>
                  ) : null}
                  <div className="mt-3 space-y-2">
                    {recentChanges.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-[#d8c39f] bg-[#fffaf1] p-3 text-xs leading-5 text-[#8a7356]">
                        No assistant activity yet.
                      </div>
                    ) : recentChanges.map((change) => (
                      <div key={change.id} className={`rounded-xl border px-3 py-2 text-xs ${actionStatusClass(change.status)}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-black">{change.label}</div>
                          {change.createdAt ? (
                            <div className="text-[9px] font-mono opacity-60">
                              {new Date(change.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-1 leading-5">{change.note}</div>
                      </div>
                    ))}
                  </div>
                </details>

                <section className="rounded-2xl border border-[#e8dcc4] bg-[#3d3122] p-4 text-white shadow-sm">
                  <div className="text-sm font-black">Help keep the flock fed</div>
                  <p className="mt-2 text-xs leading-5 text-amber-100">
                    Temporary support rail: donations stay external for now. Later, Patreon events can reconcile into app-owned memberships.
                  </p>
                  <a
                    href={patreonHref || "https://www.patreon.com/"}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex rounded-xl bg-amber-200 px-3 py-2 text-xs font-black text-[#342618] hover:bg-amber-100"
                  >
                    Open support page
                  </a>
                </section>
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-hidden">
              <StoryBibleSidebar
                projectId={projectId}
                projectSlug={projectSlug}
                documentId={documentId ?? ""}
                documentTitle={documentTitle}
                activeBoundary={activeBoundary}
                activeView={activeView}
                visibleBlocks={visibleBlocks}
              />
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
