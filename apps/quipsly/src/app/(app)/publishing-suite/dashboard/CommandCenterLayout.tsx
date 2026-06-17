"use client";

import React, { useState } from "react";
import { ComposerClient } from "../composer/ComposerClient";
import { CalendarGrid } from "../calendar/CalendarGrid";
import { AnalyticsWidget } from "../analytics/AnalyticsWidget";
import { UnifiedInboxWidget } from "./UnifiedInboxWidget";

export function CommandCenterLayout() {
  const [isCommandCenterMode, setIsCommandCenterMode] = useState(false);

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] w-full overflow-hidden bg-gray-100">
      
      {/* Top Header & Toggle */}
      <div className="h-14 bg-white border-b border-gray-200 flex justify-between items-center px-6 shrink-0 z-10 shadow-sm">
        <h1 className="text-xl font-bold text-gray-800 tracking-tight">
          {isCommandCenterMode ? "Command Center" : "Publishing Suite"}
        </h1>
        <div className="flex items-center space-x-3">
          <span className="text-sm font-medium text-gray-500">Focus Mode</span>
          <button 
            onClick={() => setIsCommandCenterMode(!isCommandCenterMode)}
            className={`w-12 h-6 rounded-full transition-colors flex items-center px-1 ${isCommandCenterMode ? "bg-blue-600" : "bg-gray-300"}`}
          >
            <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform ${isCommandCenterMode ? "translate-x-6" : "translate-x-0"}`}></div>
          </button>
          <span className="text-sm font-medium text-gray-500">Command Center</span>
        </div>
      </div>

      {/* Main Grid Area */}
      <div className="flex-1 overflow-hidden relative">
        <div 
          className={`absolute inset-0 transition-all duration-500 ease-in-out p-4 gap-4 grid ${
            isCommandCenterMode 
              ? "grid-cols-12 grid-rows-2" // 12 columns for fine-grained control in expanded mode
              : "grid-cols-1 grid-rows-1"  // 1 column for focus mode
          }`}
        >
          
          {/* Main Composer Area */}
          <div 
            className={`transition-all duration-500 bg-white rounded-xl shadow-sm overflow-hidden flex flex-col ${
              isCommandCenterMode ? "col-span-8 row-span-2" : "col-span-1 row-span-1"
            }`}
          >
            <ComposerClient isEmbedded={true} />
          </div>

          {/* Analytics Panel (Slides in/fades in) */}
          <div 
            className={`transition-all duration-500 ease-in-out overflow-hidden ${
              isCommandCenterMode 
                ? "col-span-4 row-span-1 opacity-100 translate-x-0" 
                : "col-span-4 row-span-1 opacity-0 translate-x-12 hidden"
            }`}
          >
            {isCommandCenterMode && <AnalyticsWidget />}
          </div>

          {/* Inbox Panel (Slides in/fades in) */}
          <div 
            className={`transition-all duration-500 ease-in-out overflow-hidden ${
              isCommandCenterMode 
                ? "col-span-4 row-span-1 opacity-100 translate-x-0" 
                : "col-span-4 row-span-1 opacity-0 translate-x-12 hidden"
            }`}
          >
            {isCommandCenterMode && <UnifiedInboxWidget />}
          </div>

        </div>
      </div>
    </div>
  );
}
