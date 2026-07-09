import { NextResponse } from 'next/server';

export const config = {
  matcher: ['/admin/:path*', '/edicion/:path*'],
};

export function middleware(request) {
  const user = process.env.EDIT_USER || process.env.ADMIN_USER || 'Jldv1508';
  const password = process.env.EDIT_PASSWORD || process.env.ADMIN_PASSWORD || 'Temblor2018mjf';

  if (!password) {
    return new NextResponse('Falta configurar la contrasena del area protegida.', { status: 503 });
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
      'WWW-Authenticate': 'Basic realm="jldv1508 edicion", charset="UTF-8"',
    },
  });
}
