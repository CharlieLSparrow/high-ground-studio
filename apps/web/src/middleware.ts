import { NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

const { auth } = NextAuth(authConfig);

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - episodes (base fumadocs paths)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|episodes).*)',
  ],
};

// Map custom domains to internal niche folders
const domainMap: Record<string, string> = {
  'ainews.com': 'ai',
  'learnukulele.com': 'ukulele',
  // Local testing domains
  'ai.localhost:3000': 'ai',
  'ukulele.localhost:3000': 'ukulele',
};

export default auth((req) => {
  const url = req.nextUrl;
  const hostname = req.headers.get('host') || '';

  // 1. Premium Content Gating
  if (url.pathname.startsWith('/premium') || url.pathname.includes('/courses/premium')) {
    const roles = req.auth?.user?.roles || [];
    if (!roles.includes("NETWORK_PASS") && !roles.includes("OWNER")) {
      return NextResponse.redirect(new URL("/dashboard/upgrade", req.url));
    }
  }

  // 2. Domain Routing
  const niche = domainMap[hostname];

  if (niche) {
    const newUrl = new URL(`/sites/${niche}${url.pathname === '/' ? '' : url.pathname}`, req.url);
    newUrl.search = url.search;
    return NextResponse.rewrite(newUrl);
  }

  return NextResponse.next();
});
