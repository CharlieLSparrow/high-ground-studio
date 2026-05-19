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

const STORAGE_KEY = "high-ground-studio.structure-mode.v1";

const sourceTypeOptions = [
  { id: "book", label: "Book" },
  { id: "article", label: "Article" },
  { id: "transcript", label: "Transcript" },
  { id: "ted_public_talk", label: "TED/public talk" },
  { id: "podcast", label: "Podcast" },
  { id: "notes", label: "Notes" },
  { id: "other", label: "Other" },
] as const;

const semanticTypeOptions = [
  { id: "quote", label: "Quote" },
  { id: "story", label: "Story" },
  { id: "insight", label: "Insight" },
  { id: "research", label: "Research" },
  { id: "example", label: "Example" },
  { id: "thesis", label: "Thesis" },
  { id: "transition", label: "Transition" },
  { id: "question", label: "Question" },
  { id: "callback", label: "Callback" },
  { id: "opening_hook", label: "Opening hook" },
  { id: "closing_image", label: "Closing image" },
  { id: "ted_public_talk_beat", label: "TED/public-talk beat" },
  { id: "needs_review", label: "Needs review" },
] as const;

const structureLanes = [
  { id: "opening", label: "Opening" },
  { id: "story", label: "Story" },
  { id: "principle", label: "Principle" },
  { id: "evidence", label: "Evidence" },
  { id: "application", label: "Application" },
  { id: "closing", label: "Closing" },
  { id: "parking_lot", label: "Parking Lot" },
] as const;

type SourceType = (typeof sourceTypeOptions)[number]["id"];
type SemanticType = (typeof semanticTypeOptions)[number]["id"];
type LaneId = (typeof structureLanes)[number]["id"];

type HighlightCard = {
  id: string;
  selectedText: string;
  startOffset: number;
  endOffset: number;
  semanticType: SemanticType;
  note: string;
  sourceTitle: string;
  sourceType: SourceType;
  createdAt: string;
  laneId: LaneId;
};

type StructureDraft = {
  sourceTitle: string;
  sourceType: SourceType;
  sourceText: string;
  cards: HighlightCard[];
};

type SelectionState = {
  startOffset: number;
  endOffset: number;
  selectedText: string;
};

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

function isSourceType(value: string): value is SourceType {
  return sourceTypeOptions.some((option) => option.id === value);
}

function isSemanticType(value: string): value is SemanticType {
  return semanticTypeOptions.some((option) => option.id === value);
}

function isLaneId(value: string): value is LaneId {
  return structureLanes.some((lane) => lane.id === value);
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

function getSemanticLabel(value: SemanticType) {
  return (
    semanticTypeOptions.find((option) => option.id === value)?.label ?? value
  );
}

function safeStructureDraft(value: unknown): StructureDraft | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const draft = value as Partial<StructureDraft>;
  const draftSourceType = String(draft.sourceType);

  if (
    typeof draft.sourceTitle !== "string" ||
    typeof draft.sourceText !== "string" ||
    !isSourceType(draftSourceType) ||
    !Array.isArray(draft.cards)
  ) {
    return null;
  }

  const cards = draft.cards.flatMap((cardValue) => {
    if (!cardValue || typeof cardValue !== "object") {
      return [];
    }

    const card = cardValue as Partial<HighlightCard>;
    const semanticType = String(card.semanticType);
    const sourceType = String(card.sourceType);
    const laneId = String(card.laneId);

    if (
      typeof card.id !== "string" ||
      typeof card.selectedText !== "string" ||
      typeof card.startOffset !== "number" ||
      typeof card.endOffset !== "number" ||
      typeof card.note !== "string" ||
      typeof card.sourceTitle !== "string" ||
      typeof card.createdAt !== "string" ||
      !isSemanticType(semanticType) ||
      !isSourceType(sourceType) ||
      !isLaneId(laneId)
    ) {
      return [];
    }

    return [
      {
        id: card.id,
        selectedText: card.selectedText,
        startOffset: card.startOffset,
        endOffset: card.endOffset,
        semanticType,
        note: card.note,
        sourceTitle: card.sourceTitle,
        sourceType,
        createdAt: card.createdAt,
        laneId,
      },
    ];
  });

  return {
    sourceTitle: draft.sourceTitle,
    sourceType: draftSourceType,
    sourceText: draft.sourceText,
    cards,
  };
}

const fieldLabelClassName =
  "text-[0.78rem] font-extrabold uppercase text-studio-muted";

const fieldClassName =
  "min-h-10 w-full rounded-lg border border-studio-line-strong bg-[#0f1512] px-2.5 py-2 text-studio-ink disabled:text-studio-dim";

const textareaClassName =
  "w-full resize-y rounded-lg border border-studio-line-strong bg-[#0f1512] px-3 py-2.5 text-[0.95rem] leading-7 text-studio-ink disabled:text-studio-dim";

const smallButtonClassName =
  "min-h-8 rounded-lg border border-studio-line bg-studio-ink/5 px-2.5 py-1.5 text-[0.78rem] font-extrabold text-studio-source disabled:text-studio-dim";

export function StudioStructureClient({ actor }: StudioStructureClientProps) {
  const sourceTextRef = useRef<HTMLTextAreaElement>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [sourceTitle, setSourceTitle] = useState("Untitled pasted source");
  const [sourceType, setSourceType] = useState<SourceType>("notes");
  const [sourceText, setSourceText] = useState("");
  const [selection, setSelection] = useState<SelectionState>({
    startOffset: 0,
    endOffset: 0,
    selectedText: "",
  });
  const [semanticType, setSemanticType] = useState<SemanticType>("insight");
  const [highlightNote, setHighlightNote] = useState("");
  const [defaultLaneId, setDefaultLaneId] = useState<LaneId>("parking_lot");
  const [cards, setCards] = useState<HighlightCard[]>([]);
  const [exportJson, setExportJson] = useState("");
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
      sourceTitle: sourceTitle.trim() || "Untitled pasted source",
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
          <p className={labelClassName}>Structure Mode</p>
          <p className="m-0 text-[0.92rem] leading-relaxed text-studio-muted">
            Saved locally in this browser. Not yet synced to Studio database.
          </p>
          <p className="m-0 font-mono text-[0.76rem] leading-relaxed text-studio-muted">
            {STORAGE_KEY}
          </p>
        </section>

        <section
          className="grid gap-[18px] xl:grid-cols-[minmax(330px,0.72fr)_minmax(360px,0.86fr)_minmax(420px,1.25fr)]"
          aria-label="Structure mode workspace"
        >
          <section className={panelClassName} aria-label="Pasted source">
            <div className="mb-3.5 flex items-start justify-between gap-3">
              <p className={labelClassName}>Pasted Source</p>
              <StudioChip tone="source">{sourceTypeOptions.find((option) => option.id === sourceType)?.label}</StudioChip>
            </div>

            <h2 className={panelTitleClassName}>Source setup</h2>
            <p className={panelCopyClassName}>
              Paste any useful text here. Select a span in the textarea, then
              create a highlight card.
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

          <section className={panelClassName} aria-label="Highlight controls">
            <div className="mb-3.5 flex items-start justify-between gap-3">
              <p className={labelClassName}>Highlight Controls</p>
              <StudioChip tone="tag">{cards.length} cards</StudioChip>
            </div>

            <h2 className={panelTitleClassName}>Selected span to card</h2>
            <p className={panelCopyClassName}>
              Use the native textarea selection. The selected offsets and text
              snapshot are stored on the card.
            </p>

            <div className={cn(cardClassName, "mt-4 grid gap-2 p-3.5")}>
              <p className={labelClassName}>Current selection</p>
              <p className="m-0 text-[0.92rem] leading-relaxed text-studio-ink/90">
                {selection.selectedText || "No selected text yet."}
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
                  message.includes("imported")
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

                        {card.note ? (
                          <p className="m-0 rounded-lg border border-studio-line bg-studio-ink/5 p-2 text-[0.84rem] leading-relaxed text-studio-muted">
                            {card.note}
                          </p>
                        ) : null}

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
