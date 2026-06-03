import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, X, BrainCircuit, UploadCloud, FileText } from 'lucide-react';
import { saveMarketingPersona } from '@/app/marketing/avatars/actions';

export function AvatarBuilderModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [niche, setNiche] = useState('');
  const [activeTab, setActiveTab] = useState<'prompt' | 'data'>('prompt');
  const [fileData, setFileData] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleGenerate = async () => {
    setStep(2);
    setError(null);
    try {
      let csvDataText = '';
      if (activeTab === 'data' && fileData) {
        csvDataText = await fileData.text();
      }

      const response = await fetch('/api/marketing/avatars/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: activeTab === 'prompt' ? niche : undefined,
          csvData: activeTab === 'data' ? csvDataText : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate avatar');
      }

      const data = await response.json();
      console.log('Generated Persona:', data);
      
      const saveResult = await saveMarketingPersona(data, activeTab === 'data' ? csvDataText : undefined);
      if (!saveResult.success) {
        throw new Error(saveResult.error || 'Failed to save to database');
      }

      onClose();
      router.refresh();
      
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Something went wrong');
      setStep(1);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFileData(e.target.files[0]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/80 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800">
        
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-100 dark:bg-indigo-900/30 p-2 rounded-lg">
              <BrainCircuit className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Create Avatar</h2>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="p-8">
          {step === 1 ? (
            <div className="space-y-6">
              
              {/* Tabs */}
              <div className="flex space-x-1 bg-zinc-100 dark:bg-zinc-800/50 p-1 rounded-lg w-fit">
                <button
                  onClick={() => setActiveTab('prompt')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'prompt' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                >
                  Quick Prompt
                </button>
                <button
                  onClick={() => setActiveTab('data')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'data' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                >
                  Data Ingestion (Advanced)
                </button>
              </div>

              {activeTab === 'prompt' ? (
                <>
                  <h3 className="text-2xl font-bold text-zinc-800 dark:text-zinc-100">Who do you want to help?</h3>
                  <p className="text-zinc-500">Describe your niche in a few words, and Quipsly AI will generate a complete psychological profile.</p>
                  
                  <textarea 
                    className="w-full p-4 border border-zinc-300 dark:border-zinc-700 rounded-xl bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500 outline-none resize-none h-32"
                    placeholder="e.g., I want to help overwhelmed agency owners scale past $10k/month without working 80 hour weeks."
                    value={niche}
                    onChange={(e) => setNiche(e.target.value)}
                  />
                </>
              ) : (
                <>
                  <h3 className="text-2xl font-bold text-zinc-800 dark:text-zinc-100">Upload Raw Data</h3>
                  <p className="text-zinc-500">Upload customer surveys, reviews, or email exports (CSV format). Quipsly AI will extract statistically significant pain points and desires.</p>
                  
                  <div 
                    className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl p-10 flex flex-col items-center justify-center text-center bg-zinc-50 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input 
                      type="file" 
                      accept=".csv,.txt"
                      className="hidden" 
                      ref={fileInputRef}
                      onChange={handleFileChange}
                    />
                    
                    {fileData ? (
                      <div className="flex flex-col items-center text-indigo-600 dark:text-indigo-400">
                        <FileText className="w-12 h-12 mb-3" />
                        <span className="font-semibold">{fileData.name}</span>
                        <span className="text-xs text-zinc-500 mt-1">{(fileData.size / 1024).toFixed(1)} KB</span>
                        <button className="mt-4 text-sm underline text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300" onClick={(e) => { e.stopPropagation(); setFileData(null); }}>Remove file</button>
                      </div>
                    ) : (
                      <>
                        <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center mb-4">
                          <UploadCloud className="w-8 h-8" />
                        </div>
                        <h4 className="font-bold text-zinc-700 dark:text-zinc-300">Click to upload CSV</h4>
                        <p className="text-sm text-zinc-500 mt-1">or drag and drop here</p>
                      </>
                    )}
                  </div>
                </>
              )}

              {error && (
                <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-4 rounded-xl text-sm font-medium">
                  {error}
                </div>
              )}

              <div className="flex justify-end pt-4">
                <button 
                  onClick={handleGenerate}
                  disabled={activeTab === 'prompt' ? niche.length < 10 : !fileData}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-bold transition-all shadow-md hover:shadow-lg"
                >
                  <Sparkles className="w-5 h-5" />
                  Generate with Quipsly AI
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
              <h3 className="text-xl font-bold text-zinc-800 dark:text-zinc-100 mt-4">
                {activeTab === 'data' ? 'Analyzing Source Data...' : 'Generating Avatar...'}
              </h3>
              <p className="text-zinc-500 text-center max-w-sm">
                {activeTab === 'data' 
                  ? 'Extracting themes from your CSV and cross-referencing market psychographics.'
                  : 'Analyzing market desires, extracting pain points, and compiling psychographic data.'}
              </p>
              <button 
                onClick={onClose}
                className="mt-8 text-sm text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
              >
                Cancel and close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
