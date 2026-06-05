'use client';

import React, { useEffect, useRef } from 'react';
import { useInteractionState } from './InteractionStateContext';

export function AnalyticsTracker() {
  const { activePanelId, activeGroupId, viewerState } = useInteractionState();
  const startTimeRef = useRef<number>(Date.now());
  const previousPanelRef = useRef<string | null>(null);

  useEffect(() => {
    if (activePanelId !== previousPanelRef.current) {
      if (previousPanelRef.current) {
        const dwellTime = Date.now() - startTimeRef.current;
        // TODO(analytics): Replace with real analytics SDK call (e.g. posthog.capture / segment.track)
        console.log(`[Analytics] Panel Exited: ${previousPanelRef.current} | Dwell: ${dwellTime}ms`);
      }
      startTimeRef.current = Date.now();
      previousPanelRef.current = activePanelId;
    }
  }, [activePanelId]);

  return null; // This is a logic-only component
}
