"use client";

import { CompanySupportRequest } from "@prisma/client";
import { formatDistanceToNow } from "date-fns";
import { UserCheck, Check } from "lucide-react";
import { useState } from "react";
import { grantManualOverride } from "@/app/(app)/admin/patreon/actions";

export function ManualReviewInbox({ requests }: { requests: CompanySupportRequest[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <UserCheck className="h-4 w-4 text-slate-500" />
          Manual Review Requests
        </h3>
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Overrides</span>
      </div>
      
      <div className="divide-y divide-slate-100">
        {requests.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No pending manual review requests.</div>
        ) : requests.map((req) => (
          <ReviewRequestRow key={req.id} request={req} />
        ))}
      </div>
    </div>
  );
}

function ReviewRequestRow({ request }: { request: CompanySupportRequest }) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  
  const handleGrant = async () => {
    setStatus("loading");
    try {
      const res = await grantManualOverride(request.email, request.id);
      if (res.error) throw new Error(res.error);
      setStatus("success");
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  };

  return (
    <div className="p-4 hover:bg-slate-50 transition-colors flex justify-between items-center">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="font-bold text-sm text-slate-800">{request.name}</span>
          <span className="text-xs text-slate-400">
            {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
          </span>
        </div>
        <div className="text-sm font-mono text-slate-600">
          {request.email}
        </div>
        {request.note && (
          <div className="mt-1 text-xs text-slate-500 italic">
            {request.note}
          </div>
        )}
      </div>
      
      <div>
        <button
          onClick={handleGrant}
          disabled={status !== "idle"}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
            status === "success" 
              ? "bg-emerald-100 text-emerald-700 cursor-not-allowed"
              : status === "error"
              ? "bg-red-100 text-red-700"
              : "bg-slate-900 text-white hover:bg-slate-800"
          }`}
        >
          {status === "success" ? (
             <><Check className="h-3 w-3" /> Granted Override</>
          ) : status === "loading" ? (
            "Processing..."
          ) : status === "error" ? (
            "Failed. Retry?"
          ) : (
            "Grant Override"
          )}
        </button>
      </div>
    </div>
  );
}
