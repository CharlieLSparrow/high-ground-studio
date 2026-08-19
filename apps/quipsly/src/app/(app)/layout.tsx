import type { Metadata } from "next";
import { Inter, Merriweather } from "next/font/google";
import { getQuipslySession } from "@/lib/server/quipsly-session";
import "../globals.css";
import { SidebarLayout } from "@/components/SidebarLayout";
import { LiveSessionDockProvider } from "@/components/live-session-dock";
import { BetaAccessView } from "@/components/beta/BetaAccessView";
import { isUserManagementAdminEmail } from "@/lib/server/user-management";
import { canAccessStudio } from "@/lib/studio-authz";
import { MAC_WEB_SESSION_COOKIE_NAME, verifyMacWebSessionToken } from "@/lib/server/mac-session-token";
import { cookies } from "next/headers";
import { hasAnyActiveStudioProjectAccessGrantForEmail } from "@/lib/server/studio-project-access";
import { Providers } from "@/app/providers";
import { NestSignInGate } from "@/components/nest-sign-in-gate";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getQuipslySession();
  const cookieStore = await cookies();
  const actorEmail =
    session?.user?.primaryEmail
    || session?.user?.email
    || null;
  const actorRoles = session?.user?.roles || [];
  const isAdminBypass = isUserManagementAdminEmail(actorEmail);
  const showAdminTools =
    isAdminBypass || actorRoles.includes("OWNER");
  const hasProjectAccessGrant = await hasAnyActiveStudioProjectAccessGrantForEmail(actorEmail);
  const hasAccess =
    isAdminBypass
    || Boolean(session?.user && (session.user as any).hasBetaAccess)
    || Boolean(session?.user && canAccessStudio(actorRoles as any))
    || hasProjectAccessGrant;

  // If they aren't logged in, redirect to the marketing/login page
  if (!session?.user) {
    return (
      <html lang="en" className={`${inter.variable} ${merriweather.variable}`}>
        <body className="font-sans bg-[#fdfaf6] antialiased">
          <NestSignInGate />
        </body>
      </html>
    );
  }

  // If they are logged in but don't have beta access, show the pending state
  if (!hasAccess) {
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
          showAdminTools={showAdminTools}
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
          <Providers>
            <LiveSessionDockProvider>
              {children}
            </LiveSessionDockProvider>
          </Providers>
        </SidebarLayout>
      </body>
    </html>
  );
}
