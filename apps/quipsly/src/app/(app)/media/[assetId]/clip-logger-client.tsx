'use client';

import React, { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send, Scissors, Save, History, Target, Trash2, Play } from 'lucide-react';
import Link from 'next/link';
import { createMediaClip, deleteMediaClip, updateMediaClip } from '../actions';
import { generateStudioCutPackage } from './export-actions';

type MediaTag = {
  id: string;
  slug: string;
  label: string;
  color?: string | null;
};

type ClipRecord = {
  id: string;
  title: string;
  description: string | null;
  inTimecode: number;
  outTimecode: number;
  mediaTags: MediaTag[];
};

type ClipLoggerAsset = {
  id: string;
  filename: string;
  url: string;
  resolution?: string | null;
  fps?: number | null;
  clips: ClipRecord[];
  mediaTags?: MediaTag[];
};

function formatTimecode(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = Math.floor(safeSeconds % 60);
  const ms = Math.floor((safeSeconds % 1) * 100);

  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  }

  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

function parseSecondsFromInput(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const seconds = Number(trimmed);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return seconds;
}

function normalizeTagText(value: string) {
  return value
    .split(',')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];

  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }

  return out;
}

export function ClipLoggerClient({
  asset,
  mediaTagCatalog,
  backHref = '/media',
}: {
  asset: ClipLoggerAsset;
  mediaTagCatalog: MediaTag[];
  backHref?: string;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [isPending, startTransition] = useTransition();

  const catalogTags = useMemo(() => {
    const fromAsset = Array.isArray(asset.mediaTags) ? asset.mediaTags : [];
    return uniqueById([...fromAsset, ...mediaTagCatalog]).filter((tag) => tag?.id && tag.label);
  }, [asset.mediaTags, mediaTagCatalog]);

  const [inPoint, setInPoint] = useState<number | null>(null);
  const [outPoint, setOutPoint] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagText, setTagText] = useState('');

  const [editingClipId, setEditingClipId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingDescription, setEditingDescription] = useState('');
  const [editingInPoint, setEditingInPoint] = useState('');
  const [editingOutPoint, setEditingOutPoint] = useState('');
  const [editingTagIds, setEditingTagIds] = useState<string[]>([]);
  const [editingTagText, setEditingTagText] = useState('');

  const [openEditPanel, setOpenEditPanel] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);

  const isReady = inPoint !== null && outPoint !== null && title.trim().length > 0 && !isPending;

  const currentTagIds = useMemo(() => {
    const selected = dedupeStrings(selectedTagIds);
    return selected;
  }, [selectedTagIds]);

  const customTagLabels = useMemo(() => normalizeTagText(tagText), [tagText]);

  const currentClipCount = asset.clips.length;

  const hasTagCatalog = catalogTags.length > 0;

  const handleMarkIn = () => {
    if (videoRef.current) {
      setInPoint(videoRef.current.currentTime);
    }
  };

  const handleMarkOut = () => {
    if (videoRef.current) {
      setOutPoint(videoRef.current.currentTime);
    }
  };

  const clearClipDraft = () => {
    setInPoint(null);
    setOutPoint(null);
    setTitle('');
    setDescription('');
    setSelectedTagIds([]);
    setTagText('');
    setOpenEditPanel(false);
  };

  const handleSaveClip = () => {
    if (!isReady) return;

    startTransition(async () => {
      await createMediaClip(
        asset.id,
        title,
        inPoint ?? 0,
        outPoint ?? 0,
        description,
        {
          mediaTagIds: currentTagIds,
          mediaTagLabels: customTagLabels,
        }
      );
      clearClipDraft();
      router.refresh();
    });
  };

  const seekTo = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const handleExportToStudioCut = async () => {
    try {
      const payload = await generateStudioCutPackage(asset.id);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `studio_cut_import_${asset.filename}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert('Failed to generate export package.');
    }
  };

  const handleDeleteClip = (clipId: string) => {
    if (!confirm('Delete this clip?')) return;
    startTransition(async () => {
      await deleteMediaClip(clipId);
      router.refresh();
    });
  };

  const toggleTag = (tagId: string, ids: string[], updateIds: (next: string[]) => void) => {
    const next = new Set(ids);
    if (next.has(tagId)) {
      next.delete(tagId);
    } else {
      next.add(tagId);
    }
    updateIds(Array.from(next));
  };

  const startEditClip = (clip: ClipRecord) => {
    setEditingClipId(clip.id);
    setEditingTitle(clip.title);
    setEditingDescription(clip.description ?? '');
    setEditingInPoint(String(clip.inTimecode));
    setEditingOutPoint(String(clip.outTimecode));
    setEditingTagIds(clip.mediaTags.map((tag) => tag.id));
    setEditingTagText('');
  };

  const cancelEdit = () => {
    setEditingClipId(null);
    setEditingTitle('');
    setEditingDescription('');
    setEditingInPoint('');
    setEditingOutPoint('');
    setEditingTagIds([]);
    setEditingTagText('');
  };

  const saveEditClip = (clipId: string) => {
    const nextIn = parseSecondsFromInput(editingInPoint);
    const nextOut = parseSecondsFromInput(editingOutPoint);

    if (!nextIn && nextIn !== 0) return;
    if (!nextOut && nextOut !== 0) return;
    if (!editingTitle.trim()) return;

    startTransition(async () => {
      await updateMediaClip(clipId, {
        title: editingTitle,
        description: editingDescription,
        inTimecode: nextIn,
        outTimecode: nextOut,
        mediaTagIds: dedupeStrings(editingTagIds),
        mediaTagLabels: normalizeTagText(editingTagText),
      });

      cancelEdit();
      router.refresh();
    });
  };

  const jumpBy = (seconds: number) => {
    if (!videoRef.current) return;
    const nextTime = Math.max(0, videoRef.current.currentTime + seconds);
    const maxTime = videoRef.current.duration || Number.POSITIVE_INFINITY;
    videoRef.current.currentTime = Math.min(nextTime, maxTime);
  };

  const setPlaybackRateValue = (rate: number) => {
    if (!videoRef.current) return;
    const clampedRate = Math.max(0.25, Math.min(3, rate));
    videoRef.current.playbackRate = clampedRate;
    setPlaybackRate(clampedRate);
  };

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (event.key === ' ') {
        event.preventDefault();
        togglePlayPause();
        return;
      }

      switch (event.key.toLowerCase()) {
        case 'i':
          handleMarkIn();
          break;
        case 'o':
          handleMarkOut();
          break;
        case 'j':
          jumpBy(-0.5);
          break;
        case 'k':
          jumpBy(0.5);
          break;
        case 'h':
          jumpBy(-1);
          break;
        case 'l':
          jumpBy(1);
          break;
        default:
          return;
      }

      event.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-black">
      {/* Video Player Section */}
      <div className="flex-1 flex flex-col p-6">
        <header className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Link
              href={backHref}
              className="p-2 bg-white dark:bg-zinc-900 rounded-full shadow-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-white truncate" title={asset.filename}>
                {asset.filename}
              </h1>
              <p className="text-zinc-500 text-sm">
                {asset.resolution || 'Unknown'} • {asset.fps || '--'}fps
              </p>
            </div>
          </div>

          <button
            onClick={handleExportToStudioCut}
            className="flex items-center gap-2 px-4 py-2 bg-[#8c6b4a] hover:bg-[#7a5c40] text-white rounded-lg font-bold shadow-sm transition-colors"
          >
            <Send size={18} />
            Send to Studio Cut
          </button>
        </header>

        <div className="flex-1 bg-black rounded-2xl overflow-hidden shadow-lg relative flex flex-col justify-center">
          <video
            ref={videoRef}
            src={asset.url}
            controls
            className="w-full max-h-full"
            onPlay={(event) => {
              setPlaybackRate(event.currentTarget.playbackRate);
            }}
          />
        </div>

        <div className="mt-6 flex items-center justify-center gap-6">
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => jumpBy(-1)}
              className="px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-indigo-500 hover:text-indigo-500 transition-colors shadow-sm text-xs font-bold"
            >
              -1s
            </button>
            <button
              onClick={() => jumpBy(-5)}
              className="px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-indigo-500 hover:text-indigo-500 transition-colors shadow-sm text-xs font-bold"
            >
              -5s
            </button>
          </div>

          <div className="flex flex-col items-center">
            <button
              onClick={handleMarkIn}
              className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-indigo-500 hover:text-indigo-500 transition-colors shadow-sm"
            >
              <Target size={24} />
            </button>
            <span className="text-xs font-bold uppercase mt-2 text-zinc-500">Mark In (I)</span>
            <span className="font-mono mt-1 font-semibold">{inPoint !== null ? formatTimecode(inPoint) : '--:--.--'}</span>
          </div>

          <div className="w-16 h-1 bg-zinc-300 dark:bg-zinc-800 rounded-full" />

          <div className="flex flex-col items-center">
            <button
              onClick={handleMarkOut}
              className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-indigo-500 hover:text-indigo-500 transition-colors shadow-sm"
            >
              <Target size={24} />
            </button>
            <span className="text-xs font-bold uppercase mt-2 text-zinc-500">Mark Out (O)</span>
            <span className="font-mono mt-1 font-semibold">{outPoint !== null ? formatTimecode(outPoint) : '--:--.--'}</span>
          </div>

          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => jumpBy(1)}
              className="px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-indigo-500 hover:text-indigo-500 transition-colors shadow-sm text-xs font-bold"
            >
              +1s
            </button>
            <button
              onClick={() => jumpBy(5)}
              className="px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-indigo-500 hover:text-indigo-500 transition-colors shadow-sm text-xs font-bold"
            >
              +5s
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 justify-center">
          <button
            onClick={togglePlayPause}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-indigo-500 hover:text-indigo-500"
          >
            <Play size={16} />
            Play / Pause
          </button>
          <button
            onClick={() => setPlaybackRateValue(0.5)}
            className={`px-3 py-2 rounded-lg text-xs font-bold ${playbackRate === 0.5 ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800'}`}
          >
            0.5x
          </button>
          <button
            onClick={() => setPlaybackRateValue(1)}
            className={`px-3 py-2 rounded-lg text-xs font-bold ${playbackRate === 1 ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800'}`}
          >
            1x
          </button>
          <button
            onClick={() => setPlaybackRateValue(1.5)}
            className={`px-3 py-2 rounded-lg text-xs font-bold ${playbackRate === 1.5 ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800'}`}
          >
            1.5x
          </button>
          <button
            onClick={() => setPlaybackRateValue(2)}
            className={`px-3 py-2 rounded-lg text-xs font-bold ${playbackRate === 2 ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800'}`}
          >
            2x
          </button>
        </div>
      </div>

      {/* Logger Sidebar Section */}
      <div className="w-96 bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 p-6 flex flex-col h-full overflow-y-auto shadow-xl">
        <h2 className="text-xl font-bold flex items-center gap-2 mb-6">
          <Scissors size={20} className="text-indigo-500" />
          Log Clip
        </h2>

        <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 mb-8 shadow-inner">
          <div className="mb-4">
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Clip Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Sunset Drone Pan"
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="mb-4">
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Notes</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Notes about this segment"
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div className="mb-4">
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Tags</label>
            <input
              type="text"
              value={tagText}
              onChange={(e) => setTagText(e.target.value)}
              placeholder="Add custom tag(s), comma-separated"
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {hasTagCatalog && (
              <div className="mt-2 flex flex-wrap gap-1">
                {catalogTags.map((tag) => {
                  const selected = selectedTagIds.includes(tag.id);
                  const color = tag.color || '#8c6b4a';
                  return (
                    <button
                      key={tag.id}
                      onClick={() => toggleTag(tag.id, selectedTagIds, setSelectedTagIds)}
                      className={`text-[10px] px-2 py-1 rounded-full border ${selected ? 'text-white' : ''}`}
                      style={{
                        borderColor: color,
                        color: selected ? '#fff' : color,
                        backgroundColor: selected ? color : 'transparent',
                      }}
                    >
                      {tag.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            onClick={() => setOpenEditPanel((value) => !value)}
            className="w-full mb-3 text-xs font-semibold px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700"
          >
            {openEditPanel ? 'Hide clip setup details' : 'Show details'}
          </button>

          {openEditPanel ? (
            <div className="space-y-3 mb-3">
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Exact Start</label>
                <input
                  value={inPoint !== null ? inPoint.toFixed(3) : ''}
                  onChange={(e) => setInPoint(parseSecondsFromInput(e.target.value))}
                  className="w-full px-3 py-2 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                  placeholder="seconds"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Exact End</label>
                <input
                  value={outPoint !== null ? outPoint.toFixed(3) : ''}
                  onChange={(e) => setOutPoint(parseSecondsFromInput(e.target.value))}
                  className="w-full px-3 py-2 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                  placeholder="seconds"
                />
              </div>
            </div>
          ) : null}

          <button
            onClick={handleSaveClip}
            disabled={!isReady}
            className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            <Save size={18} />
            {isPending ? 'Saving...' : 'Save Clip'}
          </button>
        </div>

        <div className="flex-1">
          <h3 className="text-sm font-bold flex items-center gap-2 text-zinc-500 uppercase tracking-wider mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-2">
            <History size={16} />
            Logged Clips ({currentClipCount})
          </h3>

          <div className="space-y-3">
            {currentClipCount === 0 ? (
              <p className="text-zinc-400 text-sm italic text-center py-8">No clips logged yet.</p>
            ) : (
              asset.clips.map((clip) => {
                const isEditing = editingClipId === clip.id;
                return (
                  <div key={clip.id} className="p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg">
                    {isEditing ? (
                      <div className="space-y-3">
                        <input
                          className="w-full px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 text-sm bg-white dark:bg-zinc-900"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          placeholder="Clip title"
                        />
                        <div className="flex gap-2">
                          <input
                            className="w-full px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 text-sm bg-white dark:bg-zinc-900"
                            value={editingInPoint}
                            onChange={(e) => setEditingInPoint(e.target.value)}
                            placeholder="start sec"
                          />
                          <input
                            className="w-full px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 text-sm bg-white dark:bg-zinc-900"
                            value={editingOutPoint}
                            onChange={(e) => setEditingOutPoint(e.target.value)}
                            placeholder="end sec"
                          />
                        </div>
                        <textarea
                          className="w-full px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 text-sm bg-white dark:bg-zinc-900 resize-none"
                          value={editingDescription}
                          onChange={(e) => setEditingDescription(e.target.value)}
                          rows={2}
                        />
                        <input
                          className="w-full px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 text-sm bg-white dark:bg-zinc-900"
                          value={editingTagText}
                          onChange={(e) => setEditingTagText(e.target.value)}
                          placeholder="Add custom tags, comma-separated"
                        />
                        {hasTagCatalog && (
                          <div className="flex flex-wrap gap-1">
                            {catalogTags.map((tag) => {
                              const selected = editingTagIds.includes(tag.id);
                              const color = tag.color || '#8c6b4a';
                              return (
                                <button
                                  key={tag.id}
                                  onClick={() => toggleTag(tag.id, editingTagIds, setEditingTagIds)}
                                  className={`text-[10px] px-2 py-1 rounded-full border ${selected ? 'text-white' : ''}`}
                                  style={{
                                    borderColor: color,
                                    color: selected ? '#fff' : color,
                                    backgroundColor: selected ? color : 'transparent',
                                  }}
                                >
                                  {tag.label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveEditClip(clip.id)}
                            className="text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                          >
                            Save
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="text-xs px-2 py-1 rounded bg-zinc-200 dark:bg-zinc-800"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm mb-1">{clip.title}</h4>
                          <div className="flex gap-2">
                            <button
                              onClick={() => startEditClip(clip)}
                              className="text-xs font-medium text-zinc-500 hover:text-indigo-500 transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteClip(clip.id)}
                              className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-600 transition-colors"
                            >
                              <Trash2 size={12} />
                              Delete
                            </button>
                          </div>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="font-mono text-xs text-indigo-600 dark:text-indigo-400 font-bold">
                            {formatTimecode(clip.inTimecode)} - {formatTimecode(clip.outTimecode)}
                          </span>
                          <button
                            onClick={() => seekTo(clip.inTimecode)}
                            className="text-xs font-medium text-zinc-500 hover:text-indigo-500 transition-colors"
                          >
                            Play
                          </button>
                        </div>

                        {clip.description && (
                          <p className="text-xs text-zinc-500 mt-2 line-clamp-2">{clip.description}</p>
                        )}

                        {clip.mediaTags.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {clip.mediaTags.map((tag) => {
                              const color = tag.color || '#8c6b4a';
                              return (
                                <span
                                  key={tag.id}
                                  className="text-[10px] px-2 py-0.5 rounded-full border"
                                  style={{ borderColor: color, color }}
                                >
                                  {tag.label}
                                </span>
                              );
                            })}
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  const out = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }

  return out;
}
