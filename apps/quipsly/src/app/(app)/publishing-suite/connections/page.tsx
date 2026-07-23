import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import { connectTwitterAction, connectYouTubeAction } from "./actions";

export default async function ConnectionsPage() {
  const session = await auth();
  
  if (!session?.user?.id) {
    return (
      <div className="p-8 max-w-3xl mx-auto text-center">
        <p className="text-xl text-[#8c6b4a]">Please log in to manage your connections.</p>
      </div>
    );
  }

  const userId = session.user.id;
  const prisma = getPrismaClient();
  const accounts = await prisma.socialAccount.findMany({
    where: { userId },
  });

  const twitterAccounts = accounts.filter((a) => a.platform === "twitter");
  const youtubeAccounts = accounts.filter((a) => a.platform === "youtube");

  return (
    <div className="p-8 max-w-4xl mx-auto h-full">
      <div className="mb-10">
        <h1 className="text-3xl font-black text-[#3d3122] tracking-tight mb-2">
          Publishing Channels
        </h1>
        <p className="text-[#8c6b4a]">
          Securely link your social profiles so Quipsly can schedule and publish your packages automatically. You can connect multiple channels of the same platform.
        </p>
      </div>

      <div className="space-y-6">
        {/* Twitter Card */}
        <div className="bg-white rounded-2xl p-6 border border-[#e8dcc4] shadow-sm flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500">
                <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#3d3122]">X (Twitter)</h2>
              <p className="text-sm text-[#8c6b4a] mb-4">Allow Quipsly to publish tweets and threads on your behalf.</p>
              
              {twitterAccounts.length > 0 && (
                <div className="flex flex-col gap-2 mb-4">
                  {twitterAccounts.map((account) => (
                    <div key={account.id} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200 w-max">
                      <span className="text-sm font-medium text-gray-700">@{account.handle}</span>
                      <span className="flex w-2 h-2 rounded-full bg-green-500 ml-2" title="Connected"></span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="shrink-0 mt-1">
            <form action={connectTwitterAction}>
              <button
                type="submit"
                className="px-6 py-2 rounded-lg bg-[#3d3122] text-white font-bold text-sm hover:bg-[#5e4b33] transition-colors whitespace-nowrap"
              >
                {twitterAccounts.length > 0 ? "Connect Another" : "Connect Twitter"}
              </button>
            </form>
          </div>
        </div>

        {/* YouTube Card */}
        <div className="bg-white rounded-2xl p-6 border border-[#e8dcc4] shadow-sm flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600">
                <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
                <path d="m10 15 5-3-5-3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#3d3122]">YouTube</h2>
              <p className="text-sm text-[#8c6b4a] mb-4">Allow Quipsly to upload and publish videos to your channel.</p>
              
              {youtubeAccounts.length > 0 && (
                <div className="flex flex-col gap-2 mb-4">
                  {youtubeAccounts.map((account) => (
                    <div key={account.id} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200 w-max">
                      <span className="text-sm font-medium text-gray-700">{account.handle}</span>
                      <span className="flex w-2 h-2 rounded-full bg-green-500 ml-2" title="Connected"></span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="shrink-0 mt-1">
            <form action={connectYouTubeAction}>
              <button
                type="submit"
                className="px-6 py-2 rounded-lg bg-[#3d3122] text-white font-bold text-sm hover:bg-[#5e4b33] transition-colors whitespace-nowrap"
              >
                {youtubeAccounts.length > 0 ? "Connect Another" : "Connect YouTube"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
