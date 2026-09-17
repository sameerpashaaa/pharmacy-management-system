import { NextResponse } from 'next/server'
import { withAuth } from 'next-auth/middleware'

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl
    const token = req.nextauth.token

    // If accessing /pos route group, verify POS permission or owner/admin role
    const isOwnerOrAdmin =
      token?.roles?.includes('owner') || token?.roles?.includes('admin')
    if (pathname.startsWith('/pos') && !isOwnerOrAdmin && !token?.permissions?.includes('sales:create')) {
      return NextResponse.redirect(new URL('/', req.url))
    }

    return NextResponse.next()
  },
  {
    pages: {
      signIn: '/login',
      error: '/login',
    },
    callbacks: {
      authorized({ token }) {
        // Token exists = authenticated
        return !!token
      },
    },
  }
)

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - /login, /register, /reset-password (auth pages)
     * - /api/auth (NextAuth API)
     * - /_next/static, /_next/image, /favicon.ico (static files)
     */
    '/((?!login|register|reset-password|api/auth|_next/static|_next/image|favicon.ico|public).*)',
  ],
}
