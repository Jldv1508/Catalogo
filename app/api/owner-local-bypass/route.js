import { NextResponse } from 'next/server';
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from '../../../lib/access-session.js';
import { ownerEmail, isOwnerEmail } from '../../../lib/owner-access.js';

function isLocalRequest(request) {
  const host = String(request.headers.get('host') || '').toLowerCase();
  const forwarded = String(request.headers.get('x-forwarded-host') || '').toLowerCase();
  const candidates = [host, forwarded];
  const localPatterns = [
    /^localhost(?::\d+)?$/i,
    /^127\.0\.0\.1(?::\d+)?$/i,
    /^\[::1\](?::\d+)?$/i,
    /\.local(?::\d+)?$/i,
  ];
  if (candidates.some(candidate => localPatterns.some(pattern => pattern.test(candidate)))) {
    return true;
  }
  return process.env.NODE_ENV !== 'production';
}

function sanitizeNextPath(value) {
  const nextPath = String(value || '/base-clientes').trim();
  if (!nextPath.startsWith('/') || nextPath.startsWith('//')) {
    return '/base-clientes';
  }
  return nextPath;
}

function pageHtml(title, text, showBack = true) {
  return new Response(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body{font-family:Arial,sans-serif;background:#f7f2eb;color:#2d241d;margin:0;padding:40px}
    main{max-width:760px;margin:0 auto;background:#fff;border:1px solid #e2d7ca;border-radius:18px;padding:28px}
    h1{margin-top:0}
    a{color:#6f4d2d}
    .pill{display:inline-flex;align-items:center;min-height:34px;padding:6px 12px;border-radius:999px;background:#f6efe8;border:1px solid #e6d8c9;color:#5f4e3f;font-size:12px;font-weight:900}
    code{background:#faf4ec;border:1px solid #ecdcca;color:#5c4e42;padding:8px 10px;border-radius:10px;display:block;white-space:pre-wrap;word-break:break-word}
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p>${text}</p>
    ${showBack ? '<p><a href="/sign-in">Volver al acceso</a></p>' : ''}
  </main>
</body>
</html>`, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function GET(request) {
  if (!isLocalRequest(request)) {
    return pageHtml('Acceso no permitido', 'Este acceso directo solo funciona en localhost o entorno local. Usa el enlace seguro por email desde fuera.');
  }
  const email = ownerEmail();
  if (!isOwnerEmail(email)) {
    return pageHtml('Configuracion invalida', 'El correo propietario no esta configurado correctamente.');
  }
  const nextPath = sanitizeNextPath(new URL(request.url).searchParams.get('next') || '/base-clientes');
  const response = NextResponse.redirect(new URL(nextPath, request.url), 302);
  response.cookies.set(SESSION_COOKIE, await createSessionToken(email), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
