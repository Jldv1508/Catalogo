const TYPE = { PUL: 'Pulsera', ANI: 'Anillo', PEN: 'Pendiente', COL: 'Collar', CON: 'Conjunto', BRO: 'Broche', PIE: 'Pieza', CCH: 'Concha', ACC: 'Accesorio', PIN: 'Pin' };
const COLOR = { '000': 'Pendiente', '001': 'Multicolor', '002': 'Blanco', '003': 'Negro', '004': 'Rojo', '005': 'Plateado', '006': 'Verde', '007': 'Azul', '008': 'Marrón', '009': 'Multicolor', '010': 'Naranja', '011': 'Amarillo', '012': 'Morado', '013': 'Turquesa', '014': 'Rosa', '015': 'Gris', '016': 'Lila', '017': 'Fucsia', '999': 'Pendiente' };
const MATERIAL = { '000': 'Pendiente', '001': 'Resina', '002': 'Latón', '003': 'Piedra', '004': 'Cristal', '005': 'Acero inoxidable', '006': 'Metal', '007': 'Cuero', '008': 'Tela', '009': 'Material mixto', '010': 'Perla', '011': 'Acero', '012': 'Plata', '013': 'Dorado / baño oro', '999': 'Pendiente' };
const STATUS = { disponible: 'Disponible', reservado: 'Reservado', vendido: 'Vendido', oculto: 'Oculto' };

const grid = document.querySelector('#grid');
const search = document.querySelector('#search');
const status = document.querySelector('#status');
const typeFilter = document.querySelector('#typeFilter');
const materialFilter = document.querySelector('#materialFilter');
const colorFilter = document.querySelector('#colorFilter');
const visibleCount = document.querySelector('#visibleCount');
const clearFilters = document.querySelector('#clearFilters');
const catalogUrl = document.body.dataset.catalogUrl || 'catalogo-fotos.json?v=780-20260630';
const publicStorageKey = document.body.dataset.publicStorageKey || '';
const emptyTitle = document.body.dataset.emptyTitle || 'Catálogo en blanco';
const emptyText = document.body.dataset.emptyText || 'Estamos preparando una nueva selección de piezas.';
let catalog = [];
let syncingFilters = false;
let currentRows = [];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
}

function labelFor(table, key, fallback) {
  return fallback || table[key] || key || 'Pendiente';
}

function cleanName(value) {
  return String(value || '').trim();
}

function typeName(item) {
  return TYPE[itemType(item)] || cleanName(item.tipo_nombre) || 'Tipo pendiente';
}

function materialName(item) {
  return cleanName(item.material_nombre) || MATERIAL[itemMaterial(item)] || 'Material pendiente';
}

function colorName(item) {
  return cleanName(item.color_nombre) || COLOR[itemColor(item)] || 'Color pendiente';
}

function itemType(item) {
  return item.tipo || 'PIE';
}

function itemMaterial(item) {
  return item.material || '000';
}

function itemColor(item) {
  return item.color || '000';
}

function searchText(item) {
  return [
    item.codigo,
    item.referencia_csv,
    item.idf,
    item.nombre_comercial,
    item.tipo,
    TYPE[item.tipo],
    item.material,
    item.material_nombre,
    item.color,
    item.color_nombre,
    item.estado,
    STATUS[item.estado],
    item.medidas,
    item.descripcion,
  ].join(' ').toLowerCase();
}

function baseRows() {
  const query = search.value.trim().toLowerCase();
  return catalog.filter(item =>
    (!status?.value || (item.estado || 'disponible') === status.value) &&
    (!query || searchText(item).includes(query))
  );
}

function rowsForOptions(ignore) {
  return baseRows().filter(item =>
    (ignore === 'type' || !typeFilter?.value || itemType(item) === typeFilter.value) &&
    (ignore === 'material' || !materialFilter?.value || itemMaterial(item) === materialFilter.value) &&
    (ignore === 'color' || !colorFilter?.value || itemColor(item) === colorFilter.value)
  );
}

function selectedRows() {
  return baseRows().filter(item =>
    (!typeFilter?.value || itemType(item) === typeFilter.value) &&
    (!materialFilter?.value || itemMaterial(item) === materialFilter.value) &&
    (!colorFilter?.value || itemColor(item) === colorFilter.value)
  );
}

function optionRows(rows, keyFn, labelFn) {
  const options = new Map();
  rows.forEach(item => {
    const key = keyFn(item);
    if (!options.has(key)) options.set(key, { label: labelFn(item), count: 0 });
    options.get(key).count += 1;
  });
  return [...options.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label, 'es'));
}

function fillSelect(select, placeholder, options) {
  if (!select) return;
  const previous = select.value;
  select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>`;
  options.forEach(([key, option]) => {
    select.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(key)}">${escapeHtml(option.label)} (${option.count})</option>`);
  });
  select.value = options.some(([key]) => key === previous) ? previous : '';
}

function syncSmartFilters() {
  syncingFilters = true;
  fillSelect(
    typeFilter,
    'Todos los tipos',
    optionRows(rowsForOptions('type'), itemType, typeName)
  );
  fillSelect(
    materialFilter,
    'Todos los materiales',
    optionRows(rowsForOptions('material'), itemMaterial, materialName)
  );
  fillSelect(
    colorFilter,
    'Todos los colores',
    optionRows(rowsForOptions('color'), itemColor, colorName)
  );
  syncingFilters = false;
}

function syncUrl() {
  const params = new URLSearchParams();
  if (search.value.trim()) params.set('q', search.value.trim());
  if (typeFilter?.value) params.set('tipo', typeFilter.value);
  if (materialFilter?.value) params.set('material', materialFilter.value);
  if (colorFilter?.value) params.set('color', colorFilter.value);
  if (status?.value) params.set('estado', status.value);
  history.replaceState(null, '', `${location.pathname}${params.toString() ? `?${params}` : ''}`);
}

function restoreUrlFilters() {
  const params = new URLSearchParams(location.search);
  search.value = params.get('q') || '';
  if (status) status.value = params.get('estado') || '';
  if (typeFilter) typeFilter.value = params.get('tipo') || '';
  if (materialFilter) materialFilter.value = params.get('material') || '';
  if (colorFilter) colorFilter.value = params.get('color') || '';
}

function optionizeStatus() {
  const values = catalog.reduce((options, item) => {
    const key = item.estado || 'disponible';
    if (!options[key]) options[key] = STATUS[key] || key;
    return options;
  }, {});
  status.innerHTML = '<option value="">Todos los estados</option>';
  Object.entries(values).forEach(([key, value]) => {
    status.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(key)}">${escapeHtml(value)}</option>`);
  });
}

function imageStyle(item) {
  const x = Number(item.image_x ?? item.imagePositionX ?? 50);
  const y = Number(item.image_y ?? item.imagePositionY ?? 50);
  const zoom = Number(item.image_zoom ?? item.imageZoom ?? 1);
  const safeX = Number.isFinite(x) ? Math.min(100, Math.max(0, x)) : 50;
  const safeY = Number.isFinite(y) ? Math.min(100, Math.max(0, y)) : 50;
  const safeZoom = Number.isFinite(zoom) ? Math.min(2.2, Math.max(.7, zoom)) : 1;
  return `--image-x:${safeX}%;--image-y:${safeY}%;--image-zoom:${safeZoom};`;
}

function priceText(value) {
  const number = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(number) && number > 0 ? `${number.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : '';
}

function cardTitle(item) {
  return item.nombre_comercial || item.codigo || item.referencia_csv || 'Pieza';
}

function itemDetails(item) {
  return [
    ['Código', item.codigo || ''],
    ['Tipo', typeName(item)],
    ['Material', materialName(item)],
    ['Color', colorName(item)],
    ['Precio', priceText(item.precio_eur) || 'Precio pendiente'],
    ['Estado', `${STATUS[item.estado] || item.estado || 'Disponible'}${item.stock ? ` · Stock ${item.stock}` : ''}`],
    ['Medidas', item.medidas || ''],
    ['Descripción', item.descripcion || ''],
  ].filter(([, value]) => String(value || '').trim());
}

function detailsHtml(item) {
  return `<dl>${itemDetails(item).map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>`;
}

function render() {
  syncSmartFilters();
  const rows = selectedRows();
  currentRows = rows;
  syncUrl();
  if (visibleCount) visibleCount.textContent = `${rows.length} de ${catalog.length}`;
  grid.innerHTML = rows.length ? rows.map((item, index) => `<article class="card type-${escapeHtml(item.tipo)}">
    <button class="image image-button" type="button" data-card-index="${index}" aria-label="Ampliar ${escapeHtml(cardTitle(item))}">
      <img src="${escapeHtml(item.archivo)}" alt="${escapeHtml(item.codigo)}" loading="lazy" style="${imageStyle(item)}">
    </button>
    <div class="card-info">
      <strong>${escapeHtml(cardTitle(item))}</strong>
    </div>
  </article>`).join('') : `<section class="empty-state"><strong>${escapeHtml(emptyTitle)}</strong><span>${escapeHtml(emptyText)}</span></section>`;
}

function ensureViewer() {
  let viewer = document.querySelector('#itemViewer');
  if (viewer) return viewer;
  document.body.insertAdjacentHTML('beforeend', `<div id="itemViewer" class="item-viewer" hidden>
    <div class="item-viewer-backdrop" data-close-viewer></div>
    <article class="item-viewer-panel" role="dialog" aria-modal="true" aria-labelledby="itemViewerTitle">
      <button class="item-viewer-close" type="button" data-close-viewer aria-label="Cerrar">×</button>
      <div class="item-viewer-image"></div>
      <div class="item-viewer-info">
        <p class="item-viewer-kicker">Ficha de pieza</p>
        <h2 id="itemViewerTitle"></h2>
        <div class="item-viewer-details"></div>
      </div>
    </article>
  </div>`);
  viewer = document.querySelector('#itemViewer');
  viewer.addEventListener('click', event => {
    if (event.target.closest('[data-close-viewer]')) closeViewer();
  });
  return viewer;
}

function openViewer(item) {
  const viewer = ensureViewer();
  viewer.querySelector('#itemViewerTitle').textContent = cardTitle(item);
  viewer.querySelector('.item-viewer-image').innerHTML = `<img src="${escapeHtml(item.archivo)}" alt="${escapeHtml(item.codigo || cardTitle(item))}" style="${imageStyle(item)}">`;
  viewer.querySelector('.item-viewer-details').innerHTML = detailsHtml(item);
  viewer.hidden = false;
  document.body.classList.add('viewer-open');
  viewer.querySelector('.item-viewer-close').focus();
}

function closeViewer() {
  const viewer = document.querySelector('#itemViewer');
  if (!viewer) return;
  viewer.hidden = true;
  document.body.classList.remove('viewer-open');
}

function localPublicCatalog() {
  if (!publicStorageKey) return null;
  try {
    const payload = JSON.parse(localStorage.getItem(publicStorageKey) || 'null');
    return Array.isArray(payload?.items) ? payload.items : null;
  } catch {
    return null;
  }
}

function renderFromEvent() {
  if (!syncingFilters) render();
}

search.addEventListener('input', render);
status?.addEventListener('input', render);
typeFilter?.addEventListener('input', renderFromEvent);
materialFilter?.addEventListener('input', renderFromEvent);
colorFilter?.addEventListener('input', renderFromEvent);
clearFilters?.addEventListener('click', () => {
  search.value = '';
  if (status) status.value = '';
  if (typeFilter) typeFilter.value = '';
  if (materialFilter) materialFilter.value = '';
  if (colorFilter) colorFilter.value = '';
  render();
});
grid?.addEventListener('click', event => {
  const card = event.target.closest('[data-card-index]');
  if (!card) return;
  const item = currentRows[Number(card.dataset.cardIndex)];
  if (item) openViewer(item);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeViewer();
});

fetch(catalogUrl).then(response => response.json()).then(data => {
  catalog = localPublicCatalog() || data;
  optionizeStatus();
  syncSmartFilters();
  restoreUrlFilters();
  render();
});
