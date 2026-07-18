import { verifySignedToken } from '../../../lib/access-session.js';
import { readAccessRequests, readApprovedAccess, writeAccessRequests, writeApprovedAccess } from '../../../lib/access-store.js';

function pageHtml(title, text) {
  return new Response(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body{font-family:Arial,sans-serif;background:#f7f2eb;color:#2d241d;margin:0;padding:40px}
    main{max-width:680px;margin:0 auto;background:#fff;border:1px solid #e2d7ca;border-radius:18px;padding:28px}
    h1{margin-top:0}
    a{color:#6f4d2d}
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p>${text}</p>
    <p><a href="/sign-in">Ir a sign in</a></p>
  </main>
</body>
</html>`, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function GET(request) {
  const token = new URL(request.url).searchParams.get('token') || '';
  const payload = await verifySignedToken(token);
  if (!payload || payload.type !== 'approval' || !payload.email || !payload.requestId) {
    return pageHtml('Enlace no valido', 'El enlace de aprobacion no es valido o ha caducado.');
  }

  const requests = await readAccessRequests();
  const approvals = await readApprovedAccess();
  const now = new Date().toISOString();
  const decision = payload.decision === 'deny' ? 'denied' : 'approved';

  const nextRequests = requests.map(entry => (
    entry.id === payload.requestId
      ? { ...entry, status: decision, reviewedAt: now }
      : entry
  ));

  const nextApprovals = approvals.filter(entry => String(entry?.email || '').trim().toLowerCase() !== String(payload.email).trim().toLowerCase());
  nextApprovals.unshift({
    email: String(payload.email).trim().toLowerCase(),
    status: decision,
    requestId: payload.requestId,
    reviewedAt: now,
  });

  await writeAccessRequests(nextRequests);
  await writeApprovedAccess(nextApprovals);

  return pageHtml(
    decision === 'approved' ? 'Acceso aprobado' : 'Acceso denegado',
    decision === 'approved'
      ? `El email ${payload.email} ya tiene acceso autorizado.`
      : `El email ${payload.email} ha sido denegado.`,
  );
}
