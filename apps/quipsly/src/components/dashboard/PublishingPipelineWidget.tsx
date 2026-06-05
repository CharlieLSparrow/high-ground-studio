"use client";

import React, { useState } from "react";
import { Columns, AlertTriangle, MoreVertical, Plus, MessageSquare, Paperclip } from "lucide-react";
import { WidgetCard, classNames } from "./WidgetCard";

type Task = {
  id: string;
  title: string;
  type: 'video' | 'writing' | 'audio' | 'social';
  priority: 'high' | 'medium' | 'low';
  comments: number;
  attachments: number;
};

type Column = {
  id: string;
  title: string;
  tasks: Task[];
};

const INITIAL_COLUMNS: Column[] = [
  {
    id: 'col1',
    title: 'Ideation',
    tasks: [
      { id: 't1', title: 'Worldbuilding Q&A', type: 'video', priority: 'medium', comments: 2, attachments: 0 },
      { id: 't2', title: 'Draft Patreon Poll', type: 'social', priority: 'low', comments: 0, attachments: 1 },
    ]
  },
  {
    id: 'col2',
    title: 'In Progress',
    tasks: [
      { id: 't3', title: 'Chapter 14 Revision', type: 'writing', priority: 'high', comments: 5, attachments: 2 },
      { id: 't4', title: 'Record Voiceover', type: 'audio', priority: 'high', comments: 1, attachments: 0 },
    ]
  },
  {
    id: 'col3',
    title: 'In Review',
    tasks: [
      { id: 't5', title: 'May Newsletter', type: 'writing', priority: 'medium', comments: 3, attachments: 1 },
    ]
  },
  {
    id: 'col4',
    title: 'Ready for Publish',
    tasks: [
      { id: 't6', title: 'Shorts: Magic System', type: 'video', priority: 'high', comments: 0, attachments: 1 },
    ]
  }
];

export const PublishingPipelineWidget = React.memo(() => {
  const [columns] = useState(INITIAL_COLUMNS);

  return (
    <WidgetCard>
      <div className="flex justify-between items-start mb-8">
        <div>
          <h3 className="text-2xl font-black text-[#3d3122] flex items-center gap-3">
            <Columns className="text-indigo-500" size={28} aria-hidden="true" />
            Publishing Pipeline
          </h3>
          <p className="text-[#8c6b4a] font-medium mt-1">Kanban board for all active drops</p>
        </div>
        <button className="px-4 py-2 bg-indigo-50 border border-indigo-100 text-indigo-800 font-bold text-sm rounded-xl hover:bg-indigo-100 transition-colors shadow-sm flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
          <Plus size={16} aria-hidden="true" /> Add Task
        </button>
      </div>

      <div className="flex-1 flex gap-6 overflow-x-auto custom-scrollbar pb-4" role="region" aria-label="Kanban Board">
        {columns.map(col => (
          <section key={col.id} className="w-80 flex-shrink-0 flex flex-col gap-4" aria-labelledby={`col-${col.id}`}>
            <div className="flex justify-between items-center px-2">
              <h4 id={`col-${col.id}`} className="text-sm font-bold text-[#3d3122] uppercase tracking-wider">
                {col.title} <span className="text-[#8c6b4a] ml-2 text-xs" aria-label={`${col.tasks.length} tasks`}>({col.tasks.length})</span>
              </h4>
              <button 
                className="text-[#d4c1a0] hover:text-[#8c6b4a] p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                aria-label={`Add task to ${col.title}`}
              >
                <Plus size={16} aria-hidden="true" />
              </button>
            </div>
            
            <ul className="flex-1 bg-[#fdfaf6] border border-[#e8dcc4] rounded-2xl p-3 flex flex-col gap-3 min-h-[400px]">
              {col.tasks.map(task => (
                <li 
                  key={task.id} 
                  className="bg-white border border-[#e8dcc4] p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer group focus-within:ring-2 focus-within:ring-indigo-400"
                  tabIndex={0}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className={classNames(
                      "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                      task.type === 'video' ? 'bg-rose-50 text-rose-800 border-rose-200' :
                      task.type === 'writing' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                      task.type === 'audio' ? 'bg-purple-50 text-purple-800 border-purple-200' :
                      'bg-blue-50 text-blue-800 border-blue-200'
                    )}>
                      {task.type}
                    </span>
                    <button 
                      className="text-[#d4c1a0] opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity hover:text-[#3d3122] focus:outline-none focus-visible:opacity-100"
                      aria-label="Task options"
                    >
                      <MoreVertical size={14} aria-hidden="true" />
                    </button>
                  </div>
                  
                  <h5 className="font-bold text-sm text-[#3d3122] mb-3 leading-snug">{task.title}</h5>
                  
                  <div className="flex items-center justify-between pt-3 border-t border-[#f8f3e6]">
                    <div className="flex items-center gap-3 text-[#8c6b4a]">
                      {task.comments > 0 && (
                        <div className="flex items-center gap-1 text-xs font-medium" aria-label={`${task.comments} comments`}>
                          <MessageSquare size={12} aria-hidden="true" /> {task.comments}
                        </div>
                      )}
                      {task.attachments > 0 && (
                        <div className="flex items-center gap-1 text-xs font-medium" aria-label={`${task.attachments} attachments`}>
                          <Paperclip size={12} aria-hidden="true" /> {task.attachments}
                        </div>
                      )}
                    </div>
                    {task.priority === 'high' && (
                      <AlertTriangle size={14} className="text-rose-600" aria-label="High Priority" />
                    )}
                  </div>
                </li>
              ))}
              
              {col.tasks.length === 0 && (
                <li className="flex-1 border-2 border-dashed border-[#e8dcc4] rounded-xl flex items-center justify-center pointer-events-none">
                  <span className="text-[#d4c1a0] text-sm font-medium">Drop tasks here</span>
                </li>
              )}
            </ul>
          </section>
        ))}
      </div>
    </WidgetCard>
  );
});
