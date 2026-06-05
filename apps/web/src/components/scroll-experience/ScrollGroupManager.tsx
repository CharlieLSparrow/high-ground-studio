'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ScrollGroup, ExperienceType } from './types';
import { useInteractionState } from './InteractionStateContext';
import { ScrollPanelRenderer } from './ScrollPanelRenderer';

interface ScrollGroupManagerProps {
  group: ScrollGroup;
  experienceType: ExperienceType;
}

/**
 * Manages the horizontal scrolling logic for a group of panels.
 *
 * It uses native CSS `scroll-snap-type: x mandatory` to ensure panels snap neatly into view.
 *
 * **State Synchronization Strategy:**
 * 1. Native Chrome 129+ Events: Listens for `scrollsnapchanging` and `scrollsnapchange`
 *    to guarantee perfect, zero-latency active panel state updates.
 * 2. Robust Geometric Fallback: Polyfills older browsers (like Safari) by attaching an optimized
 *    `requestAnimationFrame` listener to the scroll event. It calculates the geometric distance
 *    to the closest panel center to eagerly update the UI (like progress dots) mid-swipe.
 *
 * @param props.group - The metadata and panels for this horizontal group.
 * @param props.experienceType - The type of experience to render panels for.
 */
export function ScrollGroupManager({ group, experienceType }: ScrollGroupManagerProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { setActivePanel } = useInteractionState();
  const [activeId, setActiveId] = useState<string>(group.panels[0]?.id || '');
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    // Convert children HTMLCollection to Array for easy indexing
    const items = Array.from(container.children) as HTMLElement[];
    if (items.length === 0) return;

    // Helper: Find closest item geometrically (fallback for older browsers)
    const findClosestItem = () => {
      const containerCenter = container.scrollLeft + container.clientWidth / 2;
      let closestId = items[0].getAttribute('data-panel-id') || '';
      let minDistance = Infinity;

      items.forEach((item) => {
        const itemCenter = item.offsetLeft + item.offsetWidth / 2;
        const distance = Math.abs(containerCenter - itemCenter);
        if (distance < minDistance) {
          minDistance = distance;
          closestId = item.getAttribute('data-panel-id') || '';
        }
      });
      return closestId;
    };

    // Promote the currently pending item to active (settled)
    const promoteToActive = (id: string) => {
      setActiveId(id);
      setPendingId(null);
      setActivePanel(group.id, id);
    };

    // 1. Feature Detect Native Scroll Snap Events
    // @ts-ignore - TS doesn't know about onscrollsnapchanging yet
    if ('onscrollsnapchanging' in Element.prototype) {
      const handleSnapChanging = (e: any) => {
        const target = e.snapTargetInline;
        if (target) {
          setPendingId(target.getAttribute('data-panel-id'));
        }
      };

      const handleSnapChange = (e: any) => {
        const target = e.snapTargetInline;
        if (target) {
          const id = target.getAttribute('data-panel-id');
          if (id) promoteToActive(id);
        }
      };

      container.addEventListener('scrollsnapchanging', handleSnapChanging);
      container.addEventListener('scrollsnapchange', handleSnapChange);

      return () => {
        container.removeEventListener('scrollsnapchanging', handleSnapChanging);
        container.removeEventListener('scrollsnapchange', handleSnapChange);
      };
    } 
    // 2. Fallback: Geometric Calculation with requestAnimationFrame
    else {
      let scrollTimeout: NodeJS.Timeout;
      let rafId: number | null = null;

      const handleScroll = () => {
        if (rafId) return;
        
        rafId = requestAnimationFrame(() => {
          rafId = null;
          const closestId = findClosestItem();
          if (closestId) {
            setPendingId(closestId); // eager feedback
          }
        });

        // Debounce to simulate scroll completion (snap change)
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          const finalId = findClosestItem();
          if (finalId) promoteToActive(finalId);
        }, 150); // 150ms after last scroll event is usually considered "settled"
      };

      const handleScrollEnd = () => {
        clearTimeout(scrollTimeout);
        const finalId = findClosestItem();
        if (finalId) promoteToActive(finalId);
      };

      container.addEventListener('scroll', handleScroll, { passive: true });
      // Use scrollend if available in fallback path
      if ('onscrollend' in window) {
         container.addEventListener('scrollend', handleScrollEnd);
      }

      return () => {
        container.removeEventListener('scroll', handleScroll);
        if ('onscrollend' in window) {
           container.removeEventListener('scrollend', handleScrollEnd);
        }
        clearTimeout(scrollTimeout);
        if (rafId) cancelAnimationFrame(rafId);
      };
    }
  }, [group.id, setActivePanel]);

  return (
    <div 
      className="w-full h-[100dvh] snap-start snap-always relative flex items-center justify-center bg-zinc-950"
      data-group-id={group.id}
    >
      {/* Horizontal Scrolling Panel Container */}
      <div 
        ref={scrollContainerRef}
        className="w-full h-full overflow-x-auto snap-x snap-mandatory flex hide-scrollbar overscroll-x-none relative"
        style={{ scrollBehavior: 'smooth' }}
      >
        {group.panels.map((panel) => (
          <div key={panel.id} className="min-w-full h-full snap-center snap-always flex" data-panel-id={panel.id}>
             <ScrollPanelRenderer panel={panel} group={group} experienceType={experienceType} />
          </div>
        ))}
      </div>

      {/* Group Title Overlay */}
      <div className="absolute top-safe-20 left-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-md text-xs text-zinc-300 pointer-events-none border border-white/10 shadow-xl z-30 mt-4">
        {group.title}
      </div>
      
      {/* Horizontal progress indicator with active/pending state tracking */}
      <div className="absolute top-safe-28 left-4 flex gap-1.5 z-30 mt-14">
        {group.panels.map((p) => {
          const isSettledActive = p.id === activeId;
          const isPending = p.id === pendingId;
          const isHighlighted = isPending || (isSettledActive && !pendingId);
          
          return (
            <div 
              key={p.id} 
              aria-current={isSettledActive ? "true" : "false"}
              className={`h-1.5 rounded-full transition-all duration-300 ease-out ${
                isHighlighted ? 'w-6 bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)]' : 'w-2 bg-white/20'
              }`} 
            />
          );
        })}
      </div>
    </div>
  );
}
