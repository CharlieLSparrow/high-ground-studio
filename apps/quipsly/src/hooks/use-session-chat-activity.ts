"use client";

import { useEffect, useState } from "react";
import { CHAT_PERSISTED_INCOMING_EVENT, parseChatPersistedLiveHint } from "@/lib/live-collaboration/chat-live-hint";

export const SESSION_CHAT_READ_EVENT = "quipsly-session-chat-read";

/** Unread state comes from the same scoped conversation and read cursor as chat.
 * LiveKit is only a refresh hint; it never supplies trusted counts or content. */
export function useSessionChatActivity(roomId: string | null) {
  const [activity, setActivity] = useState<{roomId: string; count: number} | null>(null);
  useEffect(() => {
    if (!roomId) return;
    let alive = true;
    let inFlight = false;
    let refreshAgain = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (!alive || document.visibilityState === "hidden") return;
      if (inFlight) { refreshAgain = true; return; }
      inFlight = true;
      try {
        const response = await fetch(`/api/sessions/${encodeURIComponent(roomId)}/conversation?view=activity`, {
          cache: "no-store", signal: controller.signal,
        });
        if (!alive) return;
        if ([401, 403, 404].includes(response.status)) { setActivity(null); return; }
        const data = await response.json();
        if (!alive) return;
        if (!response.ok || !data.ok || data.room?.id !== roomId || !Number.isSafeInteger(data.unreadCount) || data.unreadCount < 0) {
          return;
        }
        setActivity({roomId, count: data.unreadCount});
      } catch { /* Keep the last verified count through a temporary disconnect. */ }
      finally {
        inFlight = false;
        if (refreshAgain && alive) { refreshAgain = false; void refresh(); }
      }
    };
    const receive = (event: Event) => {
      if (parseChatPersistedLiveHint((event as CustomEvent).detail, `session:${roomId}`)) void refresh();
    };
    const read = (event: Event) => {
      if ((event as CustomEvent).detail?.roomId === roomId) void refresh();
    };
    const visible = () => { void refresh(); };
    void refresh();
    const timer = window.setInterval(visible, 15_000);
    window.addEventListener(CHAT_PERSISTED_INCOMING_EVENT, receive);
    window.addEventListener(SESSION_CHAT_READ_EVENT, read);
    window.addEventListener("online", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      alive = false;
      controller.abort();
      clearInterval(timer);
      window.removeEventListener(CHAT_PERSISTED_INCOMING_EVENT, receive);
      window.removeEventListener(SESSION_CHAT_READ_EVENT, read);
      window.removeEventListener("online", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [roomId]);
  return activity?.roomId === roomId ? activity.count : 0;
}
