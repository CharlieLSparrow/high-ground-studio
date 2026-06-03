"use client";

import React, { useState } from "react";
import { MessageSquare, Bug, Lightbulb, HelpCircle, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { createFeedbackAction } from "./actions";
import { FeedbackTicketType } from "@prisma/client";

interface Ticket {
  id: string;
  title: string;
  description: string;
  type: FeedbackTicketType;
  status: string;
  createdAt: Date;
}

export function FeedbackPortal({
  initialTickets,
  orgId,
}: {
  initialTickets: Ticket[];
  orgId?: string;
}) {
  const [tickets, setTickets] = useState<Ticket[]>(initialTickets);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<FeedbackTicketType>(FeedbackTicketType.BUG);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description) {
      setError("Please fill out all fields.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      const res = await createFeedbackAction(title, description, type);
      if (res.ok && res.ticket) {
        setTickets([res.ticket as Ticket, ...tickets]);
        setTitle("");
        setDescription("");
        setSuccess(true);
      } else {
        setError("Failed to submit feedback. Try again.");
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "RESOLVED":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "IN_PROGRESS":
        return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      case "CLOSED":
        return "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
      default:
        return "bg-sky-500/10 text-sky-400 border-sky-500/20";
    }
  };

  const getTypeIcon = (ticketType: FeedbackTicketType) => {
    switch (ticketType) {
      case FeedbackTicketType.BUG:
        return <Bug className="w-4 h-4 text-rose-400" />;
      case FeedbackTicketType.FEATURE_REQUEST:
        return <Lightbulb className="w-4 h-4 text-amber-400" />;
      default:
        return <HelpCircle className="w-4 h-4 text-sky-400" />;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      
      {/* Ticket Submission Form */}
      <div className="lg:col-span-1 bg-[#062d2a]/80 backdrop-blur-md border border-studio-line rounded-2xl p-6 shadow-studio-panel">
        <h3 className="text-lg font-bold text-studio-ink flex items-center gap-2 mb-4">
          <MessageSquare className="text-studio-tag" size={20} />
          Submit Feedback
        </h3>
        <p className="text-sm text-studio-muted mb-6">
          Spotted a bug or have a suggestion? Submit it directly to our core engineering queue.
        </p>

        {success && (
          <div className="mb-6 p-4 bg-emerald-500/15 border border-emerald-500/30 rounded-xl flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-emerald-200">Feedback Received!</p>
              <p className="text-xs text-emerald-300/80">Thank you. Your ticket has been logged in our internal tracker.</p>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-rose-500/15 border border-rose-500/30 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <p className="text-xs text-rose-200">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="feedback-type" className="text-xs font-bold uppercase tracking-wider text-studio-dim">
              Feedback Type
            </label>
            <select
              id="feedback-type"
              value={type}
              onChange={(e) => setType(e.target.value as FeedbackTicketType)}
              className="w-full bg-[#032321] border border-studio-line rounded-xl px-4 py-3 text-studio-ink focus:outline-none focus:ring-2 focus:ring-studio-tag/20 transition-all font-medium"
            >
              <option value="BUG">Bug Report</option>
              <option value="FEATURE_REQUEST">Feature Request</option>
              <option value="GENERAL">General Support / Question</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="feedback-title" className="text-xs font-bold uppercase tracking-wider text-studio-dim">
              Subject
            </label>
            <input
              id="feedback-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Video export fails at 99%"
              className="w-full bg-[#032321] border border-studio-line rounded-xl px-4 py-3 text-studio-ink focus:outline-none focus:ring-2 focus:ring-studio-tag/20 transition-all placeholder:text-studio-dim/40"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="feedback-desc" className="text-xs font-bold uppercase tracking-wider text-studio-dim">
              Description
            </label>
            <textarea
              id="feedback-desc"
              required
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide details of the bug, or explain the feature you would like to see..."
              className="w-full bg-[#032321] border border-studio-line rounded-xl px-4 py-3 text-studio-ink focus:outline-none focus:ring-2 focus:ring-studio-tag/20 transition-all placeholder:text-studio-dim/40 resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-studio-tag hover:bg-studio-tag/90 text-[#032321] font-black rounded-xl shadow-sm transition-all text-sm mt-2 disabled:opacity-50"
          >
            {loading ? "Submitting..." : "Submit Ticket"}
          </button>
        </form>
      </div>

      {/* Ticket History */}
      <div className="lg:col-span-2 flex flex-col gap-6">
        <div className="bg-[#032321] border border-studio-line rounded-2xl p-6 shadow-studio-panel flex-1">
          <h3 className="text-lg font-bold text-studio-ink mb-6 flex items-center gap-2">
            <Clock className="text-studio-tag" size={20} />
            Feedback & Support History
          </h3>

          <div className="flex flex-col gap-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
            {tickets.map((t) => (
              <div key={t.id} className="p-4 bg-[#062d2a]/50 border border-studio-line rounded-xl flex flex-col sm:flex-row justify-between items-start gap-4 hover:border-studio-line-strong transition-colors">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-[#032321] border border-studio-line w-fit">
                      {getTypeIcon(t.type)}
                    </span>
                    <span className="font-bold text-sm text-studio-ink">{t.title}</span>
                  </div>
                  <p className="text-xs text-studio-muted leading-relaxed pl-8">
                    {t.description}
                  </p>
                  <span className="text-[10px] text-studio-dim pl-8">
                    Submitted: {new Date(t.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-bold border rounded-full px-2.5 py-0.5 tracking-wider ${getStatusStyle(t.status)}`}>
                    {t.status}
                  </span>
                </div>
              </div>
            ))}

            {tickets.length === 0 && (
              <div className="text-center py-12 text-studio-dim italic text-sm">
                No tickets submitted yet. Any feedback or issues you report will show up here.
              </div>
            )}
          </div>
        </div>
      </div>
      
    </div>
  );
}
