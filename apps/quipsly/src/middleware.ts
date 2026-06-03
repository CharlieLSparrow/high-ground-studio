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
      // Strip out '/create' if they typed it on the root domain, otherwise pass path exactly
      const newPath = url.pathname.startsWith('/create') 
        ? url.pathname.replace('/create', '') || '/'
        : url.pathname
        
      return NextResponse.redirect(new URL(newPath, 'https://nest.quipsly.com'))
    }
  }

  // Map everything on nest.quipsly.com to the /create folder
  if (hostname === 'nest.quipsly.com') {
    // If they explicitly hit /create, remove it from the URL
    if (url.pathname.startsWith('/create')) {
      const newPath = url.pathname.replace('/create', '') || '/'
      return NextResponse.redirect(new URL(newPath, request.url))
    }
    
    const rewritePath = url.pathname === '/' ? '/create' : `/create${url.pathname}`
    return NextResponse.rewrite(new URL(rewritePath, request.url))
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
