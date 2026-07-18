import { SESSION_COOKIE, verifySessionToken } from '../../lib/access-session.js';
import { readAllClientAreas } from '../../lib/client-area-store.js';
import { isOwnerEmail } from '../../lib/owner-access.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
}

function cleanText(value) {
  return String(value || '').trim();
}

function clientSummary(client) {
  const profile = client.profile || {};
  return [
    cleanText(profile.nombre),
    cleanText(profile.apellidos),
    cleanText(profile.empresa),
    cleanText(profile.telefono),
    cleanText(profile.ciudad),
  ].filter(Boolean).join(' · ') || 'Sin ficha completada';
}

function profileRows(client) {
  const profile = client.profile || {};
  return [
    ['Nombre', cleanText(profile.nombre)],
    ['Apellidos', cleanText(profile.apellidos)],
    ['Empresa', cleanText(profile.empresa)],
    ['Telefono', cleanText(profile.telefono)],
    ['Ciudad', cleanText(profile.ciudad)],
    ['Direccion', cleanText(profile.direccion)],
    ['Notas', cleanText(profile.notas)],
  ].filter(([, value]) => value);
}

function pageHtml(ownerEmail, clients) {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Base de clientes · jldv1508</title>
  <style>
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;background:#f7f2eb;color:#2d241d;font-family:Arial,sans-serif}
    main{width:min(1240px,calc(100vw - 32px));margin:0 auto;padding:28px 0 44px;display:grid;gap:18px}
    .hero,.client-card{background:#fff;border:1px solid #e0d6ca;border-radius:22px;box-shadow:0 16px 40px rgba(59,39,21,.08)}
    .hero{padding:30px;display:grid;gap:16px}
    .kicker{margin:0;color:#8e6644;font-size:12px;font-weight:900;text-transform:uppercase}
    h1{margin:0;font-family:Georgia,serif;font-size:clamp(34px,5vw,58px);line-height:.95}
    p{margin:0;line-height:1.55}
    .actions{display:flex;flex-wrap:wrap;gap:10px}
    a{min-height:44px;display:inline-flex;align-items:center;justify-content:center;padding:10px 16px;border-radius:12px;border:1px solid #2d241d;background:#2d241d;color:#fff;font:inherit;font-weight:900;text-decoration:none}
    .secondary{background:#fff;color:#2d241d;border-color:#d8cdbf}
    .pill{display:inline-flex;align-items:center;min-height:38px;padding:8px 12px;border-radius:999px;background:#f6efe8;border:1px solid #e6d8c9;color:#5f4e3f;font-size:12px;font-weight:900}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}
    .client-card{padding:20px;display:grid;gap:14px}
    .client-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
    .client-head strong{font-size:20px;line-height:1.15}
    .client-head span{color:#6a5b4d;font-size:13px;line-height:1.4}
    .meta{display:flex;flex-wrap:wrap;gap:8px}
    .meta span{display:inline-flex;align-items:center;min-height:30px;padding:6px 10px;border-radius:999px;background:#f8f1ea;border:1px solid #eadbc9;color:#5f4e3f;font-size:12px;font-weight:800}
    .profile{display:grid;gap:8px}
    .profile div{display:grid;gap:3px;padding-top:8px;border-top:1px solid #efe4d6}
    .profile b{font-size:11px;text-transform:uppercase;color:#8e6644}
    .profile span{color:#4b4037;font-size:13px;line-height:1.45}
    .favorites-list{display:grid;gap:6px}
    .favorites-list code{padding:8px 10px;border-radius:10px;background:#faf4ec;border:1px solid #ecdcca;color:#5c4e42;font-size:12px;overflow-wrap:anywhere}
    .empty{padding:18px;border:1px dashed #dfd1c1;border-radius:18px;background:#faf4ec;color:#7a6859;font-weight:700}
    @media(max-width:860px){.grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <p class="kicker">Base de datos accesible</p>
      <h1>Base de clientes</h1>
      <p>Esta vista centraliza las fichas y favoritos rellenados por los clientes autorizados. Solo es accesible para <strong>${escapeHtml(ownerEmail)}</strong>.</p>
      <div class="actions">
        <a href="/api/client-area-db">Descargar JSON</a>
        <a href="/area-cliente" class="secondary">Volver al area cliente</a>
      </div>
      <span class="pill">${clients.length} clientes registrados</span>
    </section>
    ${clients.length ? `<section class="grid">
      ${clients.map(client => `<article class="client-card">
        <div class="client-head">
          <div>
            <strong>${escapeHtml(client.email)}</strong>
            <span>${escapeHtml(clientSummary(client))}</span>
          </div>
        </div>
        <div class="meta">
          <span>${client.favorites.length} favoritos</span>
          <span>${profileRows(client).length ? 'Ficha completada' : 'Sin ficha'}</span>
        </div>
        <section class="profile">
          ${profileRows(client).length ? profileRows(client).map(([label, value]) => `<div><b>${escapeHtml(label)}</b><span>${escapeHtml(value)}</span></div>`).join('') : '<div><span>Este cliente todavia no ha rellenado su ficha.</span></div>'}
        </section>
        <section class="favorites-list">
          ${client.favorites.length ? client.favorites.map(item => `<code>${escapeHtml(item)}</code>`).join('') : '<span>Sin favoritos guardados.</span>'}
        </section>
      </article>`).join('')}
    </section>` : '<section class="empty">Todavia no hay clientes con datos guardados.</section>'}
  </main>
</body>
</html>`;
}

export async function GET(request) {
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const email = String(session?.email || '').trim().toLowerCase();
  if (!isOwnerEmail(email)) {
    return Response.redirect(new URL('/area-cliente', request.url), 302);
  }

  const clients = await readAllClientAreas();
  return new Response(pageHtml(email, clients), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}
