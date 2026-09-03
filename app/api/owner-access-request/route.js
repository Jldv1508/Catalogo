import { NextResponse } from 'next/server';
import { createOwnerLoginToken } from '../../../lib/access-session.js';
import { sendOwnerSignInEmail } from '../../../lib/access-mailer.js';
import { ownerEmail } from '../../../lib/owner-access.js';

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

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const nextPath = sanitizeNextPath(body?.next || '/base-clientes');
  const email = ownerEmail();
  const token = await createOwnerLoginToken({ email, next: nextPath });
  const origin = new URL(request.url).origin;
  const signInUrl = `${origin}/api/owner-access-verify?token=${encodeURIComponent(token)}`;
  const localFallback = isLocalRequest(request);

  try {
    await sendOwnerSignInEmail({ signInUrl });
    return NextResponse.json({
      ok: true,
      emailSent: true,
      localFallback,
      signInUrl: localFallback ? signInUrl : null,
      expiresInMinutes: 20,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'OWNER_EMAIL_SEND_FAILED',
      emailSent: false,
      localFallback,
      signInUrl: localFallback ? signInUrl : null,
      expiresInMinutes: 20,
    }, { status: 500 });
  }
}
