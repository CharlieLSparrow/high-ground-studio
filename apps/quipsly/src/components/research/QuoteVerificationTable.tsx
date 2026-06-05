"use client";

import React, { useState, useMemo } from "react";
import { 
  useReactTable, 
  getCoreRowModel, 
  getSortedRowModel, 
  getFilteredRowModel,
  getPaginationRowModel,
  getExpandedRowModel,
  flexRender,
  ColumnDef,
  SortingState
} from "@tanstack/react-table";
import { CheckCircle2, AlertTriangle, Clock, XCircle, ChevronRight, ChevronDown, FileText, User, Hash, MoreHorizontal } from "lucide-react";

type QuoteData = {
  id: string;
  text: string;
  author: string;
  source: string;
  status: "verified" | "pending" | "disputed" | "rejected";
  date: string;
  confidence: number;
  notes?: string;
};

// Generate deterministic mock data
const MOCK_DATA: QuoteData[] = Array.from({ length: 150 }).map((_, i) => ({
  id: `QT-${1000 + i}`,
  text: i % 3 === 0 
    ? "The only way to deal with an unfree world is to become so absolutely free that your very existence is an act of rebellion."
    : i % 2 === 0 
    ? "I rebel; therefore I exist."
    : "In the depth of winter, I finally learned that within me there lay an invincible summer.",
  author: "Albert Camus",
  source: i % 2 === 0 ? "The Rebel" : "Return to Tipasa",
  status: i % 5 === 0 ? "verified" : i % 4 === 0 ? "disputed" : i % 3 === 0 ? "rejected" : "pending",
  date: new Date(Date.now() - (i * 10000000)).toLocaleDateString(),
  confidence: 100 - (i % 50),
  notes: i % 4 === 0 ? "Needs additional translator verification. French original has nuances." : undefined
}));

export function QuoteVerificationTable() {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const data = useMemo(() => {
    if (statusFilter === "all") return MOCK_DATA;
    return MOCK_DATA.filter(item => item.status === statusFilter);
  }, [statusFilter]);

  const columns = useMemo<ColumnDef<QuoteData>[]>(
    () => [
      {
        id: "expander",
        header: () => null,
        cell: ({ row }) => (
          <button
            {...{
              onClick: row.getToggleExpandedHandler(),
              style: { cursor: 'pointer' },
            }}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500"
            aria-label={row.getIsExpanded() ? "Collapse row" : "Expand row"}
          >
            {row.getIsExpanded() ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        ),
        size: 40,
      },
      {
        accessorKey: "id",
        header: "ID",
        cell: info => <span className="text-zinc-500 font-mono text-xs">{info.getValue<string>()}</span>,
        size: 80,
      },
      {
        accessorKey: "text",
        header: "Quote Extract",
        cell: info => (
          <div className="flex items-start gap-2">
            <FileText size={14} className="text-zinc-600 mt-1 shrink-0" />
            <span className="line-clamp-2 text-zinc-200">{info.getValue<string>()}</span>
          </div>
        ),
        size: 400,
      },
      {
        accessorKey: "author",
        header: "Author",
        cell: info => (
          <div className="flex items-center gap-2 text-zinc-300">
            <User size={12} className="text-zinc-600 shrink-0" />
            <span className="truncate">{info.getValue<string>()}</span>
          </div>
        ),
        size: 150,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: info => <StatusBadge status={info.getValue<string>()} />,
        size: 120,
      },
      {
        accessorKey: "confidence",
        header: "Conf.",
        cell: info => {
          const val = info.getValue<number>();
          return (
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-10 bg-zinc-800 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full ${
                    val > 80 ? 'bg-emerald-500' : val > 50 ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${val}%` }}
                />
              </div>
              <span className="text-xs text-zinc-500 font-mono">{val}%</span>
            </div>
          );
        },
        size: 100,
      },
      {
        id: "actions",
        header: () => null,
        cell: () => (
          <button className="p-1.5 text-zinc-500 hover:text-amber-500 hover:bg-zinc-800 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500" aria-label="More actions">
            <MoreHorizontal size={16} />
          </button>
        ),
        size: 40,
      }
    ],
    []
  );

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    initialState: {
      pagination: { pageSize: 15 }
    }
  });

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Header and Controls */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-zinc-100 tracking-tight">Verification Queue</h2>
          <p className="text-zinc-400 mt-1">Review, verify, and resolve quote provenance across manuscripts.</p>
        </div>
        <div className="flex items-center gap-4">
          <input
            value={globalFilter ?? ""}
            onChange={e => setGlobalFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-amber-500"
            placeholder="Search all columns..."
            aria-label="Search all columns"
          />
          <div className="flex bg-zinc-900 border border-zinc-800 rounded-lg p-1">
            {["all", "pending", "verified", "disputed", "rejected"].map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1 rounded text-xs font-medium capitalize transition-all focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                  statusFilter === f 
                    ? "bg-zinc-800 text-amber-500 shadow-sm" 
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
                aria-pressed={statusFilter === f}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="flex-1 bg-zinc-900/50 border border-zinc-800 rounded-xl flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm text-left border-collapse" role="grid">
            <thead className="bg-zinc-900/80 sticky top-0 z-10 backdrop-blur-sm border-b border-zinc-800 shadow-sm">
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <th 
                      key={header.id} 
                      style={{ width: header.getSize() }}
                      className="px-4 py-3 font-semibold text-zinc-500 uppercase tracking-wider text-xs whitespace-nowrap"
                    >
                      {header.isPlaceholder ? null : (
                        <div
                          className={`flex items-center gap-2 ${header.column.getCanSort() ? 'cursor-pointer hover:text-zinc-300 select-none' : ''}`}
                          onClick={header.column.getToggleSortingHandler()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              header.column.getToggleSortingHandler()?.(e);
                            }
                          }}
                          tabIndex={header.column.getCanSort() ? 0 : undefined}
                          role={header.column.getCanSort() ? "button" : undefined}
                          aria-label={header.column.getCanSort() ? `Sort by ${header.column.id}` : undefined}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                          {{
                            asc: ' ↑',
                            desc: ' ↓',
                          }[header.column.getIsSorted() as string] ?? null}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {table.getRowModel().rows.map(row => (
                <React.Fragment key={row.id}>
                  <tr 
                    className="hover:bg-zinc-800/30 transition-colors group"
                    role="row"
                    aria-expanded={row.getIsExpanded()}
                  >
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} className="px-4 py-3 align-top">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                  {row.getIsExpanded() && (
                    <tr className="bg-zinc-900/80 border-b border-zinc-800">
                      <td colSpan={row.getVisibleCells().length} className="px-10 py-4">
                        <div className="flex gap-6">
                          <div className="flex-1 space-y-2">
                            <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Full Quote Text</h4>
                            <p className="text-sm text-zinc-200 leading-relaxed font-serif">
                              "{row.original.text}"
                            </p>
                          </div>
                          <div className="w-1/3 space-y-2 border-l border-zinc-800 pl-6">
                            <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Internal Notes</h4>
                            <p className="text-sm text-amber-500/80">
                              {row.original.notes || "No internal notes attached to this extraction."}
                            </p>
                            <div className="pt-2 flex gap-2">
                              <button className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-xs rounded transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-zinc-900">
                                Verify & Publish
                              </button>
                              <button className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-xs rounded transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500">
                                View Manuscript
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {table.getRowModel().rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-8 text-center text-zinc-500">
                    No results found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Controls */}
        <div className="p-3 border-t border-zinc-800 bg-zinc-900 flex items-center justify-between text-sm">
          <div className="text-zinc-500">
            Showing <span className="text-zinc-300 font-medium">{table.getRowModel().rows.length}</span> of <span className="text-zinc-300 font-medium">{table.getPrePaginationRowModel().rows.length}</span> results
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="px-3 py-1.5 border border-zinc-700 rounded bg-zinc-800 text-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-700 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500"
              aria-label="Previous page"
            >
              Previous
            </button>
            <span className="text-zinc-400 px-2">
              Page <strong className="text-zinc-200">{table.getState().pagination.pageIndex + 1}</strong> of{' '}
              {table.getPageCount()}
            </span>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="px-3 py-1.5 border border-zinc-700 rounded bg-zinc-800 text-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-700 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500"
              aria-label="Next page"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { LucideIcon } from "lucide-react";

const STATUS_CONFIG: Record<string, { icon: LucideIcon, color: string }> = {
  verified: { icon: CheckCircle2, color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
  pending: { icon: Clock, color: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
  disputed: { icon: AlertTriangle, color: "text-orange-400 bg-orange-400/10 border-orange-400/20" },
  rejected: { icon: XCircle, color: "text-red-400 bg-red-400/10 border-red-400/20" },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending;

  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${config.color}`}>
      <Icon size={10} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
