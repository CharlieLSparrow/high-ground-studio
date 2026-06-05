export function DashboardSkeleton() {
  return (
    <div className="p-8 max-w-6xl mx-auto h-full flex flex-col animate-pulse">
      <div className="h-10 w-64 bg-gray-200 rounded-lg mb-2"></div>
      <div className="h-4 w-96 bg-gray-100 rounded-lg mb-8"></div>
      
      <div className="grid grid-cols-4 gap-6 mb-8">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex justify-between items-start mb-4">
               <div className="h-3 w-24 bg-gray-200 rounded"></div>
               <div className="w-8 h-8 rounded-full bg-gray-100"></div>
            </div>
            <div className="h-8 w-20 bg-gray-200 rounded mb-2"></div>
            <div className="h-3 w-32 bg-gray-100 rounded"></div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-8 flex-1 min-h-0">
        <div className="col-span-7 bg-white rounded-2xl border border-gray-100 p-5">
           <div className="h-6 w-48 bg-gray-200 rounded mb-6"></div>
           <div className="space-y-4">
             {[1, 2, 3].map(i => (
               <div key={i} className="h-24 w-full bg-gray-50 rounded-xl"></div>
             ))}
           </div>
        </div>
        <div className="col-span-5 bg-white rounded-2xl border border-gray-100 p-5">
           <div className="h-6 w-48 bg-gray-200 rounded mb-6"></div>
           <div className="space-y-4">
             {[1, 2].map(i => (
               <div key={i} className="h-32 w-full bg-gray-50 rounded-xl"></div>
             ))}
           </div>
        </div>
      </div>
    </div>
  );
}

export function ContentBlockSkeleton() {
  return (
    <div className="animate-pulse space-y-4 w-full">
      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
      <div className="h-4 bg-gray-100 rounded w-full"></div>
      <div className="h-4 bg-gray-100 rounded w-5/6"></div>
    </div>
  );
}
