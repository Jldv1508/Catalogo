const TYPE = { PUL: 'Pulsera', ANI: 'Anillo', PEN: 'Pendiente', COL: 'Collar', CON: 'Conjunto', BRO: 'Broche', PIE: 'Pieza', CCH: 'Concha', ACC: 'Accesorio', PIN: 'Pin' };
const COLOR = { '000': 'Pendiente', '001': 'Multicolor', '002': 'Blanco', '003': 'Negro', '004': 'Rojo', '005': 'Plateado', '006': 'Verde', '007': 'Azul', '008': 'Marrón', '009': 'Multicolor', '010': 'Naranja', '011': 'Amarillo', '012': 'Morado', '013': 'Turquesa', '014': 'Rosa', '015': 'Gris', '016': 'Lila', '017': 'Fucsia', '999': 'Pendiente' };
const MATERIAL = { '000': 'Pendiente', '001': 'Resina', '002': 'Latón', '003': 'Piedra', '004': 'Cristal', '005': 'Acero inoxidable', '006': 'Metal', '007': 'Cuero', '008': 'Tela', '009': 'Material mixto', '010': 'Perla', '011': 'Acero', '012': 'Plata', '013': 'Dorado / baño oro', '999': 'Pendiente' };
const STATUS = { disponible: 'Disponible', reservado: 'Reservado', vendido: 'Vendido', oculto: 'Oculto' };
const DEFAULT_TABLES = { types: TYPE, materials: MATERIAL, colors: COLOR };

const grid = document.querySelector('#grid');
const search = document.querySelector('#search');
const sortOrder = document.querySelector('#sortOrder');
const typeFilter = document.querySelector('#typeFilter');
const materialFilter = document.querySelector('#materialFilter');
const colorFilter = document.querySelector('#colorFilter');
const priceMin = document.querySelector('#priceMin');
const priceMax = document.querySelector('#priceMax');
const priceFilterMeta = document.querySelector('#priceFilterMeta');
const priceFilterNote = document.querySelector('#priceFilterNote');
const clearFilters = document.querySelector('#clearFilters');
const visibleCount = document.querySelector('#visibleCount');
const resultSummary = document.querySelector('#resultSummary');
const resultHint = document.querySelector('#resultHint');
const activeFilters = document.querySelector('#activeFilters');
const typeShortcutChips = document.querySelector('#typeShortcutChips');
const materialShortcutChips = document.querySelector('#materialShortcutChips');
const colorShortcutChips = document.querySelector('#colorShortcutChips');
const catalogUrl = document.body.dataset.catalogUrl || 'catalogo-unificado.json?v=20260708-cleanup';
const publicStorageKey = document.body.dataset.publicStorageKey || '';
const emptyTitle = document.body.dataset.emptyTitle || 'Catálogo en blanco';
const emptyText = document.body.dataset.emptyText || 'Estamos preparando una nueva selección de piezas.';
let catalog = [];
let baseCatalog = [];
let activeTables = DEFAULT_TABLES;
let syncingFilters = false;
let currentRows = [];
let originalIndexById = new Map();

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function labelFor(table, key, fallback) {
  return fallback || table[key] || key || 'Pendiente';
}

function mergeTables(source) {
  const base = source || {};
  return {
    types: { ...(DEFAULT_TABLES.types || {}), ...(base.types || {}) },
    materials: { ...(DEFAULT_TABLES.materials || {}), ...(base.materials || {}) },
    colors: { ...(DEFAULT_TABLES.colors || {}), ...(base.colors || {}) },
  };
}

function cleanName(value) {
  return String(value || '').trim();
}

function normalizeText(value) {
  return cleanName(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function queryTokens() {
  return normalizeText(search?.value || '')
    .split(/\s+/)
    .filter(Boolean);
}

function typeName(item) {
  return activeTables.types[itemType(item)] || cleanName(item.tipo_nombre) || 'Tipo pendiente';
}

function materialName(item) {
  return cleanName(item.material_nombre) || activeTables.materials[itemMaterial(item)] || 'Material pendiente';
}

function colorName(item) {
  return cleanName(item.color_nombre) || activeTables.colors[itemColor(item)] || 'Color pendiente';
}

function itemType(item) {
  return item.type || item.tipo || 'PIE';
}

function itemMaterial(item) {
  return item.material || '000';
}

function itemColor(item) {
  return item.color || '000';
}

function itemPrice(item) {
  const raw = item.precio_eur ?? item.price ?? '';
  const value = Number(String(raw).replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function itemIdf(item) {
  return cleanName(item.idf || item.id || item.codigo || '');
}

function searchText(item) {
  return normalizeText([
    item.codigo,
    item.referencia_csv,
    item.idf,
    item.nombre_comercial,
    item.productName,
    item.type,
    item.tipo,
    activeTables.types[itemType(item)],
    item.material,
    item.material_nombre,
    item.color,
    item.color_nombre,
    item.estado,
    STATUS[item.estado],
    item.medidas,
    item.descripcion,
  ].join(' '));
}

function matchesQuery(item) {
  const tokens = queryTokens();
  if (!tokens.length) return true;
  const haystack = searchText(item);
  return tokens.every(token => haystack.includes(token));
}

function baseRows() {
  return catalog.filter(item => matchesQuery(item));
}

function priceFilters() {
  const min = Number(String(priceMin?.value || '').replace(',', '.'));
  const max = Number(String(priceMax?.value || '').replace(',', '.'));
  return {
    min: Number.isFinite(min) && min >= 0 ? min : null,
    max: Number.isFinite(max) && max >= 0 ? max : null,
  };
}

function matchesPrice(item) {
  const { min, max } = priceFilters();
  if (min == null && max == null) return true;
  const price = itemPrice(item);
  if (price == null) return false;
  if (min != null && price < min) return false;
  if (max != null && price > max) return false;
  return true;
}

function rowsForOptions(ignore) {
  return baseRows().filter(item =>
    matchesPrice(item) &&
    (ignore === 'type' || !typeFilter?.value || itemType(item) === typeFilter.value) &&
    (ignore === 'material' || !materialFilter?.value || itemMaterial(item) === materialFilter.value) &&
    (ignore === 'color' || !colorFilter?.value || itemColor(item) === colorFilter.value)
  );
}

function selectedRows() {
  return baseRows().filter(item =>
    matchesPrice(item) &&
    (!typeFilter?.value || itemType(item) === typeFilter.value) &&
    (!materialFilter?.value || itemMaterial(item) === materialFilter.value) &&
    (!colorFilter?.value || itemColor(item) === colorFilter.value)
  );
}

function sortRows(rows) {
  const mode = sortOrder?.value || 'original';
  const compare = {
    original: (a, b) => (originalIndexById.get(a.codigo || a.archivo || a.referencia_csv || '') ?? 0) - (originalIndexById.get(b.codigo || b.archivo || b.referencia_csv || '') ?? 0),
    name: (a, b) => cardTitle(a).localeCompare(cardTitle(b), 'es'),
    type: (a, b) => typeName(a).localeCompare(typeName(b), 'es') || cardTitle(a).localeCompare(cardTitle(b), 'es'),
    material: (a, b) => materialName(a).localeCompare(materialName(b), 'es') || cardTitle(a).localeCompare(cardTitle(b), 'es'),
    color: (a, b) => colorName(a).localeCompare(colorName(b), 'es') || cardTitle(a).localeCompare(cardTitle(b), 'es'),
  }[mode] || (() => 0);
  return [...rows].sort(compare);
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

function topOptions(options, limit = 8) {
  return [...options]
    .sort((a, b) => b[1].count - a[1].count || a[1].label.localeCompare(b[1].label, 'es'))
    .slice(0, limit);
}

function renderShortcutChips(container, filterName, options, activeValue) {
  if (!container) return;
  const top = topOptions(options);
  if (!top.length) {
    container.innerHTML = '<span class="filter-chip-empty">Sin opciones</span>';
    return;
  }
  container.innerHTML = top.map(([key, option]) => `<button type="button" class="filter-chip${key === activeValue ? ' is-active' : ''}" data-filter-target="${escapeAttr(filterName)}" data-filter-value="${escapeAttr(key)}">${escapeHtml(option.label)}<span>${option.count}</span></button>`).join('');
}

function syncSmartFilters() {
  syncingFilters = true;
  const typeOptions = optionRows(rowsForOptions('type'), itemType, typeName);
  const materialOptions = optionRows(rowsForOptions('material'), itemMaterial, materialName);
  const colorOptions = optionRows(rowsForOptions('color'), itemColor, colorName);
  fillSelect(
    typeFilter,
    'Todos los tipos',
    typeOptions
  );
  fillSelect(
    materialFilter,
    'Todos los materiales',
    materialOptions
  );
  fillSelect(
    colorFilter,
    'Todos los colores',
    colorOptions
  );
  renderShortcutChips(typeShortcutChips, 'type', typeOptions, typeFilter?.value || '');
  renderShortcutChips(materialShortcutChips, 'material', materialOptions, materialFilter?.value || '');
  renderShortcutChips(colorShortcutChips, 'color', colorOptions, colorFilter?.value || '');
  syncingFilters = false;
}

function syncUrl() {
  const params = new URLSearchParams();
  if (search.value.trim()) params.set('q', search.value.trim());
  if (typeFilter?.value) params.set('tipo', typeFilter.value);
  if (materialFilter?.value) params.set('material', materialFilter.value);
  if (colorFilter?.value) params.set('color', colorFilter.value);
  if (priceMin?.value.trim()) params.set('precioMin', priceMin.value.trim());
  if (priceMax?.value.trim()) params.set('precioMax', priceMax.value.trim());
  if (sortOrder?.value && sortOrder.value !== 'original') params.set('sort', sortOrder.value);
  history.replaceState(null, '', `${location.pathname}${params.toString() ? `?${params}` : ''}`);
}

function restoreUrlFilters() {
  const params = new URLSearchParams(location.search);
  search.value = params.get('q') || '';
  if (typeFilter) typeFilter.value = params.get('tipo') || '';
  if (materialFilter) materialFilter.value = params.get('material') || '';
  if (colorFilter) colorFilter.value = params.get('color') || '';
  if (priceMin) priceMin.value = params.get('precioMin') || '';
  if (priceMax) priceMax.value = params.get('precioMax') || '';
  if (sortOrder) sortOrder.value = params.get('sort') || 'original';
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

function catalogImage(item) {
  return item.archivo || item.image || '';
}

function catalogImageHtml(item) {
  const image = catalogImage(item);
  if (!image) return '<span class="image-empty">Sin imagen</span>';
  return `<img src="${escapeHtml(image)}" alt="${escapeHtml(item.codigo || cardTitle(item))}" loading="lazy" style="${imageStyle(item)}">`;
}

function priceText(value) {
  const number = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(number) && number > 0 ? `${number.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : '';
}

function cardTitle(item) {
  return item.productName || item.nombre_comercial || item.codigo || item.referencia_csv || 'Pieza';
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

function selectedOptionLabel(select, fallback = '') {
  const option = [...(select?.options || [])].find(current => current.value === select.value);
  return option ? option.textContent.replace(/\s+\(\d+\)\s*$/, '') : fallback;
}

function availablePrices() {
  return catalog.map(itemPrice).filter(price => price != null);
}

function updatePriceFilterMeta() {
  const prices = availablePrices();
  if (!priceFilterMeta || !priceFilterNote) return;
  if (!prices.length) {
    priceFilterMeta.textContent = 'Sin precios';
    priceFilterNote.textContent = 'El filtro se activa cuando las piezas tengan precio cargado.';
    return;
  }
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  priceFilterMeta.textContent = `${min.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € - ${max.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  priceFilterNote.textContent = `${prices.length.toLocaleString('es-ES')} piezas tienen precio disponible para filtrar.`;
}

function activeFilterEntries() {
  const entries = [];
  if (search?.value.trim()) entries.push({ key: 'search', label: `Busqueda: ${search.value.trim()}` });
  if (typeFilter?.value) entries.push({ key: 'type', label: `Tipo: ${selectedOptionLabel(typeFilter, activeTables.types[typeFilter.value] || typeFilter.value)}` });
  if (materialFilter?.value) entries.push({ key: 'material', label: `Material: ${selectedOptionLabel(materialFilter, activeTables.materials[materialFilter.value] || materialFilter.value)}` });
  if (colorFilter?.value) entries.push({ key: 'color', label: `Color: ${selectedOptionLabel(colorFilter, activeTables.colors[colorFilter.value] || colorFilter.value)}` });
  const { min, max } = priceFilters();
  if (min != null) entries.push({ key: 'priceMin', label: `Desde: ${min.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` });
  if (max != null) entries.push({ key: 'priceMax', label: `Hasta: ${max.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` });
  if (sortOrder?.value && sortOrder.value !== 'original') entries.push({ key: 'sort', label: `Orden: ${selectedOptionLabel(sortOrder, sortOrder.value)}` });
  return entries;
}

function hasActiveFilters() {
  return activeFilterEntries().length > 0;
}

function renderActiveFilters() {
  if (!activeFilters) return;
  const entries = activeFilterEntries();
  activeFilters.hidden = !entries.length;
  activeFilters.innerHTML = entries.map(entry => `<button type="button" class="active-filter-chip" data-remove-filter="${escapeAttr(entry.key)}">${escapeHtml(entry.label)}<span aria-hidden="true">×</span></button>`).join('');
}

function renderResultSummary(totalRows, visibleRows) {
  if (visibleCount) {
    visibleCount.textContent = `${visibleRows.length.toLocaleString('es-ES')} piezas`;
  }
  if (resultSummary) {
    if (!hasActiveFilters()) {
      resultSummary.textContent = `Mostrando las ${totalRows.toLocaleString('es-ES')} piezas del catálogo`;
    } else {
      resultSummary.textContent = `${visibleRows.length.toLocaleString('es-ES')} resultados de ${totalRows.toLocaleString('es-ES')} piezas`;
    }
  }
  if (resultHint) {
    const tokens = queryTokens();
    if (!hasActiveFilters()) {
      resultHint.textContent = 'Usa la búsqueda, los selectores o los atajos para refinar el catálogo.';
    } else if ((priceFilters().min != null || priceFilters().max != null) && !availablePrices().length) {
      resultHint.textContent = 'Ahora mismo el catálogo base no tiene precios cargados, así que ese filtro no devolverá piezas hasta que haya importes.';
    } else if (!visibleRows.length) {
      resultHint.textContent = 'No hay coincidencias con los filtros actuales. Puedes quitar alguno o limpiar todo.';
    } else if (tokens.length > 1) {
      resultHint.textContent = `La búsqueda está cruzando ${tokens.length} términos a la vez.`;
    } else {
      resultHint.textContent = 'Puedes quitar filtros desde las etiquetas activas o probar los atajos laterales.';
    }
  }
}

function clearAllFilters() {
  if (search) search.value = '';
  if (sortOrder) sortOrder.value = 'original';
  if (typeFilter) typeFilter.value = '';
  if (materialFilter) materialFilter.value = '';
  if (colorFilter) colorFilter.value = '';
  if (priceMin) priceMin.value = '';
  if (priceMax) priceMax.value = '';
}

function removeFilter(key) {
  if (key === 'search' && search) search.value = '';
  if (key === 'sort' && sortOrder) sortOrder.value = 'original';
  if (key === 'type' && typeFilter) typeFilter.value = '';
  if (key === 'material' && materialFilter) materialFilter.value = '';
  if (key === 'color' && colorFilter) colorFilter.value = '';
  if (key === 'priceMin' && priceMin) priceMin.value = '';
  if (key === 'priceMax' && priceMax) priceMax.value = '';
}

function emptyStateHtml() {
  const title = hasActiveFilters() ? 'Sin resultados' : emptyTitle;
  const text = hasActiveFilters()
    ? 'No hay piezas que coincidan con la combinación actual de búsqueda y filtros.'
    : emptyText;
  const action = hasActiveFilters()
    ? '<button class="empty-state-action" type="button" data-clear-all-filters>Limpiar filtros</button>'
    : '';
  return `<section class="empty-state"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span>${action}</section>`;
}

function render() {
  syncSmartFilters();
  updatePriceFilterMeta();
  const rows = sortRows(selectedRows());
  currentRows = rows;
  renderResultSummary(catalog.length, rows);
  renderActiveFilters();
  syncUrl();
  grid.innerHTML = rows.length ? rows.map((item, index) => `<article class="card type-${escapeHtml(itemType(item))}">
    <button class="image image-button" type="button" data-card-index="${index}" aria-label="Ampliar ${escapeHtml(cardTitle(item))}">
      ${catalogImageHtml(item)}
    </button>
    <div class="card-info">
      <span class="card-type">${escapeHtml(typeName(item))}</span>
      <strong>${escapeHtml(cardTitle(item))}</strong>
    </div>
  </article>`).join('') : emptyStateHtml();
  ensureReturnToEditButton();
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
        <div class="item-viewer-head">
          <p class="item-viewer-kicker">Ficha de pieza</p>
          <h2 id="itemViewerTitle"></h2>
        </div>
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
  viewer.querySelector('.item-viewer-image').innerHTML = catalogImage(item)
    ? `<img src="${escapeHtml(catalogImage(item))}" alt="${escapeHtml(item.codigo || cardTitle(item))}" style="${imageStyle(item)}">`
    : '<span class="image-empty image-empty--viewer">Sin imagen</span>';
  viewer.querySelector('.item-viewer-details').innerHTML = detailsHtml(item);
  viewer.hidden = false;
  document.body.classList.add('viewer-open');
  viewer.querySelector('.item-viewer-close').focus();
}

function ensureReturnToEditButton() {
  const params = new URLSearchParams(location.search);
  let shouldShow = params.get('volverEdicion') === '1';
  try {
    const raw = sessionStorage.getItem('jldv1508ReturnToEdit') || localStorage.getItem('jldv1508ReturnToEdit') || '';
    const until = Number(raw);
    shouldShow = shouldShow || raw === '1' || (Number.isFinite(until) && until > Date.now());
  } catch {}
  if (!shouldShow || document.querySelector('[data-return-edit]')) return;
  const target = document.querySelector('.brand-actions') || document.querySelector('header');
  if (!target) return;
  target.insertAdjacentHTML('beforeend', '<a class="catalog-edit catalog-edit--return" href="/edicion" data-return-edit>Volver a edición</a>');
  document.querySelector('[data-return-edit]')?.addEventListener('click', () => {
    try {
      sessionStorage.removeItem('jldv1508ReturnToEdit');
      localStorage.removeItem('jldv1508ReturnToEdit');
    } catch {}
  });
}

function closeViewer() {
  const viewer = document.querySelector('#itemViewer');
  if (!viewer) return;
  viewer.hidden = true;
  document.body.classList.remove('viewer-open');
}

function localPublicData() {
  if (!publicStorageKey) return null;
  try {
    const payload = JSON.parse(localStorage.getItem(publicStorageKey) || 'null');
    if (Array.isArray(payload?.items)) return payload;
    if (Array.isArray(payload)) return { items: payload };
    return null;
  } catch {
    return null;
  }
}

function refreshPublicCatalog() {
  const localData = localPublicData();
  if (localData?.tables) activeTables = mergeTables(localData.tables);
  catalog = mergeCatalogRows(baseCatalog, localData?.items);
  originalIndexById = new Map(catalog.map((item, index) => [item.codigo || item.archivo || item.referencia_csv || `${index}`, index]));
  syncSmartFilters();
  restoreUrlFilters();
  render();
}

function rowKey(item) {
  return item.codigo || item.archivo || item.referencia_csv || `${item.tipo || ''}-${item.material || ''}-${item.color || ''}-${item.nombre_comercial || ''}`;
}

function mergeCatalogRows(baseRows, extraRows) {
  const rows = Array.isArray(baseRows) ? [...baseRows] : [];
  const extras = Array.isArray(extraRows) ? extraRows : [];
  const indexByKey = new Map(rows.map((item, index) => [rowKey(item), index]));
  extras.forEach(item => {
    const key = rowKey(item);
    if (indexByKey.has(key)) {
      rows[indexByKey.get(key)] = item;
    } else {
      indexByKey.set(key, rows.length);
      rows.push(item);
    }
  });
  return rows;
}

function renderFromEvent() {
  if (!syncingFilters) render();
}

search.addEventListener('input', render);
sortOrder?.addEventListener('input', render);
typeFilter?.addEventListener('input', renderFromEvent);
materialFilter?.addEventListener('input', renderFromEvent);
colorFilter?.addEventListener('input', renderFromEvent);
priceMin?.addEventListener('input', render);
priceMax?.addEventListener('input', render);
clearFilters?.addEventListener('click', () => {
  clearAllFilters();
  render();
});
document.addEventListener('click', event => {
  const shortcut = event.target.closest('[data-filter-target]');
  if (shortcut) {
    const { filterTarget, filterValue } = shortcut.dataset;
    if (filterTarget === 'type' && typeFilter) typeFilter.value = filterValue || '';
    if (filterTarget === 'material' && materialFilter) materialFilter.value = filterValue || '';
    if (filterTarget === 'color' && colorFilter) colorFilter.value = filterValue || '';
    render();
    return;
  }
  const remove = event.target.closest('[data-remove-filter]');
  if (remove) {
    removeFilter(remove.dataset.removeFilter || '');
    render();
    return;
  }
  if (event.target.closest('[data-clear-all-filters]')) {
    clearAllFilters();
    render();
  }
});
ensureReturnToEditButton();
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
  baseCatalog = Array.isArray(data) ? [...data] : [];
  const localData = localPublicData();
  if (localData?.tables) activeTables = mergeTables(localData.tables);
  catalog = mergeCatalogRows(baseCatalog, localData?.items);
  originalIndexById = new Map(catalog.map((item, index) => [item.codigo || item.archivo || item.referencia_csv || `${index}`, index]));
  syncSmartFilters();
  restoreUrlFilters();
  render();
});

window.addEventListener('storage', event => {
  if (!publicStorageKey || event.key !== publicStorageKey) return;
  refreshPublicCatalog();
});

window.addEventListener('jldv1508-public-updated', event => {
  if (!publicStorageKey) return;
  if (event?.detail?.key && event.detail.key !== publicStorageKey) return;
  refreshPublicCatalog();
});
