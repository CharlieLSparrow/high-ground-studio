"use client";

import Link from "next/link";
import {
  ChevronDown,
  ExternalLink,
  MessageSquareText,
  Mic2,
  PanelRightClose,
  PanelRightOpen,
  PhoneOff,
  Radio,
  Repeat2,
  X,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  LiveSessionRoom,
  type LiveSessionRoomStatus,
} from "@/components/live-session-room";
import { SessionThread } from "@/components/session-thread";
import {
  sessionExperienceForPurpose,
  type SessionCaptureProfile,
} from "@/lib/session-experience";

export type LiveSessionDockConfig = {
  callRoomId: string;
  sessionTitle: string;
  kind: SessionCaptureProfile;
  purpose: string;
  projectSlug?: string | null;
  episodeSlug?: string | null;
  canPost?: boolean;
  parentLabel?: string | null;
  parentHref?: string | null;
};

type LiveSessionDockContextValue = {
  activeCallRoomId: string | null;
  isOpen: boolean;
  register: (config: LiveSessionDockConfig, options?: { requestOpen?: boolean }) => void;
  open: (config: LiveSessionDockConfig) => void;
  minimize: () => void;
};

const fallbackContext: LiveSessionDockContextValue = {
  activeCallRoomId: null,
  isOpen: false,
  register: () => undefined,
  open: () => undefined,
  minimize: () => undefined,
};

const LiveSessionDockContext = createContext<LiveSessionDockContextValue>(fallbackContext);

function callIsActive(status: LiveSessionRoomStatus) {
  return status === "connected" || status === "reconnecting" || status === "joining";
}

function sameSession(left: LiveSessionDockConfig | null, right: LiveSessionDockConfig) {
  return left?.callRoomId === right.callRoomId;
}

export function useLiveSessionDock() {
  return useContext(LiveSessionDockContext);
}

export function LiveSessionDockProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<LiveSessionDockConfig | null>(null);
  const [pending, setPending] = useState<LiveSessionDockConfig | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<LiveSessionRoomStatus>("preflight");
  const [showLeaveDecision, setShowLeaveDecision] = useState(false);

  const requestSession = useCallback((config: LiveSessionDockConfig, requestOpen: boolean) => {
    setActive((current) => {
      if (!current || sameSession(current, config)) return config;
      if (!requestOpen) return current;
      if (callIsActive(status)) {
        setPending(config);
        return current;
      }
      setStatus("preflight");
      return config;
    });
    if (requestOpen) setIsOpen(true);
  }, [status]);

  const register = useCallback((config: LiveSessionDockConfig, options?: { requestOpen?: boolean }) => {
    requestSession(config, options?.requestOpen === true);
  }, [requestSession]);

  const open = useCallback((config: LiveSessionDockConfig) => {
    requestSession(config, true);
  }, [requestSession]);

  const minimize = useCallback(() => {
    setIsOpen(false);
    setShowLeaveDecision(false);
  }, []);

  const requestClose = useCallback(() => {
    if (callIsActive(status)) {
      setIsOpen(true);
      setShowLeaveDecision(true);
      return;
    }
    setActive(null);
    setIsOpen(false);
  }, [status]);

  const leaveAndClose = useCallback(() => {
    setShowLeaveDecision(false);
    setPending(null);
    setActive(null);
    setIsOpen(false);
    setStatus("ended");
  }, []);

  const switchSession = useCallback(() => {
    if (!pending) return;
    setActive(pending);
    setPending(null);
    setShowLeaveDecision(false);
    setStatus("preflight");
    setIsOpen(true);
  }, [pending]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !isOpen) return;
      event.preventDefault();
      minimize();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, minimize]);

  const value = useMemo<LiveSessionDockContextValue>(() => ({
    activeCallRoomId: active?.callRoomId || null,
    isOpen,
    register,
    open,
    minimize,
  }), [active?.callRoomId, isOpen, minimize, open, register]);

  const experience = active
    ? sessionExperienceForPurpose(active.purpose)
    : null;
  const sessionHref = active
    ? `/sessions/${encodeURIComponent(active.callRoomId)}?mode=overview`
    : "#";

  return (
    <LiveSessionDockContext.Provider value={value}>
      <div className={isOpen && active ? "2xl:grid 2xl:grid-cols-[minmax(0,1fr)_minmax(25rem,36rem)] 2xl:gap-5" : ""}>
        <div className="min-w-0">{children}</div>

        {active ? (
          <aside
            aria-label={`${active.sessionTitle} live call dock`}
            aria-hidden={!isOpen}
            inert={!isOpen ? true : undefined}
            className={isOpen
              ? "fixed inset-3 bottom-20 z-[70] overflow-y-auto rounded-[1.75rem] border border-[#cbb791] bg-[#fdf8ee] p-3 shadow-2xl shadow-black/30 md:inset-6 md:bottom-6 2xl:sticky 2xl:inset-auto 2xl:top-0 2xl:z-30 2xl:max-h-[calc(100vh-7.5rem)]"
              : "pointer-events-none fixed h-px w-px overflow-hidden opacity-0"
            }
          >
            <header className="sticky top-0 z-20 rounded-2xl border border-[#d8c7a7] bg-[#3d3122] p-3 text-white shadow-lg">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-amber-200">
                    <Radio size={13} aria-hidden="true" /> {experience?.label || "Live Session"} · {status}
                  </p>
                  <h2 className="mt-1 truncate font-serif text-lg font-black">{active.sessionTitle}</h2>
                  <p className="mt-1 text-[11px] font-semibold text-[#dfd0b8]">The call stays connected while you open transcript, notes, goals, Watch, or the editor.</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" onClick={minimize} className="grid min-h-10 min-w-10 place-items-center rounded-full border border-white/20 hover:bg-white/10" aria-label="Minimize live call"><ChevronDown size={18} /></button>
                  <button type="button" onClick={requestClose} className="grid min-h-10 min-w-10 place-items-center rounded-full border border-white/20 hover:bg-rose-500/20" aria-label="Close live call"><X size={18} /></button>
                </div>
              </div>
              <nav aria-label="Live Session work" className="mt-3 flex gap-2 overflow-x-auto pb-1 text-[10px] font-black uppercase tracking-wide">
                <Link href={sessionHref} className="shrink-0 rounded-full border border-white/20 px-3 py-2 hover:bg-white/10">Overview</Link>
                <Link href={`${sessionHref.replace("mode=overview", "mode=transcript")}`} className="shrink-0 rounded-full border border-white/20 px-3 py-2 hover:bg-white/10">Transcript</Link>
                <Link href={`${sessionHref.replace("mode=overview", "mode=notes")}`} className="shrink-0 rounded-full border border-white/20 px-3 py-2 hover:bg-white/10">Notes</Link>
                <Link href={`${sessionHref.replace("mode=overview", "mode=work")}`} className="shrink-0 rounded-full border border-white/20 px-3 py-2 hover:bg-white/10">Goals & tasks</Link>
                {active.parentHref ? <Link href={active.parentHref} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300/40 px-3 py-2 text-amber-100 hover:bg-white/10">{active.parentLabel || "Workspace"}<ExternalLink size={11} /></Link> : null}
              </nav>
            </header>

            {pending ? (
              <section className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950" aria-live="polite">
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide"><Repeat2 size={15} /> Another Session requested</p>
                <p className="mt-2 text-sm font-semibold">Leave <strong>{active.sessionTitle}</strong> and open <strong>{pending.sessionTitle}</strong>?</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={switchSession} className="min-h-10 rounded-full bg-amber-950 px-4 text-xs font-black text-white">Leave & switch</button>
                  <button type="button" onClick={() => setPending(null)} className="min-h-10 rounded-full border border-amber-400 bg-white px-4 text-xs font-black">Stay here</button>
                </div>
              </section>
            ) : null}

            {showLeaveDecision ? (
              <section className="mt-3 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-rose-950" aria-live="polite">
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide"><PhoneOff size={15} /> Leave this live call?</p>
                <p className="mt-2 text-sm font-semibold">Closing disconnects this browser. Minimizing keeps the mic, camera, participant audio, and local source controls alive.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={leaveAndClose} className="min-h-10 rounded-full bg-rose-900 px-4 text-xs font-black text-white">Leave & close</button>
                  <button type="button" onClick={minimize} className="min-h-10 rounded-full border border-rose-300 bg-white px-4 text-xs font-black">Keep call & minimize</button>
                </div>
              </section>
            ) : null}

            <div className="mt-3 space-y-3">
              <LiveSessionRoom
                callRoomId={active.callRoomId}
                sessionTitle={active.sessionTitle}
                kind={active.kind}
                purpose={active.purpose}
                projectSlug={active.projectSlug || null}
                episodeSlug={active.episodeSlug || null}
                onStatusChange={setStatus}
                compact
                narrow
              />
              {active.projectSlug ? (
                <SessionThread
                  projectSlug={active.projectSlug}
                  roomId={active.callRoomId}
                  sessionTitle={active.sessionTitle}
                  canPost={active.canPost}
                  scopeLabel="This live Session"
                  scopeDescription="Durable coordination for this take or conversation. Messages remain after everyone leaves the call."
                />
              ) : (
                <section className="rounded-2xl border border-[#d8c7a7] bg-white p-4">
                  <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-[#5b472f]"><MessageSquareText size={15} /> Session thread unavailable</p>
                  <p className="mt-2 text-sm font-semibold text-[#765f40]">Connect this Session to a Nest to give the call a durable shared thread.</p>
                </section>
              )}
            </div>
          </aside>
        ) : null}
      </div>

      {active && !isOpen ? (
        <section className="fixed bottom-20 left-3 right-3 z-[65] flex items-center gap-3 rounded-2xl border border-[#d8c7a7] bg-[#3d3122] p-2.5 text-white shadow-2xl shadow-black/30 md:bottom-5 md:left-auto md:right-5 md:w-[min(32rem,calc(100vw-2.5rem))]" aria-label="Minimized live call">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${callIsActive(status) ? "bg-emerald-400 text-emerald-950" : "bg-amber-200 text-amber-950"}`}><Mic2 size={18} /></span>
          <button type="button" onClick={() => setIsOpen(true)} className="min-w-0 flex-1 text-left">
            <span className="block truncate text-sm font-black">{active.sessionTitle}</span>
            <span className="block truncate text-[11px] font-semibold text-[#dfd0b8]">{status} · call controls minimized</span>
          </button>
          <button type="button" onClick={() => setIsOpen(true)} className="grid min-h-10 min-w-10 place-items-center rounded-full border border-white/20 hover:bg-white/10" aria-label="Open live call"><PanelRightOpen size={18} /></button>
          <button type="button" onClick={requestClose} className="grid min-h-10 min-w-10 place-items-center rounded-full border border-white/20 hover:bg-rose-500/20" aria-label="Leave or close live call"><PanelRightClose size={18} /></button>
        </section>
      ) : null}
    </LiveSessionDockContext.Provider>
  );
}

export function LiveSessionDockLauncher({
  config,
  label = "Open live call",
  description,
  autoOpen = false,
}: {
  config: LiveSessionDockConfig;
  label?: string;
  description?: string;
  autoOpen?: boolean;
}) {
  const dock = useLiveSessionDock();
  const register = dock.register;
  const autoOpenedRoomRef = useRef<string | null>(null);

  useEffect(() => {
    const requestOpen = autoOpen && autoOpenedRoomRef.current !== config.callRoomId;
    if (requestOpen) autoOpenedRoomRef.current = config.callRoomId;
    register(config, { requestOpen });
  }, [autoOpen, config, register]);

  const active = dock.activeCallRoomId === config.callRoomId;

  return (
    <section className="rounded-[1.75rem] border border-violet-200 bg-violet-50/80 p-5 text-violet-950 shadow-sm">
      <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em]"><Radio size={14} /> Persistent live call</p>
      <h2 className="mt-2 font-serif text-2xl font-black">{active ? "Call controls stay with you" : "Join from this browser"}</h2>
      <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-violet-900">{description || "Choose external microphones, cameras, and headphones, then keep the call open while moving through the rest of the workspace."}</p>
      <button type="button" onClick={() => dock.open(config)} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-violet-950 px-5 text-xs font-black uppercase tracking-wide text-white">
        <PanelRightOpen size={16} /> {active && dock.isOpen ? "Focus live call" : label}
      </button>
    </section>
  );
}
