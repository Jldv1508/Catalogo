import { NextResponse } from 'next/server';

export function GET(request) {
  return NextResponse.redirect(new URL('/conchas', request.url));
}
