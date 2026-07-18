const SESSION_COOKIE = 'catalogo_access_session';
const REQUEST_SIGNING_SECRET = 'catalogo-access-secret';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const REQUEST_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function secretValue() {
  return process.env.SESSION_SECRET || process.env.ACCESS_SESSION_SECRET || REQUEST_SIGNING_SECRET;
}

function toBase64Url(bytes) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64url');
  }
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(value, 'base64url'));
  }
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function encodeJson(payload) {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

function decodeJson(value) {
  const bytes = fromBase64Url(value);
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function signValue(value) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secretValue()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return toBase64Url(new Uint8Array(signature));
}

export async function createSignedToken(payload) {
  const encoded = encodeJson(payload);
  const signature = await signValue(encoded);
  return `${encoded}.${signature}`;
}

export async function verifySignedToken(token) {
  if (!token || !token.includes('.')) return null;
  const [encoded, signature] = token.split('.');
  const expected = await signValue(encoded);
  if (signature !== expected) return null;
  const payload = decodeJson(encoded);
  if (payload?.exp && Date.now() > payload.exp) return null;
  return payload;
}

export async function createSessionToken(email) {
  return createSignedToken({
    type: 'session',
    email,
    exp: Date.now() + (SESSION_MAX_AGE_SECONDS * 1000),
  });
}

export async function verifySessionToken(token) {
  const payload = await verifySignedToken(token);
  return payload?.type === 'session' ? payload : null;
}

export async function createApprovalToken(payload) {
  return createSignedToken({
    ...payload,
    type: 'approval',
    exp: Date.now() + (REQUEST_TOKEN_MAX_AGE_SECONDS * 1000),
  });
}

export { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS };
