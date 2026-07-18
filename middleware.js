import { NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from './lib/access-session.js';

const PUBLIC_ROUTES = new Set([
  '/sign-in',
  '/api/access-request',
  '/api/access-session',
  '/api/access-approve',
  '/api/owner-access-request',
  '/api/owner-access-verify',
]);

function isPublicPath(pathname) {
  if (PUBLIC_ROUTES.has(pathname)) return true;
  if (pathname.startsWith('/_next/')) return true;
  if (pathname === '/favicon.ico') return true;
  return /\.[a-z0-9]+$/i.test(pathname);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};

export async function middleware(request) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (session?.email) {
    return NextResponse.next();
  }

  const signInUrl = new URL('/sign-in', request.url);
  signInUrl.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(signInUrl);
}
