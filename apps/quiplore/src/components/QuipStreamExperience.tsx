"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bookmark,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  ListPlus,
  Shuffle,
  ThumbsDown,
  ThumbsUp,
  WandSparkles,
} from "lucide-react";
import {
  createQuipStreamEvent,
  createQuipStreamSession,
  summarizeQuipStreamEvents,
  type QuipStreamEvent,
  type QuipStreamSession,
  type StreamMode,
} from "@high-ground/quipsly-domain";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getQuipStreamCards,
  starterNest,
} from "@high-ground/quipsly-domain/seed";
import { SourceBadge } from "./SourceBadge";
import { StatPanel } from "./StatPanel";
import { VerificationBadge } from "./VerificationBadge";
import { QuipVisual } from "./QuipVisual";

const modeOptions: readonly {
  readonly mode: StreamMode;
  readonly label: string;
}[] = [
  { mode: "for-you", label: "For You" },
  { mode: "verified", label: "Verified" },
  { mode: "by-theme", label: "Curiosity" },
  { mode: "by-person", label: "Einstein" },
];

function formatEventType(type: string): string {
  return type
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function QuipStreamExperience({
  fullScreen = false,
  initialMode = "for-you",
}: {
  readonly fullScreen?: boolean;
  readonly initialMode?: StreamMode;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<StreamMode>(initialMode);
  const [index, setIndex] = useState(0);
  const [session, setSession] = useState<QuipStreamSession | null>(null);
  const [events, setEvents] = useState<readonly QuipStreamEvent[]>([]);
  const [savedQuoteIds, setSavedQuoteIds] = useState<ReadonlySet<string>>(
    () => new Set(starterNest.savedQuoteIds),
  );
  const [lorelistQuoteIds, setLorelistQuoteIds] = useState<ReadonlySet<string>>(
    () => new Set(["quote-einstein-imagination", "quote-dickinson-slant"]),
  );
  const enteredAtRef = useRef(0);
  const activeQuoteIdRef = useRef<string | null>(null);
  const wheelLockedRef = useRef(false);
  const touchStartYRef = useRef<number | null>(null);

  const cards = useMemo(() => getQuipStreamCards(mode), [mode]);
  const activeCard = cards[index] ?? cards[0];
  const stats = useMemo(() => summarizeQuipStreamEvents(events), [events]);

  const pushEvent = useCallback(
    (
      type: QuipStreamEvent["type"],
      quoteId?: string,
      metadata?: QuipStreamEvent["metadata"],
      dwellMs?: number,
    ) => {
      if (!session) {
        return;
      }

      setEvents((current) => [
        createQuipStreamEvent({
          sessionId: session.id,
          type,
          mode,
          quoteId,
          dwellMs,
          metadata,
        }),
        ...current,
      ]);
    },
    [mode, session],
  );

  const exitCurrentImpression = useCallback(() => {
    if (!activeQuoteIdRef.current || !enteredAtRef.current) {
      return;
    }

    const dwellMs = Math.max(0, Math.round(performance.now() - enteredAtRef.current));
    pushEvent("quote_impression_exited", activeQuoteIdRef.current, undefined, dwellMs);
  }, [pushEvent]);

  useEffect(() => {
    const createdSession = createQuipStreamSession({
      mode: initialMode,
      entrySurface: fullScreen ? "stream-route" : "home",
      anonymous: true,
    });

    setSession(createdSession);
    setEvents([
      createQuipStreamEvent({
        sessionId: createdSession.id,
        type: "stream_session_started",
        mode: initialMode,
        metadata: { entrySurface: createdSession.entrySurface },
      }),
    ]);
  }, [fullScreen, initialMode]);

  useEffect(() => {
    if (!session || !activeCard) {
      return;
    }

    activeQuoteIdRef.current = activeCard.quote.id;
    enteredAtRef.current = performance.now();
    pushEvent("quote_impression_shown", activeCard.quote.id, {
      rank: activeCard.rank,
      status: activeCard.quote.verificationStatus,
      reason: activeCard.streamReason,
    });
  }, [activeCard, pushEvent, session]);

  const move = useCallback(
    (direction: "next" | "previous") => {
      if (!cards.length) {
        return;
      }

      exitCurrentImpression();
      pushEvent(direction, activeCard?.quote.id);
      setIndex((current) => {
        if (direction === "next") {
          return (current + 1) % cards.length;
        }

        return (current - 1 + cards.length) % cards.length;
      });
    },
    [activeCard?.quote.id, cards.length, exitCurrentImpression, pushEvent],
  );

  const selectMode = useCallback(
    (nextMode: StreamMode) => {
      if (nextMode === mode) {
        return;
      }

      exitCurrentImpression();
      setMode(nextMode);
      setIndex(0);
    },
    [exitCurrentImpression, mode],
  );

  const toggleSaved = useCallback(() => {
    if (!activeCard) {
      return;
    }

    setSavedQuoteIds((current) => {
      const next = new Set(current);

      if (next.has(activeCard.quote.id)) {
        next.delete(activeCard.quote.id);
        pushEvent("unsave", activeCard.quote.id);
      } else {
        next.add(activeCard.quote.id);
        pushEvent("save", activeCard.quote.id);
      }

      return next;
    });
  }, [activeCard, pushEvent]);

  const toggleLorelist = useCallback(() => {
    if (!activeCard) {
      return;
    }

    setLorelistQuoteIds((current) => {
      const next = new Set(current);

      if (next.has(activeCard.quote.id)) {
        next.delete(activeCard.quote.id);
        pushEvent("remove_from_lorelist", activeCard.quote.id);
      } else {
        next.add(activeCard.quote.id);
        pushEvent("add_to_lorelist", activeCard.quote.id);
      }

      return next;
    });
  }, [activeCard, pushEvent]);

  const openPassport = useCallback(() => {
    if (!activeCard) {
      return;
    }

    pushEvent("open_quote_passport", activeCard.quote.id);
    router.push(`/quotes/${activeCard.quote.slug}`);
  }, [activeCard, pushEvent, router]);

  const shareQuote = useCallback(() => {
    if (!activeCard) {
      return;
    }

    const shareText = `"${activeCard.quote.text}" - ${activeCard.person.displayName}`;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(shareText);
    }

    pushEvent("copy_share", activeCard.quote.id);
  }, [activeCard, pushEvent]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown" || event.key.toLowerCase() === "j") {
        event.preventDefault();
        move("next");
      }

      if (event.key === "ArrowUp" || event.key.toLowerCase() === "k") {
        event.preventDefault();
        move("previous");
      }

      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        toggleSaved();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [move, toggleSaved]);

  if (!activeCard) {
    return null;
  }

  const isSaved = savedQuoteIds.has(activeCard.quote.id);
  const isInLorelist = lorelistQuoteIds.has(activeCard.quote.id);

  return (
    <section
      className="stream-frame"
      aria-label="QuipStream quote discovery"
      onWheel={(event) => {
        if (wheelLockedRef.current || Math.abs(event.deltaY) < 26) {
          return;
        }

        wheelLockedRef.current = true;
        move(event.deltaY > 0 ? "next" : "previous");
        window.setTimeout(() => {
          wheelLockedRef.current = false;
        }, 520);
      }}
      onTouchStart={(event) => {
        touchStartYRef.current = event.touches[0]?.clientY ?? null;
      }}
      onTouchEnd={(event) => {
        const startY = touchStartYRef.current;
        const endY = event.changedTouches[0]?.clientY;
        touchStartYRef.current = null;

        if (startY === null || endY === undefined) {
          return;
        }

        const delta = startY - endY;

        if (Math.abs(delta) > 42) {
          move(delta > 0 ? "next" : "previous");
        }
      }}
    >
      <div className="stream-topbar">
        <div>
          <span className="section-label">
            <Shuffle size={14} aria-hidden="true" />
            QuipStream
          </span>
          <p className="panel-copy">
            Card {index + 1} of {cards.length} | {activeCard.streamReason}
          </p>
        </div>
        <div className="segmented-control" aria-label="Stream mode">
          {modeOptions.map((option) => (
            <button
              className={`segment ${option.mode === mode ? "active" : ""}`}
              key={option.mode}
              onClick={() => selectMode(option.mode)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="stream-stage">
        <article
          className={`stream-card ${activeCard.quote.visual ? "has-visual" : ""}`}
          aria-live="polite"
        >
          <div className="chip-row">
            <VerificationBadge status={activeCard.quote.verificationStatus} />
            <SourceBadge source={activeCard.sourceWork} />
            {activeCard.themes.map((theme) => (
              <span className="chip" key={theme.id}>
                {theme.label}
              </span>
            ))}
          </div>

          <QuipVisual size="stream" visual={activeCard.quote.visual} />

          <div className="stream-card-main">
            <blockquote className="stream-quote">{activeCard.quote.text}</blockquote>
            <div className="quote-attribution">
              <strong>{activeCard.person.displayName}</strong>
              <span>
                {activeCard.sourceWork.title}
                {activeCard.sourceWork.year ? ` | ${activeCard.sourceWork.year}` : ""}
              </span>
            </div>
          </div>

          <div className="card-footer">
            <p className="panel-copy">{activeCard.quote.contextNote}</p>
            <div className="button-row">
              <button
                className={`icon-button ${isSaved ? "active" : ""}`}
                onClick={toggleSaved}
                title={isSaved ? "Remove from Nest" : "Save to Nest"}
                type="button"
                aria-label={isSaved ? "Remove from Nest" : "Save to Nest"}
              >
                <Bookmark size={17} aria-hidden="true" />
              </button>
              <button
                className={`icon-button ${isInLorelist ? "active" : ""}`}
                onClick={toggleLorelist}
                title={isInLorelist ? "Remove from Lorelist" : "Add to Lorelist"}
                type="button"
                aria-label={
                  isInLorelist ? "Remove from Lorelist" : "Add to Lorelist"
                }
              >
                <ListPlus size={17} aria-hidden="true" />
              </button>
              <button
                className="icon-button"
                onClick={shareQuote}
                title="Copy share text"
                type="button"
                aria-label="Copy share text"
              >
                <Copy size={17} aria-hidden="true" />
              </button>
              <button
                className="button primary"
                onClick={openPassport}
                type="button"
              >
                <BookOpen size={16} aria-hidden="true" />
                Passport
              </button>
            </div>
          </div>
        </article>
      </div>

      <div className="stream-bottombar">
        <div className="stream-controls">
          <button className="button" onClick={() => move("previous")} type="button">
            <ChevronUp size={16} aria-hidden="true" />
            Prev
          </button>
          <button className="button" onClick={() => move("next")} type="button">
            <ChevronDown size={16} aria-hidden="true" />
            Next
          </button>
          <button
            className="button green"
            onClick={() => pushEvent("more_like_this", activeCard.quote.id)}
            type="button"
          >
            <ThumbsUp size={16} aria-hidden="true" />
            More
          </button>
          <button
            className="button plum"
            onClick={() => {
              pushEvent("too_cheesy", activeCard.quote.id);
              move("next");
            }}
            type="button"
          >
            <ThumbsDown size={16} aria-hidden="true" />
            Skip
          </button>
        </div>
      </div>

      {fullScreen ? (
        <div className="panel tight">
          <StatPanel
            items={[
              { label: "Impressions", value: stats.impressions },
              { label: "Saves", value: savedQuoteIds.size },
              { label: "Lorelist", value: lorelistQuoteIds.size },
              { label: "Passports", value: stats.passportOpens },
            ]}
          />
          <div className="button-row" style={{ marginTop: "0.75rem" }}>
            <Link className="button" href={`/people/${activeCard.person.slug}`}>
              <ExternalLink size={15} aria-hidden="true" />
              Person
            </Link>
            <button
              className="button"
              onClick={() => pushEvent("story_interest", activeCard.quote.id)}
              type="button"
            >
              <WandSparkles size={15} aria-hidden="true" />
              Story
            </button>
          </div>
          <div className="event-ledger" style={{ marginTop: "0.75rem" }}>
            {events.slice(0, 8).map((event) => (
              <div className="event-row" key={event.id}>
                <strong>{formatEventType(event.type)}</strong>
                {event.quoteId ?? "session"} | {new Date(event.occurredAt).toLocaleTimeString()}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
