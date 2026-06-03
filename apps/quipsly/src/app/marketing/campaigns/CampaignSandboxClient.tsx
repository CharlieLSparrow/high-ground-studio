"use client";

import React, { useState } from 'react';
import { Target, LayoutTemplate, Mail, Plus, Map, Briefcase, Calendar } from 'lucide-react';
import Image from 'next/image';

type Props = {
  initialCampaigns: any[];
  avatars: any[];
  landingPages: any[];
  emailSequences: any[];
};

export function CampaignSandboxClient({ initialCampaigns, avatars, landingPages, emailSequences }: Props) {
  const [campaigns, setCampaigns] = useState<any[]>(initialCampaigns);
  const [activeCampaign, setActiveCampaign] = useState(initialCampaigns[0] || null);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateMockCampaign = async () => {
    setIsCreating(true);
    try {
      const res = await fetch('/api/marketing/campaigns', {
        method: 'POST',
      });
      if (!res.ok) throw new Error("Failed to create campaign");
      
      const newCampaign = await res.json();
      setCampaigns(prev => [newCampaign, ...prev]);
      setActiveCampaign(newCampaign);
    } catch (err) {
      console.error(err);
      alert("Failed to create campaign");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex w-full h-full divide-x divide-zinc-200 dark:divide-zinc-800">
      
      {/* LEFT PANE: CAMPAIGN LIST */}
      <div className="w-80 flex flex-col bg-zinc-50 dark:bg-zinc-950 overflow-y-auto">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-white dark:bg-zinc-900">
          <div className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="font-bold text-zinc-900 dark:text-white">Campaigns</h2>
          </div>
          <button 
            onClick={handleCreateMockCampaign}
            disabled={isCreating}
            className="flex items-center gap-1 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-2 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" /> {isCreating ? 'Creating...' : 'New'}
          </button>
        </div>

        <div className="p-4 space-y-2">
          {campaigns.length === 0 ? (
            <div className="text-center p-6 text-zinc-500 text-sm">
              No campaigns yet. Click New to create a Product Launch.
            </div>
          ) : (
            campaigns.map(camp => (
              <button
                key={camp.id}
                onClick={() => setActiveCampaign(camp)}
                className={`w-full text-left p-4 rounded-xl border transition-all ${activeCampaign?.id === camp.id ? 'bg-white dark:bg-zinc-900 border-indigo-200 dark:border-indigo-800 shadow-sm ring-1 ring-indigo-500' : 'bg-transparent border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-900/50'}`}
              >
                <h3 className={`font-bold ${activeCampaign?.id === camp.id ? 'text-indigo-900 dark:text-indigo-300' : 'text-zinc-700 dark:text-zinc-300'}`}>
                  {camp.name}
                </h3>
                <p className="text-xs text-zinc-500 mt-1 line-clamp-1">{camp.description || 'No description'}</p>
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded-md uppercase">
                    {camp.status}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* RIGHT PANE: SANDBOX CANVAS */}
      <div className="flex-1 flex flex-col bg-zinc-100 dark:bg-zinc-900 relative">
        {!activeCampaign ? (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-400">
            <Map className="w-16 h-16 mb-4 opacity-20" />
            <h3 className="text-xl font-bold text-zinc-700 dark:text-zinc-300">Campaign Sandbox</h3>
            <p className="mt-2 text-sm text-zinc-500 max-w-sm text-center">
              Select or create a campaign to map out your Avatars, Landing Pages, and Email Sequences for your next launch.
            </p>
          </div>
        ) : (
          <>
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">{activeCampaign.name}</h1>
                <p className="text-sm text-zinc-500 mt-1">{activeCampaign.description}</p>
              </div>
              <div className="flex gap-2">
                <button className="flex items-center gap-2 text-sm font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-4 py-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
                  <Calendar className="w-4 h-4" /> Schedule Launch
                </button>
              </div>
            </div>

            <div className="flex-1 p-8 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
                
                {/* Column 1: Avatars */}
                <div className="flex flex-col space-y-4">
                  <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
                    <h3 className="font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                      <Target className="w-5 h-5 text-indigo-500" /> Target Avatars
                    </h3>
                    <span className="bg-zinc-200 dark:bg-zinc-800 text-xs px-2 py-0.5 rounded-full font-bold">{avatars.length}</span>
                  </div>
                  
                  {avatars.map(avatar => (
                    <div key={avatar.id} className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-4 rounded-xl shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-3">
                        <Image src={avatar.avatarImageUrl} alt={avatar.name} width={40} height={40} className="rounded-full bg-zinc-100" />
                        <div>
                          <h4 className="font-bold text-sm text-zinc-900 dark:text-white">{avatar.name}</h4>
                          <p className="text-xs text-zinc-500 line-clamp-1">{avatar.demographics}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  <button className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 rounded-xl p-4 text-sm font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2">
                    <Plus className="w-4 h-4" /> Add Avatar
                  </button>
                </div>

                {/* Column 2: Landing Pages */}
                <div className="flex flex-col space-y-4">
                  <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
                    <h3 className="font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                      <LayoutTemplate className="w-5 h-5 text-emerald-500" /> Lead Magnets
                    </h3>
                    <span className="bg-zinc-200 dark:bg-zinc-800 text-xs px-2 py-0.5 rounded-full font-bold">{landingPages.length}</span>
                  </div>
                  
                  {landingPages.map(lp => (
                    <div key={lp.id} className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-4 rounded-xl shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                      <h4 className="font-bold text-sm text-zinc-900 dark:text-white">{lp.name}</h4>
                      <p className="text-xs text-zinc-500 line-clamp-2 mt-1">{lp.headline}</p>
                      <div className="flex gap-2 mt-3 text-xs font-semibold">
                         <span className="bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 px-2 py-1 rounded">Views: {lp.views}</span>
                         <span className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 px-2 py-1 rounded">Leads: {lp.conversions}</span>
                      </div>
                    </div>
                  ))}

                  <button className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 rounded-xl p-4 text-sm font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2">
                    <Plus className="w-4 h-4" /> Add Landing Page
                  </button>
                </div>

                {/* Column 3: Sequences */}
                <div className="flex flex-col space-y-4">
                  <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
                    <h3 className="font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                      <Mail className="w-5 h-5 text-amber-500" /> Sequences
                    </h3>
                    <span className="bg-zinc-200 dark:bg-zinc-800 text-xs px-2 py-0.5 rounded-full font-bold">{emailSequences.length}</span>
                  </div>
                  
                  {emailSequences.map(seq => (
                    <div key={seq.id} className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-4 rounded-xl shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>
                      <h4 className="font-bold text-sm text-zinc-900 dark:text-white">{seq.name}</h4>
                      <div className="flex items-center gap-2 mt-2">
                         <div className="flex -space-x-2">
                           <div className="w-6 h-6 rounded-full border-2 border-white dark:border-zinc-950 bg-amber-100 flex items-center justify-center text-[10px] font-bold text-amber-800">1</div>
                           <div className="w-6 h-6 rounded-full border-2 border-white dark:border-zinc-950 bg-amber-200 flex items-center justify-center text-[10px] font-bold text-amber-800">2</div>
                           <div className="w-6 h-6 rounded-full border-2 border-white dark:border-zinc-950 bg-amber-300 flex items-center justify-center text-[10px] font-bold text-amber-800">3</div>
                         </div>
                         <span className="text-xs text-zinc-500 font-medium">Emails</span>
                      </div>
                    </div>
                  ))}

                  <button className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 rounded-xl p-4 text-sm font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2">
                    <Plus className="w-4 h-4" /> Add Sequence
                  </button>
                </div>

              </div>
            </div>
          </>
        )}
      </div>

    </div>
  );
}
