import Editor from "@/components/Editor";

function getCollabUrl() {
  const configured = (
    process.env.NEXT_PUBLIC_STUDIO_COLLAB_URL ||
    process.env.STUDIO_COLLAB_URL ||
    ""
  ).trim();

  if (configured) {
    return configured;
  }

  return process.env.NODE_ENV === "production" ? "" : "ws://localhost:8789";
}

export default async function ManuscriptRoomPage({
  params,
}: {
  params: Promise<{ roomName: string }>;
}) {
  const { roomName } = await params;
  
  // In a real app, you would fetch user session and auth token here
  const token = "demo-jwt-token-replace-me"; // This would come from next-auth/cookies
  const userName = "Writer_" + Math.floor(Math.random() * 1000);
  const userColor = "#" + Math.floor(Math.random() * 16777215).toString(16);

  return (
    <div className="flex h-screen w-full bg-neutral-50 dark:bg-neutral-950 overflow-hidden">
      {/* Main Infinite Canvas */}
      <main className="flex-1 overflow-y-auto p-4 md:p-12 relative flex justify-center">
        <div className="w-full max-w-4xl pb-64">
          <header className="mb-8">
            <h1 className="text-4xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">
              {roomName.replace(/-/g, " ")}
            </h1>
            <p className="text-sm text-neutral-500">
              Live Collaboration Room • {userName}
            </p>
          </header>
          
          <Editor 
            roomName={roomName} 
            token={token} 
            collabUrl={getCollabUrl()}
            userName={userName} 
            userColor={userColor} 
          />
        </div>
      </main>

      {/* Right Sidebar - Collections & Snippets */}
      <aside className="w-80 border-l border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex flex-col hidden lg:flex">
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
            Studio Library
          </h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Active Collections */}
          <section>
            <h3 className="text-xs font-semibold text-neutral-400 mb-3 flex justify-between items-center">
              Active Collections
              <button className="text-blue-500 hover:text-blue-600">+</button>
            </h3>
            <ul className="space-y-2">
              <li className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 px-3 py-2 rounded-md cursor-pointer">
                <span className="text-blue-500">📁</span> Book Quotes (Q3)
              </li>
              <li className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 px-3 py-2 rounded-md cursor-pointer">
                <span className="text-green-500">📁</span> High Ground Odyssey Ideas
              </li>
            </ul>
          </section>

          {/* Recent Snippets */}
          <section>
            <h3 className="text-xs font-semibold text-neutral-400 mb-3">Recent Snippets</h3>
            <div className="space-y-3">
              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900/50 rounded-md text-sm cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-900/40 transition-colors">
                "The only way out is through the suffering."
                <div className="text-xs text-neutral-500 mt-2">— Found in 'Meditations'</div>
              </div>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
