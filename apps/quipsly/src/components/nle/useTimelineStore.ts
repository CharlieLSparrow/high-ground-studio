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
  selectedClipIds: string[];
  
  // Actions
  setPlayheadFrame: (frame: number) => void;
  setZoom: (zoom: number) => void;
  setIsPlaying: (playing: boolean) => void;
  addClip: (clip: Clip) => void;
  updateClip: (id: string, partial: Partial<Clip>) => void;
  deleteClip: (id: string) => void;
  splitClip: (id: string, frame: number) => void;
  toggleClipSelection: (id: string, multi: boolean) => void;
  clearSelection: () => void;
  
  // Playback loop integration
  advanceFrame: () => void;
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  playheadFrame: 0,
  zoom: 10, // Default to 10px per frame
  isPlaying: false,
  clips: INITIAL_CLIPS,
  selectedClipIds: [],

  setPlayheadFrame: (frame) => set({ playheadFrame: Math.max(0, frame) }),
  
  setZoom: (zoom) => set({ zoom: Math.max(1, Math.min(100, zoom)) }),
  
  setIsPlaying: (playing) => set({ isPlaying: playing }),

  addClip: (clip) => set((state) => ({ clips: [...state.clips, clip] })),
  
  updateClip: (id, partial) => set((state) => ({
    clips: state.clips.map(c => c.id === id ? { ...c, ...partial } : c)
  })),

  deleteClip: (id) => set((state) => ({
    clips: state.clips.filter(c => c.id !== id),
    selectedClipIds: state.selectedClipIds.filter(selectedId => selectedId !== id)
  })),

  splitClip: (id, frame) => set((state) => {
    const clip = state.clips.find(c => c.id === id);
    if (!clip || frame <= clip.startFrame || frame >= clip.startFrame + clip.durationFrames) return state;

    const firstDuration = frame - clip.startFrame;
    const secondDuration = clip.durationFrames - firstDuration;
    
    const firstClip = { ...clip, durationFrames: firstDuration };
    const secondClip = { ...clip, id: `${clip.id}-split-${Date.now()}`, startFrame: frame, durationFrames: secondDuration, name: `${clip.name} (2)` };

    return {
      clips: [...state.clips.filter(c => c.id !== id), firstClip, secondClip]
    };
  }),

  toggleClipSelection: (id, multi) => set((state) => {
    if (multi) {
      return {
        selectedClipIds: state.selectedClipIds.includes(id) 
          ? state.selectedClipIds.filter(s => s !== id)
          : [...state.selectedClipIds, id]
      };
    } else {
      return { selectedClipIds: [id] };
    }
  }),

  clearSelection: () => set({ selectedClipIds: [] }),
  
  advanceFrame: () => {
    if (get().isPlaying) {
      set((state) => ({ playheadFrame: state.playheadFrame + 1 }));
    }
  }
}));
