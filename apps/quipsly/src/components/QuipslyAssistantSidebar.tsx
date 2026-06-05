"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, Check, ChevronRight, ClipboardList, Feather, HeartHandshake, Loader2, RotateCcw, ShieldCheck, Sparkles, X } from "lucide-react";
import type { DocumentBoundary, ViewDefinition } from "@/app/(app)/create/types";
import { searchExamplesAction, searchQuotesAction, saveAssistantAction, undoSavedAssistantAction } from "@/app/(app)/create/actions";
import { StoryBibleSidebar } from "./story-bible";

type AssistantBlockContext = {
  id: string;
  text: string;
  tags?: string[];
};

type AssistantSuggestion = {
  title: string;
  detail: string;
  confidence: number;
};

type AssistantActionStatus = "proposed" | "approved" | "rejected" | "undone" | "saved";

type AssistantAction = {
  id: string;
  kind: string;
  label: string;
  explanation: string;
  riskLevel: "low" | "medium" | "high";
  payload: Record<string, unknown>;
  status: AssistantActionStatus;
  createdAt: string;
};

type AssistantPreviewCard = {
  id: string;
  actionId: string;
  title: string;
  kind: string;
  detail: string;
  items: Array<{ label: string; detail?: string }>;
  createdAt: string;
};

type AssistantChange = {
  id: string;
  actionId: string;
  label: string;
  status: AssistantActionStatus;
  note: string;
  createdAt: string;
};

type AssistantResponse = {
  ok: boolean;
  sessionId?: string;
  source?: string;
  assistantMessage?: string;
  suggestions?: AssistantSuggestion[];
  toolIntents?: Array<Omit<AssistantAction, "id" | "status" | "createdAt">>;
  actions?: AssistantAction[];
  warning?: string;
  error?: string;
};

function uniqueTags(blocks: AssistantBlockContext[]) {
  return Array.from(new Set(blocks.flatMap((block) => block.tags ?? []))).slice(0, 20);
}

function summarizeRisk(riskLevel: AssistantAction["riskLevel"]) {
  if (riskLevel === "high") return "Needs careful review";
  if (riskLevel === "medium") return "Review before applying";
  return "Safe proposal";
}

function actionStatusClass(status: AssistantActionStatus) {
  if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-800";
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

export function QuipslyAssistantSidebar({
  projectId,
  projectSlug,
  documentId,
  documentTitle,
  activeBoundary,
  activeView,
  visibleBlocks,
  patreonHref,
}: {
  projectId: string;
  projectSlug: string;
  documentId: string;
  documentTitle?: string;
  activeBoundary?: DocumentBoundary | null;
  activeView: ViewDefinition;
  visibleBlocks: AssistantBlockContext[];
  patreonHref?: string;
}) {
  const [activeTab, setActiveTab] = useState<"CHAT" | "STORY_BIBLE">("CHAT");
  const [isOpen, setIsOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [message, setMessage] = useState("What should I notice in this section?");
  const [assistantMessage, setAssistantMessage] = useState("Ask your Quipsly to find related material, suggest structure cleanup, summarize a block, or prepare a research packet. It will propose changes, not secretly make them.");
  const [suggestions, setSuggestions] = useState<AssistantSuggestion[]>([]);
  const [actions, setActions] = useState<AssistantAction[]>([]);
  const [previews, setPreviews] = useState<AssistantPreviewCard[]>([]);
  const [recentChanges, setRecentChanges] = useState<AssistantChange[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [warning, setWarning] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const contextSummary = useMemo(() => {
    const boundaryLabel = activeBoundary?.label ?? activeView.name;
    return `${projectSlug} / ${boundaryLabel}`;
  }, [activeBoundary?.label, activeView.name, projectSlug]);

  const recentTags = useMemo(() => uniqueTags(visibleBlocks), [visibleBlocks]);

  const askAssistant = async () => {
    const trimmed = message.trim();
    if (!trimmed) return;

    setStatus("loading");
    setWarning(null);
    try {
      const response = await fetch("/api/quipsly-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          message: trimmed,
          projectSlug,
          documentId,
          documentTitle,
          activeBoundary,
          activeViewName: activeView.name,
          visibleBlocks: visibleBlocks.slice(0, 14),
          recentTags,
        }),
      });

      const data = await response.json() as AssistantResponse;
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Quipsly could not answer safely.");
      }

      setAssistantMessage(data.assistantMessage ?? "I found a few safe next steps.");
      setSuggestions(data.suggestions ?? []);
      setWarning(data.warning ?? null);
      if (data.sessionId) setSessionId(data.sessionId);
      
      const createdAt = new Date().toISOString();
      const proposedActions = data.actions?.length ? data.actions : (data.toolIntents ?? []).map((intent: any, index: number) => ({
        ...intent,
        id: intent.id || `${Date.now().toString(36)}-${index}`,
        status: "proposed" as const,
        createdAt,
      }));
      setActions((current) => [...proposedActions, ...current].slice(0, 20));
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setWarning(error instanceof Error ? error.message : "Quipsly failed safely.");
    }
  };

  const logChange = (action: AssistantAction, nextStatus: AssistantActionStatus, note: string) => {
    setRecentChanges((current) => [{
      id: `${Date.now().toString(36)}-${action.id}`,
      actionId: action.id,
      label: action.label,
      status: nextStatus,
      note,
      createdAt: new Date().toISOString(),
    }, ...current].slice(0, 18));
  };

  const updateActionStatus = (id: string, nextStatus: AssistantActionStatus) => {
    setActions((current) => current.map((action) => (
      action.id === id ? { ...action, status: nextStatus } : action
    )));
  };

  const buildPreviewForAction = (action: AssistantAction): AssistantPreviewCard => {
    const createdAt = new Date().toISOString();
    const firstBlock = visibleBlocks.find((block) => block.text.trim().length > 0);
    const activeLabel = activeBoundary?.label ?? activeView.name;

    if (action.kind === "suggest-tags") {
      return {
        id: `preview-${Date.now().toString(36)}`,
        actionId: action.id,
        title: "Tag suggestions",
        kind: action.kind,
        detail: "These are buttons for thinking and review only. They do not apply tags yet.",
        items: [
          { label: "Chapter", detail: "Use on heading blocks that start a chapter range." },
          { label: "Episode", detail: "Use on heading blocks that start an episode range." },
        ],
        createdAt,
      };
    }

    if (action.kind === "summarize-selected-block") {
      const target = firstBlock ?? visibleBlocks[0];
      return {
        id: `preview-${Date.now().toString(36)}`,
        actionId: action.id,
        title: target ? "Local summary preview" : "Summary preview",
        kind: action.kind,
        detail: target
          ? summarizeText(target.text)
          : "No visible block text was available. Select or focus a section, then ask again.",
        items: target?.tags?.length
          ? target.tags.map((tag) => ({ label: tag }))
          : [{ label: "No tags detected on previewed block" }],
        createdAt,
      };
    }

    if (action.kind === "find-related-blocks") {
      const query = importantWords(`${message} ${activeLabel} ${action.label} ${action.explanation}`);
      const matches = visibleBlocks
        .map((block) => {
          const text = `${block.text} ${(block.tags ?? []).join(" ")}`.toLowerCase();
          const score = query.reduce((total, word) => total + (text.includes(word) ? 1 : 0), 0);
          return { block, score };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);

      return {
        id: `preview-${Date.now().toString(36)}`,
        actionId: action.id,
        title: "Related blocks preview",
        kind: action.kind,
        detail: matches.length
          ? `Found ${matches.length} visible block${matches.length === 1 ? "" : "s"} with overlapping terms: ${query.slice(0, 6).join(", ")}.`
          : "No strong local matches in the currently visible block slice. A future pass can search the full project index.",
        items: matches.length
          ? matches.map(({ block, score }) => ({
              label: `${score} match${score === 1 ? "" : "es"} / ${block.id.slice(0, 8)}`,
              detail: block.text.replace(/\s+/g, " ").trim().slice(0, 180),
            }))
          : [{ label: "No local matches", detail: "Try asking with a specific theme, quote, episode, or source." }],
        createdAt,
      };
    }

    if (action.kind === "create-research-packet-note") {
      return {
        id: `preview-${Date.now().toString(36)}`,
        actionId: action.id,
        title: "Research packet note preview",
        kind: action.kind,
        detail: `Draft packet for ${activeLabel}. This is not persisted yet.`,
        items: [
          { label: "Focus", detail: activeLabel },
          { label: "Prompt", detail: message },
          { label: "Recent tags", detail: recentTags.length ? recentTags.join(", ") : "No recent tags detected." },
          ...suggestions.slice(0, 3).map((suggestion) => ({
            label: suggestion.title,
            detail: suggestion.detail,
          })),
        ],
        createdAt,
      };
    }

    if (action.kind === "PROPOSE_ENTITY" || action.kind === "PROPOSE_ENTITY_UPDATE") {
      const p = action.payload || {};
      const entityName = String(p.name || "Unknown Entity");
      const entityType = String(p.type || "Unknown Type");
      const attributes = p.attributes as Record<string, any> || {};
      const sourceExcerpt = String(attributes.sourceExcerpt || "No excerpt provided.");
      const items = Object.entries(attributes)
        .filter(([k]) => k !== "sourceExcerpt")
        .map(([k, v]) => ({ label: k, detail: String(v) }));

      return {
        id: `preview-${Date.now().toString(36)}`,
        actionId: action.id,
        title: action.kind === "PROPOSE_ENTITY" ? `Proposed Entity: ${entityName}` : `Proposed Entity Update: ${entityName}`,
        kind: action.kind,
        detail: `Type: ${entityType}`,
        items: [
          { label: "Source Excerpt", detail: `"${sourceExcerpt}"` },
          ...items,
        ],
        createdAt,
      };
    }

    if (action.kind === "find-examples" || action.kind === "search-quotes") {
      const query = String(action.payload?.query || "");
      return {
        id: `preview-${Date.now().toString(36)}`,
        actionId: action.id,
        title: action.kind === "find-examples" ? "Research: Manuscript examples" : "Research: Verified quotes",
        kind: action.kind,
        detail: `Searching for: "${query}". Connecting to read-only research retrieval...`,
        items: [{ label: "Loading research results...", detail: "Please wait while Quipsly queries the database." }],
        createdAt,
      };
    }

    if (action.kind === "suggest-outline-cleanup") {
      const items: Array<{ label: string; detail?: string }> = [];

      for (const block of visibleBlocks) {
        const text = block.text.trim();
        const firstLine = text.split("\n")[0].trim();
        if (!firstLine) continue;

        const hasChapterTag = (block.tags ?? []).includes("chapter");
        const hasEpisodeTag = (block.tags ?? []).includes("episode");
        const hasStructureTag = hasChapterTag || hasEpisodeTag;

        // 1. Duplicate/ambiguous structure tags
        if (hasChapterTag && hasEpisodeTag) {
          items.push({
            label: `Ambiguous Tags: "${firstLine.slice(0, 48)}"`,
            detail: `CRITICAL: Block has both "chapter" and "episode" tags. Proposing to keep "chapter" only.`,
          });
          continue;
        }

        // 2. Likely Chapter headings (starts with Chapter / Ch. / Ch)
        const isLikelyChapter = /^(chapter|ch\.|ch\s+\d)/i.test(firstLine);
        if (isLikelyChapter) {
          if (!hasChapterTag) {
            items.push({
              label: `Missing Chapter Tag: "${firstLine.slice(0, 48)}"`,
              detail: `Proposing to ADD "chapter" tag to align with text header.`,
            });
          }
          continue;
        }

        // 3. Likely Episode headings (starts with Episode / Ep. / Ep)
        const isLikelyEpisode = /^(episode|ep\.|ep\s+\d)/i.test(firstLine);
        if (isLikelyEpisode) {
          if (!hasEpisodeTag) {
            items.push({
              label: `Missing Episode Tag: "${firstLine.slice(0, 48)}"`,
              detail: `Proposing to ADD "episode" tag to align with text header.`,
            });
          }
          continue;
        }

        // 4. Untagged heading candidates (short, single-line, bold or capital starts, under 60 chars)
        const isShortOneLine = text.length > 0 && text.length < 60 && !text.includes("\n");
        const isCapitalized = /^[A-Z0-9]/.test(firstLine);
        if (isShortOneLine && isCapitalized && !hasStructureTag) {
          items.push({
            label: `Untagged Heading Candidate: "${firstLine}"`,
            detail: `Looks like a chapter/episode heading range boundary but has no structure tags.`,
          });
        }
      }

      return {
        id: `preview-${Date.now().toString(36)}`,
        actionId: action.id,
        title: "Outline Hygiene Audit",
        kind: action.kind,
        detail: items.length > 0
          ? `Found ${items.length} structural outline cleanup proposals for human review.`
          : "Outline is clean! All headings and chapter/episode tags align perfectly.",
        items: items.length > 0 ? items : [{ label: "All clear", detail: "No untagged headings or ambiguous tags detected." }],
        createdAt,
      };
    }

    return {
      id: `preview-${Date.now().toString(36)}`,
      actionId: action.id,
      title: "Unknown action preview",
      kind: action.kind,
      detail: `No preview handler defined for action kind: ${action.kind}`,
      items: [],
      createdAt,
    };
  };

  useEffect(() => {
    let active = true;
    const restoreSession = async () => {
      try {
        const res = await fetch(
          `/api/quipsly-assistant?projectSlug=${encodeURIComponent(projectSlug)}&documentId=${encodeURIComponent(documentId)}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!active || !data.ok || data.fallback || !data.sessionId) return;

        setSessionId(data.sessionId);

        if (data.messages && data.messages.length > 0) {
          const assistantMsgs = data.messages.filter((m: any) => m.role === "assistant");
          if (assistantMsgs.length > 0) {
            const lastMsg = assistantMsgs[assistantMsgs.length - 1];
            setAssistantMessage(lastMsg.content);
          }
        }

        if (data.actions && data.actions.length > 0) {
          setActions(data.actions);

          // Build preview cards for approved actions
          const approved = data.actions.filter((a: any) => a.status === "approved");
          const restoredPreviews = approved.map((action: any) => buildPreviewForAction(action));
          setPreviews(restoredPreviews);

          // Re-fetch research results for approved actions
          approved.forEach(async (action: any) => {
            if (action.kind === "find-examples" || action.kind === "search-quotes") {
              try {
                const query = String(action.payload?.query || "");
                const res = action.kind === "find-examples"
                  ? await searchExamplesAction(query, projectSlug)
                  : await searchQuotesAction(query, projectSlug);

                if (!active) return;

                if (res && res.ok && res.packet && res.packet.results.length > 0) {
                  const results = res.packet.results;
                  setPreviews((current) => current.map((p) => {
                    if (p.actionId === action.id) {
                      return {
                        ...p,
                        detail: `Read-only Research Results for: "${query}". Found ${results.length} evidence matches in library "${res.packet.librarySlug}".`,
                        items: results.map((r: any) => ({
                          label: `${r.title} / ${r.citation || 'Unknown Source'}`,
                          detail: r.content,
                        })),
                      };
                    }
                    return p;
                  }));
                } else {
                  setPreviews((current) => current.map((p) => {
                    if (p.actionId === action.id) {
                      return {
                        ...p,
                        detail: `Read-only Research Results for: "${query}". No direct matches found.`,
                        items: [{ label: "No matches found in active manuscript." }],
                      };
                    }
                    return p;
                  }));
                }
              } catch (e) {
                console.error("Failed to restore research preview:", e);
                if (!active) return;
                setPreviews((current) => current.map((p) => {
                  if (p.actionId === action.id) {
                    return {
                      ...p,
                      detail: `Retrieval engine is offline or unavailable. Local fallback search completed: 0 results.`,
                      items: [{ label: "Fallback", detail: "Database connection failed or search failed." }],
                    };
                  }
                  return p;
                }));
              }
            }
          });

          // Populate recent changes
          const nonProposed = data.actions.filter((a: any) => a.status !== "proposed");
          const restoredChanges = nonProposed.map((action: any) => {
            let note = "";
            if (action.status === "approved") {
              note = action.kind === "find-examples" || action.kind === "search-quotes"
                ? "Approved research retrieval. Querying database..."
                : "Approved locally and generated a non-destructive preview. No manuscript write occurred.";
            } else if (action.status === "rejected") {
              note = "Rejected proposal. No manuscript write occurred.";
            } else if (action.status === "undone") {
              note = "Removed local approval preview. No persisted state was changed.";
            }
            return {
              id: `log-${action.id}`,
              actionId: action.id,
              label: action.label,
              status: action.status,
              note,
              createdAt: action.createdAt,
            };
          });
          setRecentChanges(restoredChanges);
        }
      } catch (err) {
        console.error("Failed to load active assistant session:", err);
      }
    };

    void restoreSession();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectSlug, documentId]);

  const syncLedger = (actionId: string, newStatus: AssistantActionStatus, note?: string) => {
    fetch("/api/quipsly-assistant/ledger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionId, newStatus, note }),
    }).catch(console.error); // Best effort, optimistic update
  };

  const approveAction = async (action: AssistantAction) => {
    updateActionStatus(action.id, "approved");
    const preview = buildPreviewForAction(action);
    setPreviews((current) => [preview, ...current].slice(0, 12));

    const isResearch = action.kind === "find-examples" || action.kind === "search-quotes";
    logChange(
      action,
      "approved",
      isResearch
        ? "Approved research retrieval. Querying database..."
        : "Approved locally and generated a non-destructive preview. No manuscript write occurred."
    );
    syncLedger(
      action.id,
      "approved",
      isResearch ? "Approved research retrieval" : "Approved locally and generated preview"
    );

    if (isResearch) {
      try {
        const query = String(action.payload?.query || "");
        const res = action.kind === "find-examples"
          ? await searchExamplesAction(query, projectSlug)
          : await searchQuotesAction(query, projectSlug);

        if (res && res.ok && res.packet && res.packet.results.length > 0) {
          const results = res.packet.results;
          setPreviews((current) => current.map((p) => {
            if (p.actionId === action.id) {
              return {
                ...p,
                detail: `Read-only Research Results for: "${query}". Found ${results.length} evidence matches in library "${res.packet.librarySlug}".`,
                items: results.map((r: any) => ({
                  label: `${r.title} / ${r.citation || 'Unknown Source'}`,
                  detail: r.content,
                })),
              };
            }
            return p;
          }));
        } else {
          setPreviews((current) => current.map((p) => {
            if (p.actionId === action.id) {
              return {
                ...p,
                detail: `Read-only Research Results for: "${query}". No direct matches found.`,
                items: [{ label: "No matches found in active manuscript." }],
              };
            }
            return p;
          }));
        }
      } catch (err) {
        console.error("Retrieval failed", err);
        setPreviews((current) => current.map((p) => {
          if (p.actionId === action.id) {
            return {
              ...p,
              detail: `Retrieval engine is offline or unavailable. Local fallback search completed: 0 results.`,
              items: [{ label: "Fallback", detail: "Database connection failed or search failed." }],
            };
          }
          return p;
        }));
      }
    }
  };

  const rejectAction = (action: AssistantAction) => {
    updateActionStatus(action.id, "rejected");
    logChange(action, "rejected", "Rejected proposal. No manuscript write occurred.");
    syncLedger(action.id, "rejected", "Rejected proposal");
  };

  const undoAction = (action: AssistantAction) => {
    updateActionStatus(action.id, "undone");
    setPreviews((current) => current.filter((preview) => preview.actionId !== action.id));
    logChange(action, "undone", "Removed local approval preview. No persisted state was changed.");
    syncLedger(action.id, "undone", "Undid approval");
  };

  const saveAction = async (action: AssistantAction) => {
    updateActionStatus(action.id, "saved");
    logChange(action, "saved", "Saved as persistent research note in ledger.");
    syncLedger(action.id, "saved", "Saved as Research Note");
    
    const p = action.payload || {};
    const provenance = {
      projectSlug,
      documentId,
      documentTitle,
      blockId: visibleBlocks[0]?.id || null,
      sourceExcerpt: (p as any).attributes?.sourceExcerpt || null,
      assistantActionId: action.id,
      createdBy: "Quipsly AI",
    };
    await saveAssistantAction(action.id, provenance);
  };

  const undoSaveAction = async (action: AssistantAction) => {
    updateActionStatus(action.id, "undone");
    logChange(action, "undone", "Archived saved note from persistent ledger.");
    syncLedger(action.id, "undone", "Undid saved note");
    await undoSavedAssistantAction(action.id);
  };

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
    setExportStatus("Diagnostic JSON exported.");
    window.setTimeout(() => setExportStatus(null), 3000);
  };

  const lastApproved = actions.find((action) => action.status === "approved");

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="fixed bottom-20 right-5 z-40 flex items-center gap-2 rounded-full border border-[#d3a24f] bg-[#3d3122] px-4 py-3 text-sm font-bold text-white shadow-xl transition-transform hover:scale-[1.02] md:bottom-6"
        aria-expanded={isOpen}
      >
        <Feather className="h-4 w-4 text-amber-200" />
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
              <Bot className="h-4 w-4" />
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
                      <Bot className="h-4 w-4" />
                      Research assistant
                    </div>
                    <h2 className="mt-1 font-serif text-2xl font-black text-[#342618]">Talk to your Quipsly</h2>
                    <p className="mt-1 text-xs leading-5 text-[#6b5b45]">
                      It gathers, organizes, compares, and proposes. You write and approve.
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
                    {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Feather className="h-4 w-4" />}
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

                <section className="rounded-2xl border border-[#e8dcc4] bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-black text-[#342618]">
                      <ShieldCheck className="h-4 w-4 text-emerald-700" />
                      Proposed actions
                    </div>
                    {lastApproved ? (
                      <button
                        type="button"
                        onClick={() => undoAction(lastApproved)}
                        className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-900 hover:bg-amber-100"
                      >
                        Undo last approval
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[#8a7356]">
                    Approval is recorded locally in this first pass. Manuscript writes come later after project access and rollback are wired.
                  </p>
                  <div className="mt-3 space-y-3">
                    {actions.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-[#d8c39f] bg-[#fffaf1] p-4 text-xs leading-5 text-[#8a7356]">
                        No proposed actions yet. Ask Quipsly what to notice or organize.
                      </div>
                    ) : (
                      actions.map((action) => (
                        <div
                          key={action.id}
                          className={`rounded-xl border p-3 transition-all ${
                            action.status === "approved"
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
                              ) : (
                                <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-700">
                                  Proposed Action: {action.kind} ({summarizeRisk(action.riskLevel)})
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
                          {action.status === "proposed" ? (
                            <div className="mt-3 flex gap-2">
                              <button
                                type="button"
                                onClick={() => approveAction(action)}
                                className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold text-white ${
                                  action.kind === "find-examples" || action.kind === "search-quotes"
                                    ? "bg-sky-700 hover:bg-sky-800"
                                    : "bg-emerald-700 hover:bg-emerald-800"
                                }`}
                              >
                                <Check className="h-3.5 w-3.5" />
                                {action.kind === "find-examples" || action.kind === "search-quotes" ? "Execute Search" : "Approve"}
                              </button>
                              <button
                                type="button"
                                onClick={() => rejectAction(action)}
                                className="flex items-center gap-1 rounded-lg border border-[#d9c7a5] bg-white px-3 py-1.5 text-xs font-bold text-[#6b5b45] hover:bg-[#f8f1e3]"
                              >
                                <X className="h-3.5 w-3.5" />
                                {action.kind === "find-examples" || action.kind === "search-quotes" ? "Dismiss" : "Reject"}
                              </button>
                            </div>
                          ) : action.status === "approved" ? (
                            <div className="mt-3 flex gap-2">
                              <button
                                type="button"
                                onClick={() => saveAction(action)}
                                className="flex items-center gap-1 rounded-lg bg-[#a36f2e] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#8b5e27]"
                              >
                                <Check className="h-3.5 w-3.5" />
                                Save as Research Note
                              </button>
                              <button
                                type="button"
                                onClick={() => undoAction(action)}
                                className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                {action.kind === "find-examples" || action.kind === "search-quotes" ? "Hide Search Results" : "Undo approval"}
                              </button>
                            </div>
                          ) : action.status === "saved" ? (
                            <button
                              type="button"
                              onClick={() => undoSaveAction(action)}
                              className="mt-3 flex items-center gap-1 rounded-lg border border-[#d9c7a5] bg-white px-3 py-1.5 text-xs font-bold text-[#6b5b45] hover:bg-[#f8f1e3]"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Undo saved note
                            </button>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </section>

                {previews.length > 0 ? (
                  <section className="rounded-2xl border border-[#e8dcc4] bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-2 text-sm font-black text-[#342618]">
                      <Sparkles className="h-4 w-4 text-[#a36f2e]" />
                      Local previews
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[#8a7356]">
                      These are generated from loaded browser state. They are safe to inspect and are not persisted.
                    </p>
                    <div className="mt-3 space-y-3">
                      {previews.map((preview) => {
                        const isResearch = preview.kind === "find-examples" || preview.kind === "search-quotes";
                        return (
                          <div key={preview.id} className={`rounded-xl border p-3 ${isResearch ? 'border-sky-100 bg-sky-50/50' : 'border-amber-100 bg-amber-50/50'}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="text-sm font-bold text-[#342618]">{preview.title}</div>
                                <div className={`mt-1 text-[11px] font-bold uppercase tracking-[0.12em] ${isResearch ? 'text-sky-700' : 'text-[#a36f2e]'}`}>
                                  {isResearch ? "Research Result" : "Proposed Write Preview"} / {preview.kind}
                                </div>
                              </div>
                            </div>
                            <div className="mt-2 flex">
                              {isResearch ? (
                                <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800 border border-sky-200">
                                  ℹ️ Research Result: No manuscript changes
                                </span>
                              ) : (
                                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200 animate-pulse">
                                  ⚠️ Proposed Outline: Needs approval to write
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

                <section className="rounded-2xl border border-[#e8dcc4] bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-[#342618]">Recent assistant changes</div>
                      <p className="mt-1 text-xs leading-5 text-[#8a7356]">
                        Local approvals, rejections, undos, and generated previews.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={exportLedger}
                      className="shrink-0 rounded-full border border-[#d9c7a5] bg-[#fffaf1] px-3 py-1.5 text-[11px] font-bold text-[#6b5b45] hover:bg-[#f8f1e3]"
                    >
                      Export JSON
                    </button>
                  </div>
                  {exportStatus ? (
                    <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
                      {exportStatus}
                    </div>
                  ) : null}
                  <div className="mt-3 space-y-2">
                    {recentChanges.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-[#d8c39f] bg-[#fffaf1] p-3 text-xs leading-5 text-[#8a7356]">
                        No assistant approvals or previews yet.
                      </div>
                    ) : recentChanges.map((change) => (
                      <div key={change.id} className={`rounded-xl border px-3 py-2 text-xs ${actionStatusClass(change.status)}`}>
                        <div className="font-black">{change.label}</div>
                        <div className="mt-1 leading-5">{change.note}</div>
                      </div>
                    ))}
                  </div>
                </section>

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
                documentId={documentId}
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
