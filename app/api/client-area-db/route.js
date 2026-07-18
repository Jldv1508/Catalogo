import { NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '../../../lib/access-session.js';
import { readAllClientAreas } from '../../../lib/client-area-store.js';
import { isOwnerEmail } from '../../../lib/owner-access.js';

async function ownerSessionEmail(request) {
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const email = String(session?.email || '').trim().toLowerCase();
  return isOwnerEmail(email) ? email : '';
}

export async function GET(request) {
  const email = await ownerSessionEmail(request);
  if (!email) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const clients = await readAllClientAreas();
  return NextResponse.json({
    ok: true,
    owner: email,
    total: clients.length,
    clients,
  });
}
