import type { Metadata } from "next";
import { Inter, Merriweather } from "next/font/google";
import { auth } from "@/auth";
import "../globals.css";
import { SidebarLayout } from "@/components/SidebarLayout";
import { BetaAccessView } from "@/components/beta/BetaAccessView";
import { isUserManagementAdminEmail } from "@/lib/server/user-management";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const merriweather = Merriweather({ weight: ["300", "400", "700", "900"], subsets: ["latin"], variable: "--font-merriweather" });

export const metadata: Metadata = {
  title: "Quipsly.com",
  description: "Private semantic workbench for source-aware creative work.",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/quipsly-icon.svg", type: "image/svg+xml" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  robots: {
    index: false,
    follow: false,
  },
};

function NestSignInGate() {
  return (
    <main className="min-h-screen bg-[#fdf6ea] px-5 py-10 text-[#3d2a1e]">
      <section className="mx-auto flex min-h-[76vh] max-w-4xl flex-col justify-center rounded-[36px] border border-[#ead8ba] bg-white/90 p-8 shadow-2xl shadow-amber-950/10 md:p-12">
        <p className="text-xs font-black uppercase tracking-[0.32em] text-[#a96735]">
          Quipsly Nest
        </p>
        <h1 className="mt-5 font-serif text-5xl font-black leading-tight tracking-tight md:text-6xl">
          Your private creative workspace lives here.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-[#6f5a43]">
          Nest is the app side of Quipsly: writing documents, study documents, media production, research packets, and publishing workflows. Sign in to open your Nests.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href="/api/auth/signin?callbackUrl=/projects"
            className="rounded-full bg-[#3d2a1e] px-6 py-3 text-sm font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-amber-950/20"
          >
            Sign in to Nest
          </a>
          <a
            href="https://quipsly.com/support"
            className="rounded-full border border-[#ffc0c5] bg-[#fff1f2] px-6 py-3 text-sm font-black uppercase tracking-[0.18em] text-[#a32631]"
          >
            Support beta access
          </a>
          <a
            href="https://quipsly.com/"
            className="rounded-full border border-[#d7bd91] bg-[#fff8ec] px-6 py-3 text-sm font-black uppercase tracking-[0.18em] text-[#7b512d]"
          >
            Visit Quipsly.com
          </a>
        </div>
        <p className="mt-8 max-w-2xl text-sm leading-6 text-[#8b765f]">
          If you expected a public article or marketing page, it belongs on Quipsly.com. If you expected your editor, recorder, or project hub, you are in the right place.
        </p>
      </section>
    </main>
  );
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  const ownerOverride = process.env.QUIPSLY_OWNER_OVERRIDE === "true";
  const actorEmail = session?.user?.primaryEmail || session?.user?.email || null;
  const isAdminBypass = isUserManagementAdminEmail(actorEmail);

  // If they aren't logged in, redirect to the marketing/login page
  if (!session?.user && !ownerOverride) {
    return (
      <html lang="en" className={`${inter.variable} ${merriweather.variable}`}>
        <body className="font-sans bg-[#fdfaf6] antialiased">
          <NestSignInGate />
        </body>
      </html>
    );
  }

  // If they are logged in but don't have beta access, show the pending state
  if (!ownerOverride && !isAdminBypass && !(session?.user as any).hasBetaAccess) {
    return (
      <html lang="en" className={`${inter.variable} ${merriweather.variable}`}>
        <body className="font-sans bg-[#fdfaf6] antialiased">
          <BetaAccessView email={session?.user?.email || "supporter@example.com"} />
        </body>
      </html>
    );
  }

  return (
    <html lang="en" className={`${inter.variable} ${merriweather.variable}`}>
        <body className="font-sans bg-[#050505] text-studio-ink antialiased">
        <SidebarLayout
          showAdminTools={isAdminBypass}
          currentUser={
            session?.user
              ? {
                  email: session.user.primaryEmail || session.user.email || "",
                  name: session.user.name || null,
                  image: session.user.image || null,
                  isStaff: Boolean(session.user.isStaff),
                  hasBetaAccess: Boolean((session.user as any).hasBetaAccess),
                }
              : null
          }
        >
          {children}
        </SidebarLayout>
      </body>
    </html>
  );
}
