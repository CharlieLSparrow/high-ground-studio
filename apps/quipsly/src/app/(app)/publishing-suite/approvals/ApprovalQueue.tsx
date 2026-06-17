"use client";

import React, { useState } from "react";

// Mock Data
const MOCK_APPROVALS = [
  { id: "cand-1", title: "New Feature Teaser", platform: "x_twitter", author: "Junior Copywriter", status: "pending_review", date: "2026-06-10T10:00:00Z" },
  { id: "cand-2", title: "Weekly Podcast Clip", platform: "youtube_v3", author: "Video Intern", status: "pending_review", date: "2026-06-11T14:30:00Z" },
];

export function ApprovalQueue() {
  const [approvals, setApprovals] = useState(MOCK_APPROVALS);

  const handleApprove = (id: string) => {
    // In reality, this calls a server action to update HgoEpisodePublishCandidate approvalStatus
    setApprovals(prev => prev.filter(a => a.id !== id));
    alert(`Post ${id} approved and sent to job queue!`);
  };

  const handleReject = (id: string) => {
    // Moves it back to 'draft'
    setApprovals(prev => prev.filter(a => a.id !== id));
    alert(`Post ${id} rejected and returned to draft status.`);
  };

  return (
    <div className="flex flex-col h-full w-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center shrink-0">
        <h2 className="text-lg font-bold text-gray-900">Needs Approval</h2>
        <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-1 rounded-full">{approvals.length} Pending</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
        {approvals.map(post => (
          <div key={post.id} className="bg-white p-4 border border-gray-200 rounded-lg shadow-sm hover:border-blue-300 transition-colors">
            <div className="flex justify-between items-start mb-2">
              <div>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{post.platform}</span>
                <h3 className="text-sm font-bold text-gray-900 mt-1">{post.title}</h3>
                <div className="text-xs text-gray-500 mt-1">Drafted by <span className="font-medium text-gray-700">{post.author}</span> • Scheduled for {new Date(post.date).toLocaleString()}</div>
              </div>
              <span className="bg-yellow-100 text-yellow-700 text-[10px] font-bold px-2 py-1 rounded uppercase">Review</span>
            </div>
            
            <div className="mt-4 flex space-x-2">
              <button 
                onClick={() => handleApprove(post.id)}
                className="flex-1 bg-green-600 text-white text-sm font-semibold py-2 rounded hover:bg-green-700 transition-colors"
              >
                Approve & Schedule
              </button>
              <button 
                onClick={() => handleReject(post.id)}
                className="flex-1 bg-white border border-red-200 text-red-600 text-sm font-semibold py-2 rounded hover:bg-red-50 transition-colors"
              >
                Reject & Edit
              </button>
            </div>
          </div>
        ))}

        {approvals.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p>All caught up! No pending approvals.</p>
          </div>
        )}
      </div>
    </div>
  );
}
