import { SESSION_COOKIE, verifySessionToken } from '../../lib/access-session.js';
import { isOwnerEmail } from '../../lib/owner-access.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
}

function pageHtml(email) {
  const safeEmail = escapeHtml(email);
  const safeEmailJson = JSON.stringify(email);
  const ownerLinks = isOwnerEmail(email)
    ? '<a href="/base-clientes" class="secondary">Base de clientes</a>'
    : '';
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Area cliente · jldv1508</title>
  <style>
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;background:#f7f2eb;color:#2d241d;font-family:Arial,sans-serif}
    main{width:min(1180px,calc(100vw - 32px));margin:0 auto;padding:28px 0 44px;display:grid;gap:18px}
    .hero,.grid article,.section{background:#fff;border:1px solid #e0d6ca;border-radius:22px;box-shadow:0 16px 40px rgba(59,39,21,.08)}
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
    .section{padding:24px;display:grid;gap:16px}
    .section-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
    .section-head strong{font-size:24px;line-height:1.1}
    .section-head span{color:#6a5b4d;line-height:1.45}
    .favorites-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}
    .favorite-card{display:grid;grid-template-rows:180px auto;overflow:hidden;border:1px solid #e0d6ca;border-radius:18px;background:#fff8f1}
    .favorite-card-image{display:grid;place-items:center;padding:14px;background:#fff}
    .favorite-card-image img{width:100%;height:100%;object-fit:contain}
    .favorite-card-empty{width:100%;height:100%;display:grid;place-items:center;border:1px dashed #dfd1c1;border-radius:14px;background:#faf4ec;color:#8c7764;font-size:12px;font-weight:900;text-transform:uppercase}
    .favorite-card-copy{display:grid;gap:8px;padding:14px}
    .favorite-card-copy strong{font-size:16px;line-height:1.2}
    .favorite-card-copy span{color:#6a5b4d;font-size:13px;line-height:1.45}
    .status-note{padding:12px 14px;border-radius:14px;background:#f8f1ea;border:1px solid #eadbc9;color:#5f4e3f;font-size:13px;font-weight:700}
    form{display:grid;gap:14px}
    .form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    label{display:grid;gap:6px}
    label span{color:#6a5b4d;font-size:12px;font-weight:900;text-transform:uppercase}
    input,textarea{width:100%;border:1px solid #d8cdbf;border-radius:12px;padding:12px 14px;background:#fff;color:#2d241d;font:inherit}
    textarea{min-height:120px;resize:vertical}
    .full{grid-column:1 / -1}
    .form-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
    .form-status{color:#6a5b4d;font-size:13px;font-weight:700}
    @media(max-width:860px){.grid,.form-grid{grid-template-columns:1fr}}
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
        ${ownerLinks}
        <button type="button" id="signOutButton" class="secondary">Cerrar sesion</button>
      </div>
    </section>
    <section class="grid">
      <article>
        <strong>Catalogo publico</strong>
        <span>Consulta las piezas visibles, marca favoritos en el catalogo y vuelvelos a ver desde esta area cliente.</span>
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
    <section class="section">
      <div class="section-head">
        <div>
          <strong>Favoritos guardados</strong>
          <span>Estas piezas se marcan previamente dentro del catalogo y aparecen aqui para el cliente.</span>
        </div>
        <a href="/catalogo-publico" class="secondary">Marcar favoritos</a>
      </div>
      <div id="favoritesStatus" class="status-note">Cargando favoritos del cliente...</div>
      <div id="favoritesGrid" class="favorites-grid"></div>
    </section>
    <section class="section">
      <div class="section-head">
        <div>
          <strong>Ficha del cliente</strong>
          <span>El cliente puede rellenar sus datos y guardarlos dentro de su acceso autorizado.</span>
        </div>
        <span class="pill">${safeEmail}</span>
      </div>
      <form id="clientProfileForm">
        <div class="form-grid">
          <label>
            <span>Nombre</span>
            <input name="nombre" type="text" autocomplete="given-name">
          </label>
          <label>
            <span>Apellidos</span>
            <input name="apellidos" type="text" autocomplete="family-name">
          </label>
          <label>
            <span>Empresa</span>
            <input name="empresa" type="text" autocomplete="organization">
          </label>
          <label>
            <span>Telefono</span>
            <input name="telefono" type="tel" autocomplete="tel">
          </label>
          <label>
            <span>Email</span>
            <input name="email" type="email" value="${safeEmail}" autocomplete="email" readonly>
          </label>
          <label>
            <span>Ciudad</span>
            <input name="ciudad" type="text" autocomplete="address-level2">
          </label>
          <label class="full">
            <span>Direccion</span>
            <input name="direccion" type="text" autocomplete="street-address">
          </label>
          <label class="full">
            <span>Notas</span>
            <textarea name="notas" placeholder="Preferencias, medidas, pedido o cualquier dato que quiera dejar guardado."></textarea>
          </label>
        </div>
        <div class="form-actions">
          <button type="submit">Guardar ficha</button>
          <span id="profileStatus" class="form-status">Esperando cambios.</span>
        </div>
      </form>
    </section>
  </main>
  <script>
    const CLIENT_AREA_URL = '/api/client-area';
    const CATALOG_URL = '/api/catalogo-publico';
    const sessionEmail = ${safeEmailJson};

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
    }

    function rowKey(item) {
      return item.codigo || item.archivo || item.referencia_csv || [item.tipo || '', item.material || '', item.color || '', item.nombre_comercial || ''].join('-');
    }

    function normalizePayload(payload) {
      if (Array.isArray(payload)) return { items: payload, tables: {} };
      return {
        items: Array.isArray(payload?.items) ? payload.items : [],
        tables: payload?.tables && typeof payload.tables === 'object' ? payload.tables : {},
      };
    }

    function cleanText(value) {
      return String(value || '').trim();
    }

    function cardTitle(item) {
      return item.productName || item.nombre_comercial || item.codigo || item.referencia_csv || 'Pieza';
    }

    function typeName(item, tables) {
      return tables?.types?.[item.type || item.tipo || ''] || cleanText(item.tipo_nombre) || 'Pieza';
    }

    function materialName(item, tables) {
      return cleanText(item.material_nombre) || tables?.materials?.[item.material || ''] || '';
    }

    function colorName(item, tables) {
      return cleanText(item.color_nombre) || tables?.colors?.[item.color || ''] || '';
    }

    function imageHtml(item) {
      const image = item.archivo || item.image || '';
      return image
        ? '<img src="' + escapeHtml(image) + '" alt="' + escapeHtml(cardTitle(item)) + '" loading="lazy">'
        : '<span class="favorite-card-empty">Sin imagen</span>';
    }

    function favoriteMeta(item, tables) {
      return [typeName(item, tables), materialName(item, tables), colorName(item, tables)].filter(Boolean).join(' · ');
    }

    function setFavoritesStatus(text) {
      document.getElementById('favoritesStatus').textContent = text;
    }

    function renderFavorites(items, tables, favorites) {
      const favoritesGrid = document.getElementById('favoritesGrid');
      const selected = items.filter(item => favorites.includes(rowKey(item)));
      if (!selected.length) {
        setFavoritesStatus('Todavia no hay favoritos marcados en el catalogo para este cliente.');
        favoritesGrid.innerHTML = '';
        return;
      }
      setFavoritesStatus(selected.length + ' favoritos guardados para ' + sessionEmail + '.');
      favoritesGrid.innerHTML = selected.map(item => '<article class="favorite-card">' +
        '<div class="favorite-card-image">' + imageHtml(item) + '</div>' +
        '<div class="favorite-card-copy">' +
          '<strong>' + escapeHtml(cardTitle(item)) + '</strong>' +
          '<span>' + escapeHtml(favoriteMeta(item, tables) || 'Pieza guardada en favoritos') + '</span>' +
          '<span>' + escapeHtml(cleanText(item.descripcion || item.description || item.codigo || item.referencia_csv || '')) + '</span>' +
        '</div>' +
      '</article>').join('');
    }

    function fillProfileForm(profile) {
      const form = document.getElementById('clientProfileForm');
      if (!form || !profile) return;
      ['nombre', 'apellidos', 'empresa', 'telefono', 'ciudad', 'direccion', 'notas'].forEach(field => {
        if (form.elements[field]) {
          form.elements[field].value = profile[field] || '';
        }
      });
      if (form.elements.email) {
        form.elements.email.value = profile.email || sessionEmail;
      }
    }

    async function signOut() {
      await fetch('/api/access-session', { method: 'DELETE' });
      window.location.href = '/sign-in';
    }

    async function loadClientArea() {
      const [areaResponse, catalogResponse] = await Promise.all([
        fetch(CLIENT_AREA_URL, { cache: 'no-store' }),
        fetch(CATALOG_URL, { cache: 'no-store' }),
      ]);
      const areaPayload = await areaResponse.json().catch(() => ({}));
      const catalogPayload = normalizePayload(await catalogResponse.json().catch(() => ({})));
      if (!areaResponse.ok) {
        setFavoritesStatus('No se pudieron cargar los datos del cliente.');
        return;
      }
      fillProfileForm(areaPayload.profile || {});
      renderFavorites(catalogPayload.items, catalogPayload.tables || {}, Array.isArray(areaPayload.favorites) ? areaPayload.favorites : []);
    }

    document.getElementById('clientProfileForm')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const profileStatus = document.getElementById('profileStatus');
      const profile = {
        nombre: form.elements.nombre.value,
        apellidos: form.elements.apellidos.value,
        empresa: form.elements.empresa.value,
        telefono: form.elements.telefono.value,
        ciudad: form.elements.ciudad.value,
        direccion: form.elements.direccion.value,
        notas: form.elements.notas.value,
      };
      profileStatus.textContent = 'Guardando ficha...';
      const response = await fetch(CLIENT_AREA_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profile }),
      });
      if (!response.ok) {
        profileStatus.textContent = 'No se pudo guardar la ficha.';
        return;
      }
      const payload = await response.json().catch(() => ({}));
      fillProfileForm(payload.profile || profile);
      profileStatus.textContent = 'Ficha guardada correctamente.';
    });

    document.getElementById('signOutButton')?.addEventListener('click', signOut);
    document.getElementById('signOutButtonCard')?.addEventListener('click', signOut);
    loadClientArea();
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
