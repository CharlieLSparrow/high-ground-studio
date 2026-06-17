#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import os from 'node:os';

const [projectSlug = 'high-ground-odyssey-manuscript', episodeSlug = 'episode-1'] = process.argv.slice(2);
const appSupport = join(os.homedir(), 'Library/Application Support/QuipslyMac');
const manifestPath = join(appSupport, 'render-prep', projectSlug, episodeSlug, 'manifest.json');
const outputPath = join(appSupport, 'render-plans', projectSlug, episodeSlug, 'program-plan.json');

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function naturalTrackOrder(trackId) {
  const id = String(trackId || '').toUpperCase();
  const digits = Number(id.replace(/\D/g, '') || 0);
  if (id.startsWith('V')) return 10000 + digits;
  if (id.startsWith('A')) return digits;
  return 5000 + digits;
}

function isVideoClip(clip) {
  return clip.isVideoLike === true ||
    String(clip.trackId || '').toUpperCase().startsWith('V') ||
    String(clip.kind || '').toLowerCase() === 'video' ||
    String(clip.mediaKind || '').toLowerCase() === 'video';
}

function isAudioTrack(clip) {
  return String(clip.trackId || '').toUpperCase().startsWith('A');
}

function clipContains(clip, time) {
  return time >= Number(clip.editStart || 0) && time < Number(clip.editEnd || 0) - 0.0001;
}

function mediaPathFor(clip) {
  return clip.localMediaPath || null;
}

function previewMediaPathFor(clip) {
  return clip.playbackMediaPath || null;
}

function sourceAtEditTime(clip, editTime) {
  return Number(clip.sourceStart || 0) + (editTime - Number(clip.editStart || 0));
}

function mergeVideoSegments(segments) {
  const merged = [];
  for (const segment of segments) {
    const previous = merged[merged.length - 1];
    const canMerge = previous &&
      previous.clipId === segment.clipId &&
      previous.trackId === segment.trackId &&
      previous.mediaPath === segment.mediaPath &&
      JSON.stringify(previous.motion || null) === JSON.stringify(segment.motion || null) &&
      Math.abs(previous.editEnd - segment.editStart) <= 0.001 &&
      Math.abs(previous.sourceEnd - segment.sourceStart) <= 0.001;
    if (canMerge) {
      previous.editEnd = segment.editEnd;
      previous.sourceEnd = segment.sourceEnd;
      previous.duration = previous.editEnd - previous.editStart;
    } else {
      merged.push({ ...segment });
    }
  }
  return merged;
}

function withOutputTimeline(segments) {
  let cursor = 0;
  return segments.map((segment) => {
    const duration = Number(segment.duration || 0);
    const outputSegment = {
      ...segment,
      outputStart: cursor,
      outputEnd: cursor + duration,
    };
    cursor += duration;
    return outputSegment;
  });
}

function intersection(leftStart, leftEnd, rightStart, rightEnd) {
  const start = Math.max(Number(leftStart || 0), Number(rightStart || 0));
  const end = Math.min(Number(leftEnd || 0), Number(rightEnd || 0));
  if (end - start <= 0.01) return null;
  return { start, end, duration: end - start };
}

if (!existsSync(manifestPath)) {
  fail(`Missing render-prep manifest: ${manifestPath}. Run script/render_readiness_matrix.sh --refresh ${projectSlug} ${episodeSlug}`);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const blockers = Array.isArray(manifest.blockers) ? manifest.blockers : [];
const warnings = Array.isArray(manifest.warnings) ? manifest.warnings : [];
const clips = Array.isArray(manifest.clips) ? manifest.clips : [];
const active = clips.filter((clip) => clip.isActive === true);
const activeVideoClips = active
  .filter((clip) => isVideoClip(clip) && String(clip.trackId || '').toUpperCase().startsWith('V'));
const activeAudioClips = active.filter((clip) => isAudioTrack(clip));
const boundaries = [...new Set(activeVideoClips.flatMap((clip) => [Number(clip.editStart || 0), Number(clip.editEnd || 0)]))]
  .filter((value) => Number.isFinite(value))
  .sort((a, b) => a - b);
const videoSegments = [];
const programBlockers = new Map();

for (let index = 0; index < boundaries.length - 1; index += 1) {
  const editStart = boundaries[index];
  const editEnd = boundaries[index + 1];
  const duration = editEnd - editStart;
  if (duration <= 0.01) continue;
  const midpoint = editStart + duration / 2;
  const clip = activeVideoClips
    .filter((candidate) => clipContains(candidate, midpoint))
    .sort((left, right) => naturalTrackOrder(right.trackId) - naturalTrackOrder(left.trackId))[0];
  if (!clip) continue;
  const mediaPath = mediaPathFor(clip);
  if (!mediaPath || clip.localMediaExists !== true) {
    const key = `${clip.id}:${editStart}:${editEnd}`;
    programBlockers.set(key, {
      type: 'missing-program-video-source',
      clipId: clip.id,
      name: clip.name,
      trackId: clip.trackId,
      editStart,
      editEnd,
      sourceStart: sourceAtEditTime(clip, editStart),
      sourceEnd: sourceAtEditTime(clip, editEnd),
      reason: 'Topmost active V* clip at this program interval has no local source media.',
    });
    continue;
  }
  const sourceStart = sourceAtEditTime(clip, editStart);
  const sourceEnd = sourceAtEditTime(clip, editEnd);
  videoSegments.push({
    clipId: clip.id,
    sourceAssetId: clip.sourceAssetId,
    name: clip.name,
    trackId: clip.trackId,
    mediaPath,
    previewMediaPath: previewMediaPathFor(clip),
    mediaPathRole: 'source-original-for-render',
    motion: clip.motion || null,
    editStart,
    editEnd,
    duration,
    sourceStart,
    sourceEnd,
  });
}

const programVideoSegments = withOutputTimeline(mergeVideoSegments(videoSegments));
const audioSegments = [];

for (const clip of activeAudioClips) {
  for (const videoSegment of programVideoSegments) {
    const overlap = intersection(clip.editStart, clip.editEnd, videoSegment.editStart, videoSegment.editEnd);
    if (!overlap) continue;

    const outputStart = videoSegment.outputStart + (overlap.start - videoSegment.editStart);
    const mediaPath = mediaPathFor(clip);
    if (!mediaPath || clip.localMediaExists !== true) {
      programBlockers.set(`audio:${clip.id}:${overlap.start}:${overlap.end}`, {
        type: 'missing-program-audio-source',
        clipId: clip.id,
        name: clip.name,
        trackId: clip.trackId,
        editStart: overlap.start,
        editEnd: overlap.end,
        outputStart,
        outputEnd: outputStart + overlap.duration,
        sourceStart: Number(clip.sourceStart || 0) + (overlap.start - Number(clip.editStart || 0)),
        sourceEnd: Number(clip.sourceStart || 0) + (overlap.end - Number(clip.editStart || 0)),
        reason: 'Active A* clip overlaps program output but has no local source media.',
      });
      continue;
    }

    const sourceStart = Number(clip.sourceStart || 0) + (overlap.start - Number(clip.editStart || 0));
    const sourceEnd = Number(clip.sourceStart || 0) + (overlap.end - Number(clip.editStart || 0));
    audioSegments.push({
      clipId: clip.id,
      sourceAssetId: clip.sourceAssetId,
      name: clip.name,
      trackId: clip.trackId,
      mediaPath,
      previewMediaPath: previewMediaPathFor(clip),
      mediaPathRole: 'source-original-for-render',
      editStart: overlap.start,
      editEnd: overlap.end,
      outputStart,
      outputEnd: outputStart + overlap.duration,
      duration: overlap.duration,
      sourceStart,
      sourceEnd,
    });
  }
}

audioSegments.sort((left, right) => left.outputStart - right.outputStart || naturalTrackOrder(left.trackId) - naturalTrackOrder(right.trackId));

const plan = {
  schema: 'quipsly-mac-program-render-plan-v1',
  generatedAt: new Date().toISOString(),
  projectSlug,
  episodeSlug,
  manifestPath,
  manifestReadiness: manifest.readiness,
  ok: programBlockers.size === 0 && programVideoSegments.length > 0,
  blockers: [...programBlockers.values()],
  sourceReviewBlockers: blockers,
  warnings,
  outputMode: manifest.outputPlan?.mode || 'play-edit',
  inactivePolicy: manifest.outputPlan?.inactivePolicy || 'preserve-in-manifest-skip-in-output',
  mediaPathPolicy: 'source-original-for-render-preview-path-is-non-authoritative-v1',
  programDuration: manifest.programDuration || 0,
  renderedProgramDuration: programVideoSegments.at(-1)?.outputEnd ?? 0,
  activeEditDuration: manifest.activeEditDuration || 0,
  inactiveClipCount: manifest.inactiveClipCount || 0,
  videoTrackIds: manifest.videoTrackIds || [],
  audioTrackIds: manifest.audioTrackIds || [],
  videoSegments: programVideoSegments,
  audioSegments,
  notes: [
    'Video segments choose the topmost active V* clip at each edit interval.',
    'Audio segments preserve active A* clips for the renderer/mixer layer.',
    'Inactive clips remain in the render-prep manifest and are intentionally skipped here.',
    'mediaPath is the original/local source path used for render/export; previewMediaPath is only a cache/proxy convenience and must not replace the source for final output.',
    'Source-review blockers can exist without blocking Play Edit export when missing lower-track media is fully hidden by higher playable V* media.',
  ],
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(plan, null, 2));

console.log(JSON.stringify({
  ok: plan.ok,
  projectSlug,
  episodeSlug,
  outputPath,
  blockers: plan.blockers,
  sourceReviewBlockers: plan.sourceReviewBlockers,
  warnings: plan.warnings,
  videoSegmentCount: plan.videoSegments.length,
  audioSegmentCount: plan.audioSegments.length,
  programDuration: plan.programDuration,
  activeEditDuration: plan.activeEditDuration,
}, null, 2));

if (!plan.ok) process.exitCode = 1;
