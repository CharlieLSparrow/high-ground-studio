"use client";

import { MembershipReconciliation, Membership, User } from "@prisma/client";
import { formatDistanceToNow } from "date-fns";
import { ShieldCheck, UserCircle, Zap } from "lucide-react";

type ReconciliationWithRelations = MembershipReconciliation & {
  membership?: (Membership & { user: User }) | null;
};

export function ReconciliationLedger({ reconciliations }: { reconciliations: ReconciliationWithRelations[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-slate-500" />
          Reconciliation Ledger
        </h3>
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Access Gating</span>
      </div>
      
      <div className="divide-y divide-slate-100">
        {reconciliations.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No reconciliations pending.</div>
        ) : reconciliations.map((recon) => (
          <div key={recon.id} className="p-4 hover:bg-slate-50 transition-colors">
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                <span className={`font-bold text-xs uppercase px-2 py-0.5 rounded ${
                  recon.action === "grant" ? "bg-emerald-100 text-emerald-700" : 
                  recon.action === "revoke" ? "bg-red-100 text-red-700" : 
                  "bg-blue-100 text-blue-700"
                }`}>
                  {recon.action} {recon.proposedTier}
                </span>
                <span className="text-xs text-slate-400">
                  {formatDistanceToNow(new Date(recon.createdAt), { addSuffix: true })}
                </span>
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${
                recon.status === "applied" ? "text-emerald-500" : 
                recon.status === "failed" ? "text-red-500" : "text-amber-500"
              }`}>
                {recon.status}
              </span>
            </div>
            
            <div className="mt-3 flex items-center gap-2 text-sm">
              <UserCircle className="h-4 w-4 text-slate-400" />
              <span className="font-medium text-slate-700">{recon.providerEmail}</span>
            </div>
            
            {recon.membership && (
              <div className="mt-2 text-xs text-slate-500 flex items-center gap-1 bg-slate-100 px-2 py-1 rounded inline-flex">
                <Zap className="h-3 w-3 text-sky-500" />
                Linked to User: {recon.membership.user.primaryEmail} (Current Plan: {recon.membership.planId})
              </div>
            )}
            
            {recon.note && (
              <p className="mt-2 text-xs text-slate-500 italic border-l-2 border-slate-200 pl-2">
                {recon.note}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
