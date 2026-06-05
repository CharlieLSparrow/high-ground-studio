"use client";

import React, { useState } from "react";
import { Lock, Clock, ShieldCheck, LogOut, ArrowRight, UserCheck } from "lucide-react";
import Link from "next/link";
import { requestManualReview } from "./actions";

export function BetaAccessView({ email }: { email: string }) {
  const [reviewStatus, setReviewStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [reviewMessage, setReviewMessage] = useState("");

  const handleManualReview = async () => {
    setReviewStatus("loading");
    const result = await requestManualReview();
    if (result.error) {
      setReviewStatus("error");
      setReviewMessage(result.error);
    } else {
      setReviewStatus("success");
      setReviewMessage(result.message || "Review requested successfully.");
    }
  };
  return (
    <div className="min-h-screen bg-[#fdfaf6] flex items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full bg-white rounded-[2rem] border border-[#e8dcc4] p-8 shadow-xl relative overflow-hidden">
        {/* Soft background accents */}
        <div className="absolute -top-20 -right-20 w-48 h-48 bg-amber-100/50 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-emerald-100/50 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-6">
          <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center border border-amber-200 shadow-sm mx-auto">
            <Lock className="w-8 h-8 text-amber-700" />
          </div>

          <div className="text-center space-y-2">
            <h1 className="text-2xl font-black text-[#3d3122] tracking-tight font-serif">Supporter Connected</h1>
            <p className="text-sm font-bold text-[#8a7659]">{email}</p>
          </div>

          <div className="bg-[#fffaf3] border border-[#eadfca] rounded-2xl p-5 space-y-4">
            <div className="flex gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-[#342618]">1. Authenticated</p>
                <p className="text-xs text-[#6b5b45] mt-1 leading-relaxed">
                  You successfully signed in. Your identity is verified.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-[#342618]">2. Pending Reconciliation</p>
                <p className="text-xs text-[#6b5b45] mt-1 leading-relaxed">
                  We are checking our app-owned membership records. If you just pledged on Patreon, our webhooks might take a few minutes to process your event and grant beta access.
                </p>
              </div>
            </div>
          </div>

          <div className="text-center">
            <p className="text-xs text-[#8a7659] leading-relaxed">
              Quipsly manages access via internal Entitlements, not directly through Patreon. This protects your data if provider connections ever drop.
            </p>
          </div>

          <div className="pt-4 flex flex-col gap-3">
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 rounded-xl bg-[#3d3122] hover:bg-[#2a2218] text-white font-bold text-sm shadow-sm transition-colors flex items-center justify-center gap-2"
            >
              Refresh Access Status <ArrowRight className="w-4 h-4" />
            </button>

            {reviewStatus !== "success" ? (
              <button 
                onClick={handleManualReview}
                disabled={reviewStatus === "loading"}
                className="w-full py-3 rounded-xl bg-[#fdfaf6] hover:bg-[#f5ebd9] border border-[#e8dcc4] text-[#8a7659] font-bold text-sm shadow-sm transition-colors flex items-center justify-center gap-2"
              >
                <UserCheck className="w-4 h-4" /> {reviewStatus === "loading" ? "Requesting..." : "Request Manual Review"}
              </button>
            ) : (
              <div className="w-full py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-sm text-center shadow-sm">
                {reviewMessage}
              </div>
            )}
            {reviewStatus === "error" && (
              <p className="text-xs text-red-500 text-center">{reviewMessage}</p>
            )}

            <Link 
              href="/api/auth/signout"
              className="w-full py-3 rounded-xl bg-white hover:bg-slate-50 border border-[#e8dcc4] text-[#6b5b45] font-bold text-sm shadow-sm transition-colors flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" /> Sign Out
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
