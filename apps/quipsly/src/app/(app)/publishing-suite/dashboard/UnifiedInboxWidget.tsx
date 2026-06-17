"use client";

import React, { useEffect, useState } from "react";
import { fetchInteractions, replyToInteractionAction } from "@/lib/publishing/inboxActions";

export function UnifiedInboxWidget() {
  const [messages, setMessages] = useState<any[]>([]);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchInteractions().then((data: any[]) => {
      setMessages(data);
      setIsLoading(false);
    });
  }, []);

  const handleReplySubmit = async (id: string) => {
    if (!replyText.trim()) return;
    await replyToInteractionAction(id, replyText);
    setMessages(prev => prev.filter(m => m.id !== id));
    setReplyingTo(null);
    setReplyText("");
  };

  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-full">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-gray-900 text-sm uppercase tracking-wider">Unified Inbox</h3>
        {!isLoading && <span className="text-xs font-semibold text-blue-600 bg-blue-100 px-2 py-1 rounded-full">{messages.length} New</span>}
      </div>

      <div className="flex-1 overflow-y-auto space-y-3">
        {isLoading && <div className="text-sm text-gray-500">Loading interactions...</div>}
        {!isLoading && messages.length === 0 && <div className="text-sm text-gray-500">Inbox zero!</div>}
        
        {messages.map((msg) => (
          <div key={msg.id} className="p-3 bg-gray-50 border border-gray-100 rounded-lg group hover:border-blue-300 transition-colors">
            <div className="flex justify-between items-start mb-1">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-gray-700">{msg.authorName}</span>
                <span className="text-[10px] text-gray-400 font-medium px-1.5 py-0.5 rounded bg-gray-200">{msg.platform}</span>
              </div>
              <span className="text-[10px] text-gray-400">{new Date(msg.createdAt).toLocaleDateString()}</span>
            </div>
            <p className="text-sm text-gray-800 line-clamp-2">{msg.content}</p>
            
            {replyingTo === msg.id ? (
              <div className="mt-3 flex flex-col space-y-2">
                <textarea 
                  className="w-full text-sm p-2 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500" 
                  rows={2} 
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder="Type your reply..."
                />
                <div className="flex space-x-2 justify-end">
                  <button onClick={() => setReplyingTo(null)} className="text-xs text-gray-500 font-medium">Cancel</button>
                  <button onClick={() => handleReplySubmit(msg.id)} className="text-xs text-blue-600 font-bold">Send Reply</button>
                </div>
              </div>
            ) : (
              <div className="mt-2 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => setReplyingTo(msg.id)} className="text-xs text-blue-600 font-medium hover:underline">Reply</button>
                <button onClick={() => setMessages(prev => prev.filter(m => m.id !== msg.id))} className="text-xs text-gray-500 font-medium hover:underline">Dismiss</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
