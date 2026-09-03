import { NextResponse } from 'next/server';
import { createOwnerLoginToken } from '../../../lib/access-session.js';
import { ownerEmail } from '../../../lib/owner-access.js';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

function sanitizeNextPath(value) {
  const nextPath = String(value || '/base-clientes').trim();
  if (!nextPath.startsWith('/') || nextPath.startsWith('//')) {
    return '/base-clientes';
  }
  return nextPath;
}

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

export async function GET(request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json({ ok: false, error: 'LOCALHOST_ONLY' }, { status: 403 });
  }
  const email = ownerEmail();
  const nextPath = sanitizeNextPath(new URL(request.url).searchParams.get('next') || '/base-clientes');
  const token = await createOwnerLoginToken({ email, next: nextPath });
  const origin = new URL(request.url).origin;
  const signInUrl = `${origin}/api/owner-access-verify?token=${encodeURIComponent(token)}`;

  try {
    const dataDir = path.join(process.cwd(), 'data');
    await writeFile(
      path.join(dataDir, 'owner-local-link.txt'),
      [
        `Enlace local del propietario generado el: ${new Date().toISOString()}`,
        `Owner: ${email}`,
        `Destino: ${nextPath}`,
        '',
        signInUrl,
        '',
      ].join('\n'),
      'utf8',
    );
  } catch {}

  return NextResponse.json({
    ok: true,
    owner: email,
    next: nextPath,
    signInUrl,
    expiresInMinutes: 20,
    note: 'Copia y abre este enlace directamente en tu navegador. Es solo para uso local y caduca en 20 minutos.',
  });
}
