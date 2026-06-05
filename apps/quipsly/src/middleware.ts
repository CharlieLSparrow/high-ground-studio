import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

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
  // Only allow marketing paths (just '/' for now). Everything else goes to nest.
  if (hostname === 'quipsly.com' || hostname === 'www.quipsly.com') {
    const isMarketingPath = url.pathname === '/' || url.pathname.startsWith('/waitlist')

    if (!isMarketingPath) {
      return NextResponse.redirect(new URL(`${url.pathname}${url.search}`, 'https://nest.quipsly.com'))
    }
  }

  // Make the app subdomain land directly in the manuscript workbench, but keep
  // real app routes addressable. /editor must stay /editor, not /create/editor.
  if (hostname === 'nest.quipsly.com') {
    if (url.pathname === '/') {
      return NextResponse.rewrite(new URL('/create', request.url))
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
