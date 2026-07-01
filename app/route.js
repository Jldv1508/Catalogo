import { NextResponse } from 'next/server';

export function GET(request) {
  return NextResponse.redirect(new URL('/catalogo.html', request.url));
}
