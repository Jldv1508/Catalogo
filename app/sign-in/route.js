import { verifySessionToken, SESSION_COOKIE } from '../../lib/access-session.js';

function sanitizeNextPath(value) {
  const nextPath = String(value || '/area-cliente').trim();
  if (!nextPath.startsWith('/') || nextPath.startsWith('//')) {
    return '/area-cliente';
  }
  return nextPath;
}

function html(nextPath = '/area-cliente') {
  const safeNext = sanitizeNextPath(nextPath).replace(/"/g, '&quot;');
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sign In · jldv1508</title>
  <style>
    *{box-sizing:border-box}
    body{margin:0;font-family:Arial,sans-serif;background:linear-gradient(180deg,#f7f2eb,#f2ebe2);color:#2d241d}
    main{min-height:100vh;display:grid;place-items:center;padding:24px}
    .shell{width:min(1160px,100%);display:grid;gap:18px}
    .hero,.card{background:#fff;border:1px solid #e0d6ca;border-radius:24px;box-shadow:0 16px 44px rgba(59,39,21,.08)}
    .hero{padding:28px;display:grid;gap:18px}
    .hero-top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}
    .hero-copy{display:grid;gap:10px;max-width:700px}
    .eyebrow{margin:0;color:#8e6644;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}
    h1{margin:0;font-family:Georgia,serif;font-size:clamp(34px,5vw,60px);line-height:.95}
    p{margin:0;line-height:1.55}
    .muted{color:#6a5b4d;font-size:14px}
    .header-tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}
    .lang-switch{display:flex;gap:8px;flex-wrap:wrap}
    .lang-button{min-height:40px;padding:9px 14px;border:1px solid #d8cdbf;border-radius:999px;background:#fff;color:#2d241d;font:inherit;font-weight:900;cursor:pointer}
    .lang-button.is-active{background:#2d241d;color:#fff;border-color:#2d241d}
    .gear-button{width:44px;min-width:44px;min-height:44px;padding:0;border:1px solid #d8cdbf;border-radius:999px;background:#fff;color:#2d241d;font-size:22px;line-height:1;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
    .gear-button.is-active{background:#2d241d;color:#fff;border-color:#2d241d}
    .steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
    .step{padding:16px;border:1px solid #eaded1;border-radius:18px;background:#fcf7f1;display:grid;gap:8px}
    .step strong{font-size:15px;line-height:1.25}
    .step span{color:#6a5b4d;font-size:13px}
    .cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
    .card{padding:24px;display:grid;gap:16px}
    .card-head{display:grid;gap:8px}
    .card-kicker{display:inline-flex;align-items:center;min-height:28px;padding:4px 10px;border-radius:999px;background:#f6efe8;color:#6a5b4d;font-size:11px;font-weight:900;text-transform:uppercase;width:max-content}
    .card h2{margin:0;font-size:28px;line-height:1.05;font-family:Georgia,serif}
    form{display:grid;gap:12px}
    label{display:grid;gap:6px}
    label span{color:#6a5b4d;font-size:12px;font-weight:900;text-transform:uppercase}
    input,button{font:inherit;border-radius:14px;padding:14px 16px;border:1px solid #d8cdbf}
    input{background:#fff;color:#2d241d}
    button{background:#2d241d;color:#fff;border:none;cursor:pointer;font-weight:900}
    button.secondary{background:#efe5da;color:#2d241d;border:1px solid #d8cdbf}
    .helper{padding:14px 16px;border-radius:16px;background:#faf5ee;border:1px solid #eaded1;color:#5f4e3f;font-size:13px}
    .note{padding:14px 16px;border-radius:16px;background:#f6efe8;border:1px solid #e6d8c9;min-height:54px;display:flex;align-items:center}
    .footer-note{padding:16px 18px;border-radius:20px;background:#fff;border:1px solid #e0d6ca;color:#6a5b4d;font-size:14px;box-shadow:0 10px 30px rgba(59,39,21,.05)}
    .owner-panel{background:#fff;border:1px solid #e0d6ca;border-radius:24px;box-shadow:0 16px 44px rgba(59,39,21,.08);padding:24px;display:grid;gap:16px}
    .owner-panel[hidden]{display:none}
    @media(max-width:860px){
      .steps,.cards{grid-template-columns:1fr}
      .hero,.card{padding:20px}
      .hero-top{align-items:stretch}
    }
  </style>
</head>
<body>
  <main>
    <section class="shell">
      <section class="hero">
        <div class="hero-top">
          <div class="hero-copy">
            <p class="eyebrow" data-i18n="eyebrow">Acceso privado · Private access</p>
            <h1 data-i18n="title">Entrar con email / Sign in with email</h1>
            <p class="muted" data-i18n="intro">Solicita acceso con tu email o entra si ya ha sido aprobado.</p>
          </div>
          <div class="header-tools">
            <div class="lang-switch" aria-label="Language switcher">
              <button type="button" class="lang-button is-active" data-lang="es">ES</button>
              <button type="button" class="lang-button" data-lang="en">EN</button>
            </div>
            <button type="button" id="owner-toggle" class="gear-button" aria-label="Owner access" aria-expanded="false">&#9881;</button>
          </div>
        </div>
        <section class="steps" aria-label="How access works">
          <article class="step">
            <strong data-i18n="step1Title">1. Solicita acceso</strong>
            <span data-i18n="step1Text">Escribe tu email en el primer bloque para enviar la solicitud.</span>
          </article>
          <article class="step">
            <strong data-i18n="step2Title">2. Espera aprobación</strong>
            <span data-i18n="step2Text">Revisamos tu solicitud y autorizamos el acceso manualmente.</span>
          </article>
          <article class="step">
            <strong data-i18n="step3Title">3. Entra con tu email</strong>
            <span data-i18n="step3Text">Cuando esté aprobado, usa el segundo bloque para entrar y abrir tu área cliente.</span>
          </article>
        </section>
      </section>
      <section class="cards">
        <section class="card">
          <div class="card-head">
            <span class="card-kicker" data-i18n="requestKicker">Nuevo acceso</span>
            <h2 data-i18n="requestTitle">Pedir acceso</h2>
            <p class="muted" data-i18n="requestText">Usa esta opción si es la primera vez que entras.</p>
          </div>
          <form id="request-form">
            <label>
              <span data-i18n="emailLabel">Tu email</span>
              <input id="request-email" type="email" placeholder="tu@email.com" autocomplete="email" required>
            </label>
            <button type="submit" data-i18n="requestButton">Solicitar acceso</button>
          </form>
          <div class="helper" data-i18n="requestHelper">Te mandaremos una aprobación manual antes de dejarte entrar.</div>
        </section>
        <section class="card">
          <div class="card-head">
            <span class="card-kicker" data-i18n="loginKicker">Acceso aprobado</span>
            <h2 data-i18n="loginTitle">Entrar</h2>
            <p class="muted" data-i18n="loginText">Usa esta opción si tu email ya fue aprobado.</p>
          </div>
          <form id="login-form">
            <label>
              <span data-i18n="approvedEmailLabel">Email aprobado</span>
              <input id="login-email" type="email" placeholder="Email aprobado" autocomplete="email" required>
            </label>
            <input id="next-path" type="hidden" value="${safeNext}">
            <button type="submit" class="secondary" data-i18n="loginButton">Entrar con email aprobado</button>
          </form>
          <div class="helper" data-i18n="loginHelper">Si tu acceso ya está aceptado, entrarás directamente a tu área cliente.</div>
        </section>
      </section>
      <section id="owner-panel" class="owner-panel" hidden>
        <div class="card-head">
          <span class="card-kicker" data-i18n="ownerKicker">Propietario</span>
          <h2 data-i18n="ownerTitle">Acceso seguro del propietario</h2>
          <p class="muted" data-i18n="ownerText">Tu correo personal no puede usarse escribiéndolo aquí. Solo entra mediante un enlace seguro enviado a tu email.</p>
        </div>
        <form id="owner-form">
          <button type="submit" data-i18n="ownerButton">Enviar enlace seguro a mi correo</button>
        </form>
        <div class="helper" data-i18n="ownerHelper">Este acceso solo funciona mediante un enlace seguro y queda oculto para clientes.</div>
      </section>
      <div id="status" class="note">Esperando acción.</div>
      <div class="footer-note" data-i18n="footerNote">Si compartes esta página con clientes internacionales, pueden cambiar a inglés desde arriba.</div>
    </section>
  </main>
  <script>
    const TRANSLATIONS = {
      es: {
        eyebrow: 'Acceso privado',
        title: 'Entrar con email',
        intro: 'Solicita acceso con tu email o entra si ya ha sido aprobado.',
        step1Title: '1. Solicita acceso',
        step1Text: 'Escribe tu email en el primer bloque para enviar la solicitud.',
        step2Title: '2. Espera aprobación',
        step2Text: 'Revisamos tu solicitud y autorizamos el acceso manualmente.',
        step3Title: '3. Entra con tu email',
        step3Text: 'Cuando esté aprobado, usa el segundo bloque para entrar y abrir tu área cliente.',
        requestKicker: 'Nuevo acceso',
        requestTitle: 'Pedir acceso',
        requestText: 'Usa esta opción si es la primera vez que entras.',
        emailLabel: 'Tu email',
        requestButton: 'Solicitar acceso',
        requestHelper: 'Te mandaremos una aprobación manual antes de dejarte entrar.',
        loginKicker: 'Acceso aprobado',
        loginTitle: 'Entrar',
        loginText: 'Usa esta opción si tu email ya fue aprobado.',
        approvedEmailLabel: 'Email aprobado',
        loginButton: 'Entrar con email aprobado',
        loginHelper: 'Si tu acceso ya está aceptado, entrarás directamente a tu área cliente.',
        ownerKicker: 'Propietario',
        ownerTitle: 'Acceso seguro del propietario',
        ownerText: 'Tu correo personal no puede usarse escribiéndolo aquí. Solo entra mediante un enlace seguro enviado a tu email.',
        ownerButton: 'Enviar enlace seguro a mi correo',
        ownerHelper: 'Este acceso solo funciona mediante un enlace seguro y queda oculto para clientes.',
        footerNote: 'Si compartes esta página con clientes internacionales, pueden cambiar a inglés desde arriba.',
        requestPlaceholder: 'tu@email.com',
        loginPlaceholder: 'Email aprobado',
        idleStatus: 'Elige una de las dos opciones para continuar.',
        sendingRequest: 'Enviando solicitud...',
        requestInvalid: 'No se pudo registrar la solicitud. Revisa el email.',
        requestSmtpMissing: 'Solicitud guardada, pero falta configurar el envío SMTP para que llegue el email de aprobación.',
        requestSent: 'Solicitud enviada. Cuando se apruebe, vuelve aquí y entra con el mismo email.',
        checkingAccess: 'Comprobando acceso aprobado...',
        accessPending: 'Ese email todavía no ha sido aprobado.',
        ownerProtected: 'Ese correo está protegido. Usa el acceso seguro del propietario.',
        loginFailed: 'No se pudo iniciar sesión.',
        ownerSending: 'Enviando enlace seguro al correo del propietario...',
        ownerSent: 'Enlace seguro enviado. Revisa tu correo para entrar.',
        ownerFailed: 'No se pudo enviar el enlace seguro del propietario.',
      },
      en: {
        eyebrow: 'Private access',
        title: 'Sign in with email',
        intro: 'Request access with your email or sign in if it has already been approved.',
        step1Title: '1. Request access',
        step1Text: 'Enter your email in the first section to send an access request.',
        step2Title: '2. Wait for approval',
        step2Text: 'We review your request and authorize access manually.',
        step3Title: '3. Sign in with your email',
        step3Text: 'Once approved, use the second section to sign in and open your client area.',
        requestKicker: 'New access',
        requestTitle: 'Request access',
        requestText: 'Use this option if this is your first time here.',
        emailLabel: 'Your email',
        requestButton: 'Request access',
        requestHelper: 'A manual approval is required before you can enter.',
        loginKicker: 'Approved access',
        loginTitle: 'Sign in',
        loginText: 'Use this option if your email has already been approved.',
        approvedEmailLabel: 'Approved email',
        loginButton: 'Sign in with approved email',
        loginHelper: 'If your access is already approved, you will go straight to your client area.',
        ownerKicker: 'Owner',
        ownerTitle: 'Secure owner access',
        ownerText: 'Your personal email cannot be used by typing it here. You can only sign in through a secure link sent to your email.',
        ownerButton: 'Send secure link to my email',
        ownerHelper: 'This access only works through a secure link and stays hidden from clients.',
        footerNote: 'If you share this page with international clients, they can switch to English from the top.',
        requestPlaceholder: 'your@email.com',
        loginPlaceholder: 'Approved email',
        idleStatus: 'Choose one of the two options to continue.',
        sendingRequest: 'Sending request...',
        requestInvalid: 'The request could not be saved. Please check the email.',
        requestSmtpMissing: 'The request was saved, but SMTP email delivery still needs to be configured.',
        requestSent: 'Request sent. Once it is approved, come back here and sign in with the same email.',
        checkingAccess: 'Checking approved access...',
        accessPending: 'That email has not been approved yet.',
        ownerProtected: 'That email is protected. Use the secure owner access instead.',
        loginFailed: 'Could not sign in.',
        ownerSending: 'Sending secure link to the owner email...',
        ownerSent: 'Secure link sent. Check your email to sign in.',
        ownerFailed: 'Could not send the secure owner link.',
      },
    };

    let currentLang = 'es';
    const statusEl = document.getElementById('status');
    const setStatus = (text) => { statusEl.textContent = text; };
    const translateText = (key) => (TRANSLATIONS[currentLang]?.[key] || '');

    function applyLanguage(lang) {
      currentLang = TRANSLATIONS[lang] ? lang : 'es';
      document.documentElement.lang = currentLang;
      document.querySelectorAll('[data-i18n]').forEach(node => {
        const key = node.dataset.i18n;
        node.innerHTML = translateText(key);
      });
      document.getElementById('request-email').placeholder = translateText('requestPlaceholder');
      document.getElementById('login-email').placeholder = translateText('loginPlaceholder');
      document.querySelectorAll('[data-lang]').forEach(button => {
        button.classList.toggle('is-active', button.dataset.lang === currentLang);
      });
      if (!statusEl.dataset.locked) {
        setStatus(translateText('idleStatus'));
      }
    }

    const browserLang = (navigator.language || '').toLowerCase().startsWith('en') ? 'en' : 'es';
    applyLanguage(browserLang);

    document.querySelectorAll('[data-lang]').forEach(button => {
      button.addEventListener('click', () => applyLanguage(button.dataset.lang || 'es'));
    });

    const ownerToggle = document.getElementById('owner-toggle');
    const ownerPanel = document.getElementById('owner-panel');
    ownerToggle?.addEventListener('click', () => {
      const isOpen = !ownerPanel.hasAttribute('hidden');
      if (isOpen) {
        ownerPanel.setAttribute('hidden', '');
      } else {
        ownerPanel.removeAttribute('hidden');
      }
      ownerToggle.classList.toggle('is-active', !isOpen);
      ownerToggle.setAttribute('aria-expanded', String(!isOpen));
    });

    document.getElementById('request-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = document.getElementById('request-email').value.trim();
      statusEl.dataset.locked = '1';
      setStatus(translateText('sendingRequest'));
      const response = await fetch('/api/access-request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(translateText('requestInvalid'));
        return;
      }
      if (payload.emailSent === false) {
        setStatus(translateText('requestSmtpMissing'));
        return;
      }
      setStatus(translateText('requestSent'));
    });

    document.getElementById('login-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const nextPath = document.getElementById('next-path').value || '/';
      statusEl.dataset.locked = '1';
      setStatus(translateText('checkingAccess'));
      const response = await fetch('/api/access-session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (payload.error === 'ACCESS_PENDING') {
          setStatus(translateText('accessPending'));
          return;
        }
        if (payload.error === 'OWNER_MAGIC_LINK_REQUIRED') {
          setStatus(translateText('ownerProtected'));
          return;
        }
        setStatus(translateText('loginFailed'));
        return;
      }
      window.location.href = nextPath;
    });

    document.getElementById('owner-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      statusEl.dataset.locked = '1';
      setStatus(translateText('ownerSending'));
      const nextPath = document.getElementById('next-path').value || '/base-clientes';
      const response = await fetch('/api/owner-access-request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ next: nextPath }),
      });
      if (!response.ok) {
        setStatus(translateText('ownerFailed'));
        return;
      }
      setStatus(translateText('ownerSent'));
    });
  </script>
</body>
</html>`;
}

export async function GET(request) {
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const nextPath = sanitizeNextPath(new URL(request.url).searchParams.get('next') || '/area-cliente');
  if (session?.email) {
    return Response.redirect(new URL(nextPath, request.url), 302);
  }
  return new Response(html(nextPath), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}
