import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const marketingPathPrefixes = ['/waitlist', '/philosophy']

function isMarketingPath(pathname: string) {
  return pathname === '/' || marketingPathPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function middleware(request: NextRequest) {
  const url = request.nextUrl
  const hostname = request.headers.get('host')

  // Forward quipsly.studio to quipsly.com
  if (hostname === 'quipsly.studio') {
    const url = new URL(request.url)
    url.hostname = 'quipsly.com'
    return NextResponse.redirect(url)
  }

  // Enforce strict boundaries for quipsly.com
  // Only allow marketing paths. Everything app/workbench-shaped goes to nest.
  if (hostname === 'quipsly.com' || hostname === 'www.quipsly.com') {
    if (!isMarketingPath(url.pathname)) {
      return NextResponse.redirect(new URL(`${url.pathname}${url.search}`, 'https://nest.quipsly.com'))
    }
  }

  // Make the app subdomain land directly in the manuscript workbench, but keep
  // real app routes addressable. /editor must stay /editor, not /create/editor.
  if (hostname === 'nest.quipsly.com') {
    if (url.pathname === '/') {
      return NextResponse.rewrite(new URL('/create', request.url))
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
