export const DEFAULT_PIXELS_PER_SECOND = 100;
export const MIN_PIXELS_PER_SECOND = 10;
export const MAX_PIXELS_PER_SECOND = 1000;
export const SNAP_THRESHOLD_PIXELS = 10;
export const MIN_CLIP_DURATION_SECONDS = 0.05;

export function timeToPixels(seconds: number, pixelsPerSecond: number): number {
  return seconds * pixelsPerSecond;
}

export function pixelsToTime(pixels: number, pixelsPerSecond: number): number {
  return pixels / pixelsPerSecond;
}

export function calculateSnapPoint(
  time: number,
  snapPoints: number[],
  pixelsPerSecond: number,
  thresholdPixels = SNAP_THRESHOLD_PIXELS
): number | null {
  const thresholdTime = pixelsToTime(thresholdPixels, pixelsPerSecond);
  let closestPoint: number | null = null;
  let minDistance = Infinity;

  for (const point of snapPoints) {
    const distance = Math.abs(time - point);
    if (distance <= thresholdTime && distance < minDistance) {
      minDistance = distance;
      closestPoint = point;
    }
  }

  return closestPoint;
}

export function clampTime(time: number, min = 0, max = Infinity): number {
  return Math.max(min, Math.min(max, time));
}

export function generateSnapPoints(
  clips: Array<{ startIn: number; duration: number }>,
  excludeClipId?: string
): number[] {
  const points = new Set<number>();
  points.add(0); // Always snap to start of timeline
  
  for (const clip of clips as any) {
    if (clip.id === excludeClipId) continue;
    points.add(clip.startIn);
    points.add(clip.startIn + clip.duration);
  }
  
  return Array.from(points).sort((a, b) => a - b);
}

export function checkOverlap(
  startA: number,
  durationA: number,
  startB: number,
  durationB: number
): boolean {
  return startA < startB + durationB && startA + durationA > startB;
}

export function resolveTrackCollisions(
  movedClipId: string,
  clips: Array<{ id: string, trackId: string, startIn: number, duration: number, kind: "video" | "audio" }>
): Array<{ id: string, trackId: string, startIn: number, duration: number, kind: "video" | "audio" }> {
  // 1. Find the moved clip
  const movedClip = clips.find(c => c.id === movedClipId);
  if (!movedClip) return clips;

  // 2. Find any overlapping clips on the EXACT same track
  const overlaps = clips.filter(c => 
    c.id !== movedClipId && 
    c.trackId === movedClip.trackId && 
    checkOverlap(movedClip.startIn, movedClip.duration, c.startIn, c.duration)
  );

  // If no overlaps, return the original array
  if (overlaps.length === 0) return clips;

  // 3. We have an overlap! Bump the moved clip to a new track.
  // Parse the current track (e.g. "V1", "A2")
  const prefix = movedClip.trackId.charAt(0); // "V" or "A"
  let trackNum = parseInt(movedClip.trackId.slice(1)) || 1;
  
  let newTrackId = movedClip.trackId;
  let hasOverlap = true;

  // Keep bumping up track numbers until we find a free slot
  while (hasOverlap) {
    trackNum++;
    newTrackId = `${prefix}${trackNum}`;
    
    // Check if the NEW track has an overlap
    hasOverlap = clips.some(c => 
      c.id !== movedClipId && 
      c.trackId === newTrackId && 
      checkOverlap(movedClip.startIn, movedClip.duration, c.startIn, c.duration)
    );
  }

  // 4. Return the new array with the moved clip bumped
  return clips.map(c => 
    c.id === movedClipId ? { ...c, trackId: newTrackId } : c
  );
}

export function getTrackIndex(yOffset: number, trackHeight: number, gap: number = 8): number {
  const totalTrackHeight = trackHeight + gap;
  return Math.max(0, Math.floor(yOffset / totalTrackHeight));
}
