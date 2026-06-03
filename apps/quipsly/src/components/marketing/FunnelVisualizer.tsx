import React from 'react';
import { ArrowRight, Users, MousePointerClick, ShoppingCart } from 'lucide-react';

interface FunnelStepProps {
  step: {
    id: string;
    stepOrder: number;
    stepType: string;
    name: string;
    views: number;
    conversions: number;
    expectedConvRate: number | null;
    actualConvRate: number | null;
  };
}

export function FunnelVisualizer({ steps }: { steps: FunnelStepProps['step'][] }) {
  // Mock steps if none provided
  const displaySteps = steps.length > 0 ? steps : [
    { id: '1', stepOrder: 1, stepType: 'landing_page', name: 'Podcast Opt-in Page', views: 1200, conversions: 480, expectedConvRate: 35, actualConvRate: 40 },
    { id: '2', stepOrder: 2, stepType: 'email_sequence', name: 'Welcome Email', views: 480, conversions: 50, expectedConvRate: 20, actualConvRate: 10.4 },
    { id: '3', stepOrder: 3, stepType: 'checkout', name: 'Course Checkout', views: 50, conversions: 12, expectedConvRate: 25, actualConvRate: 24 }
  ];

  return (
    <div className="flex flex-col gap-4 w-full p-6 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800">
      <h2 className="text-xl font-bold text-zinc-800 dark:text-zinc-100 mb-4">Funnel Pipeline</h2>
      
      <div className="flex flex-col md:flex-row items-center justify-between gap-6">
        {displaySteps.map((step, index) => {
          const isUnderperforming = step.expectedConvRate && step.actualConvRate && (step.actualConvRate < step.expectedConvRate * 0.8);
          
          return (
            <React.Fragment key={step.id}>
              {/* Step Card */}
              <div className={`flex flex-col flex-1 min-w-[200px] p-5 rounded-lg border-2 transition-all ${isUnderperforming ? 'border-red-400 bg-red-50 dark:bg-red-900/20' : 'border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800'}`}>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">Step {step.stepOrder}</span>
                  {step.stepType === 'landing_page' && <Users className="w-5 h-5 text-indigo-500" />}
                  {step.stepType === 'email_sequence' && <MousePointerClick className="w-5 h-5 text-indigo-500" />}
                  {step.stepType === 'checkout' && <ShoppingCart className="w-5 h-5 text-indigo-500" />}
                </div>
                
                <h3 className="font-bold text-lg text-zinc-800 dark:text-zinc-100 mb-4">{step.name}</h3>
                
                <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                  <div>
                    <div className="text-zinc-500 text-xs">Views</div>
                    <div className="font-medium text-zinc-900 dark:text-zinc-100">{step.views.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500 text-xs">Conversions</div>
                    <div className="font-medium text-zinc-900 dark:text-zinc-100">{step.conversions.toLocaleString()}</div>
                  </div>
                </div>

                <div className="mt-auto pt-4 border-t border-zinc-200 dark:border-zinc-700">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-zinc-500">Conv. Rate</span>
                    <span className={`font-bold ${isUnderperforming ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {step.actualConvRate}%
                    </span>
                  </div>
                  {step.expectedConvRate && (
                    <div className="flex justify-between items-center text-xs mt-1 text-zinc-400">
                      <span>Expected</span>
                      <span>{step.expectedConvRate}%</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Arrow */}
              {index < displaySteps.length - 1 && (
                <div className="hidden md:flex flex-col items-center justify-center">
                  <ArrowRight className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />
                  <div className="text-xs font-semibold text-zinc-400 mt-2 bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded-full">
                    Drop-off: {(100 - (displaySteps[index+1].views / Math.max(1, step.views) * 100)).toFixed(1)}%
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
