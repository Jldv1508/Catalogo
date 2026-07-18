import { NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '../../../lib/access-session.js';
import { readClientArea, writeClientFavorites, writeClientProfile } from '../../../lib/client-area-store.js';

const PROFILE_FIELDS = ['nombre', 'apellidos', 'empresa', 'telefono', 'ciudad', 'direccion', 'notas'];

function cleanText(value, maxLength = 400) {
  return String(value || '').trim().slice(0, maxLength);
}

async function sessionEmail(request) {
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  return session?.email ? String(session.email).trim().toLowerCase() : '';
}

function sanitizeFavorites(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => cleanText(item, 200)).filter(Boolean))].slice(0, 200);
}

function sanitizeProfile(value, email) {
  const source = value && typeof value === 'object' ? value : {};
  const profile = {
    email,
  };
  PROFILE_FIELDS.forEach(field => {
    profile[field] = cleanText(source[field], field === 'notas' ? 2000 : 200);
  });
  return profile;
}

export async function GET(request) {
  const email = await sessionEmail(request);
  if (!email) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }
  const data = await readClientArea(email);
  return NextResponse.json({
    ok: true,
    email,
    favorites: sanitizeFavorites(data.favorites),
    profile: sanitizeProfile(data.profile, email),
  });
}

export async function POST(request) {
  const email = await sessionEmail(request);
  if (!email) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const response = { ok: true, email };

  if (body?.favorites) {
    const favorites = sanitizeFavorites(body.favorites);
    await writeClientFavorites(email, favorites);
    response.favorites = favorites;
  }

  if (body?.profile) {
    const profile = sanitizeProfile(body.profile, email);
    await writeClientProfile(email, profile);
    response.profile = profile;
  }

  if (!('favorites' in response) && !('profile' in response)) {
    const data = await readClientArea(email);
    response.favorites = sanitizeFavorites(data.favorites);
    response.profile = sanitizeProfile(data.profile, email);
  }

  return NextResponse.json(response);
}
