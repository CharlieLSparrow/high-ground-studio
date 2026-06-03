"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  Search, 
  PenTool, 
  Rocket, 
  Settings,
  Bell
} from "lucide-react";
import { cn } from "../app/studio-ui";

const navItems = [
  { name: "The Nest", href: "/dashboard", icon: LayoutDashboard },
  { name: "Research", href: "/research", icon: Search },
  { name: "Studio", href: "/create", icon: PenTool },
  { name: "Publishing", href: "/publishing", icon: Rocket },
];

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-screen w-full bg-[#fdfaf6] overflow-hidden text-[#3d3122] font-sans">
      {/* Sleek Top Header */}
      <header className="h-[60px] shrink-0 border-b border-[#e8dcc4] px-6 flex items-center justify-between bg-[#fdfaf6]/90 backdrop-blur-md relative z-20">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden mix-blend-multiply bg-[#f8f3e6]">
              <img src="/quipsly.png" alt="Quipsly Character" className="w-full h-full object-cover scale-[1.35]" />
            </div>
            <span className="font-bold text-lg tracking-wide text-[#3d3122]">Quipsly</span>
          </div>

          <nav className="flex items-center gap-2">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link 
                  key={item.href} 
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-sm font-semibold",
                    isActive 
                      ? "bg-[#8c6b4a] text-white shadow-sm" 
                      : "text-[#5e4b33] hover:text-[#3d3122] hover:bg-[#ebdcc8]"
                  )}
                >
                  <item.icon className={cn("w-4 h-4", isActive ? "text-amber-100" : "text-[#8c6b4a]")} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8c6b4a]" />
            <input 
              type="text" 
              placeholder="Search assets..." 
              className="w-full bg-white border border-[#e8dcc4] rounded-full py-1.5 pl-9 pr-4 text-sm text-[#3d3122] placeholder:text-[#8c6b4a]/70 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/50 transition-all shadow-sm"
            />
          </div>
          <button className="relative p-2 rounded-full hover:bg-[#ebdcc8] text-[#8c6b4a] hover:text-[#3d3122] transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-500 rounded-full border border-[#fdfaf6]" />
          </button>
          <button className="relative p-2 rounded-full hover:bg-[#ebdcc8] text-[#8c6b4a] hover:text-[#3d3122] transition-colors">
            <Settings className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 rounded-full bg-[#ebdcc8] border border-white shadow-sm overflow-hidden cursor-pointer">
            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=QuipslyUser" alt="User" className="w-full h-full object-cover" />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 min-h-0 relative z-10 overflow-hidden bg-[#fdfaf6]">
        {/* Soft sunlight glow background */}
        <div className="absolute top-0 left-0 w-full h-64 bg-amber-100/30 blur-[100px] pointer-events-none" />
        
        <div className="h-full overflow-y-auto custom-scrollbar p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
