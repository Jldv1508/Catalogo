import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, verifyOwnerLoginToken } from '../../../lib/access-session.js';
import { isOwnerEmail } from '../../../lib/owner-access.js';

function sanitizeNextPath(value) {
  const nextPath = String(value || '/base-clientes').trim();
  if (!nextPath.startsWith('/') || nextPath.startsWith('//')) {
    return '/base-clientes';
  }
  return nextPath;
}

function pageHtml(title, text) {
  return new Response(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body{font-family:Arial,sans-serif;background:#f7f2eb;color:#2d241d;margin:0;padding:40px}
    main{max-width:680px;margin:0 auto;background:#fff;border:1px solid #e2d7ca;border-radius:18px;padding:28px}
    h1{margin-top:0}
    a{color:#6f4d2d}
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p>${text}</p>
    <p><a href="/sign-in">Volver al acceso</a></p>
  </main>
</body>
</html>`, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function GET(request) {
  const token = new URL(request.url).searchParams.get('token') || '';
  const payload = await verifyOwnerLoginToken(token);
  if (!payload?.email || !isOwnerEmail(payload.email)) {
    return pageHtml('Enlace no valido', 'El enlace seguro del propietario no es valido o ha caducado.');
  }

  const nextPath = sanitizeNextPath(payload.next || '/base-clientes');
  const response = Response.redirect(new URL(nextPath, request.url), 302);
  response.cookies.set(SESSION_COOKIE, await createSessionToken(payload.email), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
