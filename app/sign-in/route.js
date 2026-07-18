import { verifySessionToken, SESSION_COOKIE } from '../../lib/access-session.js';

function sanitizeNextPath(value) {
  const nextPath = String(value || '/').trim();
  if (!nextPath.startsWith('/') || nextPath.startsWith('//')) {
    return '/';
  }
  return nextPath;
}

function html(nextPath = '/') {
  const safeNext = sanitizeNextPath(nextPath).replace(/"/g, '&quot;');
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sign In · jldv1508</title>
  <style>
    body{margin:0;font-family:Arial,sans-serif;background:#f7f2eb;color:#2d241d}
    main{min-height:100vh;display:grid;place-items:center;padding:24px}
    .card{width:min(100%,540px);background:#fff;border:1px solid #e0d6ca;border-radius:20px;padding:28px;box-shadow:0 12px 40px rgba(59,39,21,.08)}
    h1{margin:0 0 10px}
    p{line-height:1.5}
    form{display:grid;gap:12px;margin-top:18px}
    input,button{font:inherit;border-radius:12px;padding:14px 16px;border:1px solid #d8cdbf}
    button{background:#2d241d;color:#fff;border:none;cursor:pointer}
    button.secondary{background:#efe5da;color:#2d241d}
    .note{margin-top:14px;padding:12px 14px;border-radius:12px;background:#f6efe8;border:1px solid #e6d8c9}
    .stack{display:grid;gap:10px}
    .muted{color:#6a5b4d;font-size:14px}
  </style>
</head>
<body>
  <main>
    <section class="card">
      <p class="muted">Acceso privado</p>
      <h1>Entrar con email</h1>
      <p>Escribe tu email para solicitar acceso. La solicitud llega a <strong>jldv1508@icloud.com</strong> y solo entrarás cuando ese acceso quede aprobado.</p>
      <form id="request-form" class="stack">
        <input id="request-email" type="email" placeholder="tu@email.com" autocomplete="email" required>
        <button type="submit">Solicitar acceso</button>
      </form>
      <form id="login-form" class="stack">
        <input id="login-email" type="email" placeholder="Email aprobado" autocomplete="email" required>
        <input id="next-path" type="hidden" value="${safeNext}">
        <button type="submit" class="secondary">Entrar con email aprobado</button>
      </form>
      <div id="status" class="note">Esperando acción.</div>
    </section>
  </main>
  <script>
    const statusEl = document.getElementById('status');
    const setStatus = (text) => { statusEl.textContent = text; };

    document.getElementById('request-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = document.getElementById('request-email').value.trim();
      setStatus('Enviando solicitud...');
      const response = await fetch('/api/access-request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus('No se pudo registrar la solicitud. Revisa el email.');
        return;
      }
      if (payload.emailSent === false) {
        setStatus('Solicitud guardada, pero falta configurar el envio de correo SMTP para que llegue el email de aprobacion.');
        return;
      }
      setStatus('Solicitud enviada. Cuando jldv1508@icloud.com la apruebe, vuelve aquí y entra con el mismo email.');
    });

    document.getElementById('login-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const nextPath = document.getElementById('next-path').value || '/';
      setStatus('Comprobando acceso aprobado...');
      const response = await fetch('/api/access-session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(payload.error === 'ACCESS_PENDING' ? 'Ese email todavía no ha sido aprobado.' : 'No se pudo iniciar sesión.');
        return;
      }
      window.location.href = nextPath;
    });
  </script>
</body>
</html>`;
}

export async function GET(request) {
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const nextPath = sanitizeNextPath(new URL(request.url).searchParams.get('next') || '/');
  if (session?.email) {
    return Response.redirect(new URL(nextPath, request.url), 302);
  }
  return new Response(html(nextPath), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}
