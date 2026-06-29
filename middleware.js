import { NextResponse } from 'next/server';

export const config = {
  matcher: ['/admin/:path*'],
};

export function middleware(request) {
  const user = process.env.ADMIN_USER || 'admin';
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    return new NextResponse('Falta configurar ADMIN_PASSWORD en Vercel.', { status: 503 });
  }

  const auth = request.headers.get('authorization') || '';
  const [scheme, encoded] = auth.split(' ');

  if (scheme === 'Basic' && encoded) {
    const decoded = atob(encoded);
    const separator = decoded.indexOf(':');
    const sentUser = decoded.slice(0, separator);
    const sentPassword = decoded.slice(separator + 1);
    if (sentUser === user && sentPassword === password) {
      return NextResponse.next();
    }
  }

  return new NextResponse('Acceso restringido', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="jldv1508 admin", charset="UTF-8"',
    },
  });
}
