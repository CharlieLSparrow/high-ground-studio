import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const marketingPathPrefixes = [
  '/creator',
  '/help',
  '/philosophy',
  '/pricing',
  '/privacy',
  '/quipslys',
  '/support',
  '/terms',
  '/waitlist',
  '/welcome',
]

function normalizeHost(hostname: string | null) {
  return hostname?.split(':')[0]?.toLowerCase() ?? ''
}

function isMarketingPath(pathname: string) {
  return pathname === '/' || marketingPathPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

function isPublicAssetPath(pathname: string) {
  return (
    pathname.startsWith('/images/') ||
    pathname.startsWith('/avatars/') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/icon-') ||
    pathname.startsWith('/apple-touch-icon') ||
    pathname.startsWith('/quipsly') ||
    pathname.startsWith('/brand-') ||
    pathname === '/site.webmanifest' ||
    pathname === '/robots.txt'
  )
}

export function proxy(request: NextRequest) {
  const url = request.nextUrl
  const hostname = normalizeHost(request.headers.get('host'))

  // Forward quipsly.studio to quipsly.com
  if (hostname === 'quipsly.studio') {
    const url = new URL(request.url)
    url.hostname = 'quipsly.com'
    return NextResponse.redirect(url)
  }

  // Public static assets are shared by the marketing and app shells.
  // Do not host-route them away from the domain that requested them.
  if (isPublicAssetPath(url.pathname)) {
    return NextResponse.next()
  }

  // Enforce strict boundaries for quipsly.com
  // Only allow marketing paths. Everything app/workbench-shaped goes to nest.
  if (hostname === 'quipsly.com' || hostname === 'www.quipsly.com') {
    if (!isMarketingPath(url.pathname)) {
      return NextResponse.redirect(new URL(`${url.pathname}${url.search}`, 'https://nest.quipsly.com'))
    }
  }

  // Make the app subdomain land directly in the manuscript workbench, but keep
  // real app routes addressable. /editor must stay /editor, not /projects/editor.
  if (hostname === 'nest.quipsly.com' || hostname === 'www.nest.quipsly.com') {
    if (url.pathname === '/') {
      return NextResponse.redirect(new URL('/projects', request.url))
    }

    if (isMarketingPath(url.pathname)) {
      const marketingUrl = new URL(request.url)
      marketingUrl.hostname = 'quipsly.com'
      return NextResponse.redirect(marketingUrl)
    }

    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
