"use client";

import { useState } from "react";
import { StudioNav } from "../../studio-nav";
import { BookOpen, ChevronRight, ChevronDown, Book, Users2, Library } from "lucide-react";
import { cn, panelClassName, labelClassName, StudioChip } from "../../studio-ui";

export function SeriesClient({ initialSeries }: { initialSeries: any[] }) {
  const [expandedSeries, setExpandedSeries] = useState<string | null>(null);

  const toggleSeries = (id: string) => {
    setExpandedSeries(expandedSeries === id ? null : id);
  };

  const totalBooks = initialSeries.reduce((acc, s) => acc + s.books.length, 0);

  return (
    <div className="w-full h-full flex flex-col bg-[#fdfaf6] overflow-y-auto min-h-screen p-3.5 md:p-6 gap-[18px]">
      
      {/* Header */}
      <header
        className={cn(
          panelClassName,
          "flex min-h-[72px] flex-col items-stretch justify-between gap-[18px] px-[18px] py-4 lg:flex-row lg:items-center",
        )}
      >
        <div className="flex min-w-0 flex-col items-stretch gap-3.5 sm:flex-row sm:items-center">
          <div className="w-12 h-12 bg-[#8c6b4a]/10 rounded-xl flex items-center justify-center border border-[#8c6b4a]/30">
            <Library className="text-[#8c6b4a]" size={24} />
          </div>
          <div>
            <h1 className="m-0 text-[1.75rem] leading-[1.08] tracking-normal text-[#3d3122] max-sm:text-[1.45rem]">
              Series Bible
            </h1>
            <p className="mt-1.5 mb-0 max-w-[760px] text-[0.94rem] leading-relaxed text-[#8c6b4a]">
              The Thornfield Files — {initialSeries.length} Sub-Series, {totalBooks} Books
            </p>
          </div>
        </div>

        <div className="flex flex-wrap justify-start gap-2 lg:justify-end items-center">
          <StudioNav />
          <StudioChip tone="source">Romance Lab</StudioChip>
        </div>
      </header>

      {/* Main Grid */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {initialSeries.map((series) => {
          const isExpanded = expandedSeries === series.id;

          return (
            <div key={series.id} className="bg-white border border-[#e8dcc4] rounded-2xl shadow-sm flex flex-col overflow-hidden hover:border-[#8c6b4a] transition-all">
              {/* Card Header (Clickable) */}
              <div 
                className="p-6 cursor-pointer flex justify-between items-start group"
                onClick={() => toggleSeries(series.id)}
              >
                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#f8f3e6] flex items-center justify-center text-2xl border border-[#e8dcc4]">
                    {series.icon}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-[#3d3122]">{series.title}</h3>
                    <p className="text-[#8c6b4a] text-sm mt-1">{series.description}</p>
                    <div className="flex gap-2 mt-2">
                      <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Book size={12} /> {series.books.length} Books
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-[#d4c1a0] group-hover:text-amber-600 transition-colors">
                  {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                </div>
              </div>

              {/* Expandable Book List */}
              {isExpanded && (
                <div className="border-t border-[#e8dcc4] bg-[#fdfaf6] p-4 flex flex-col gap-3">
                  {series.books.length === 0 ? (
                    <p className="text-sm text-[#8c6b4a] italic text-center py-4">No books drafted yet.</p>
                  ) : (
                    series.books.map((book: any) => {
                      const tropes = JSON.parse(book.tropesJson || "[]");
                      const leads = JSON.parse(book.leadsJson || "[]");

                      return (
                        <div key={book.id} className="bg-white border border-[#e8dcc4] rounded-xl p-3 shadow-sm">
                          <h4 className="font-bold text-[#3d3122] text-sm">#{book.bookNumber}: {book.title}</h4>
                          
                          <div className="flex items-center gap-1 mt-2 text-xs text-[#8c6b4a]">
                            <Users2 size={12} /> {leads.join(" & ") || "TBD"}
                          </div>

                          <div className="flex flex-wrap gap-1 mt-2">
                            {tropes.map((trope: string, i: number) => (
                              <span key={i} className="text-[10px] font-bold text-[#8c6b4a] bg-[#f8f3e6] px-1.5 py-0.5 rounded">
                                {trope}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <button className="w-full py-2.5 mt-2 border-2 border-dashed border-[#d4c1a0] text-[#8c6b4a] font-bold text-xs rounded-xl hover:bg-[#f8f3e6] hover:border-[#8c6b4a] transition-all">
                    + Add Book
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
}
