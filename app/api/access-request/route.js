import { NextResponse } from 'next/server';
import { createApprovalToken } from '../../../lib/access-session.js';
import { sendAccessRequestEmail } from '../../../lib/access-mailer.js';
import { readAccessRequests, writeAccessRequests } from '../../../lib/access-store.js';

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

  const requestId = crypto.randomUUID();
  const now = new Date().toISOString();
  const requests = await readAccessRequests();
  const nextRequests = requests.filter(entry => normalizeEmail(entry?.email) !== email);
  nextRequests.unshift({
    id: requestId,
    email,
    status: 'pending',
    requestedAt: now,
  });
  await writeAccessRequests(nextRequests);

  const origin = new URL(request.url).origin;
  const approveToken = await createApprovalToken({ requestId, email, decision: 'approve' });
  const denyToken = await createApprovalToken({ requestId, email, decision: 'deny' });
  const approveUrl = `${origin}/api/access-approve?token=${encodeURIComponent(approveToken)}`;
  const denyUrl = `${origin}/api/access-approve?token=${encodeURIComponent(denyToken)}`;

  try {
    await sendAccessRequestEmail({ requesterEmail: email, approveUrl, denyUrl, requestId });
    return NextResponse.json({ ok: true, status: 'pending', emailSent: true });
  } catch (error) {
    return NextResponse.json({
      ok: true,
      status: 'pending',
      emailSent: false,
      error: error instanceof Error ? error.message : 'EMAIL_SEND_FAILED',
      message: 'La solicitud queda guardada, pero falta configurar el envio de correo SMTP.',
    });
  }
}
