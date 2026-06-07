#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const PREMIERE_TICKS_PER_SECOND = 254_016_000_000;
const DEFAULT_PROJECT_SLUG = "high-ground-odyssey-manuscript";
const DEFAULT_OUTPUT_DIR = "content/quipsly/premiere-imports";

const VIDEO_EXTENSIONS = new Set([
  ".3gp",
  ".avi",
  ".insv",
  ".lrv",
  ".m4v",
  ".mkv",
  ".mov",
  ".mp4",
  ".mpeg",
  ".mpg",
  ".webm",
]);

const AUDIO_EXTENSIONS = new Set([
  ".aac",
  ".aif",
  ".aiff",
  ".flac",
  ".m4a",
  ".mp3",
  ".ogg",
  ".wav",
  ".webm",
]);

function parseArgs(argv) {
  const args = {
    projectSlug: DEFAULT_PROJECT_SLUG,
    outDir: DEFAULT_OUTPUT_DIR,
    pretty: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === "--input" || token === "-i") {
      args.input = next;
      index += 1;
    } else if (token === "--episode" || token === "-e") {
      args.episodeSlug = next;
      index += 1;
    } else if (token === "--project" || token === "-p") {
      args.projectSlug = next;
      index += 1;
    } else if (token === "--out-dir") {
      args.outDir = next;
      index += 1;
    } else if (token === "--out") {
      args.out = next;
      index += 1;
    } else if (token === "--compact") {
      args.pretty = false;
    } else if (token === "--help" || token === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!args.input) throw new Error("Missing --input /path/to/Episode.prproj");
  if (!args.episodeSlug) throw new Error("Missing --episode episode-1");
  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/quipsly/import-premiere-project.mjs \\
    --input /path/to/Episode1.prproj \\
    --project high-ground-odyssey-manuscript \\
    --episode episode-1

Outputs a Quipsly Premiere import packet that preserves media references,
active timeline clips, raw Premiere ticks, and candidate deactivated source
ranges for recoverable re-editing.`);
}

function readPremiereXml(inputPath) {
  const buffer = fs.readFileSync(inputPath);
  const xmlBuffer = buffer[0] === 0x1f && buffer[1] === 0x8b ? zlib.gunzipSync(buffer) : buffer;
  return xmlBuffer.toString("utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeXml(value = "") {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function getAttr(block, attrName) {
  const match = block.match(new RegExp(`\\b${escapeRegExp(attrName)}="([^"]+)"`));
  return match ? decodeXml(match[1]) : undefined;
}

function getTagValues(block, tagName) {
  const escaped = escapeRegExp(tagName);
  const regex = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "g");
  const values = [];
  let match;
  while ((match = regex.exec(block))) values.push(decodeXml(match[1]));
  return values;
}

function getTagValue(block, tagName) {
  return getTagValues(block, tagName)[0];
}

function getRef(block, tagName) {
  const escaped = escapeRegExp(tagName);
  const match = block.match(new RegExp(`<${escaped}\\b[^>]*\\bObjectRef="([^"]+)"[^>]*\\/?\\s*>`));
  return match ? match[1] : undefined;
}

function getRefs(block, tagName) {
  const escaped = escapeRegExp(tagName);
  const regex = new RegExp(`<${escaped}\\b[^>]*\\bObjectRef="([^"]+)"[^>]*\\/?\\s*>`, "g");
  const refs = [];
  let match;
  while ((match = regex.exec(block))) refs.push(match[1]);
  return refs;
}

function getURef(block, tagName) {
  const escaped = escapeRegExp(tagName);
  const match = block.match(new RegExp(`<${escaped}\\b[^>]*\\bObjectURef="([^"]+)"[^>]*\\/?\\s*>`));
  return match ? match[1] : undefined;
}

function getURefs(block, tagName) {
  const escaped = escapeRegExp(tagName);
  const regex = new RegExp(`<${escaped}\\b[^>]*\\bObjectURef="([^"]+)"[^>]*\\/?\\s*>`, "g");
  const refs = [];
  let match;
  while ((match = regex.exec(block))) refs.push(match[1]);
  return refs;
}

function getIndexedURefs(block, tagName) {
  const escaped = escapeRegExp(tagName);
  const regex = new RegExp(`<${escaped}\\b[^>]*\\bIndex="([^"]+)"[^>]*\\bObjectURef="([^"]+)"[^>]*\\/?\\s*>`, "g");
  const refs = [];
  let match;
  while ((match = regex.exec(block))) {
    refs.push({ index: Number.parseInt(match[1], 10), uref: match[2] });
  }
  return refs.sort((left, right) => left.index - right.index);
}

function getIndexedRefs(block, tagName) {
  const escaped = escapeRegExp(tagName);
  const regex = new RegExp(`<${escaped}\\b[^>]*\\bIndex="([^"]+)"[^>]*\\bObjectRef="([^"]+)"[^>]*\\/?\\s*>`, "g");
  const refs = [];
  let match;
  while ((match = regex.exec(block))) {
    refs.push({ index: Number.parseInt(match[1], 10), ref: match[2] });
  }
  return refs.sort((left, right) => left.index - right.index);
}

function objectBlocks(xml, tagName) {
  const escaped = escapeRegExp(tagName);
  const regex = new RegExp(`<${escaped}\\b[^>]*>[\\s\\S]*?<\\/${escaped}>`, "g");
  return [...xml.matchAll(regex)].map((match) => match[0]);
}

function asNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ticksToSeconds(ticks) {
  const parsed = asNumber(ticks, 0);
  if (!Number.isFinite(parsed)) return 0;
  return Number((parsed / PREMIERE_TICKS_PER_SECOND).toFixed(6));
}

function secondsDuration(startTicks, endTicks) {
  return Math.max(0, ticksToSeconds(asNumber(endTicks) - asNumber(startTicks)));
}

function stableId(...parts) {
  return crypto.createHash("sha1").update(parts.filter(Boolean).join("|")).digest("hex").slice(0, 16);
}

function slugify(value, fallback = "untitled") {
  const safe = String(value || "")
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return safe || fallback;
}

function fileKindFromPath(filePath, fallback = "unknown") {
  const ext = path.extname(filePath || "").toLowerCase();
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  return fallback;
}

function contentTypeFromPath(filePath, kind) {
  const ext = path.extname(filePath || "").toLowerCase();
  const types = {
    ".aac": "audio/aac",
    ".aif": "audio/aiff",
    ".aiff": "audio/aiff",
    ".avi": "video/x-msvideo",
    ".flac": "audio/flac",
    ".insv": "video/mp4",
    ".lrv": "video/mp4",
    ".m4a": "audio/mp4",
    ".m4v": "video/mp4",
    ".mkv": "video/x-matroska",
    ".mov": "video/quicktime",
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
    ".webm": kind === "audio" ? "audio/webm" : "video/webm",
  };
  return types[ext] || (kind === "audio" ? "audio/octet-stream" : kind === "video" ? "video/octet-stream" : "application/octet-stream");
}

function importRoleForMedia(media) {
  const name = `${media.originalName} ${media.filePath}`.toLowerCase();
  if (media.kind === "audio") {
    if (/call|mainoutput|first pod|homer|charlie|mic|tx00/.test(name)) return "spine-audio-candidate";
    return "audio-source";
  }
  if (media.kind === "video") {
    if (/homer|charlie|camera|insta|vid_|mvi_|iphone|sony|canon|gopro/.test(name)) return "camera-video";
    if (/temp_video|youtube|source|there is no try|percy/.test(name)) return "reference-clip";
    return "video-source";
  }
  return "episode-media";
}

function isRealFilePath(filePath) {
  if (!filePath) return false;
  if (/^\d+$/.test(filePath)) return false;
  return filePath.startsWith("/") || filePath.startsWith("./") || /^[A-Za-z]:[\\/]/.test(filePath);
}

function safeStat(filePath) {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

function mediaHealth(filePath, historyPaths) {
  const stat = filePath && filePath.startsWith("/") ? safeStat(filePath) : null;
  const allPaths = [filePath, ...historyPaths].filter(Boolean);
  const hasICloudPath = allPaths.some((value) => value.includes("/Mobile Documents/") || value.includes("com~apple~CloudDocs"));

  return {
    exists: Boolean(stat),
    size: stat?.size ?? null,
    modifiedAt: stat?.mtime ? stat.mtime.toISOString() : null,
    iCloudHistory: hasICloudPath,
    needsLocalDownload: !stat && hasICloudPath,
    downloadHints: allPaths
      .filter((value) => value.includes("/Mobile Documents/") || value.includes("com~apple~CloudDocs"))
      .map((value) => `brctl download ${JSON.stringify(value)}`),
  };
}

function parseStreams(xml, tagName, kind) {
  const map = new Map();
  for (const block of objectBlocks(xml, tagName)) {
    const id = getAttr(block, "ObjectID");
    if (!id) continue;
    map.set(id, {
      objectId: id,
      kind,
      durationTicks: asNumber(getTagValue(block, "Duration"), 0),
      durationSeconds: ticksToSeconds(getTagValue(block, "Duration")),
      frameRateRaw: getTagValue(block, "FrameRate"),
    });
  }
  return map;
}

function parseMedia(xml, audioStreams, videoStreams) {
  const mediaByUid = new Map();

  for (const block of objectBlocks(xml, "Media")) {
    const objectUid = getAttr(block, "ObjectUID");
    if (!objectUid) continue;

    const filePath = getTagValue(block, "ActualMediaFilePath") || getTagValue(block, "FilePath");
    const title = getTagValue(block, "Title") || path.basename(filePath || "") || objectUid;
    if (!isRealFilePath(filePath)) continue;

    const relativePaths = getTagValues(block, "RelativePath");
    const historyPaths = [...new Set([...getTagValues(block, "MediaFileHistory0"), ...getTagValues(block, "MediaFileHistory1")])];
    const audioStreamRefs = getRefs(block, "AudioStream");
    const videoStreamRefs = getRefs(block, "VideoStream");
    const audioStreamInfo = audioStreamRefs.map((ref) => audioStreams.get(ref)).filter(Boolean);
    const videoStreamInfo = videoStreamRefs.map((ref) => videoStreams.get(ref)).filter(Boolean);
    const durationSeconds = Math.max(
      0,
      ...audioStreamInfo.map((stream) => stream.durationSeconds),
      ...videoStreamInfo.map((stream) => stream.durationSeconds),
    );
    const inferredKind = videoStreamRefs.length ? "video" : audioStreamRefs.length ? "audio" : fileKindFromPath(filePath);

    mediaByUid.set(objectUid, {
      id: `premiere-source-${stableId(path.resolve(filePath))}`,
      premiereMediaUid: objectUid,
      title,
      originalName: path.basename(filePath),
      filePath,
      actualMediaFilePath: filePath,
      relativePaths,
      historyPaths,
      kind: fileKindFromPath(filePath, inferredKind),
      isProxy: getTagValue(block, "IsProxy") === "true",
      fileKey: getTagValue(block, "FileKey"),
      durationSeconds: durationSeconds || null,
      durationTicks: Math.max(
        0,
        ...audioStreamInfo.map((stream) => stream.durationTicks),
        ...videoStreamInfo.map((stream) => stream.durationTicks),
      ) || null,
      audioStreams: audioStreamInfo,
      videoStreams: videoStreamInfo,
      health: mediaHealth(filePath, historyPaths),
    });
  }

  return mediaByUid;
}

function consolidateMedia(mediaItems) {
  const canonical = new Map();

  for (const item of mediaItems) {
    const existing = canonical.get(item.id);
    if (!existing) {
      canonical.set(item.id, {
        ...item,
        premiereMediaUids: [item.premiereMediaUid],
        duplicatePremiereMediaCount: 1,
      });
      continue;
    }

    existing.premiereMediaUids = [...new Set([...existing.premiereMediaUids, item.premiereMediaUid])];
    existing.duplicatePremiereMediaCount = existing.premiereMediaUids.length;
    existing.relativePaths = [...new Set([...existing.relativePaths, ...item.relativePaths])];
    existing.historyPaths = [...new Set([...existing.historyPaths, ...item.historyPaths])];
    existing.isProxy = existing.isProxy || item.isProxy;
    existing.durationSeconds = Math.max(existing.durationSeconds ?? 0, item.durationSeconds ?? 0) || null;
    existing.durationTicks = Math.max(existing.durationTicks ?? 0, item.durationTicks ?? 0) || null;
    existing.audioStreams = [...existing.audioStreams, ...item.audioStreams];
    existing.videoStreams = [...existing.videoStreams, ...item.videoStreams];
  }

  return [...canonical.values()].sort((left, right) => left.originalName.localeCompare(right.originalName));
}

function parseMediaSources(xml) {
  const sourcesByObjectId = new Map();
  const specs = [
    ["AudioMediaSource", "audio"],
    ["VideoMediaSource", "video"],
    ["DataMediaSource", "data"],
    ["AudioSequenceSource", "audio-sequence"],
    ["VideoSequenceSource", "video-sequence"],
  ];

  for (const [tagName, kind] of specs) {
    for (const block of objectBlocks(xml, tagName)) {
      const objectId = getAttr(block, "ObjectID");
      if (!objectId) continue;
      sourcesByObjectId.set(objectId, {
        objectId,
        kind,
        mediaUid: getURef(block, "Media"),
        sequenceUid: getURef(block, "Sequence"),
        originalDurationTicks: asNumber(getTagValue(block, "OriginalDuration"), 0),
        originalDurationSeconds: ticksToSeconds(getTagValue(block, "OriginalDuration")),
      });
    }
  }

  return sourcesByObjectId;
}

function parseClips(xml, mediaSourcesByObjectId, mediaByUid) {
  const clipsByObjectId = new Map();
  const specs = [
    ["VideoClip", "video"],
    ["AudioClip", "audio"],
  ];

  for (const [tagName, kind] of specs) {
    for (const block of objectBlocks(xml, tagName)) {
      const objectId = getAttr(block, "ObjectID");
      if (!objectId) continue;

      const sourceObjectId = getRef(block, "Source");
      const source = sourceObjectId ? mediaSourcesByObjectId.get(sourceObjectId) : undefined;
      const media = source?.mediaUid ? mediaByUid.get(source.mediaUid) : undefined;
      const inPointTicks = asNumber(getTagValue(block, "InPoint"), 0);
      const outPointTicks = asNumber(getTagValue(block, "OutPoint"), source?.originalDurationTicks ?? 0);

      clipsByObjectId.set(objectId, {
        objectId,
        kind,
        clipId: getTagValue(block, "ClipID"),
        sourceObjectId,
        premiereMediaUid: source?.mediaUid,
        mediaId: media?.id,
        mediaTitle: media?.title,
        mediaFilePath: media?.filePath,
        inPointTicks,
        outPointTicks,
        sourceStart: ticksToSeconds(inPointTicks),
        sourceEnd: ticksToSeconds(outPointTicks),
        sourceDuration: secondsDuration(inPointTicks, outPointTicks),
      });
    }
  }

  return clipsByObjectId;
}

function parseMasterClips(xml) {
  const masterClipsByUid = new Map();

  for (const block of objectBlocks(xml, "MasterClip")) {
    const objectUid = getAttr(block, "ObjectUID");
    if (!objectUid) continue;
    masterClipsByUid.set(objectUid, {
      objectUid,
      name: getTagValue(block, "Name") || objectUid,
      clipObjectRefs: getIndexedRefs(block, "Clip").map((entry) => entry.ref),
      mediaInPointTicks: asNumber(getTagValue(block, "MediaInPoint"), 0),
      mediaOutPointTicks: asNumber(getTagValue(block, "MediaOutPoint"), 0),
    });
  }

  return masterClipsByUid;
}

function parseSubClips(xml, clipsByObjectId, masterClipsByUid) {
  const subClipsByObjectId = new Map();

  for (const block of objectBlocks(xml, "SubClip")) {
    const objectId = getAttr(block, "ObjectID");
    if (!objectId) continue;
    const clipObjectId = getRef(block, "Clip");
    const masterClipUid = getURef(block, "MasterClip");
    const clip = clipObjectId ? clipsByObjectId.get(clipObjectId) : undefined;
    const masterClip = masterClipUid ? masterClipsByUid.get(masterClipUid) : undefined;

    subClipsByObjectId.set(objectId, {
      objectId,
      clipObjectId,
      masterClipUid,
      name: getTagValue(block, "Name") || masterClip?.name || clip?.mediaTitle || objectId,
      origChannelGroup: getTagValue(block, "OrigChGrp"),
      clip,
      masterClip,
    });
  }

  return subClipsByObjectId;
}

function parseTrackItems(xml, subClipsByObjectId) {
  const trackItemsByObjectId = new Map();
  const specs = [
    ["VideoClipTrackItem", "video"],
    ["AudioClipTrackItem", "audio"],
  ];

  for (const [tagName, kind] of specs) {
    for (const block of objectBlocks(xml, tagName)) {
      const objectId = getAttr(block, "ObjectID");
      if (!objectId) continue;
      const subClipObjectId = getRef(block, "SubClip");
      const subClip = subClipObjectId ? subClipsByObjectId.get(subClipObjectId) : undefined;
      const startTicks = asNumber(getTagValue(block, "Start"), 0);
      const endTicks = asNumber(getTagValue(block, "End"), startTicks);
      const clip = subClip?.clip;

      trackItemsByObjectId.set(objectId, {
        objectId,
        kind,
        name: subClip?.name || clip?.mediaTitle || `${kind} clip ${objectId}`,
        subClipObjectId,
        clipObjectId: subClip?.clipObjectId,
        masterClipUid: subClip?.masterClipUid,
        premiereMediaUid: clip?.premiereMediaUid,
        mediaId: clip?.mediaId,
        mediaFilePath: clip?.mediaFilePath,
        startTicks,
        endTicks,
        startIn: ticksToSeconds(startTicks),
        duration: secondsDuration(startTicks, endTicks),
        sourceStart: clip?.sourceStart ?? 0,
        sourceEnd: clip?.sourceEnd ?? secondsDuration(startTicks, endTicks),
        sourceDuration: clip?.sourceDuration ?? secondsDuration(startTicks, endTicks),
        raw: {
          startTicks,
          endTicks,
          clipInPointTicks: clip?.inPointTicks ?? null,
          clipOutPointTicks: clip?.outPointTicks ?? null,
        },
      });
    }
  }

  return trackItemsByObjectId;
}

function parseTracks(xml) {
  const tracksByUid = new Map();
  const specs = [
    ["VideoClipTrack", "video"],
    ["AudioClipTrack", "audio"],
  ];

  for (const [tagName, kind] of specs) {
    for (const block of objectBlocks(xml, tagName)) {
      const objectUid = getAttr(block, "ObjectUID");
      if (!objectUid) continue;
      const trackIndex = asNumber(getTagValue(block, "Index"), 0);
      tracksByUid.set(objectUid, {
        objectUid,
        kind,
        index: trackIndex,
        trackId: `${kind === "video" ? "V" : "A"}${trackIndex + 1}`,
        trackItemRefs: getIndexedRefs(block, "TrackItem").map((entry) => entry.ref),
      });
    }
  }

  return tracksByUid;
}

function parseTrackGroups(xml) {
  const trackGroupsByObjectId = new Map();
  const specs = [
    ["VideoTrackGroup", "video"],
    ["AudioTrackGroup", "audio"],
    ["DataTrackGroup", "data"],
  ];

  for (const [tagName, kind] of specs) {
    for (const block of objectBlocks(xml, tagName)) {
      const objectId = getAttr(block, "ObjectID");
      if (!objectId) continue;
      trackGroupsByObjectId.set(objectId, {
        objectId,
        kind,
        frameRateRaw: getTagValue(block, "FrameRate"),
        frameRect: getTagValue(block, "FrameRect"),
        trackRefs: getIndexedURefs(block, "Track"),
      });
    }
  }

  return trackGroupsByObjectId;
}

function parseSequences(xml, trackGroupsByObjectId, tracksByUid, trackItemsByObjectId) {
  const sequences = [];

  for (const block of objectBlocks(xml, "Sequence")) {
    const objectUid = getAttr(block, "ObjectUID");
    if (!objectUid) continue;

    const groupRefs = getRefs(block, "Second");
    const timelineClips = [];
    const missing = {
      trackGroups: [],
      tracks: [],
      trackItems: [],
      media: [],
    };

    for (const groupRef of groupRefs) {
      const group = trackGroupsByObjectId.get(groupRef);
      if (!group) {
        missing.trackGroups.push(groupRef);
        continue;
      }

      for (const trackRef of group.trackRefs) {
        const track = tracksByUid.get(trackRef.uref);
        if (!track) {
          missing.tracks.push(trackRef.uref);
          continue;
        }

        for (const trackItemRef of track.trackItemRefs) {
          const item = trackItemsByObjectId.get(trackItemRef);
          if (!item) {
            missing.trackItems.push(trackItemRef);
            continue;
          }
          if (!item.mediaId) missing.media.push(trackItemRef);

          timelineClips.push({
            id: `premiere-clip-${stableId(objectUid, track.trackId, trackItemRef, item.mediaId, item.startTicks, item.endTicks)}`,
            assetId: item.mediaId || `missing-premiere-media-${stableId(item.mediaFilePath || item.name || trackItemRef)}`,
            sourceId: item.premiereMediaUid,
            kind: item.kind,
            trackId: track.trackId,
            startIn: item.startIn,
            duration: item.duration,
            sourceStart: item.sourceStart,
            sourceEnd: item.sourceEnd,
            name: item.name,
            color: item.kind === "video" ? "#2563eb" : "#16a34a",
            deactivated: false,
            generatedFrom: "premiere-prproj-import-v1",
            premiere: {
              sequenceUid: objectUid,
              trackItemObjectId: item.objectId,
              trackUid: track.objectUid,
              trackGroupObjectId: group.objectId,
              masterClipUid: item.masterClipUid,
              subClipObjectId: item.subClipObjectId,
              mediaUid: item.premiereMediaUid,
              startTicks: item.startTicks,
              endTicks: item.endTicks,
              clipInPointTicks: item.raw.clipInPointTicks,
              clipOutPointTicks: item.raw.clipOutPointTicks,
            },
          });
        }
      }
    }

    const duration = timelineClips.reduce((max, clip) => Math.max(max, clip.startIn + clip.duration), 0);
    sequences.push({
      id: `premiere-sequence-${stableId(objectUid)}`,
      premiereSequenceUid: objectUid,
      name: getTagValue(block, "Name") || objectUid,
      workInSeconds: ticksToSeconds(getTagValue(block, "MZ.WorkInPoint")),
      workOutSeconds: ticksToSeconds(getTagValue(block, "MZ.WorkOutPoint")),
      exportOutSeconds: parseExportOutSeconds(block),
      preview: {
        width: asNumber(getTagValue(block, "MZ.Sequence.PreviewFrameSizeWidth"), 0) || null,
        height: asNumber(getTagValue(block, "MZ.Sequence.PreviewFrameSizeHeight"), 0) || null,
      },
      trackGroupRefs: groupRefs,
      timelineDurationSeconds: Number(duration.toFixed(6)),
      timelineClips: timelineClips.sort((left, right) => left.startIn - right.startIn || left.trackId.localeCompare(right.trackId)),
      sourceUsage: [],
      candidateDeactivatedSourceRanges: [],
      timelineGaps: [],
      warnings: [
        ...missing.trackGroups.map((id) => `Missing track group ${id}`),
        ...missing.tracks.map((id) => `Missing track ${id}`),
        ...missing.trackItems.map((id) => `Missing track item ${id}`),
        ...missing.media.map((id) => `Track item ${id} did not resolve to a media asset`),
      ],
    });
  }

  return sequences;
}

function parseExportOutSeconds(sequenceBlock) {
  const saveAsFile = getTagValue(sequenceBlock, "ExportSettings.Info.SaveAsFile");
  if (!saveAsFile) return null;
  try {
    const parsed = JSON.parse(saveAsFile);
    return typeof parsed.OutPoint === "number" ? ticksToSeconds(parsed.OutPoint) : null;
  } catch {
    return null;
  }
}

function buildSourceUsage(sequence, mediaById) {
  const usageByAssetId = new Map();
  const timelineGapsByTrackId = new Map();

  for (const clip of sequence.timelineClips) {
    const key = clip.assetId;
    if (!usageByAssetId.has(key)) usageByAssetId.set(key, []);
    usageByAssetId.get(key).push({
      clipId: clip.id,
      name: clip.name,
      kind: clip.kind,
      trackId: clip.trackId,
      timelineStart: clip.startIn,
      timelineEnd: Number((clip.startIn + clip.duration).toFixed(6)),
      sourceStart: clip.sourceStart,
      sourceEnd: clip.sourceEnd ?? Number((clip.sourceStart + clip.duration).toFixed(6)),
    });

    if (!timelineGapsByTrackId.has(clip.trackId)) timelineGapsByTrackId.set(clip.trackId, []);
    timelineGapsByTrackId.get(clip.trackId).push({
      start: clip.startIn,
      end: Number((clip.startIn + clip.duration).toFixed(6)),
    });
  }

  const sourceUsage = [];
  const candidateDeactivatedSourceRanges = [];

  for (const [assetId, ranges] of usageByAssetId.entries()) {
    ranges.sort((left, right) => left.sourceStart - right.sourceStart || left.sourceEnd - right.sourceEnd);
    const merged = mergeRanges(ranges.map((range) => ({ start: range.sourceStart, end: range.sourceEnd })), 0.05);
    const media = mediaById.get(assetId);
    const internalGaps = [];
    for (let index = 1; index < merged.length; index += 1) {
      const previous = merged[index - 1];
      const next = merged[index];
      if (next.start - previous.end > 0.05) {
        internalGaps.push({
          id: `premiere-deactivated-source-gap-${stableId(sequence.id, assetId, previous.end, next.start)}`,
          assetId,
          kind: media?.kind || ranges[0]?.kind || "unknown",
          sourceStart: Number(previous.end.toFixed(6)),
          sourceEnd: Number(next.start.toFixed(6)),
          duration: Number((next.start - previous.end).toFixed(6)),
          deactivated: true,
          confidence: "medium",
          reason: "Premiere uses this source before and after this range, but this range is absent from the edited sequence.",
        });
      }
    }

    const edgeGaps = [];
    if (media?.durationSeconds && merged.length) {
      const first = merged[0];
      const last = merged[merged.length - 1];
      if (first.start > 0.05) {
        edgeGaps.push({
          id: `premiere-unused-source-head-${stableId(sequence.id, assetId, first.start)}`,
          assetId,
          kind: media.kind,
          sourceStart: 0,
          sourceEnd: Number(first.start.toFixed(6)),
          duration: Number(first.start.toFixed(6)),
          deactivated: true,
          confidence: "low",
          reason: "Source head is outside the edited sequence. It may be intentional setup/slate/dead air.",
        });
      }
      if (media.durationSeconds - last.end > 0.05) {
        edgeGaps.push({
          id: `premiere-unused-source-tail-${stableId(sequence.id, assetId, last.end, media.durationSeconds)}`,
          assetId,
          kind: media.kind,
          sourceStart: Number(last.end.toFixed(6)),
          sourceEnd: Number(media.durationSeconds.toFixed(6)),
          duration: Number((media.durationSeconds - last.end).toFixed(6)),
          deactivated: true,
          confidence: "low",
          reason: "Source tail is outside the edited sequence. It may be intentional leftover recording.",
        });
      }
    }

    sourceUsage.push({
      assetId,
      mediaTitle: media?.title || ranges[0]?.name || assetId,
      mediaFilePath: media?.filePath || null,
      kind: media?.kind || ranges[0]?.kind || "unknown",
      usedRanges: ranges,
      mergedSourceRanges: merged,
      candidateInternalGaps: internalGaps,
      candidateEdgeGaps: edgeGaps,
    });
    candidateDeactivatedSourceRanges.push(...internalGaps, ...edgeGaps);
  }

  sequence.sourceUsage = sourceUsage.sort((left, right) => left.mediaTitle.localeCompare(right.mediaTitle));
  sequence.candidateDeactivatedSourceRanges = candidateDeactivatedSourceRanges.sort(
    (left, right) => left.assetId.localeCompare(right.assetId) || left.sourceStart - right.sourceStart,
  );
  sequence.timelineGaps = [...timelineGapsByTrackId.entries()].flatMap(([trackId, ranges]) => {
    const merged = mergeRanges(ranges.sort((left, right) => left.start - right.start), 0.05);
    const gaps = [];
    for (let index = 1; index < merged.length; index += 1) {
      const previous = merged[index - 1];
      const next = merged[index];
      if (next.start - previous.end > 0.05) {
        gaps.push({
          id: `premiere-timeline-gap-${stableId(sequence.id, trackId, previous.end, next.start)}`,
          trackId,
          startIn: Number(previous.end.toFixed(6)),
          endIn: Number(next.start.toFixed(6)),
          duration: Number((next.start - previous.end).toFixed(6)),
          deactivated: true,
          reason: "Empty time between active Premiere clips on this track.",
        });
      }
    }
    return gaps;
  });
}

function mergeRanges(ranges, tolerance = 0) {
  const sorted = ranges
    .filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end) && range.end > range.start)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const merged = [];

  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (!last || range.start > last.end + tolerance) {
      merged.push({ start: Number(range.start.toFixed(6)), end: Number(range.end.toFixed(6)) });
    } else {
      last.end = Number(Math.max(last.end, range.end).toFixed(6));
    }
  }

  return merged;
}

function buildPacket(args, xml) {
  const audioStreams = parseStreams(xml, "AudioStream", "audio");
  const videoStreams = parseStreams(xml, "VideoStream", "video");
  const mediaByUid = parseMedia(xml, audioStreams, videoStreams);
  const mediaSourcesByObjectId = parseMediaSources(xml);
  const clipsByObjectId = parseClips(xml, mediaSourcesByObjectId, mediaByUid);
  const masterClipsByUid = parseMasterClips(xml);
  const subClipsByObjectId = parseSubClips(xml, clipsByObjectId, masterClipsByUid);
  const trackItemsByObjectId = parseTrackItems(xml, subClipsByObjectId);
  const tracksByUid = parseTracks(xml);
  const trackGroupsByObjectId = parseTrackGroups(xml);
  const sequences = parseSequences(xml, trackGroupsByObjectId, tracksByUid, trackItemsByObjectId);
  const media = consolidateMedia([...mediaByUid.values()]);
  const mediaById = new Map(media.map((item) => [item.id, item]));

  for (const sequence of sequences) buildSourceUsage(sequence, mediaById);

  const primarySequence = choosePrimarySequence(sequences);
  const primarySequenceAssetIds = new Set((primarySequence?.timelineClips ?? [])
    .map((clip) => clip.assetId)
    .filter((assetId) => mediaById.has(assetId)));
  const primarySequenceMedia = primarySequence
    ? media.filter((item) => primarySequenceAssetIds.has(item.id))
    : media;
  const skippedProjectMedia = primarySequence
    ? media.filter((item) => !primarySequenceAssetIds.has(item.id))
    : [];
  const generatedAt = new Date().toISOString();
  const prprojPath = path.resolve(args.input);
  const episodeSlug = args.episodeSlug;
  const projectSlug = args.projectSlug;
  const importedMedia = buildImportedMediaPlaceholders(primarySequenceMedia, projectSlug, episodeSlug, generatedAt);
  const suggestedSpineAudioCandidates = chooseSuggestedSpineAudioCandidates(importedMedia, primarySequence);

  return {
    payloadVersion: 1,
    source: "premiere-prproj-import-v1",
    projectSlug,
    episodeSlug,
    generatedAt,
    generatedFrom: prprojPath,
    premiere: {
      prprojPath,
      ticksPerSecond: PREMIERE_TICKS_PER_SECOND,
      parser: "scripts/quipsly/import-premiere-project.mjs",
      mediaScope: "primary-sequence",
      projectMediaCount: media.length,
      primarySequenceMediaCount: primarySequenceMedia.length,
      skippedProjectMediaCount: skippedProjectMedia.length,
    },
    summary: {
      importMediaCount: primarySequenceMedia.length,
      mediaCount: primarySequenceMedia.length,
      primarySequenceMediaCount: primarySequenceMedia.length,
      projectMediaCount: media.length,
      skippedProjectMediaCount: skippedProjectMedia.length,
      sequenceCount: sequences.length,
      primarySequenceId: primarySequence?.id ?? null,
      primarySequenceName: primarySequence?.name ?? null,
      primaryTimelineClipCount: primarySequence?.timelineClips.length ?? 0,
      missingMediaCount: primarySequenceMedia.filter((item) => !item.health.exists).length,
      iCloudHistoryCount: primarySequenceMedia.filter((item) => item.health.iCloudHistory).length,
      proxyMediaCount: primarySequenceMedia.filter((item) => item.isProxy).length,
      projectMissingMediaCount: media.filter((item) => !item.health.exists).length,
      projectICloudHistoryCount: media.filter((item) => item.health.iCloudHistory).length,
    },
    mediaScope: {
      importScope: "primary-sequence",
      mediaFieldMeaning: "Only assets referenced by the chosen primary sequence. This is the list the Mac app should stage/import.",
      projectMediaInventoryMeaning: "All media references found in the Premiere project. Reference-only diagnostics; do not stage by default.",
      skippedProjectMediaMeaning: "Project media not referenced by the chosen primary sequence. Safe to ignore for this editing pass unless a human asks to recover it.",
    },
    media: primarySequenceMedia,
    projectMediaInventory: media,
    skippedProjectMedia: skippedProjectMedia.map((item) => ({
      id: item.id,
      originalName: item.originalName,
      filePath: item.filePath,
      kind: item.kind,
      exists: item.health.exists,
      reason: "Skipped because this media is not used by the chosen primary sequence.",
    })),
    sequences,
    quipslyEpisodeProductionPatch: primarySequence
      ? {
          episodeProductionPayloadVersion: 1,
          projectSlug,
          episodeSlug,
          source: "premiere-prproj-import-v1",
          premiereImport: {
            packetPath: null,
            prprojPath,
            importedAt: generatedAt,
            primarySequenceId: primarySequence.id,
            primarySequenceName: primarySequence.name,
            ticksPerSecond: PREMIERE_TICKS_PER_SECOND,
            mediaScope: "primary-sequence",
            importMediaCount: primarySequenceMedia.length,
            projectMediaCount: media.length,
            skippedProjectMediaCount: skippedProjectMedia.length,
          },
          importedMedia,
          spineAudioAssetId: null,
          spineAudioLabel: null,
          spineAudioSource: null,
          premiereSuggestedSpineAudioCandidates: suggestedSpineAudioCandidates,
          timelineClips: primarySequence.timelineClips.map((clip) => ({
            id: clip.id,
            assetId: clip.assetId,
            sourceId: clip.sourceId,
            kind: clip.kind,
            trackId: clip.trackId,
            startIn: clip.startIn,
            duration: clip.duration,
            sourceStart: clip.sourceStart,
            sourceEnd: clip.sourceEnd,
            name: clip.name,
            color: clip.color,
            deactivated: false,
            generatedFrom: "premiere-prproj-import-v1",
          })),
          premiereDeactivatedSourceCandidates: primarySequence.candidateDeactivatedSourceRanges,
          premiereTimelineGaps: primarySequence.timelineGaps,
        }
      : null,
    warnings: buildWarnings(primarySequenceMedia, sequences, skippedProjectMedia.length),
  };
}

function buildImportedMediaPlaceholders(media, projectSlug, episodeSlug, generatedAt) {
  return media.map((item) => {
    const importRole = importRoleForMedia(item);
    const ready = item.health.exists;
    return {
      id: item.id,
      sourceId: item.premiereMediaUids?.[0] ?? item.premiereMediaUid,
      projectSlug,
      episodeSlug,
      originalName: item.originalName,
      contentType: contentTypeFromPath(item.filePath, item.kind),
      size: item.health.size ?? 0,
      kind: item.kind,
      bucketName: "",
      objectName: "",
      gcsUri: "",
      playbackUrl: "",
      importedAt: generatedAt,
      source: "premiere-prproj-import",
      importRole,
      metadata: {
        localImport: {
          source: "premiere-prproj-import-v1",
          filePath: item.filePath,
          actualMediaFilePath: item.actualMediaFilePath,
          relativePaths: item.relativePaths,
          historyPaths: item.historyPaths,
          exists: item.health.exists,
          iCloudHistory: item.health.iCloudHistory,
          needsLocalDownload: item.health.needsLocalDownload,
          downloadHints: item.health.downloadHints,
          durationSeconds: item.durationSeconds,
          isProxy: item.isProxy,
          premiereMediaUids: item.premiereMediaUids,
          duplicatePremiereMediaCount: item.duplicatePremiereMediaCount,
        },
      },
      sync: {
        status: ready ? "ready-to-sync" : "held",
        suggestedRole: importRole,
        suggestedTrackId: item.kind === "audio" ? "A1" : item.isProxy ? "V2" : "V1",
        suggestionReason: ready
          ? "Imported from Premiere project and exists at its local path."
          : "Imported from Premiere project, but the local file path is missing. Locate/download before syncing.",
        suggestionSource: "premiere-prproj-import-v1",
        note: ready ? "Ready for local probe/proxy/upload." : "Held until local media is found.",
      },
      proxy: {
        status: item.kind === "video" ? "queued" : "not-required",
        note: item.kind === "video"
          ? "Proxy should be generated by the Mac/local engine before browser editing."
          : "Audio does not require a video proxy.",
      },
    };
  });
}

function chooseSuggestedSpineAudioCandidates(importedMedia, primarySequence) {
  const usedTimelineSecondsByAsset = new Map();
  for (const clip of primarySequence?.timelineClips ?? []) {
    if (clip.kind !== "audio") continue;
    usedTimelineSecondsByAsset.set(
      clip.assetId,
      Number(((usedTimelineSecondsByAsset.get(clip.assetId) ?? 0) + clip.duration).toFixed(6)),
    );
  }

  return importedMedia
    .filter((item) => item.kind === "audio")
    .map((item) => {
      const sourceDuration = Number(item.metadata?.localImport?.durationSeconds ?? 0);
      const usedTimelineSeconds = usedTimelineSecondsByAsset.get(item.id) ?? 0;
      const exists = item.sync?.status !== "held";
      return {
        assetId: item.id,
        originalName: item.originalName,
        exists,
        usedTimelineSeconds,
        sourceDurationSeconds: sourceDuration,
        recommendation: exists
          ? usedTimelineSeconds > 0
            ? "Likely spine audio: Premiere uses this audio in the active sequence. Confirm by listening before setting it as the episode spine."
            : "Audio exists locally, but Premiere did not use it in the chosen primary sequence. Treat as a backup or alternate until confirmed."
          : usedTimelineSeconds > 0
            ? "Likely spine audio, but missing locally. Locate, download, or relink before using."
            : "Candidate spine audio is missing locally and not used in the chosen primary sequence. Hold until reviewed.",
      };
    })
    .sort((left, right) => {
      const usedDelta = right.usedTimelineSeconds - left.usedTimelineSeconds;
      if (usedDelta) return usedDelta;
      if (Number(right.exists) !== Number(left.exists)) return Number(right.exists) - Number(left.exists);
      return right.sourceDurationSeconds - left.sourceDurationSeconds;
    })
    .slice(0, 8);
}

function choosePrimarySequence(sequences) {
  return [...sequences]
    .filter((sequence) => sequence.timelineClips.length)
    .sort((left, right) => {
      const clipDelta = right.timelineClips.length - left.timelineClips.length;
      if (clipDelta) return clipDelta;
      return right.timelineDurationSeconds - left.timelineDurationSeconds;
    })[0] ?? null;
}

function buildWarnings(media, sequences, skippedProjectMediaCount = 0) {
  const warnings = [];
  const missingMedia = media.filter((item) => !item.health.exists);
  const iCloudHistory = media.filter((item) => item.health.iCloudHistory);
  if (missingMedia.length) {
    warnings.push(`${missingMedia.length} primary-sequence media references do not exist at their current local path. They may need iCloud/external drive recovery.`);
  }
  if (iCloudHistory.length) {
    warnings.push(`${iCloudHistory.length} primary-sequence media references include iCloud history paths. If files are placeholders, download before proxy/upload.`);
  }
  if (skippedProjectMediaCount) {
    warnings.push(`${skippedProjectMediaCount} project media references are not used by the chosen primary sequence and were skipped from the import queue.`);
  }
  const sequencesWithWarnings = sequences.filter((sequence) => sequence.warnings.length);
  if (sequencesWithWarnings.length) {
    warnings.push(`${sequencesWithWarnings.length} sequences have unresolved Premiere object references. Keep packet as review-only until corrected.`);
  }
  warnings.push("Candidate deactivated ranges are source-level recovery hints, not destructive transcript edits.");
  return warnings;
}

function writePacket(args, packet) {
  const outputPath = args.out
    ? path.resolve(args.out)
    : path.resolve(args.outDir, `${args.episodeSlug}.json`);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const withPath = {
    ...packet,
    quipslyEpisodeProductionPatch: packet.quipslyEpisodeProductionPatch
      ? {
          ...packet.quipslyEpisodeProductionPatch,
          premiereImport: {
            ...packet.quipslyEpisodeProductionPatch.premiereImport,
            packetPath: outputPath,
          },
        }
      : null,
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(withPath, null, args.pretty ? 2 : 0)}\n`);
  return outputPath;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const xml = readPremiereXml(args.input);
  const packet = buildPacket(args, xml);
  const outputPath = writePacket(args, packet);
  const primary = packet.summary.primarySequenceName || "none";

  console.log(`Premiere import packet written: ${outputPath}`);
  console.log(`Episode: ${packet.projectSlug}/${packet.episodeSlug}`);
  console.log(
    `Primary media: ${packet.summary.mediaCount} needed (${packet.summary.missingMediaCount} missing, ${packet.summary.iCloudHistoryCount} with iCloud history); ` +
      `skipped project media: ${packet.summary.skippedProjectMediaCount}`,
  );
  console.log(`Sequences: ${packet.summary.sequenceCount}; primary: ${primary}; clips: ${packet.summary.primaryTimelineClipCount}`);
  if (packet.warnings.length) {
    console.log("Warnings:");
    for (const warning of packet.warnings) console.log(`- ${warning}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
