'use client';

import React from 'react';
import { ScrollPanel, ScrollGroup, ExperienceType } from './types';
import { InteractionOverlay } from './InteractionOverlay';
import { StoryboardAdapter } from './adapters/StoryboardAdapter';
import { CourseAdapter } from './adapters/CourseAdapter';
import { PhotographyAdapter } from './adapters/PhotographyAdapter';
import { LorelistAdapter } from './adapters/LorelistAdapter';
import { ComicAdapter } from './adapters/ComicAdapter';

interface ScrollPanelRendererProps {
  panel: ScrollPanel;
  group: ScrollGroup;
  experienceType: ExperienceType;
  isActive?: boolean;
}

/**
 * Factory component that routes an individual ScrollPanel payload to the correct format adapter.
 *
 * Each format (Storyboard, Course, Photography, etc.) has its own unique visual presentation
 * for a panel's media and text content. This renderer keeps the layout code clean by delegating
 * presentation to specialized adapters.
 *
 * @param props.panel - The panel content and configuration payload.
 * @param props.experienceType - The overarching format dictating which visual style adapter to use.
 * @param props.isActive - Whether this specific panel is currently snapped into the center of the viewport.
 */
export function ScrollPanelRenderer({ panel, experienceType, isActive }: ScrollPanelRendererProps) {
  const renderAdapter = () => {
    switch (experienceType) {
      case 'STORYBOARD':
        return <StoryboardAdapter panel={panel} />;
      case 'COURSE':
        return <CourseAdapter panel={panel} />;
      case 'PHOTOGRAPHY':
        return <PhotographyAdapter panel={panel} />;
      case 'LORELIST':
        return <LorelistAdapter panel={panel} />;
      case 'COMIC':
        return <ComicAdapter panel={panel} />;
      default:
        return (
          <div className="flex-1 flex items-center justify-center p-8 text-center text-zinc-500">
            Fallback View: {panel.content.caption || 'No content'}
          </div>
        );
    }
  };

  return (
    <div className="w-full h-full flex flex-col relative overflow-hidden">
      {/* Dynamic Content Area */}
      <div className="flex-1 overflow-hidden relative">
        {renderAdapter()}
      </div>

      {/* Unified Interaction Bar / Overlay Layer */}
      <InteractionOverlay panel={panel} experienceType={experienceType} />
    </div>
  );
}
