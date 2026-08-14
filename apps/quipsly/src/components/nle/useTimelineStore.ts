import { create } from 'zustand';

interface TimelineState {
  playheadFrame: number;
  zoom: number; // Pixels per frame
  isPlaying: boolean;
  
  // Actions
  setPlayheadFrame: (frame: number) => void;
  setZoom: (zoom: number) => void;
  setIsPlaying: (playing: boolean) => void;
  
  // Playback loop integration
  advanceFrame: () => void;
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  playheadFrame: 0,
  zoom: 10, // Default to 10px per frame
  isPlaying: false,

  setPlayheadFrame: (frame) => set({ playheadFrame: Math.max(0, frame) }),
  
  setZoom: (zoom) => set({ zoom: Math.max(1, Math.min(100, zoom)) }),
  
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  
  advanceFrame: () => {
    if (get().isPlaying) {
      set((state) => ({ playheadFrame: state.playheadFrame + 1 }));
    }
  }
}));
