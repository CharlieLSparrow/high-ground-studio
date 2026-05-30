"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { StudioNav } from "../studio-nav";
import {
  cardClassName,
  cn,
  labelClassName,
  monoMetaClassName,
  panelClassName,
  panelCopyClassName,
  panelTitleClassName,
  primaryButtonClassName,
  StudioChip,
  StudioGlyph,
} from "../studio-ui";
import {
  createStarterSampleCards,
  createStructureOutlineMarkdown,
  DEFAULT_LANE_ID,
  DEFAULT_SELECTION,
  DEFAULT_SEMANTIC_TYPE,
  DEFAULT_SOURCE_TITLE,
  DEFAULT_SOURCE_TYPE,
  getLaneLabel,
  getSemanticLabel,
  getSourceTypeLabel,
  isLaneId,
  isSemanticType,
  isSourceType,
  quickLaneOptions,
  quickSemanticTypeOptions,
  safeStructureDraft,
  semanticTypeOptions,
  sourceTypeOptions,
  STARTER_SAMPLE_TEXT,
  STARTER_SAMPLE_TITLE,
  STARTER_SAMPLE_TYPE,
  STORAGE_KEY,
  structureLanes,
} from "./structure-mode-model";
import type {
  HighlightCard,
  LaneId,
  SemanticType,
  SelectionState,
  SourceType,
  StructureDraft,
} from "./structure-mode-model";

type StudioStructureClientProps = {
  actor: {
    primaryEmail: string;
  };
};

function createCardId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `highlight-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

const fieldLabelClassName =
  "text-[0.78rem] font-extrabold uppercase text-studio-muted";

const fieldClassName =
  "min-h-10 w-full rounded-lg border border-studio-line-strong bg-[#0f1512] px-2.5 py-2 text-studio-ink disabled:text-studio-dim";

const textareaClassName =
  "w-full resize-y rounded-lg border border-studio-line-strong bg-[#0f1512] px-3 py-2.5 text-[0.95rem] leading-7 text-studio-ink disabled:text-studio-dim";

const smallButtonClassName =
  "min-h-8 rounded-lg border border-studio-line bg-studio-ink/5 px-2.5 py-1.5 text-[0.78rem] font-extrabold text-studio-source disabled:text-studio-dim";

const dangerButtonClassName =
  "min-h-8 rounded-lg border border-studio-danger/45 bg-studio-danger/10 px-2.5 py-1.5 text-[0.78rem] font-extrabold text-studio-danger";

export function StudioStructureClient({ actor }: StudioStructureClientProps) {
  const sourceTextRef = useRef<HTMLTextAreaElement>(null);
  const skipNextPersistRef = useRef(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isSourcePanelVisible, setIsSourcePanelVisible] = useState(true);
  const [sourceTitle, setSourceTitle] = useState(DEFAULT_SOURCE_TITLE);
  const [sourceType, setSourceType] =
    useState<SourceType>(DEFAULT_SOURCE_TYPE);
  const [sourceText, setSourceText] = useState("");
  const [selection, setSelection] =
    useState<SelectionState>(DEFAULT_SELECTION);
  const [semanticType, setSemanticType] =
    useState<SemanticType>(DEFAULT_SEMANTIC_TYPE);
  const [highlightNote, setHighlightNote] = useState("");
  const [defaultLaneId, setDefaultLaneId] = useState<LaneId>(DEFAULT_LANE_ID);
  const [cards, setCards] = useState<HighlightCard[]>([]);
  const [exportJson, setExportJson] = useState("");
  const [outlineMarkdown, setOutlineMarkdown] = useState("");
  const [importJson, setImportJson] = useState("");
  const [message, setMessage] = useState("MVP browser draft.");

  useEffect(() => {
    try {
      const rawDraft = window.localStorage.getItem(STORAGE_KEY);

      if (rawDraft) {
        const parsed = safeStructureDraft(JSON.parse(rawDraft));

        if (parsed) {
          setSourceTitle(parsed.sourceTitle);
          setSourceType(parsed.sourceType);
          setSourceText(parsed.sourceText);
          setCards(parsed.cards);
          setMessage("Loaded browser-local Structure Mode draft.");
        }
      }
    } catch (error) {
      console.error("Structure Mode draft load failed.", error);
      setMessage("Could not load the browser-local draft.");
    } finally {
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }

    const draft: StructureDraft = {
      sourceTitle,
      sourceType,
      sourceText,
      cards,
    };

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch (error) {
      console.error("Structure Mode draft save failed.", error);
      setMessage("Could not save the browser-local draft.");
    }
  }, [cards, isHydrated, sourceText, sourceTitle, sourceType]);

  const cardsByLane = useMemo(() => {
    return Object.fromEntries(
      structureLanes.map((lane) => [
        lane.id,
        cards.filter((card) => card.laneId === lane.id),
      ]),
    ) as Record<LaneId, HighlightCard[]>;
  }, [cards]);

  const hasDraftContent = sourceText.trim().length > 0 || cards.length > 0;
  const sourceSummary = `${sourceTitle.trim() || DEFAULT_SOURCE_TITLE} - ${getSourceTypeLabel(sourceType)} - ${sourceText.length.toLocaleString()} chars`;

  function captureSelection() {
    const textarea = sourceTextRef.current;

    if (!textarea) {
      return;
    }

    const startOffset = textarea.selectionStart;
    const endOffset = textarea.selectionEnd;
    const selectedText =
      endOffset > startOffset ? sourceText.slice(startOffset, endOffset) : "";

    setSelection({
      startOffset,
      endOffset,
      selectedText,
    });
  }

  function createHighlightCard() {
    if (!isSourcePanelVisible) {
      setMessage("Show the pasted source panel before creating a new highlight.");
      return;
    }

    const textarea = sourceTextRef.current;
    const startOffset = textarea?.selectionStart ?? selection.startOffset;
    const endOffset = textarea?.selectionEnd ?? selection.endOffset;
    const selectedText =
      endOffset > startOffset ? sourceText.slice(startOffset, endOffset) : "";

    if (!selectedText.trim()) {
      setMessage("Select text in the pasted source before creating a highlight.");
      return;
    }

    const card: HighlightCard = {
      id: createCardId(),
      selectedText,
      startOffset,
      endOffset,
      semanticType,
      note: highlightNote.trim(),
      sourceTitle: sourceTitle.trim() || DEFAULT_SOURCE_TITLE,
      sourceType,
      createdAt: new Date().toISOString(),
      laneId: defaultLaneId,
    };

    setCards((current) => [...current, card]);
    setHighlightNote("");
    setSelection({
      startOffset,
      endOffset,
      selectedText,
    });
    setMessage("Highlight card created and saved locally in this browser.");
  }

  function updateCard(cardId: string, updates: Partial<HighlightCard>) {
    setCards((current) =>
      current.map((card) =>
        card.id === cardId
          ? {
              ...card,
              ...updates,
            }
          : card,
      ),
    );
  }

  function duplicateCard(cardId: string) {
    const currentIndex = cards.findIndex((card) => card.id === cardId);
    const card = cards[currentIndex];

    if (!card) {
      return;
    }

    const duplicate: HighlightCard = {
      ...card,
      id: createCardId(),
      createdAt: new Date().toISOString(),
    };

    setCards((current) => [
      ...current.slice(0, currentIndex + 1),
      duplicate,
      ...current.slice(currentIndex + 1),
    ]);
    setMessage("Highlight card duplicated.");
  }

  function deleteCard(cardId: string) {
    const card = cards.find((candidate) => candidate.id === cardId);

    if (!card) {
      return;
    }

    const confirmed = window.confirm(
      "Delete this highlight card from the browser-local draft?",
    );

    if (!confirmed) {
      return;
    }

    setCards((current) => current.filter((candidate) => candidate.id !== cardId));
    setMessage("Highlight card deleted from this browser draft.");
  }

  async function copyCardText(card: HighlightCard) {
    if (!navigator.clipboard?.writeText) {
      setMessage("Clipboard copy is not available in this browser.");
      return;
    }

    try {
      await navigator.clipboard.writeText(card.selectedText);
      setMessage("Selected text copied to clipboard.");
    } catch {
      setMessage("Clipboard copy failed.");
    }
  }

  function moveCardWithinLane(cardId: string, direction: "up" | "down") {
    const currentIndex = cards.findIndex((card) => card.id === cardId);
    const card = cards[currentIndex];

    if (!card) {
      return;
    }

    const laneCards = cards
      .map((candidate, index) => ({ candidate, index }))
      .filter(({ candidate }) => candidate.laneId === card.laneId);
    const laneIndex = laneCards.findIndex(
      ({ candidate }) => candidate.id === card.id,
    );
    const nextLaneIndex = direction === "up" ? laneIndex - 1 : laneIndex + 1;
    const swapTarget = laneCards[nextLaneIndex];

    if (!swapTarget) {
      return;
    }

    setCards((current) => {
      const next = [...current];
      const targetCard = next[swapTarget.index];
      next[swapTarget.index] = next[currentIndex];
      next[currentIndex] = targetCard;
      return next;
    });
  }

  function moveCardToAdjacentLane(cardId: string, direction: "previous" | "next") {
    const card = cards.find((candidate) => candidate.id === cardId);

    if (!card) {
      return;
    }

    const currentLaneIndex = structureLanes.findIndex(
      (lane) => lane.id === card.laneId,
    );
    const nextLaneIndex =
      direction === "previous" ? currentLaneIndex - 1 : currentLaneIndex + 1;
    const nextLane = structureLanes[nextLaneIndex];

    if (!nextLane) {
      return;
    }

    updateCard(cardId, {
      laneId: nextLane.id,
    });
  }

  function exportStructureJson() {
    const draft: StructureDraft = {
      sourceTitle,
      sourceType,
      sourceText,
      cards,
    };

    setExportJson(JSON.stringify(draft, null, 2));
    setMessage("Structure JSON exported below.");
  }

  function createOutlineMarkdown() {
    return createStructureOutlineMarkdown({
      sourceTitle,
      cards,
    });
  }

  function exportOutlineMarkdown() {
    setOutlineMarkdown(createOutlineMarkdown());
    setMessage("Outline Markdown exported below.");
  }

  async function copyOutlineMarkdown() {
    const markdown = createOutlineMarkdown();
    setOutlineMarkdown(markdown);

    if (!navigator.clipboard?.writeText) {
      setMessage("Clipboard copy is not available in this browser.");
      return;
    }

    try {
      await navigator.clipboard.writeText(markdown);
      setMessage("Outline Markdown copied to clipboard.");
    } catch {
      setMessage("Outline Markdown copy failed.");
    }
  }

  function clearStructureDraft() {
    const confirmed = window.confirm(
      `Clear this Structure Mode browser draft? This removes only ${STORAGE_KEY} from localStorage in this browser.`,
    );

    if (!confirmed) {
      return;
    }

    skipNextPersistRef.current = true;
    window.localStorage.removeItem(STORAGE_KEY);
    setSourceTitle(DEFAULT_SOURCE_TITLE);
    setSourceType(DEFAULT_SOURCE_TYPE);
    setSourceText("");
    setSelection(DEFAULT_SELECTION);
    setSemanticType(DEFAULT_SEMANTIC_TYPE);
    setHighlightNote("");
    setDefaultLaneId(DEFAULT_LANE_ID);
    setCards([]);
    setExportJson("");
    setOutlineMarkdown("");
    setImportJson("");
    setIsSourcePanelVisible(true);
    setMessage("Structure Mode browser draft cleared.");
  }

  function loadStarterSample() {
    if (hasDraftContent) {
      const confirmed = window.confirm(
        "Load the starter sample and replace the current browser-local source and cards?",
      );

      if (!confirmed) {
        return;
      }
    }

    setSourceTitle(STARTER_SAMPLE_TITLE);
    setSourceType(STARTER_SAMPLE_TYPE);
    setSourceText(STARTER_SAMPLE_TEXT);
    setSelection(DEFAULT_SELECTION);
    setSemanticType(DEFAULT_SEMANTIC_TYPE);
    setHighlightNote("");
    setDefaultLaneId(DEFAULT_LANE_ID);
    setCards(createStarterSampleCards(createCardId));
    setExportJson("");
    setOutlineMarkdown("");
    setImportJson("");
    setIsSourcePanelVisible(true);
    setMessage("Starter sample loaded and saved locally in this browser.");
  }

  function importStructureJson() {
    try {
      const parsed = safeStructureDraft(JSON.parse(importJson));

      if (!parsed) {
        setMessage("Import JSON did not match the Structure Mode shape.");
        return;
      }

      setSourceTitle(parsed.sourceTitle);
      setSourceType(parsed.sourceType);
      setSourceText(parsed.sourceText);
      setCards(parsed.cards);
      setImportJson("");
      setMessage("Structure JSON imported into this browser draft.");
    } catch {
      setMessage("Import JSON could not be parsed.");
    }
  }

  return (
    <main className="min-h-screen p-3.5 md:p-6">
      <div className="grid min-h-[calc(100vh-28px)] grid-rows-[auto_auto_1fr_auto] gap-[18px] md:min-h-[calc(100vh-48px)]">
        <header
          className={cn(
            panelClassName,
            "flex min-h-[72px] flex-col items-stretch justify-between gap-[18px] px-[18px] py-4 lg:flex-row lg:items-center",
          )}
          aria-label="Structure mode status"
        >
          <div className="flex min-w-0 flex-col items-stretch gap-3.5 sm:flex-row sm:items-center">
            <StudioGlyph />
            <div>
              <p className={labelClassName}>Studio Structure Mode</p>
              <h1 className="mt-1.5 mb-0 text-[1.75rem] leading-[1.08] tracking-normal text-studio-ink max-sm:text-[1.45rem]">
                Paste, highlight, arrange
              </h1>
              <p className="mt-1.5 mb-0 max-w-[780px] text-[0.94rem] leading-relaxed text-studio-muted">
                Fast browser-local meaning capture for source text and working
                material.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
            <StudioNav />
            <StudioChip tone="tag">Studio access</StudioChip>
            <StudioChip className="normal-case" tone="source">
              {actor.primaryEmail}
            </StudioChip>
            <StudioChip tone="review">MVP browser draft</StudioChip>
            <StudioChip tone="source">Local only</StudioChip>
          </div>
        </header>

        <section
          className={cn(panelClassName, "grid gap-2 px-4 py-3.5")}
          aria-label="Structure mode persistence status"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="grid gap-2">
              <p className={labelClassName}>Structure Mode</p>
              <p className="m-0 text-[0.92rem] leading-relaxed text-studio-muted">
                Saved locally in this browser. Not yet synced to Studio database.
              </p>
              <p className="m-0 font-mono text-[0.76rem] leading-relaxed text-studio-muted">
                {STORAGE_KEY}
              </p>
              <p className="m-0 text-[0.84rem] leading-relaxed text-studio-muted">
                Current source: {sourceSummary}
              </p>
            </div>

            <div className="flex flex-wrap gap-2 lg:justify-end">
              <button
                className={smallButtonClassName}
                type="button"
                onClick={() =>
                  setIsSourcePanelVisible((currentValue) => !currentValue)
                }
              >
                {isSourcePanelVisible
                  ? "Hide pasted source"
                  : "Show pasted source"}
              </button>
              <button
                className={smallButtonClassName}
                type="button"
                onClick={loadStarterSample}
              >
                Load starter sample
              </button>
              <button
                className={dangerButtonClassName}
                type="button"
                onClick={clearStructureDraft}
              >
                Clear draft
              </button>
            </div>
          </div>
        </section>

        <section
          className={cn(
            "grid gap-[18px]",
            isSourcePanelVisible
              ? "xl:grid-cols-[minmax(330px,0.72fr)_minmax(360px,0.86fr)_minmax(420px,1.25fr)]"
              : "xl:grid-cols-[minmax(340px,0.72fr)_minmax(520px,1.35fr)]",
          )}
          aria-label="Structure mode workspace"
        >
          {isSourcePanelVisible ? (
            <section className={panelClassName} aria-label="Pasted source">
              <div className="mb-3.5 flex items-start justify-between gap-3">
                <p className={labelClassName}>Pasted Source</p>
                <StudioChip tone="source">
                  {getSourceTypeLabel(sourceType)}
                </StudioChip>
              </div>

              <h2 className={panelTitleClassName}>Source setup</h2>
              <p className={panelCopyClassName}>
                Paste any useful text here. Select a span in the textarea, then
                create a highlight card.
              </p>
              <p className="mt-3 rounded-lg border border-studio-line bg-studio-ink/5 p-3 text-[0.82rem] leading-relaxed text-studio-muted">
                Cards keep selected text snapshots. If you rewrite this source
                later, existing cards remain, but offsets may point at old source
                positions. Export JSON before large source rewrites.
              </p>

              <div className="mt-4 grid gap-3">
                <label className="grid gap-2">
                  <span className={fieldLabelClassName}>Title</span>
                  <input
                    className={fieldClassName}
                    value={sourceTitle}
                    onChange={(event) => setSourceTitle(event.target.value)}
                  />
                </label>

                <label className="grid gap-2">
                  <span className={fieldLabelClassName}>Source type</span>
                  <select
                    className={fieldClassName}
                    value={sourceType}
                    onChange={(event) => {
                      const value = event.target.value;
                      setSourceType(isSourceType(value) ? value : "other");
                    }}
                  >
                    {sourceTypeOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2">
                  <span className={fieldLabelClassName}>Source text</span>
                  <textarea
                    className={cn(textareaClassName, "min-h-[460px]")}
                    ref={sourceTextRef}
                    value={sourceText}
                    onChange={(event) => {
                      setSourceText(event.target.value);
                      captureSelection();
                    }}
                    onKeyUp={captureSelection}
                    onMouseUp={captureSelection}
                    onSelect={captureSelection}
                  />
                </label>
              </div>
            </section>
          ) : null}

          <section className={panelClassName} aria-label="Highlight controls">
            <div className="mb-3.5 flex items-start justify-between gap-3">
              <p className={labelClassName}>Highlight Controls</p>
              <StudioChip tone="tag">{cards.length} cards</StudioChip>
            </div>

            <h2 className={panelTitleClassName}>Selected span to card</h2>
            <p className={panelCopyClassName}>
              {isSourcePanelVisible
                ? "Use the native textarea selection. The selected offsets and text snapshot are stored on the card."
                : "Show the pasted source panel to select source text and create new highlights."}
            </p>

            <div className={cn(cardClassName, "mt-4 grid gap-2 p-3.5")}>
              <p className={labelClassName}>Current selection</p>
              <p className="m-0 text-[0.92rem] leading-relaxed text-studio-ink/90">
                {isSourcePanelVisible
                  ? selection.selectedText || "No selected text yet."
                  : "Source panel hidden."}
              </p>
              <span className={monoMetaClassName}>
                {selection.startOffset}-{selection.endOffset}
              </span>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="grid gap-2">
                <span className={fieldLabelClassName}>Semantic type</span>
                <select
                  className={fieldClassName}
                  value={semanticType}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSemanticType(isSemanticType(value) ? value : "insight");
                  }}
                >
                  {semanticTypeOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-2">
                <span className={fieldLabelClassName}>Quick type</span>
                <div className="flex flex-wrap gap-2">
                  {quickSemanticTypeOptions.map((option) => (
                    <button
                      className={cn(
                        smallButtonClassName,
                        semanticType === option
                          ? "border-studio-tag/55 bg-studio-tag/15 text-studio-tag"
                          : "",
                      )}
                      key={option}
                      type="button"
                      onClick={() => setSemanticType(option)}
                    >
                      {getSemanticLabel(option)}
                    </button>
                  ))}
                </div>
              </div>

              <label className="grid gap-2">
                <span className={fieldLabelClassName}>Initial lane</span>
                <select
                  className={fieldClassName}
                  value={defaultLaneId}
                  onChange={(event) => {
                    const value = event.target.value;
                    setDefaultLaneId(isLaneId(value) ? value : "parking_lot");
                  }}
                >
                  {structureLanes.map((lane) => (
                    <option key={lane.id} value={lane.id}>
                      {lane.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-2">
                <span className={fieldLabelClassName}>Quick lane</span>
                <div className="flex flex-wrap gap-2">
                  {quickLaneOptions.map((laneId) => (
                    <button
                      className={cn(
                        smallButtonClassName,
                        defaultLaneId === laneId
                          ? "border-studio-source/55 bg-studio-source/10 text-studio-source"
                          : "",
                      )}
                      key={laneId}
                      type="button"
                      onClick={() => setDefaultLaneId(laneId)}
                    >
                      {getLaneLabel(laneId)}
                    </button>
                  ))}
                </div>
              </div>

              <label className="grid gap-2">
                <span className={fieldLabelClassName}>Note</span>
                <textarea
                  className={cn(textareaClassName, "min-h-[110px]")}
                  value={highlightNote}
                  onChange={(event) => setHighlightNote(event.target.value)}
                />
              </label>
            </div>

            <button
              className={primaryButtonClassName}
              disabled={!isSourcePanelVisible}
              type="button"
              onClick={createHighlightCard}
            >
              Create highlight
            </button>

            <div
              className={cn(
                "mt-3.5 rounded-lg border border-studio-line p-3 text-[0.82rem] leading-relaxed text-studio-muted",
                message.includes("created") ||
                  message.includes("Loaded") ||
                  message.includes("exported") ||
                  message.includes("imported") ||
                  message.includes("copied") ||
                  message.includes("duplicated") ||
                  message.includes("deleted") ||
                  message.includes("cleared") ||
                  message.includes("sample")
                  ? "border-studio-tag/45 text-studio-tag"
                  : "",
              )}
            >
              {message}
            </div>

            <div className="mt-4 grid gap-3">
              <button
                className={smallButtonClassName}
                type="button"
                onClick={exportStructureJson}
              >
                Export structure JSON
              </button>
              <textarea
                className={cn(textareaClassName, "min-h-[140px] font-mono text-xs")}
                readOnly
                value={exportJson}
              />

              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={copyOutlineMarkdown}
                >
                  Copy outline as Markdown
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={exportOutlineMarkdown}
                >
                  Export outline Markdown
                </button>
              </div>
              <textarea
                className={cn(textareaClassName, "min-h-[160px] font-mono text-xs")}
                readOnly
                value={outlineMarkdown}
              />

              <label className="grid gap-2">
                <span className={fieldLabelClassName}>Import JSON</span>
                <textarea
                  className={cn(textareaClassName, "min-h-[120px] font-mono text-xs")}
                  value={importJson}
                  onChange={(event) => setImportJson(event.target.value)}
                />
              </label>
              <button
                className={smallButtonClassName}
                type="button"
                onClick={importStructureJson}
              >
                Import structure JSON
              </button>
            </div>
          </section>

          <section className={panelClassName} aria-label="Structure board">
            <div className="mb-3.5 flex items-start justify-between gap-3">
              <p className={labelClassName}>Structure Board</p>
              <StudioChip tone="node">Local cards</StudioChip>
            </div>

            <h2 className={panelTitleClassName}>Arrange highlights into lanes</h2>
            <p className={panelCopyClassName}>
              Move each card between lanes, then order cards inside the lane.
              No drag-and-drop dependency is used in this MVP.
            </p>

            <div className="mt-[18px] grid gap-3">
              {structureLanes.map((lane, laneIndex) => {
                const laneCards = cardsByLane[lane.id];

                return (
                  <section
                    className={cn(cardClassName, "grid gap-3 p-3.5")}
                    key={lane.id}
                    aria-label={`${lane.label} lane`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="m-0 text-[1rem] leading-snug text-studio-ink">
                        {lane.label}
                      </h3>
                      <StudioChip tone="source">{laneCards.length}</StudioChip>
                    </div>

                    {laneCards.length === 0 ? (
                      <p className="m-0 text-[0.88rem] leading-relaxed text-studio-muted">
                        No highlights yet.
                      </p>
                    ) : null}

                    {laneCards.map((card, cardIndex) => (
                      <article
                        className="grid gap-2 rounded-lg border border-studio-line bg-black/20 p-3"
                        key={card.id}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <StudioChip tone="tag">
                            {getSemanticLabel(card.semanticType)}
                          </StudioChip>
                          <span className="font-mono text-[0.72rem] leading-tight text-studio-dim">
                            {card.startOffset}-{card.endOffset}
                          </span>
                        </div>

                        <p className="m-0 whitespace-pre-wrap text-[0.92rem] leading-7 text-studio-ink/90">
                          {card.selectedText}
                        </p>

                        <div className="grid gap-2 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                          <label className="grid gap-2">
                            <span className={fieldLabelClassName}>Type</span>
                            <select
                              className={fieldClassName}
                              value={card.semanticType}
                              onChange={(event) => {
                                const value = event.target.value;
                                updateCard(card.id, {
                                  semanticType: isSemanticType(value)
                                    ? value
                                    : card.semanticType,
                                });
                              }}
                            >
                              {semanticTypeOptions.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="grid gap-2">
                            <span className={fieldLabelClassName}>Note</span>
                            <textarea
                              className={cn(textareaClassName, "min-h-[82px]")}
                              value={card.note}
                              onChange={(event) =>
                                updateCard(card.id, {
                                  note: event.target.value,
                                })
                              }
                            />
                          </label>
                        </div>

                        <dl className="grid gap-1 font-mono text-[0.72rem] leading-relaxed text-studio-muted">
                          <div>
                            <dt className="inline">Source: </dt>
                            <dd className="inline">{card.sourceTitle}</dd>
                          </div>
                          <div>
                            <dt className="inline">Created: </dt>
                            <dd className="inline">
                              {formatDateTime(card.createdAt)}
                            </dd>
                          </div>
                        </dl>

                        <label className="grid gap-2">
                          <span className={fieldLabelClassName}>Lane</span>
                          <select
                            className={fieldClassName}
                            value={card.laneId}
                            onChange={(event) => {
                              const value = event.target.value;
                              updateCard(card.id, {
                                laneId: isLaneId(value) ? value : card.laneId,
                              });
                            }}
                          >
                            {structureLanes.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <div className="flex flex-wrap gap-2">
                          <button
                            className={smallButtonClassName}
                            disabled={laneIndex === 0}
                            type="button"
                            onClick={() =>
                              moveCardToAdjacentLane(card.id, "previous")
                            }
                          >
                            Previous lane
                          </button>
                          <button
                            className={smallButtonClassName}
                            disabled={laneIndex === structureLanes.length - 1}
                            type="button"
                            onClick={() => moveCardToAdjacentLane(card.id, "next")}
                          >
                            Next lane
                          </button>
                          <button
                            className={smallButtonClassName}
                            disabled={cardIndex === 0}
                            type="button"
                            onClick={() => moveCardWithinLane(card.id, "up")}
                          >
                            Move up
                          </button>
                          <button
                            className={smallButtonClassName}
                            disabled={cardIndex === laneCards.length - 1}
                            type="button"
                            onClick={() => moveCardWithinLane(card.id, "down")}
                          >
                            Move down
                          </button>
                          <button
                            className={smallButtonClassName}
                            type="button"
                            onClick={() => void copyCardText(card)}
                          >
                            Copy text
                          </button>
                          <button
                            className={smallButtonClassName}
                            type="button"
                            onClick={() => duplicateCard(card.id)}
                          >
                            Duplicate
                          </button>
                          <button
                            className={dangerButtonClassName}
                            type="button"
                            onClick={() => deleteCard(card.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </article>
                    ))}
                  </section>
                );
              })}
            </div>
          </section>
        </section>

        <section
          className={cn(panelClassName, "grid gap-2 px-4 py-3.5")}
          aria-label="Structure mode safety"
        >
          <p className={labelClassName}>Canonical safety</p>
          <div className="break-words font-mono text-[0.76rem] leading-relaxed text-studio-muted">
            Structure Mode writes only to browser localStorage. It does not
            mutate Studio database rows, manuscript MDX, publish content,
            staging content, or inbox content.
          </div>
        </section>
      </div>
    </main>
  );
}
