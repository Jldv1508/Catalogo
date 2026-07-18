import { SESSION_COOKIE, verifySessionToken } from '../../lib/access-session.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
}

function pageHtml(email) {
  const safeEmail = escapeHtml(email);
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Area cliente · jldv1508</title>
  <style>
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;background:#f7f2eb;color:#2d241d;font-family:Arial,sans-serif}
    main{width:min(1120px,calc(100vw - 32px));margin:0 auto;padding:28px 0 44px;display:grid;gap:18px}
    .hero,.grid article{background:#fff;border:1px solid #e0d6ca;border-radius:22px;box-shadow:0 16px 40px rgba(59,39,21,.08)}
    .hero{padding:30px;display:grid;gap:16px}
    .kicker{margin:0;color:#8e6644;font-size:12px;font-weight:900;text-transform:uppercase}
    h1{margin:0;font-family:Georgia,serif;font-size:clamp(34px,5vw,58px);line-height:.95}
    p{margin:0;line-height:1.55}
    .pill{display:inline-flex;align-items:center;min-height:38px;padding:8px 12px;border-radius:999px;background:#f6efe8;border:1px solid #e6d8c9;color:#5f4e3f;font-size:12px;font-weight:900}
    .actions{display:flex;flex-wrap:wrap;gap:10px}
    a,button{min-height:44px;display:inline-flex;align-items:center;justify-content:center;padding:10px 16px;border-radius:12px;border:1px solid #2d241d;background:#2d241d;color:#fff;font:inherit;font-weight:900;text-decoration:none;cursor:pointer}
    .secondary{background:#fff;color:#2d241d;border-color:#d8cdbf}
    .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
    .grid article{padding:20px;display:grid;gap:10px}
    .grid strong{font-size:18px;line-height:1.2}
    .grid span{color:#6a5b4d;line-height:1.45}
    @media(max-width:860px){.grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <p class="kicker">Acceso autorizado</p>
      <h1>Area cliente</h1>
      <p>Has entrado con el email autorizado <strong>${safeEmail}</strong>. Desde aqui puedes ir al catalogo y gestionar tu sesion.</p>
      <span class="pill">Sesion activa</span>
      <div class="actions">
        <a href="/catalogo-publico">Ver catalogo publico</a>
        <a href="/catalogo" class="secondary">Abrir catalogo completo</a>
        <button type="button" id="signOutButton" class="secondary">Cerrar sesion</button>
      </div>
    </section>
    <section class="grid">
      <article>
        <strong>Catalogo publico</strong>
        <span>Consulta las piezas visibles con filtros desplegables y una vista comoda para clientes.</span>
        <a href="/catalogo-publico">Entrar</a>
      </article>
      <article>
        <strong>Mi acceso</strong>
        <span>Tu sesion esta vinculada al email aprobado y se mantiene mientras la cookie siga activa.</span>
        <span class="pill">${safeEmail}</span>
      </article>
      <article>
        <strong>Salir</strong>
        <span>Si terminas, puedes cerrar la sesion desde aqui y volver al acceso por email.</span>
        <button type="button" id="signOutButtonCard" class="secondary">Cerrar sesion</button>
      </article>
    </section>
  </main>
  <script>
    async function signOut() {
      await fetch('/api/access-session', { method: 'DELETE' });
      window.location.href = '/sign-in';
    }
    document.getElementById('signOutButton')?.addEventListener('click', signOut);
    document.getElementById('signOutButtonCard')?.addEventListener('click', signOut);
  </script>
</body>
</html>`;
}

export async function GET(request) {
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session?.email) {
    return Response.redirect(new URL('/sign-in?next=%2Farea-cliente', request.url), 302);
  }
  return new Response(pageHtml(session.email), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}
