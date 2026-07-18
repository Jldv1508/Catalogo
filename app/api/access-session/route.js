import { NextResponse } from 'next/server';
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from '../../../lib/access-session.js';
import { isEmailApproved } from '../../../lib/access-store.js';
import { isOwnerEmail } from '../../../lib/owner-access.js';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body?.email);
  if (!validEmail(email)) {
    return NextResponse.json({ ok: false, error: 'EMAIL_INVALIDO' }, { status: 400 });
  }
  if (isOwnerEmail(email)) {
    return NextResponse.json({ ok: false, error: 'OWNER_MAGIC_LINK_REQUIRED' }, { status: 403 });
  }
  if (!await isEmailApproved(email)) {
    return NextResponse.json({ ok: false, error: 'ACCESS_PENDING' }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(email), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(0),
  });
  return response;
}
