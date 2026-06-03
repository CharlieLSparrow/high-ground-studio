"use client";

import React, { useState } from 'react';
import { Sparkles, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { generateFunnelInsights } from '@/app/marketing/funnels/actions';

interface Insight {
  type: 'warning' | 'success' | 'info';
  title: string;
  message: string;
  recommendation?: string;
}

export function QuipslyAgenticInsights({ funnelStepsData, personaId }: { funnelStepsData: any[], personaId?: string }) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await generateFunnelInsights(funnelStepsData, personaId);
      if (res.success && res.insights) {
        setInsights(res.insights);
      } else {
        throw new Error(res.error || 'Failed to generate insights');
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 w-full xl:w-80 p-6 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl border border-indigo-100 dark:border-indigo-900">
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-xl font-bold text-indigo-900 dark:text-indigo-300">Quipsly AI</h2>
        </div>
        <button 
          onClick={handleGenerate}
          disabled={loading || funnelStepsData.length === 0}
          className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition-colors shadow-sm"
        >
          {loading ? 'Analyzing...' : 'Generate Insights'}
        </button>
      </div>
      
      <p className="text-sm text-indigo-800 dark:text-indigo-200/80 mb-4">
        I can analyze your funnel metrics against industry benchmarks and your audience psychographics.
      </p>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-200">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex justify-center p-8">
          <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
        </div>
      )}

      {!loading && insights.length > 0 && (
        <div className="space-y-4">
          {insights.map((insight, idx) => {
            const isWarning = insight.type === 'warning';
            const isSuccess = insight.type === 'success';
            
            const Icon = isWarning ? AlertTriangle : (isSuccess ? CheckCircle : Info);
            const iconColor = isWarning ? 'text-red-500' : (isSuccess ? 'text-emerald-500' : 'text-blue-500');
            const borderColor = isWarning ? 'border-red-100 dark:border-red-900/30' : (isSuccess ? 'border-emerald-100 dark:border-emerald-900/30' : 'border-blue-100 dark:border-blue-900/30');

            return (
              <div key={idx} className={`bg-white dark:bg-zinc-900 p-4 rounded-lg shadow-sm border ${borderColor}`}>
                <div className="flex items-start gap-3">
                  <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${iconColor}`} />
                  <div>
                    <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">{insight.title}</h4>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                      {insight.message}
                    </p>
                    {insight.recommendation && (
                      <div className="mt-3 bg-zinc-50 dark:bg-zinc-800/50 p-2 rounded border border-zinc-100 dark:border-zinc-800">
                        <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Recommendation:</p>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">{insight.recommendation}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
