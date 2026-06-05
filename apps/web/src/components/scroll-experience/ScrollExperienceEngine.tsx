'use client';

import React, { useEffect, useRef } from 'react';
import { ScrollExperience } from './types';
import { InteractionStateProvider, useInteractionState } from './InteractionStateContext';
import { ScrollGroupManager } from './ScrollGroupManager';
import { AnalyticsTracker } from './AnalyticsTracker';

/**
 * Props for the core ScrollExperienceEngine component.
 * @property experience - The full ScrollExperience JSON payload defining groups, panels, and content.
 * @property mode - Display mode flag determining interactivity levels (view, review, preview).
 */
interface ScrollExperienceEngineProps {
  experience: ScrollExperience;
  mode?: 'view' | 'review' | 'preview';
}

/**
 * Internal layout wrapper that handles vertical scrolling logic.
 * Enforces dynamic viewport heights (`100dvh`) to prevent mobile Safari address bar jank,
 * and sets up intersection observers to track which vertical group is currently focused.
 */
function ExperienceLayout({ experience }: { experience: ScrollExperience }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { setActivePanel } = useInteractionState();

  // Basic IntersectionObserver to detect which group is in view (for analytics/state)
  useEffect(() => {
    if (!containerRef.current) return;
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const groupId = entry.target.getAttribute('data-group-id');
          if (groupId) {
             // TODO(analytics): Replace with real analytics SDK call (e.g. posthog.capture)
             console.log(`[Analytics] Group entered view: ${groupId}`);
          }
        }
      });
    }, { threshold: 0.5 });

    const children = containerRef.current.children;
    for (let i = 0; i < children.length; i++) {
      observer.observe(children[i]);
    }

    return () => observer.disconnect();
  }, [experience]);

  return (
    <div className="relative w-full h-[100dvh] bg-black text-white overflow-hidden flex flex-col font-sans touch-none overscroll-y-none">
      <AnalyticsTracker />
      
      {/* Header Overlay */}
      <header className="absolute top-0 w-full p-4 bg-gradient-to-b from-black/90 to-transparent z-10 pointer-events-none flex justify-between items-start">
        <div>
          <h1 className="text-xl font-bold tracking-tight drop-shadow-md">{experience.title}</h1>
          <p className="text-xs text-gray-300 font-medium tracking-wide uppercase opacity-80 mt-1">
            {experience.type} • {experience.groups.length} Sections
          </p>
        </div>
      </header>

      {/* Main Vertical Scroll Container */}
      <div 
        ref={containerRef}
        className="flex-1 w-full overflow-y-auto snap-y snap-mandatory hide-scrollbar overscroll-none"
        style={{ scrollBehavior: 'smooth' }}
      >
        {experience.groups.map((group) => (
          <ScrollGroupManager key={group.id} group={group} experienceType={experience.type} />
        ))}
      </div>
    </div>
  );
}

/**
 * The root orchestration engine for Scroll-Native Experiences.
 *
 * This component wraps the layout in an `InteractionStateProvider` and an `AnalyticsTracker`
 * so that all child groups and panels have access to global interaction contexts (likes, comments)
 * without complex prop-drilling. It powers Courses, Comics, Storyboards, and Lorelists.
 *
 * @example
 * ```tsx
 * <ScrollExperienceEngine experience={mockCoursePayload} mode="view" />
 * ```
 */
export default function ScrollExperienceEngine({ experience, mode = 'view' }: ScrollExperienceEngineProps) {
  return (
    <InteractionStateProvider experienceId={experience.id}>
      <ExperienceLayout experience={experience} />
    </InteractionStateProvider>
  );
}
