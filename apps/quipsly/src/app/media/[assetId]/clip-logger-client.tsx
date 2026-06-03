'use client';

import React, { useRef, useState, useTransition } from 'react';
import { ArrowLeft, Scissors, Save, Bookmark, History, Target } from 'lucide-react';
import Link from 'next/link';
import { createMediaClip } from '../actions';

function formatTimecode(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  
  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

export function ClipLoggerClient({ asset }: { asset: any }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [inPoint, setInPoint] = useState<number | null>(null);
  const [outPoint, setOutPoint] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPending, startTransition] = useTransition();

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

  const handleSaveClip = () => {
    if (inPoint === null || outPoint === null || !title) return;

    startTransition(() => {
      createMediaClip(asset.id, title, inPoint, outPoint, description);
      setInPoint(null);
      setOutPoint(null);
      setTitle('');
      setDescription('');
    });
  };

  const seekTo = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-black">
      {/* Video Player Section */}
      <div className="flex-1 flex flex-col p-6">
        <header className="flex items-center gap-4 mb-6">
          <Link href="/media" className="p-2 bg-white dark:bg-zinc-900 rounded-full shadow-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white truncate" title={asset.filename}>{asset.filename}</h1>
            <p className="text-zinc-500 text-sm">{asset.resolution || 'Unknown'} • {asset.fps || '--'}fps</p>
          </div>
        </header>

        <div className="flex-1 bg-black rounded-2xl overflow-hidden shadow-lg relative flex flex-col justify-center">
          <video 
            ref={videoRef}
            src={asset.url}
            controls
            className="w-full max-h-full"
          />
        </div>

        <div className="mt-6 flex items-center justify-center gap-6">
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
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Sunset Drone Pan"
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="mb-4">
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Tags / Notes</label>
            <textarea 
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="#b-roll #sunset"
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>
          <button 
            onClick={handleSaveClip}
            disabled={inPoint === null || outPoint === null || !title || isPending}
            className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            <Save size={18} />
            {isPending ? 'Saving...' : 'Save Clip'}
          </button>
        </div>

        <div className="flex-1">
          <h3 className="text-sm font-bold flex items-center gap-2 text-zinc-500 uppercase tracking-wider mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-2">
            <History size={16} />
            Logged Clips ({asset.clips.length})
          </h3>
          
          <div className="space-y-3">
            {asset.clips.length === 0 ? (
              <p className="text-zinc-400 text-sm italic text-center py-8">No clips logged yet.</p>
            ) : (
              asset.clips.map((clip: any) => (
                <div key={clip.id} className="p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg group">
                  <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm mb-1">{clip.title}</h4>
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-xs text-indigo-600 dark:text-indigo-400 font-bold">
                      {formatTimecode(clip.inTimecode)} - {formatTimecode(clip.outTimecode)}
                    </span>
                    <button 
                      onClick={() => seekTo(clip.inTimecode)}
                      className="text-xs font-medium text-zinc-500 hover:text-indigo-500 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      Play
                    </button>
                  </div>
                  {clip.description && <p className="text-xs text-zinc-500 mt-2 line-clamp-1">{clip.description}</p>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
