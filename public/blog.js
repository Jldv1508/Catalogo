const repos = [
  {
    tag: 'Principal',
    lang: 'Next.js',
    title: 'Catálogo jldv1508',
    text: 'Catálogo de bisutería y conchas con portada, filtros inteligentes y una cabecera mínima de edición.',
    meta: ['GitHub', 'Vercel', 'Catálogo'],
    href: 'https://github.com/Jldv1508/Catalogo',
    action: 'Abrir código',
  },
  {
    tag: 'Utilidad',
    lang: 'HTML',
    title: 'Cabecera de edición',
    text: 'Acceso mínimo para abrir la zona de edición sin arrastrar el panel antiguo.',
    meta: ['Acceso', 'Ligero', 'Edición'],
    href: '/admin',
    action: 'Abrir edición',
  },
  {
    tag: 'Contenido',
    lang: 'JSON',
    title: 'Catálogo público',
    text: 'Fuente de datos para las vistas públicas, con tarjetas compactas y selección por atributos.',
    meta: ['Filtros', 'Ordenación', 'Vista rápida'],
    href: '/catalogo.html',
    action: 'Ver portada',
  },
];

const programs = [
  {
    title: 'Cabecera de edición',
    text: 'Entrada mínima para abrir el trabajo de edición del proyecto.',
    href: '/admin',
  },
  {
    title: 'Cabecera de conchas',
    text: 'Acceso ligero para la gestión de conchas sin panel pesado.',
    href: '/admin/conchas',
  },
  {
    title: 'Bisutería pública',
    text: 'Vista pública con árbol de categorías, filtros desplegables y visor ampliado.',
    href: '/bisuteria',
  },
  {
    title: 'Conchas públicas',
    text: 'Interfaz ligera para consultar piezas, ordenarlas y localizar variantes rápido.',
    href: '/conchas',
  },
];

const timeline = [
  {
    title: 'Inicio',
    text: 'Centraliza aquí repositorios, utilidades y programas.',
  },
  {
    title: 'Estado',
    text: 'Deja visible la versión activa y el enlace correcto de cada herramienta.',
  },
  {
    title: 'Uso',
    text: 'Haz crecer el blog con más tarjetas cuando añadas nuevos proyectos.',
  },
];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
}

function renderRepos() {
  const root = document.querySelector('#repoGrid');
  if (!root) return;
  root.innerHTML = repos.map(item => `
    <article class="repo-card">
      <div class="repo-head">
        <span class="repo-tag">${escapeHtml(item.tag)}</span>
        <span class="repo-lang">${escapeHtml(item.lang)}</span>
      </div>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.text)}</p>
      <div class="repo-meta">
        ${item.meta.map(value => `<span>${escapeHtml(value)}</span>`).join('')}
      </div>
      <div class="repo-actions">
        <a href="${escapeHtml(item.href)}"${item.href.startsWith('http') ? ' target="_blank" rel="noreferrer"' : ''}>${escapeHtml(item.action)}</a>
      </div>
    </article>
  `).join('');
}

function renderPrograms() {
  const root = document.querySelector('#programGrid');
  if (!root) return;
  root.innerHTML = programs.map(item => `
    <article class="program-card">
      <strong>${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(item.text)}</p>
      <div class="program-actions"><a href="${escapeHtml(item.href)}">Abrir</a></div>
    </article>
  `).join('');
}

function renderTimeline() {
  const root = document.querySelector('#timelineGrid');
  if (!root) return;
  root.innerHTML = timeline.map(item => `
    <div class="timeline-item">
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.text)}</span>
    </div>
  `).join('');
}

function setupNav() {
  document.querySelectorAll('.blog-nav a, .blog-actions a').forEach(link => {
    if (!link.getAttribute('href')?.startsWith('#')) return;
    link.addEventListener('click', event => {
      const id = link.getAttribute('href').slice(1);
      const target = document.getElementById(id);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

renderRepos();
renderPrograms();
renderTimeline();
setupNav();
