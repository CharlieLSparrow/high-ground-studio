"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DocumentBoundary, ViewDefinition } from "@/app/(app)/create/types";
import {
  applyAssistantDocumentEditAction,
  commitAssistantEntityAction,
  recordAssistantNonMutatingResultAction,
  recordAssistantProposalDecisionAction,
  searchExamplesAction,
  searchQuotesAction,
  undoAppliedAssistantDocumentEditAction,
  undoCommittedAssistantEntityAction,
} from "@/app/(app)/create/actions";
import { AssistantAction, AssistantActionStatus, AssistantPreviewCard, AssistantChange, AssistantResponse, AssistantSuggestion, AssistantBlockContext } from "./assistant-types";

function uniqueTags(blocks: AssistantBlockContext[]) {
  return Array.from(new Set(blocks.flatMap((block) => block.tags ?? []))).slice(0, 20);
}

function importantWords(value: string) {
  const stopWords = new Set([
    "about", "after", "again", "could", "find", "from", "have", "into", "like", "material", "related", "section", "should", "that", "this", "what", "with", "would", "quipsly",
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

function researchPreviewItem(result: any, projectSlug: string) {
  const provenance = result?.provenance && typeof result.provenance === "object" ? result.provenance : {};
  let source = String(result?.citation || provenance.origin || "Source identity unavailable");
  let href: string | undefined;
  if (provenance.origin === "studio-span" && provenance.documentId) {
    source = `${String(provenance.documentTitle || result.title || "Writing document")} · block ${String(provenance.blockStableId || provenance.blockId || "unknown")}`;
    href = `/create?project=${encodeURIComponent(projectSlug)}&document=${encodeURIComponent(String(provenance.documentId))}&block=${encodeURIComponent(String(provenance.blockId))}`;
  } else if (provenance.origin === "source-aware" && provenance.sourceDocumentId) {
    source = `${String(result?.citation || "Research source")} · ${String(provenance.sourceDocumentId)}`;
    href = `/research?source=${encodeURIComponent(String(provenance.sourceDocumentId))}`;
  } else if (provenance.origin === "semantic-lore" && provenance.quoteId) {
    source = `Story Bible quote · ${String(provenance.quoteId)}`;
  } else if (provenance.origin === "studio-knowledge" && provenance.blockStableId) {
    source = `${String(provenance.documentTitle || "Writing evidence")} · block ${String(provenance.blockStableId)}`;
  } else if (provenance.origin === "quipsly-lore" && provenance.nodeSlug) {
    source = `Lore node · ${String(provenance.nodeSlug)}`;
  }
  return {
    label: `${String(result?.title || "Untitled source")} / ${String(result?.citation || "Unknown source")}`,
    detail: String(result?.content || ""),
    source,
    href,
  };
}

export function useQuipslyAssistant({
  projectSlug,
  documentId,
  documentTitle,
  projectDocuments,
  activeBoundary,
  activeView,
  visibleBlocks,
}: {
  projectSlug: string;
  documentId: string;
  documentTitle?: string;
  projectDocuments?: { id: string; title: string; sourceLabel: string | null; updatedAt: string | Date }[];
  activeBoundary?: DocumentBoundary | null;
  activeView: ViewDefinition;
  visibleBlocks: AssistantBlockContext[];
}) {
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [message, setMessage] = useState("What should I notice in this section?");
  const [assistantMessage, setAssistantMessage] = useState("Ask Quipsly to find related material, summarize a block, check continuity, or help shape the work. Read-only results appear immediately; edits always have a clear Apply action and undo.");
  const [suggestions, setSuggestions] = useState<AssistantSuggestion[]>([]);
  const [actions, setActions] = useState<AssistantAction[]>([]);
  const [previews, setPreviews] = useState<AssistantPreviewCard[]>([]);
  const [recentChanges, setRecentChanges] = useState<AssistantChange[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [warning, setWarning] = useState<string | null>(null);
  const automaticActionIds = useRef(new Set<string>());

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
          projectDocuments: projectDocuments?.map((d: any) => ({ id: d.id, title: d.title, sourceLabel: d.sourceLabel })),
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
        status: intent.status || "proposed" as const,
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
      action.id === id ? {
        ...action,
        status: nextStatus,
        governance: action.governance && !["deciding", "applying", "committing"].includes(nextStatus)
          ? {
              ...action.governance,
              status: nextStatus === "ready"
                ? "READY"
                : nextStatus === "running"
                  ? "EXECUTING"
                  : nextStatus === "completed"
                    ? "SUCCEEDED"
                    : nextStatus === "approved"
                      ? "READY"
                : nextStatus === "rejected"
                  ? "REJECTED"
                  : nextStatus === "applied" || nextStatus === "committed"
                    ? "SUCCEEDED"
                    : nextStatus === "undone"
                      ? "UNDONE"
                      : "PROPOSED",
              decisionStatus: action.governance.decisionPolicy !== "EXPLICIT_APPROVAL"
                ? "NOT_REQUIRED"
                : nextStatus === "approved" || nextStatus === "applied" || nextStatus === "committed"
                ? "APPROVED"
                : nextStatus === "rejected"
                  ? "REJECTED"
                  : "PENDING",
            }
          : action.governance,
      } : action
    )));
  };

  const buildPreviewForAction = (action: AssistantAction): AssistantPreviewCard => {
    const createdAt = new Date().toISOString();
    const firstBlock = visibleBlocks.find((block) => block.text.trim().length > 0);
    const activeLabel = activeBoundary?.label ?? activeView.name;

    if (action.kind === "suggest-tags") {
      return {
        id: `preview-${action.id}`,
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
        id: `preview-${action.id}`,
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
        id: `preview-${action.id}`,
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
        id: `preview-${action.id}`,
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

    if (action.kind === "propose-output-plan") {
      const payload = action.payload ?? {};
      const capabilityPlan = payload.capabilityPlan as any;
      const packetSkeleton = payload.packetSkeleton as any;
      const requiredInputs = Array.isArray(capabilityPlan?.requiredInputs) ? capabilityPlan.requiredInputs : [];
      const fields = packetSkeleton?.fields && typeof packetSkeleton.fields === "object"
        ? Object.keys(packetSkeleton.fields)
        : [];

      return {
        id: `preview-${action.id}`,
        actionId: action.id,
        title: `Capability definition: ${String(payload.title || "Untitled output")}`,
        kind: action.kind,
        detail: String(capabilityPlan?.definitionSummary || "Review this capability definition before creating a real packet."),
        items: [
          { label: "Capability definition route", detail: String(payload.href || "No route provided.") },
          ...requiredInputs.slice(0, 5).map((input: any) => ({
            label: String(input.label || "Required input"),
            detail: `${String(input.evidenceState || "not-checked")}: ${String(input.note || "Verify this input before creating a real packet.")}`,
          })),
          ...(fields.length ? [{ label: "Packet fields", detail: fields.join(", ") }] : []),
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
        id: `preview-${action.id}`,
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

    if (action.kind === "CHECK_CONTINUITY") {
      const p = action.payload || {};
      return {
        id: `preview-${action.id}`,
        actionId: action.id,
        title: "Continuity Warning",
        kind: action.kind,
        detail: String(p.issueDescription || "Lore inconsistency detected."),
        items: p.violatingExcerpt ? [{ label: "Violating Excerpt", detail: `"${p.violatingExcerpt}"` }] : [],
        createdAt,
      };
    }

    if (action.kind === "PROPOSE_DRAFT" || action.kind === "PROPOSE_REWRITE" || action.kind === "PROPOSE_CONTINUITY_FIX") {
      const p = action.payload || {};
      const isRewrite = action.kind === "PROPOSE_REWRITE" || action.kind === "PROPOSE_CONTINUITY_FIX";

      const items = [];
      if (isRewrite && p.originalText) {
        items.push({ label: "Original Text", detail: String(p.originalText) });
      }
      items.push({ label: isRewrite ? "Proposed Rewrite" : "Proposed Draft", detail: String(p.draftText || p.rewriteText || "No text provided.") });

      return {
        id: `preview-${action.id}`,
        actionId: action.id,
        title: action.kind === "PROPOSE_CONTINUITY_FIX" ? "Proposed Continuity Fix" : isRewrite ? "Suggested Rewrite" : "Suggested Draft",
        kind: action.kind,
        detail: action.explanation || (isRewrite ? "Review the rewritten text." : "Review the drafted text."),
        items,
        createdAt,
      };
    }

    if (action.kind === "open-document") {
      const p = action.payload || {};
      const documentId = String(p.documentId || "unknown");
      const documentTitle = String(p.documentTitle || "Unknown Document");

      return {
        id: `preview-${action.id}`,
        actionId: action.id,
        title: `Suggested Document: ${documentTitle}`,
        kind: action.kind,
        detail: action.explanation || `I suggest reviewing the document "${documentTitle}" for more context.`,
        items: [
          { label: "Document", detail: documentTitle },
          { label: "Action", detail: "Clicking Approve will navigate you to this document." }
        ],
        createdAt,
      };
    }

    if (action.kind === "find-examples" || action.kind === "search-quotes") {
      const query = String(action.payload?.query || "");
      return {
        id: `preview-${action.id}`,
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

        if (hasChapterTag && hasEpisodeTag) {
          items.push({
            label: `Ambiguous Tags: "${firstLine.slice(0, 48)}"`,
            detail: `CRITICAL: Block has both "chapter" and "episode" tags. Proposing to keep "chapter" only.`,
          });
          continue;
        }

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
        id: `preview-${action.id}`,
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
      id: `preview-${action.id}`,
      actionId: action.id,
      title: "Unknown action preview",
      kind: action.kind,
      detail: `No preview handler defined for action kind: ${action.kind}`,
      items: [],
      createdAt,
    };
  };

  const runNonMutatingAction = async (
    action: AssistantAction,
    options: { navigate?: boolean } = {},
  ) => {
    updateActionStatus(action.id, "running");
    setWarning(null);
    let preview = buildPreviewForAction(action);
    let outcome: "succeeded" | "unavailable" = "succeeded";

    if (action.kind === "find-examples" || action.kind === "search-quotes") {
      try {
        const query = String(action.payload?.query || "");
        const result = action.kind === "find-examples"
          ? await searchExamplesAction(query, projectSlug)
          : await searchQuotesAction(query, projectSlug);
        if (result?.ok && result.packet?.results.length) {
          preview = {
            ...preview,
            detail: `Found ${result.packet.results.length} source-grounded match${result.packet.results.length === 1 ? "" : "es"} for “${query}”.`,
            items: result.packet.results.map((item: any) => researchPreviewItem(item, projectSlug)),
          };
        } else {
          preview = {
            ...preview,
            detail: `No direct source-grounded matches found for “${query}”.`,
            items: [{ label: "No matches found in this Nest." }],
          };
        }
      } catch (error) {
        console.error("Read-only assistant retrieval failed.", error);
        outcome = "unavailable";
        preview = {
          ...preview,
          detail: "Research retrieval is temporarily unavailable. Nothing was changed.",
          items: [{ label: "Try again", detail: "Your writing and prior results remain unchanged." }],
        };
      }
    }

    setPreviews((current) => [preview, ...current.filter((item) => item.actionId !== action.id)].slice(0, 12));
    const completion = await recordAssistantNonMutatingResultAction(action.id, {
      outcome,
      resultCount: preview.items.length,
      detail: preview.detail,
    });
    updateActionStatus(action.id, "completed");
    logChange(
      action,
      "completed",
      outcome === "succeeded"
        ? "Result shown immediately. No source work changed."
        : "Result could not be refreshed. No source work changed.",
    );
    if (!completion.ok) setWarning(completion.error);

    if (options.navigate && action.kind === "open-document") {
      const targetDocumentId = String(action.payload?.documentId || "");
      if (targetDocumentId) {
        window.location.href = `/create?project=${encodeURIComponent(projectSlug)}&document=${encodeURIComponent(targetDocumentId)}`;
      }
    }
  };

  useEffect(() => {
    actions
      .filter((action) => action.status === "ready" && action.governance?.decisionPolicy === "READ_ONLY")
      .forEach((action) => {
        if (automaticActionIds.current.has(action.id)) return;
        automaticActionIds.current.add(action.id);
        void runNonMutatingAction(action);
      });
    // runNonMutatingAction deliberately consumes the current editor context for
    // a newly ready action; action identity is the idempotency boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions]);

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

          const resultActions = data.actions.filter((a: any) => a.status === "approved" || a.status === "completed");
          const restoredPreviews = resultActions.map((action: any) => buildPreviewForAction(action));
          setPreviews(restoredPreviews);

          resultActions.forEach(async (action: any) => {
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
                        items: results.map((result: any) => researchPreviewItem(result, projectSlug)),
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

          const nonProposed = data.actions.filter((a: any) => !["proposed", "ready", "running"].includes(a.status));
          const restoredChanges = nonProposed.map((action: any) => {
            let note = "";
            if (action.status === "completed") {
              note = "Result shown without changing source work.";
            } else if (action.status === "approved") {
              note = action.kind === "find-examples" || action.kind === "search-quotes"
                ? "Recorded research approval. The retrieval result remains read-only."
                : "Recorded review approval and generated a non-destructive preview. No manuscript write occurred.";
            } else if (action.status === "applied") {
              note = "The reviewed manuscript edit has a persisted operation receipt.";
            } else if (action.status === "committed") {
              note = "The reviewed proposal has a canonical Story Bible commit receipt.";
            } else if (action.status === "saved") {
              note = "Legacy assistant reference. This is not a canonical Story Bible entity.";
            } else if (action.status === "rejected") {
              note = "Rejected proposal. No manuscript write occurred.";
            } else if (action.status === "undone") {
              note = "A persisted assistant operation or commit was reversed with a ledger receipt.";
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

  const approveAction = async (action: AssistantAction) => {
    const isResearch = action.kind === "find-examples" || action.kind === "search-quotes";
    const isDocumentEdit = action.kind === "PROPOSE_DRAFT" || action.kind === "PROPOSE_REWRITE" || action.kind === "PROPOSE_CONTINUITY_FIX";
    const isEntityProposal = action.kind === "PROPOSE_ENTITY" || action.kind === "PROPOSE_ENTITY_UPDATE";

    if (action.governance?.decisionPolicy === "READ_ONLY" || action.governance?.decisionPolicy === "USER_INITIATED") {
      await runNonMutatingAction(action, { navigate: action.kind === "open-document" });
      return;
    }

    if (isDocumentEdit) {
      updateActionStatus(action.id, "applying");
      setWarning(null);
      const result = await applyAssistantDocumentEditAction(action.id);
      if (!result.ok) {
        updateActionStatus(action.id, "proposed");
        setWarning(result.error);
        return;
      }

      updateActionStatus(action.id, "applied");
      setPreviews((current) => current.filter((preview) => preview.actionId !== action.id));
      logChange(
        action,
        "applied",
        `${result.replay ? "Verified existing" : "Persisted"} manuscript ${result.receipt.kind} · operation ${result.receipt.operationId}.`,
      );
      window.dispatchEvent(new CustomEvent("quipsly:assistant-edit-applied", { detail: result.receipt }));
      return;
    }

    updateActionStatus(action.id, "deciding");
    const decision = await recordAssistantProposalDecisionAction(action.id, "approved");
    if (!decision.ok) {
      updateActionStatus(action.id, "proposed");
      setWarning(decision.error);
      return;
    }

    updateActionStatus(action.id, "approved");
    const preview = buildPreviewForAction(action);
    setPreviews((current) => [preview, ...current].slice(0, 12));

    logChange(
      action,
      "approved",
      isResearch
        ? "Approved research retrieval. Querying database..."
        : isEntityProposal
          ? "Reviewed and approved as a proposal. No Story Bible entity exists until Commit succeeds."
          : "Recorded approval and generated a non-destructive preview. No manuscript write occurred."
    );

    if (action.kind === "open-document") {
      const documentId = String(action.payload?.documentId || "");
      if (documentId) {
        window.location.href = `/create?project=${encodeURIComponent(projectSlug)}&document=${encodeURIComponent(documentId)}`;
      }
      return;
    }

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
                items: results.map((result: any) => researchPreviewItem(result, projectSlug)),
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

  const rejectAction = async (action: AssistantAction) => {
    updateActionStatus(action.id, "deciding");
    setWarning(null);
    const decision = await recordAssistantProposalDecisionAction(action.id, "rejected");
    if (!decision.ok) {
      updateActionStatus(action.id, action.status);
      setWarning(decision.error);
      return;
    }
    updateActionStatus(action.id, "rejected");
    setPreviews((current) => current.filter((preview) => preview.actionId !== action.id));
    logChange(action, "rejected", `${decision.replay ? "Verified" : "Recorded"} rejection in the assistant ledger. No manuscript write occurred.`);
  };

  const undoAction = async (action: AssistantAction) => {
    if (action.status === "applied") {
      updateActionStatus(action.id, "applying");
      setWarning(null);
      const result = await undoAppliedAssistantDocumentEditAction(action.id);
      if (!result.ok) {
        updateActionStatus(action.id, "applied");
        setWarning(result.error);
        return;
      }
      updateActionStatus(action.id, "undone");
      setPreviews((current) => current.filter((preview) => preview.actionId !== action.id));
      logChange(action, "undone", `${result.replay ? "Verified existing" : "Persisted"} manuscript rollback · operation ${result.receipt.operationId}.`);
      window.dispatchEvent(new CustomEvent("quipsly:assistant-edit-undone", {
        detail: {
          ...result.receipt,
          restoredText: typeof action.payload.originalText === "string" ? action.payload.originalText : null,
        },
      }));
      return;
    }

    updateActionStatus(action.id, "deciding");
    setWarning(null);
    const decision = await recordAssistantProposalDecisionAction(action.id, "proposed");
    if (!decision.ok) {
      updateActionStatus(action.id, action.status);
      setWarning(decision.error);
      return;
    }
    updateActionStatus(action.id, "proposed");
    setPreviews((current) => current.filter((preview) => preview.actionId !== action.id));
    logChange(action, "proposed", `${decision.replay ? "Verified" : "Recorded"} approval reversal in the assistant ledger. No manuscript write occurred.`);
  };

  const saveAction = async (action: AssistantAction) => {
    if (action.kind !== "PROPOSE_ENTITY" && action.kind !== "PROPOSE_ENTITY_UPDATE") {
      setWarning("Only an exact-source entity proposal can commit to the canonical Story Bible.");
      return;
    }
    updateActionStatus(action.id, "committing");
    setWarning(null);
    const result = await commitAssistantEntityAction(action.id);
    if (!result.ok) {
      updateActionStatus(action.id, "approved");
      setWarning(result.error);
      return;
    }
    updateActionStatus(action.id, "committed");
    setPreviews((current) => current.filter((preview) => preview.actionId !== action.id));
    logChange(
      action,
      "committed",
      `${result.replay ? "Verified existing" : "Committed"} canonical Story Bible entity ${result.receipt.entityId}.`,
    );
    window.dispatchEvent(new CustomEvent("quipsly:refresh-story-bible"));
  };

  const undoSaveAction = async (action: AssistantAction) => {
    updateActionStatus(action.id, "committing");
    setWarning(null);
    const result = await undoCommittedAssistantEntityAction(action.id);
    if (!result.ok) {
      updateActionStatus(action.id, "committed");
      setWarning(result.error);
      return;
    }
    updateActionStatus(action.id, "undone");
    logChange(action, "undone", `Reversed canonical Story Bible ${result.receipt.operation} receipt for ${result.receipt.entityId}.`);
    window.dispatchEvent(new CustomEvent("quipsly:refresh-story-bible"));
  };

  return {
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
  };
}
