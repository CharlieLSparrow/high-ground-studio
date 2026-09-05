import type { Metadata } from "next";
import { Inter, Merriweather } from "next/font/google";
import { getQuipslySession } from "@/lib/server/quipsly-session";
import "../globals.css";
import { SidebarLayout } from "@/components/SidebarLayout";
import { LiveSessionDockProvider } from "@/components/live-session-dock";
import { hasPlatformOwnerRole } from "@/lib/server/user-management";
import { MAC_WEB_SESSION_COOKIE_NAME, verifyMacWebSessionToken } from "@/lib/server/mac-session-token";
import { cookies } from "next/headers";
import { Providers } from "@/app/providers";
import { NestSignInGate } from "@/components/nest-sign-in-gate";
import { QuipslyProductAnalytics } from "@/components/quipsly-product-analytics";

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
  const showPlatformAdminTools = hasPlatformOwnerRole(actorRoles);
  const showSupportTools = showPlatformAdminTools || actorRoles.includes("SUPPORT_AGENT");
  const showProductOperations = showPlatformAdminTools || actorRoles.includes("PRODUCT_ANALYST");

  // If they aren't logged in, redirect to the marketing/login page
  if (!session?.user) {
    return (
      <html lang="en" className={`${inter.variable} ${merriweather.variable}`}>
        <body className="bg-quipsly-canvas font-sans antialiased">
          <QuipslyProductAnalytics measurementId={process.env.QUIPSLY_GA_MEASUREMENT_ID} />
          <NestSignInGate />
        </body>
      </html>
    );
  }

  return (
    <html lang="en" className={`${inter.variable} ${merriweather.variable}`}>
        <body className="bg-studio-bg font-sans text-studio-ink antialiased">
        <QuipslyProductAnalytics measurementId={process.env.QUIPSLY_GA_MEASUREMENT_ID} authenticated />
        <SidebarLayout
          showPlatformAdminTools={showPlatformAdminTools}
          showSupportTools={showSupportTools}
          showProductOperations={showProductOperations}
          currentUser={
            session?.user
              ? {
                  email: session.user.primaryEmail || session.user.email || "",
                  name: session.user.name || null,
                  image: session.user.image || null,
                  isStaff: Boolean(session.user.isStaff) || showSupportTools || showProductOperations,
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
