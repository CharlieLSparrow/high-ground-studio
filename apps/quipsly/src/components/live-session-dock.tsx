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
import type { SessionCaptureProfile } from "@/lib/session-experience";

export type LiveSessionDockConfig = {
  callRoomId: string;
  captureGroupId: string | null;
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
  dismissedCallRoomId: string | null;
  connectionStatus: LiveSessionRoomStatus | null;
  isOpen: boolean;
  register: (config: LiveSessionDockConfig, options?: { requestOpen?: boolean }) => void;
  open: (config: LiveSessionDockConfig) => void;
  minimize: () => void;
};

const fallbackContext: LiveSessionDockContextValue = {
  activeCallRoomId: null,
  dismissedCallRoomId: null,
  connectionStatus: null,
  isOpen: false,
  register: () => undefined,
  open: () => undefined,
  minimize: () => undefined,
};

const LiveSessionDockContext = createContext<LiveSessionDockContextValue>(fallbackContext);

function callIsActive(status: LiveSessionRoomStatus) {
  return status === "connected" || status === "reconnecting" || status === "joining";
}

export function liveSessionStatusLabel(status: LiveSessionRoomStatus | null) {
  switch (status) {
    case "connected": return "In call";
    case "joining": return "Joining call…";
    case "reconnecting": return "Reconnecting…";
    case "checking": return "Checking devices…";
    case "ended": return "Call ended";
    case "error": return "Connection needs attention";
    default: return "Ready to join";
  }
}

function sameSession(left: LiveSessionDockConfig | null, right: LiveSessionDockConfig) {
  return left?.callRoomId === right.callRoomId;
}

export function useLiveSessionDock() {
  return useContext(LiveSessionDockContext);
}

export function LiveSessionDockProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<LiveSessionDockConfig | null>(null);
  const [dismissedCallRoomId, setDismissedCallRoomId] = useState<string | null>(null);
  const [pending, setPending] = useState<LiveSessionDockConfig | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<LiveSessionRoomStatus>("preflight");
  const [sourceProtected, setSourceProtected] = useState(false);
  const [showLeaveDecision, setShowLeaveDecision] = useState(false);
  const [exitIntent, setExitIntent] = useState<"close" | "switch" | null>(null);
  const [leaveRequestVersion, setLeaveRequestVersion] = useState(0);
  const [mobilePanel, setMobilePanel] = useState<"call" | "chat">("call");
  const [desktopChatOpen, setDesktopChatOpen] = useState(true);

  useEffect(() => {
    setMobilePanel("call");
    setDesktopChatOpen(true);
  }, [active?.callRoomId]);

  const requestSession = useCallback((config: LiveSessionDockConfig, requestOpen: boolean) => {
    setActive((current) => {
      if (!current && !requestOpen) return current;
      if (!current || sameSession(current, config)) return config;
      if (!requestOpen) return current;
      if (callIsActive(status) || sourceProtected) {
        setPending(config);
        return current;
      }
      setStatus("preflight");
      setSourceProtected(false);
      return config;
    });
    if (requestOpen) setIsOpen(true);
  }, [sourceProtected, status]);

  const register = useCallback((config: LiveSessionDockConfig, options?: { requestOpen?: boolean }) => {
    requestSession(config, options?.requestOpen === true);
  }, [requestSession]);

  const open = useCallback((config: LiveSessionDockConfig) => {
    setDismissedCallRoomId(null);
    requestSession(config, true);
  }, [requestSession]);

  const minimize = useCallback(() => {
    setIsOpen(false);
    setShowLeaveDecision(false);
  }, []);

  const requestClose = useCallback(() => {
    if (callIsActive(status) || sourceProtected) {
      setIsOpen(true);
      setShowLeaveDecision(true);
      return;
    }
    setDismissedCallRoomId(active?.callRoomId ?? null);
    setActive(null);
    setIsOpen(false);
  }, [active?.callRoomId, sourceProtected, status]);

  const leaveAndClose = useCallback(() => {
    setShowLeaveDecision(false);
    setExitIntent("close");
    setLeaveRequestVersion((version) => version + 1);
  }, []);

  const switchSession = useCallback(() => {
    if (!pending || exitIntent) return;
    setShowLeaveDecision(false);
    setExitIntent("switch");
    setLeaveRequestVersion((version) => version + 1);
  }, [exitIntent, pending]);

  const finishRequestedExit = useCallback(() => {
    if (!exitIntent) return;
    if (exitIntent === "switch" && pending) {
      setActive(pending);
      setPending(null);
      setStatus("preflight");
      setSourceProtected(false);
      setIsOpen(true);
    } else {
      setDismissedCallRoomId(active?.callRoomId ?? null);
      setPending(null);
      setActive(null);
      setIsOpen(false);
      setStatus("ended");
      setSourceProtected(false);
    }
    setExitIntent(null);
  }, [active?.callRoomId, exitIntent, pending]);

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
    dismissedCallRoomId,
    connectionStatus: active ? status : null,
    isOpen,
    register,
    open,
    minimize,
  }), [active?.callRoomId, dismissedCallRoomId, isOpen, minimize, open, register, status]);

  const sessionHref = active
    ? `/sessions/${encodeURIComponent(active.callRoomId)}?mode=overview`
    : "#";

  return (
    <LiveSessionDockContext.Provider value={value}>
      <div>
        <div className="min-w-0">{children}</div>

        {active ? (
          <aside
            aria-label={`${active.sessionTitle} live call dock`}
            aria-hidden={!isOpen}
            inert={!isOpen ? true : undefined}
            className={isOpen
              ? "fixed inset-x-2 top-2 bottom-20 z-[70] flex min-h-0 flex-col overflow-hidden rounded-[1.75rem] border border-[#cbb791] bg-[#fdf8ee] p-3 shadow-2xl shadow-black/30 md:inset-6"
              : "pointer-events-none fixed h-px w-px overflow-hidden opacity-0"
            }
          >
            <header className="z-20 shrink-0 rounded-2xl border border-[#d8c7a7] bg-[#3d3122] p-3 text-white shadow-lg">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-amber-200">
                    <Radio size={13} aria-hidden="true" /> {liveSessionStatusLabel(status)}
                  </p>
                  <h2 className="mt-1 truncate font-serif text-lg font-black">{active.sessionTitle}</h2>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" onClick={() => setDesktopChatOpen((open) => !open)} aria-expanded={desktopChatOpen} aria-controls="live-call-chat-panel" className="hidden min-h-10 items-center gap-2 rounded-full border border-white/20 px-3 text-xs font-bold hover:bg-white/10 lg:inline-flex"><MessageSquareText size={16} />{desktopChatOpen ? "Hide chat" : "Show chat"}</button>
                  <button type="button" onClick={minimize} className="grid min-h-10 min-w-10 place-items-center rounded-full border border-white/20 hover:bg-white/10" aria-label="Minimize live call"><ChevronDown size={18} /></button>
                  <button type="button" onClick={requestClose} className="grid min-h-10 min-w-10 place-items-center rounded-full border border-white/20 hover:bg-rose-500/20" aria-label="Close live call"><X size={18} /></button>
                </div>
              </div>
              <nav aria-label="Live Session work" className="mt-3 flex gap-2 overflow-x-auto pb-1 text-[10px] font-black uppercase tracking-wide">
                <Link href={sessionHref} onClick={minimize} className="shrink-0 rounded-full border border-white/20 px-3 py-2 hover:bg-white/10">Session workspace</Link>
                {callIsActive(status) ? <>
                <Link href={`${sessionHref.replace("mode=overview", "mode=transcript")}`} onClick={minimize} className="shrink-0 rounded-full border border-white/20 px-3 py-2 hover:bg-white/10">Transcript</Link>
                <Link href={`${sessionHref.replace("mode=overview", "mode=notes")}`} onClick={minimize} className="shrink-0 rounded-full border border-white/20 px-3 py-2 hover:bg-white/10">Notes</Link>
                <Link href={`${sessionHref.replace("mode=overview", "mode=work")}`} onClick={minimize} className="shrink-0 rounded-full border border-white/20 px-3 py-2 hover:bg-white/10">Goals & tasks</Link></> : null}
                {active.parentHref ? <Link href={active.parentHref} onClick={minimize} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300/40 px-3 py-2 text-amber-100 hover:bg-white/10">{active.parentLabel || "Workspace"}<ExternalLink size={11} /></Link> : null}
              </nav>
            </header>

            <div className="mt-3 flex shrink-0 gap-2 lg:hidden" role="group" aria-label="Call workspace view">
              <button type="button" aria-pressed={mobilePanel === "call"} aria-controls="live-call-stage-panel" onClick={() => setMobilePanel("call")} className={`min-h-11 flex-1 rounded-xl border px-3 text-sm font-bold ${mobilePanel === "call" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-card-foreground"}`}><Radio className="mr-2 inline" size={16} />Call</button>
              <button type="button" aria-pressed={mobilePanel === "chat"} aria-controls="live-call-chat-panel" onClick={() => setMobilePanel("chat")} className={`min-h-11 flex-1 rounded-xl border px-3 text-sm font-bold ${mobilePanel === "chat" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-card-foreground"}`}><MessageSquareText className="mr-2 inline" size={16} />Chat</button>
            </div>

            {pending ? (
              <section className="mt-3 max-h-[35dvh] shrink-0 overflow-y-auto rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950" aria-live="polite">
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide"><Repeat2 size={15} /> Another Session requested</p>
                <p className="mt-2 text-sm font-semibold">Leave <strong>{active.sessionTitle}</strong> and open <strong>{pending.sessionTitle}</strong>?</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={switchSession} disabled={Boolean(exitIntent)} className="min-h-10 rounded-full bg-amber-950 px-4 text-xs font-black text-white disabled:cursor-wait disabled:opacity-60">{exitIntent === "switch" ? "Protecting & switching…" : "Leave & switch"}</button>
                  <button type="button" onClick={() => setPending(null)} disabled={Boolean(exitIntent)} className="min-h-10 rounded-full border border-amber-400 bg-white px-4 text-xs font-black disabled:opacity-50">Stay here</button>
                </div>
              </section>
            ) : null}

            {showLeaveDecision ? (
              <section className="mt-3 max-h-[35dvh] shrink-0 overflow-y-auto rounded-2xl border border-rose-300 bg-rose-50 p-4 text-rose-950" aria-live="polite">
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide"><PhoneOff size={15} /> Leave this live call?</p>
                <p className="mt-2 text-sm font-semibold">Closing disconnects this browser. Minimizing keeps the mic, camera, participant audio, and local source controls alive.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={leaveAndClose} disabled={Boolean(exitIntent)} className="min-h-10 rounded-full bg-rose-900 px-4 text-xs font-black text-white disabled:cursor-wait disabled:opacity-60">{exitIntent === "close" ? "Protecting & closing…" : "Leave & close"}</button>
                  <button type="button" onClick={minimize} className="min-h-10 rounded-full border border-rose-300 bg-white px-4 text-xs font-black">Keep call & minimize</button>
                </div>
              </section>
            ) : null}

            <div data-testid="live-call-workspace" className={`mt-3 grid min-h-0 flex-1 gap-3 ${desktopChatOpen ? "lg:grid-cols-[minmax(0,1fr)_minmax(18rem,23rem)]" : "lg:grid-cols-1"}`}>
              <div id="live-call-stage-panel" className={`min-h-0 min-w-0 overflow-y-auto overscroll-contain ${mobilePanel === "call" ? "block" : "hidden"} lg:block`}>
              <LiveSessionRoom
                key={active.callRoomId}
                callRoomId={active.callRoomId}
                captureGroupId={active.captureGroupId}
                sessionTitle={active.sessionTitle}
                kind={active.kind}
                purpose={active.purpose}
                projectSlug={active.projectSlug || null}
                episodeSlug={active.episodeSlug || null}
                onStatusChange={setStatus}
                onProtectionChange={setSourceProtected}
                leaveRequestVersion={leaveRequestVersion}
                onExitComplete={finishRequestedExit}
                compact
                narrow
                showSessionHeading={false}
              />
              </div>
              <div id="live-call-chat-panel" className={`min-h-0 min-w-0 flex-col ${mobilePanel === "chat" ? "flex" : "hidden"} ${desktopChatOpen ? "lg:flex" : "lg:hidden"}`}>
              {active.projectSlug ? (
                <SessionThread
                  projectSlug={active.projectSlug}
                  roomId={active.callRoomId}
                  sessionTitle={active.sessionTitle}
                  canPost={active.canPost}
                  scopeLabel="This live Session"
                  scopeDescription="Messages stay here after the call."
                  heading="Chat"
                  fillHeight
                />
              ) : (
                <section className="rounded-2xl border border-[#d8c7a7] bg-white p-4">
                  <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-[#5b472f]"><MessageSquareText size={15} /> Session thread unavailable</p>
                  <p className="mt-2 text-sm font-semibold text-[#765f40]">Connect this Session to a Nest to give the call a durable shared thread.</p>
                </section>
              )}
              </div>
            </div>
          </aside>
        ) : null}
      </div>

      {active && !isOpen ? (
        <section className="fixed bottom-20 left-3 right-3 z-[65] flex items-center gap-3 rounded-2xl border border-[#d8c7a7] bg-[#3d3122] p-2.5 text-white shadow-2xl shadow-black/30 md:bottom-5 md:left-auto md:right-5 md:w-[min(32rem,calc(100vw-2.5rem))]" aria-label="Minimized live call">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${callIsActive(status) ? "bg-emerald-400 text-emerald-950" : "bg-amber-200 text-amber-950"}`}><Mic2 size={18} /></span>
          <button type="button" onClick={() => setIsOpen(true)} className="min-w-0 flex-1 text-left">
            <span className="block truncate text-sm font-black">{active.sessionTitle}</span>
            <span className="block truncate text-[11px] font-semibold text-[#dfd0b8]">{liveSessionStatusLabel(status)}</span>
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
