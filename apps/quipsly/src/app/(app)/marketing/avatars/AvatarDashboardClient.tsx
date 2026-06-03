"use client";

import React, { useState } from 'react';
import { AvatarBuilderModal } from '@/components/marketing/AvatarBuilderModal';
import { Plus } from 'lucide-react';

export function AvatarDashboardClient() {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div className="absolute top-8 right-8">
        <button 
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-900 px-5 py-2.5 rounded-lg font-bold transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" />
          New Avatar
        </button>
      </div>

      <button 
        onClick={() => setShowModal(true)}
        className="flex flex-col items-center justify-center w-full max-w-sm h-[420px] rounded-2xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors group"
      >
        <div className="w-16 h-16 bg-zinc-200 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
          <Plus className="w-8 h-8 text-zinc-500 dark:text-zinc-400" />
        </div>
        <h3 className="font-bold text-zinc-600 dark:text-zinc-300">Generate New Avatar</h3>
        <p className="text-sm text-zinc-400 mt-2">with Quipsly AI</p>
      </button>

      {showModal && <AvatarBuilderModal onClose={() => setShowModal(false)} />}
    </>
  );
}
