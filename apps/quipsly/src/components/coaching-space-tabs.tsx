"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CalendarDays, MessageCircle, NotebookPen, UsersRound } from "lucide-react";

const sections = [
  { id: "work", label: "Work", icon: NotebookPen, hash: "#relationship-work" },
  { id: "conversation", label: "Chat", icon: MessageCircle, hash: "#relationship-conversation" },
  { id: "sessions", label: "Sessions", icon: CalendarDays, hash: "#relationship-sessions" },
  { id: "people", label: "People", icon: UsersRound, hash: "#relationship-people" },
] as const;
type Section = typeof sections[number]["id"];

export function CoachingSpaceTabs({ work, conversation, sessions, people }: {
  work: ReactNode;
  conversation: ReactNode;
  sessions: ReactNode;
  people?: ReactNode;
}) {
  const [active, setActive] = useState<Section>("work");
  // The server cannot read the saved URL hash. Do not accept a click against
  // its default section before hydration restores the actual navigation.
  const [ready, setReady] = useState(false);
  const id = useId();
  const buttons = useRef<Partial<Record<Section, HTMLButtonElement | null>>>({});
  const available = sections.filter((section) => section.id !== "people" || people);
  const content = { work, conversation, sessions, people };

  useEffect(() => {
    const restoreSection = () => {
      const target = sections.find((section) => section.hash === window.location.hash);
      setActive(target && (target.id !== "people" || people) ? target.id : "work");
    };
    restoreSection();
    setReady(true);
    window.addEventListener("hashchange", restoreSection);
    return () => window.removeEventListener("hashchange", restoreSection);
  }, [people]);

  function select(section: typeof sections[number]) {
    setActive(section.id);
    window.history.replaceState(window.history.state, "", section.hash);
  }

  return <div className="mt-5 min-w-0">
    <div role="tablist" aria-label="Client space" className="grid grid-flow-col auto-cols-fr gap-1 rounded-2xl border border-[#dfcfb4] bg-[#fffdf8] p-1.5">
      {available.map((section, index) => <button
        key={section.id}
        ref={(element) => { buttons.current[section.id] = element; }}
        id={`${id}-${section.id}-tab`}
        role="tab"
        type="button"
        disabled={!ready}
        aria-selected={active === section.id}
        aria-controls={`${id}-${section.id}-panel`}
        tabIndex={active === section.id ? 0 : -1}
        onClick={() => select(section)}
        onKeyDown={(event) => {
          let next: number;
          if (event.key === "ArrowRight") next = (index + 1) % available.length;
          else if (event.key === "ArrowLeft") next = (index - 1 + available.length) % available.length;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = available.length - 1;
          else return;
          event.preventDefault();
          select(available[next]);
          buttons.current[available[next].id]?.focus();
        }}
        className={`flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-xl px-2 text-sm font-bold outline-offset-4 transition ${active === section.id ? "bg-[#e7eadc] text-[#354b36]" : "text-[#765f40] hover:bg-[#f5efe4]"}`}
      >
        <section.icon size={17} aria-hidden="true" className="hidden sm:block" />{section.label}
      </button>)}
    </div>
    {available.map((section) => <div
      key={section.id}
      id={`${id}-${section.id}-panel`}
      role="tabpanel"
      aria-labelledby={`${id}-${section.id}-tab`}
      tabIndex={0}
      hidden={active !== section.id}
      className="mt-4 min-w-0 outline-offset-4"
    >
      {/* Keep panels mounted so switching context never discards an unsaved draft. */}
      {content[section.id]}
    </div>)}
  </div>;
}
