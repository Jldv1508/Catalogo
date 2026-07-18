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

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const nextPath = sanitizeNextPath(body?.next || '/base-clientes');
  const email = ownerEmail();
  const token = await createOwnerLoginToken({ email, next: nextPath });
  const origin = new URL(request.url).origin;
  const signInUrl = `${origin}/api/owner-access-verify?token=${encodeURIComponent(token)}`;

  try {
    await sendOwnerSignInEmail({ signInUrl });
    return NextResponse.json({ ok: true, emailSent: true });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'OWNER_EMAIL_SEND_FAILED',
    }, { status: 500 });
  }
}
