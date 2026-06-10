import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const protectedPaths = ['/dashboard', '/billing', '/team', '/settings']
  const isProtected = protectedPaths.some(p => pathname.startsWith(p))
  if (!isProtected) return NextResponse.next()
  const token = request.cookies.get('fieldcore_token')?.value
  if (!token) return NextResponse.redirect(new URL('/auth/login', request.url))
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
