import { create } from 'zustand';

export type Clip = {
  id: string;
  trackId: string;
  name: string;
  startFrame: number;
  durationFrames: number;
  color: string;
};

const INITIAL_CLIPS: Clip[] = [
  { id: 'c1', trackId: 't1', name: 'Intro_Shot_01.mp4', startFrame: 30, durationFrames: 120, color: 'bg-blue-600' },
  { id: 'c2', trackId: 't1', name: 'B_Roll_Park.mp4', startFrame: 160, durationFrames: 240, color: 'bg-blue-700' },
  { id: 'c3', trackId: 't2', name: 'Logo_Overlay.png', startFrame: 60, durationFrames: 60, color: 'bg-purple-600' },
  { id: 'c4', trackId: 't3', name: 'SFX_Whoosh.wav', startFrame: 55, durationFrames: 30, color: 'bg-emerald-600' },
  { id: 'c5', trackId: 't3', name: 'Background_Music.wav', startFrame: 0, durationFrames: 1000, color: 'bg-emerald-700' },
];

interface TimelineState {
  playheadFrame: number;
  zoom: number; // Pixels per frame
  isPlaying: boolean;
  clips: Clip[];
  
  // Actions
  setPlayheadFrame: (frame: number) => void;
  setZoom: (zoom: number) => void;
  setIsPlaying: (playing: boolean) => void;
  addClip: (clip: Clip) => void;
  
  // Playback loop integration
  advanceFrame: () => void;
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  playheadFrame: 0,
  zoom: 10, // Default to 10px per frame
  isPlaying: false,
  clips: INITIAL_CLIPS,

  setPlayheadFrame: (frame) => set({ playheadFrame: Math.max(0, frame) }),
  
  setZoom: (zoom) => set({ zoom: Math.max(1, Math.min(100, zoom)) }),
  
  setIsPlaying: (playing) => set({ isPlaying: playing }),

  addClip: (clip) => set((state) => ({ clips: [...state.clips, clip] })),
  
  advanceFrame: () => {
    if (get().isPlaying) {
      set((state) => ({ playheadFrame: state.playheadFrame + 1 }));
    }
  }
}));
