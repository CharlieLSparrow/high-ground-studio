import { Clip } from './useTimelineStore';

export function calculateSnap(
  targetFrame: number,
  allClips: Clip[],
  playheadFrame: number,
  ignoreClipId?: string,
  thresholdPixels = 10,
  zoom = 10
): number {
  // Convert threshold in pixels to frames
  const thresholdFrames = thresholdPixels / zoom;

  // Collect all potential snap points
  const snapPoints = new Set<number>();
  
  // Snap to playhead
  snapPoints.add(playheadFrame);

  // Snap to start and end of all other clips
  for (const clip of allClips) {
    if (clip.id === ignoreClipId) continue;
    snapPoints.add(clip.startFrame);
    snapPoints.add(clip.startFrame + clip.durationFrames);
  }

  // Find the closest snap point
  let closestPoint = targetFrame;
  let minDistance = thresholdFrames;

  for (const point of snapPoints) {
    const distance = Math.abs(targetFrame - point);
    if (distance < minDistance) {
      minDistance = distance;
      closestPoint = point;
    }
  }

  return closestPoint;
}
