import { getAdminInboxStats, getRecentInboxEvents, getRecentReconciliations } from "./actions";
import { ProviderEventInbox } from "@/components/admin/ProviderEventInbox";
import { ReconciliationLedger } from "@/components/admin/ReconciliationLedger";
import { Database, RefreshCcw } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PatreonAdminDashboard() {
  const [stats, events, reconciliations] = await Promise.all([
    getAdminInboxStats(),
    getRecentInboxEvents(),
    getRecentReconciliations(),
  ]);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Database className="h-6 w-6 text-sky-500" />
            Entitlement Subsystem
          </h1>
          <p className="text-slate-500 mt-1">Monitor the decoupled webhook inbox and reconciliation engine.</p>
        </div>
        <button className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-800 transition-colors">
          <RefreshCcw className="h-4 w-4" />
          Run Worker Sync
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6 mb-8">
        <StatCard title="Unprocessed Webhooks" value={stats.inbox.unprocessed} color="amber" />
        <StatCard title="Processed Webhooks" value={stats.inbox.processed} color="emerald" />
        <StatCard title="Pending Reconciliations" value={stats.reconciliations.pending} color="sky" />
      </div>

      <div className="grid grid-cols-2 gap-8">
        <div>
          <h2 className="text-lg font-bold text-slate-800 mb-4">1. The Inbox (Signal)</h2>
          <ProviderEventInbox events={events} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-800 mb-4">2. The Ledger (State)</h2>
          <ReconciliationLedger reconciliations={reconciliations} />
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, color }: { title: string, value: number, color: "amber" | "emerald" | "sky" }) {
  const colorMap = {
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    sky: "bg-sky-50 text-sky-700 border-sky-200"
  };
  
  return (
    <div className={`rounded-xl border p-5 ${colorMap[color]}`}>
      <div className="text-sm font-semibold mb-1 opacity-80">{title}</div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  );
}
