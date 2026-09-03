import { NextResponse } from 'next/server';
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from '../../lib/access-session.js';
import { ownerEmail } from '../../lib/owner-access.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

(function ensureEnvFromDotEnv() {
  try {
    const p = path.join(process.cwd(), '.env.local');
    if (!fs.existsSync(p)) return;
    const content = fs.readFileSync(p, 'utf8');
    content.split('\n').forEach((raw) => {
      const line = raw.replace(/\r$/, '').trim();
      if (!line || line.startsWith('#')) return;
      const idx = line.indexOf('=');
      if (idx < 1) return;
      const key = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    });
  } catch (_) {}
})();

const HASH_PEPPER = 'catalogo-admin-login-v1';
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 10;

const rateLimitStore = new Map();

function sanitizeNextPath(value) {
  const nextPath = String(value || '/base-clientes').trim();
  if (!nextPath.startsWith('/') || nextPath.startsWith('//')) return '/base-clientes';
  return nextPath;
}

function requestClientId(request) {
  try {
    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) return String(forwardedFor.split(',')[0]).trim();
  } catch (_) {}
  return request.headers.get('x-real-ip') || request.headers.get('x-forwarded-host') || 'local';
}

function checkRateLimit(clientId) {
  const now = Date.now();
  let bucket = rateLimitStore.get(clientId);
  if (!bucket || now - bucket.resetAt > RATE_LIMIT_WINDOW_MS) {
    bucket = { resetAt: now, attempts: [] };
    rateLimitStore.set(clientId, bucket);
  }
  bucket.attempts = bucket.attempts.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (bucket.attempts.length >= RATE_LIMIT_MAX_ATTEMPTS) return { ok: false, retryMs: RATE_LIMIT_WINDOW_MS - (now - (bucket.attempts[0] || now)) };
  bucket.attempts.push(now);
  if (rateLimitStore.size > 5000) rateLimitStore.clear();
  return { ok: true };
}

async function hashPassword(password) {
  const data = new TextEncoder().encode(HASH_PEPPER + '\x00' + String(password || ''));
  return crypto.createHash('sha256').update(data).digest('hex');
}

function pageHtml({ title, error = '', message = '', nextPath = '/base-clientes', notice = '' }) {
  const escape = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return new Response(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(title)}</title>
  <style>
    body{font-family:system-ui,Arial,sans-serif;background:#f7f2eb;color:#2d241d;margin:0;padding:28px;min-height:100vh;display:flex;align-items:center;justify-content:center}
    .card{max-width:480px;width:100%;background:#fff;border:1px solid #e2d7ca;border-radius:24px;padding:28px;box-shadow:0 18px 48px rgba(59,39,21,.08)}
    h1{margin:0 0 6px;font-size:28px;line-height:1.15;color:#3b2715}
    .sub{margin:0 0 22px;color:#6a5b4d;font-size:14px}
    label{display:block;font-weight:700;margin:14px 0 6px;color:#4b3a2a;font-size:13px}
    input[type=password]{width:100%;box-sizing:border-box;padding:14px 16px;border-radius:16px;border:1px solid #d7c8b9;background:#fbf7f2;font-size:16px;outline:none}
    input[type=password]:focus{border-color:#b08a67;box-shadow:0 0 0 4px rgba(176,138,103,.15)}
    button{margin-top:18px;width:100%;padding:14px 16px;border-radius:16px;border:0;background:#3b2715;color:#fff;font-weight:800;font-size:15px;cursor:pointer}
    .row{display:flex;justify-content:space-between;gap:10px;margin-top:12px;align-items:center}
    a.secondary{color:#6f4d2d;text-decoration:none;font-weight:700;font-size:13px}
    .error{padding:12px 14px;border-radius:14px;background:#fde9e2;border:1px solid #efcdbf;color:#8a3520;font-size:13px;margin-bottom:8px}
    .ok{padding:12px 14px;border-radius:14px;background:#eaf7ef;border:1px solid #bfe3cb;color:#1f6b3e;font-size:13px;margin-bottom:8px}
    .notice{padding:12px 14px;border-radius:14px;background:#fff4e0;border:1px solid #f3dfb3;color:#76561a;font-size:13px;margin-bottom:14px}
    .muted{color:#6a5b4d;font-size:12px;margin-top:12px;line-height:1.5}
  </style>
</head>
<body>
  <div class="card">
    <h1>Acceso administrador</h1>
    <p class="sub">Entra directamente con la contraseña maestra. No requiere correo.</p>
    ${notice ? `<div class="notice">${escape(notice)}</div>` : ''}
    ${error ? `<div class="error">${escape(error)}</div>` : ''}
    ${message ? `<div class="ok">${escape(message)}</div>` : ''}
    <form method="post" action="/admin-login" autocomplete="off">
      <input type="hidden" name="next" value="${escape(nextPath)}">
      <label for="password">Contraseña maestra</label>
      <input id="password" name="password" type="password" placeholder="Introduce la contraseña maestra" autofocus required>
      <button type="submit">Entrar como administrador</button>
    </form>
    <div class="row">
      <a class="secondary" href="/sign-in">Volver al acceso normal</a>
      <a class="secondary" href="/api/owner-local-bypass?next=${escape(nextPath)}">Bypass local directo</a>
    </div>
    <p class="muted">La contraseña maestra se define en el archivo .env.local como OWNER_MASTER_PASSWORD.</p>
  </div>
</body>
</html>`, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function GET(request) {
  const url = new URL(request.url);
  const nextPath = sanitizeNextPath(url.searchParams.get('next') || '/base-clientes');
  const configured = !!process.env.OWNER_MASTER_PASSWORD;
  if (!configured) {
    return pageHtml({
      title: 'Acceso administrador no configurado',
      notice: 'Falta configurar OWNER_MASTER_PASSWORD en .env.local.',
      error: 'Añade la variable OWNER_MASTER_PASSWORD y reinicia el servidor.',
      nextPath,
    });
  }
  return pageHtml({ title: 'Acceso administrador · Sign in admin', nextPath });
}

export async function POST(request) {
  const configured = !!process.env.OWNER_MASTER_PASSWORD;
  let nextPath = '/base-clientes';
  let password = '';
  const contentHeader = (request.headers.get('content-type') || '').toLowerCase();
  if (contentHeader.includes('application/json')) {
    try {
      const body = await request.json();
      nextPath = sanitizeNextPath(body?.next || '/base-clientes');
      password = String(body?.password || '');
    } catch (_) {}
  } else {
    try {
      const formData = await request.formData();
      nextPath = sanitizeNextPath(formData.get('next') || '/base-clientes');
      password = String(formData.get('password') || '');
    } catch (_) {}
  }
  if (!configured) {
    return pageHtml({
      title: 'Acceso administrador no configurado',
      error: 'Falta configurar OWNER_MASTER_PASSWORD en .env.local.',
      nextPath,
    });
  }
  const clientId = requestClientId(request);
  const rate = checkRateLimit(clientId);
  if (!rate.ok) {
    return pageHtml({
      title: 'Acceso administrador bloqueado temporalmente',
      error: 'Demasiados intentos. Espera ' + Math.ceil(Number(rate.retryMs || 0) / 1000) + ' segundos y vuelve a probar.',
      nextPath,
    });
  }
  const [expectedHash, inputHash] = await Promise.all([
    hashPassword(process.env.OWNER_MASTER_PASSWORD),
    hashPassword(password),
  ]);
  const expectedBuf = Buffer.from(expectedHash, 'hex');
  const inputBuf = Buffer.from(inputHash, 'hex');
  let match = expectedBuf.length === inputBuf.length;
  if (match) {
    try {
      match = crypto.timingSafeEqual(expectedBuf, inputBuf);
    } catch (_) {
      match = false;
    }
  }
  if (!match) {
    return pageHtml({
      title: 'Acceso administrador',
      error: 'Contraseña maestra incorrecta. Vuelve a intentarlo.',
      nextPath,
    });
  }
  const email = ownerEmail();
  const token = await createSessionToken(email);
  const location = sanitizeNextPath(nextPath);
  const reqUrl = new URL(request.url);
  const proto = request.headers.get('x-forwarded-proto') || reqUrl.protocol.slice(0, -1) || 'http';
  const hostHeader = request.headers.get('x-forwarded-host') || request.headers.get('host') || reqUrl.host;
  const absoluteRedirect = proto + '://' + hostHeader + location;
  const cookieParts = [
    SESSION_COOKIE + '=' + token,
    'Path=/',
    'Max-Age=' + SESSION_MAX_AGE_SECONDS,
    'HttpOnly',
    'SameSite=lax',
  ];
  if (process.env.NODE_ENV === 'production') cookieParts.push('Secure');
  const setCookieVal = cookieParts.join('; ');
  const isJson = contentHeader.includes('application/json');
  if (isJson) {
    const resp = NextResponse.json({ ok: true, next: nextPath, owner: email }, { status: 200, headers: { 'cache-control': 'no-store' } });
    resp.headers.append('set-cookie', setCookieVal);
    return resp;
  }
  const headers = new Headers();
  headers.set('location', absoluteRedirect);
  headers.set('set-cookie', setCookieVal);
  headers.set('content-type', 'text/plain; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response('Redirecting to ' + absoluteRedirect, { status: 302, statusText: 'Found', headers });
}
