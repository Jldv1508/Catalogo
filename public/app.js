const TYPE = { PUL: 'Pulsera', ANI: 'Anillo', PEN: 'Pendiente', COL: 'Collar', CON: 'Conjunto', BRO: 'Broche', PIE: 'Pieza', CCH: 'Concha', ACC: 'Accesorio', PIN: 'Pin' };
const COLOR = { '000': 'Pendiente', '001': 'Multicolor', '002': 'Blanco', '003': 'Negro', '004': 'Rojo', '005': 'Plateado', '006': 'Verde', '007': 'Azul', '008': 'Marrón', '009': 'Multicolor', '010': 'Naranja', '011': 'Amarillo', '012': 'Morado', '013': 'Turquesa', '014': 'Rosa', '015': 'Gris', '016': 'Lila', '017': 'Fucsia', '999': 'Pendiente' };
const MATERIAL = { '000': 'Pendiente', '001': 'Resina', '002': 'Latón', '003': 'Piedra', '004': 'Cristal', '005': 'Acero inoxidable', '006': 'Metal', '007': 'Cuero', '008': 'Tela', '009': 'Material mixto', '010': 'Perla', '011': 'Acero', '012': 'Plata', '013': 'Dorado / baño oro', '999': 'Pendiente' };
const STATUS = { disponible: 'Disponible', reservado: 'Reservado', vendido: 'Vendido', oculto: 'Oculto' };
const DEFAULT_TABLES = { types: TYPE, materials: MATERIAL, colors: COLOR };
const SAVED_FILTERS_KEY = 'jldv1508CatalogSavedFiltersV2';

const grid = document.querySelector('#grid');
const search = document.querySelector('#search');
const sortOrder = document.querySelector('#sortOrder');
const clearFilters = document.querySelector('#clearFilters');
const visibleCount = document.querySelector('#visibleCount');
const resultSummary = document.querySelector('#resultSummary');
const resultHint = document.querySelector('#resultHint');
const activeFilters = document.querySelector('#activeFilters');
const typeFilterChips = document.querySelector('#typeFilterChips');
const materialFilterChips = document.querySelector('#materialFilterChips');
const colorFilterChips = document.querySelector('#colorFilterChips');
const typeGroupMeta = document.querySelector('#typeGroupMeta');
const materialGroupMeta = document.querySelector('#materialGroupMeta');
const colorGroupMeta = document.querySelector('#colorGroupMeta');
const filterStateSummary = document.querySelector('#filterStateSummary');
const savedFiltersList = document.querySelector('#savedFiltersList');
const saveCurrentFilters = document.querySelector('#saveCurrentFilters');
const filterToggle = document.querySelector('#filterToggle');
const resultsFilterToggle = document.querySelector('#resultsFilterToggle');
const filterClose = document.querySelector('#filterClose');
const filterPanel = document.querySelector('#filterPanel');
const filterPanelBackdrop = document.querySelector('#filterPanelBackdrop');
const catalogUrl = document.body.dataset.catalogUrl || 'catalogo-unificado.json?v=20260708-cleanup';
const publicStorageKey = document.body.dataset.publicStorageKey || '';
const emptyTitle = document.body.dataset.emptyTitle || 'Catálogo en blanco';
const emptyText = document.body.dataset.emptyText || 'Estamos preparando una nueva selección de piezas.';

const filterSelections = {
  type: new Set(),
  material: new Set(),
  color: new Set(),
};

const FILTER_GROUPS = {
  type: { container: typeFilterChips, meta: typeGroupMeta, param: 'tipo', allLabel: 'Todas' },
  material: { container: materialFilterChips, meta: materialGroupMeta, param: 'material', allLabel: 'Todos' },
  color: { container: colorFilterChips, meta: colorGroupMeta, param: 'color', allLabel: 'Todos' },
};

let catalog = [];
let baseCatalog = [];
let activeTables = DEFAULT_TABLES;
let currentRows = [];
let originalIndexById = new Map();
let savedFilterPresets = [];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
}

function escapeAttr(value) {
  return escapeHtml(value);
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

function serializeSelection(set) {
  return [...set].sort().join(',');
}

function parseSelection(value) {
  return new Set(String(value || '').split(',').map(cleanName).filter(Boolean));
}

function activeSelection(group) {
  return filterSelections[group] || new Set();
}

function selectionCount(group) {
  return activeSelection(group).size;
}

function groupLabel(group, key) {
  if (group === 'type') return activeTables.types[key] || key || 'Tipo';
  if (group === 'material') return activeTables.materials[key] || key || 'Material';
  if (group === 'color') return activeTables.colors[key] || key || 'Color';
  return key;
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

function searchText(item) {
  return normalizeText([
    item.codigo,
    item.referencia_csv,
    item.idf,
    item.nombre_comercial,
    item.productName,
    item.type,
    item.tipo,
    typeName(item),
    item.material,
    item.material_nombre,
    materialName(item),
    item.color,
    item.color_nombre,
    colorName(item),
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

function matchesGroup(group, value, ignoreGroup) {
  if (group === ignoreGroup) return true;
  const selected = activeSelection(group);
  return !selected.size || selected.has(value);
}

function rowsForOptions(ignoreGroup) {
  return baseRows().filter(item =>
    matchesGroup('type', itemType(item), ignoreGroup) &&
    matchesGroup('material', itemMaterial(item), ignoreGroup) &&
    matchesGroup('color', itemColor(item), ignoreGroup)
  );
}

function selectedRows() {
  return baseRows().filter(item =>
    matchesGroup('type', itemType(item)) &&
    matchesGroup('material', itemMaterial(item)) &&
    matchesGroup('color', itemColor(item))
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

function mergeSelectedOptions(group, options) {
  const merged = new Map(options);
  activeSelection(group).forEach(key => {
    if (!merged.has(key)) merged.set(key, { label: groupLabel(group, key), count: 0 });
  });
  return [...merged.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label, 'es'));
}

function renderFilterGroup(group, options) {
  const config = FILTER_GROUPS[group];
  if (!config?.container) return;
  const selected = activeSelection(group);
  const merged = mergeSelectedOptions(group, options);
  config.container.innerHTML = merged.length
    ? merged.map(([key, option]) => `<button type="button" class="filter-chip filter-chip--toggle${selected.has(key) ? ' is-active' : ''}" data-toggle-filter="${escapeAttr(group)}" data-filter-value="${escapeAttr(key)}">${escapeHtml(option.label)}<span>${option.count}</span></button>`).join('')
    : '<span class="filter-chip-empty">Sin opciones</span>';
  if (config.meta) {
    config.meta.textContent = selected.size ? `${selected.size} seleccionados` : config.allLabel;
  }
}

function syncFilterGroups() {
  renderFilterGroup('type', optionRows(rowsForOptions('type'), itemType, typeName));
  renderFilterGroup('material', optionRows(rowsForOptions('material'), itemMaterial, materialName));
  renderFilterGroup('color', optionRows(rowsForOptions('color'), itemColor, colorName));
}

function syncUrl() {
  const params = new URLSearchParams();
  if (search.value.trim()) params.set('q', search.value.trim());
  if (serializeSelection(activeSelection('type'))) params.set('tipo', serializeSelection(activeSelection('type')));
  if (serializeSelection(activeSelection('material'))) params.set('material', serializeSelection(activeSelection('material')));
  if (serializeSelection(activeSelection('color'))) params.set('color', serializeSelection(activeSelection('color')));
  if (sortOrder?.value && sortOrder.value !== 'original') params.set('sort', sortOrder.value);
  history.replaceState(null, '', `${location.pathname}${params.toString() ? `?${params}` : ''}`);
}

function restoreUrlFilters() {
  const params = new URLSearchParams(location.search);
  search.value = params.get('q') || '';
  filterSelections.type = parseSelection(params.get('tipo'));
  filterSelections.material = parseSelection(params.get('material'));
  filterSelections.color = parseSelection(params.get('color'));
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
    ['Precio', priceText(item.precio_eur ?? item.price) || 'Precio pendiente'],
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
  return option ? option.textContent : fallback;
}

function activeFilterEntries() {
  const entries = [];
  if (search?.value.trim()) entries.push({ key: 'search', label: `Busqueda: ${search.value.trim()}` });
  activeSelection('type').forEach(key => entries.push({ key: `type:${key}`, label: `Tipo: ${groupLabel('type', key)}` }));
  activeSelection('material').forEach(key => entries.push({ key: `material:${key}`, label: `Material: ${groupLabel('material', key)}` }));
  activeSelection('color').forEach(key => entries.push({ key: `color:${key}`, label: `Color: ${groupLabel('color', key)}` }));
  if (sortOrder?.value && sortOrder.value !== 'original') entries.push({ key: 'sort', label: `Orden: ${selectedOptionLabel(sortOrder, sortOrder.value)}` });
  return entries;
}

function activeFilterCount() {
  return activeFilterEntries().length;
}

function hasActiveFilters() {
  return activeFilterCount() > 0;
}

function renderActiveFilters() {
  if (!activeFilters) return;
  const entries = activeFilterEntries();
  activeFilters.hidden = !entries.length;
  activeFilters.innerHTML = entries.map(entry => `<button type="button" class="active-filter-chip" data-remove-filter="${escapeAttr(entry.key)}">${escapeHtml(entry.label)}<span aria-hidden="true">×</span></button>`).join('');
}

function syncFilterSummary() {
  if (filterStateSummary) {
    filterStateSummary.textContent = hasActiveFilters() ? `${activeFilterCount()} activos` : 'Sin filtros';
  }
  const count = activeFilterCount();
  const label = count ? `Filtros (${count})` : 'Filtros';
  if (filterToggle) {
    filterToggle.textContent = label;
    filterToggle.setAttribute('aria-expanded', String(document.body.classList.contains('filters-open')));
  }
  if (resultsFilterToggle) {
    resultsFilterToggle.textContent = count ? `Abrir filtros (${count})` : 'Abrir filtros';
    resultsFilterToggle.setAttribute('aria-expanded', String(document.body.classList.contains('filters-open')));
  }
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
      resultHint.textContent = 'Usa la búsqueda, la multiselección y el panel lateral para refinar el catálogo.';
    } else if (!visibleRows.length) {
      resultHint.textContent = 'No hay coincidencias con los filtros actuales. Puedes quitar alguno, abrir un favorito o limpiar todo.';
    } else if (tokens.length > 1) {
      resultHint.textContent = `La búsqueda está cruzando ${tokens.length} términos a la vez.`;
    } else if (savedFilterPresets.length) {
      resultHint.textContent = 'Puedes reutilizar una combinación guardada desde la zona de favoritos.';
    } else {
      resultHint.textContent = 'Puedes combinar varios tipos, materiales y colores a la vez desde el panel.';
    }
  }
}

function clearAllSelections() {
  filterSelections.type.clear();
  filterSelections.material.clear();
  filterSelections.color.clear();
}

function clearAllFilters() {
  if (search) search.value = '';
  if (sortOrder) sortOrder.value = 'original';
  clearAllSelections();
}

function removeFilter(key) {
  if (key === 'search' && search) search.value = '';
  if (key === 'sort' && sortOrder) sortOrder.value = 'original';
  if (key.includes(':')) {
    const [group, value] = key.split(':');
    activeSelection(group)?.delete(value);
  }
}

function emptyStateHtml() {
  const title = hasActiveFilters() ? 'Sin resultados' : emptyTitle;
  const text = hasActiveFilters()
    ? 'No hay piezas que coincidan con la combinacion actual de busqueda y filtros.'
    : emptyText;
  const action = hasActiveFilters()
    ? '<button class="empty-state-action" type="button" data-clear-all-filters>Limpiar filtros</button>'
    : '';
  return `<section class="empty-state"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span>${action}</section>`;
}

function getPresetPayload() {
  return {
    q: search?.value.trim() || '',
    sort: sortOrder?.value || 'original',
    type: [...activeSelection('type')],
    material: [...activeSelection('material')],
    color: [...activeSelection('color')],
  };
}

function applyPreset(preset) {
  const payload = preset?.filters || {};
  if (search) search.value = payload.q || '';
  if (sortOrder) sortOrder.value = payload.sort || 'original';
  filterSelections.type = new Set(payload.type || []);
  filterSelections.material = new Set(payload.material || []);
  filterSelections.color = new Set(payload.color || []);
  render();
  closeFilters();
}

function loadSavedFilters() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVED_FILTERS_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function persistSavedFilters() {
  try {
    localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(savedFilterPresets));
  } catch {}
}

function saveCurrentPreset() {
  if (!hasActiveFilters()) {
    window.alert('Primero aplica algun filtro o una busqueda para poder guardarlo.');
    return;
  }
  const defaultName = `Filtro ${savedFilterPresets.length + 1}`;
  const name = cleanName(window.prompt('Nombre para este favorito', defaultName));
  if (!name) return;
  const preset = {
    id: `${Date.now()}`,
    name,
    filters: getPresetPayload(),
  };
  savedFilterPresets = [preset, ...savedFilterPresets].slice(0, 12);
  persistSavedFilters();
  renderSavedFilters();
}

function deleteSavedPreset(id) {
  savedFilterPresets = savedFilterPresets.filter(preset => preset.id !== id);
  persistSavedFilters();
  renderSavedFilters();
}

function presetSummary(preset) {
  const filters = preset.filters || {};
  const parts = [];
  if (filters.q) parts.push(`Busqueda: ${filters.q}`);
  if (filters.type?.length) parts.push(`${filters.type.length} tipos`);
  if (filters.material?.length) parts.push(`${filters.material.length} materiales`);
  if (filters.color?.length) parts.push(`${filters.color.length} colores`);
  if (filters.sort && filters.sort !== 'original') parts.push(`Orden ${filters.sort}`);
  return parts.join(' · ') || 'Sin detalle';
}

function renderSavedFilters() {
  if (!savedFiltersList) return;
  if (!savedFilterPresets.length) {
    savedFiltersList.innerHTML = '<span class="filter-chip-empty">Todavia no hay favoritos guardados.</span>';
    return;
  }
  savedFiltersList.innerHTML = savedFilterPresets.map(preset => `<article class="saved-filter-card">
    <button type="button" class="saved-filter-apply" data-apply-preset="${escapeAttr(preset.id)}">
      <strong>${escapeHtml(preset.name)}</strong>
      <span>${escapeHtml(presetSummary(preset))}</span>
    </button>
    <button type="button" class="saved-filter-delete" data-delete-preset="${escapeAttr(preset.id)}" aria-label="Eliminar ${escapeAttr(preset.name)}">×</button>
  </article>`).join('');
}

function openFilters() {
  document.body.classList.add('filters-open');
  filterPanelBackdrop?.removeAttribute('hidden');
  syncFilterSummary();
}

function closeFilters() {
  document.body.classList.remove('filters-open');
  filterPanelBackdrop?.setAttribute('hidden', '');
  syncFilterSummary();
}

function toggleFilterValue(group, value) {
  const selected = activeSelection(group);
  if (selected.has(value)) selected.delete(value);
  else selected.add(value);
}

function render() {
  syncFilterGroups();
  renderSavedFilters();
  const rows = sortRows(selectedRows());
  currentRows = rows;
  renderResultSummary(catalog.length, rows);
  renderActiveFilters();
  syncFilterSummary();
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

function rowKey(item) {
  return item.codigo || item.archivo || item.referencia_csv || `${item.tipo || ''}-${item.material || ''}-${item.color || ''}-${item.nombre_comercial || ''}`;
}

function mergeCatalogRows(baseRows, extraRows) {
  const rows = Array.isArray(baseRows) ? [...baseRows] : [];
  const extras = Array.isArray(extraRows) ? extraRows : [];
  const indexByKey = new Map(rows.map((item, index) => [rowKey(item), index]));
  extras.forEach(item => {
    const key = rowKey(item);
    if (indexByKey.has(key)) rows[indexByKey.get(key)] = item;
    else {
      indexByKey.set(key, rows.length);
      rows.push(item);
    }
  });
  return rows;
}

function refreshPublicCatalog() {
  const localData = localPublicData();
  if (localData?.tables) activeTables = mergeTables(localData.tables);
  catalog = mergeCatalogRows(baseCatalog, localData?.items);
  originalIndexById = new Map(catalog.map((item, index) => [item.codigo || item.archivo || item.referencia_csv || `${index}`, index]));
  render();
}

search?.addEventListener('input', render);
sortOrder?.addEventListener('input', render);
clearFilters?.addEventListener('click', () => {
  clearAllFilters();
  render();
});
saveCurrentFilters?.addEventListener('click', saveCurrentPreset);
filterToggle?.addEventListener('click', openFilters);
resultsFilterToggle?.addEventListener('click', openFilters);
filterClose?.addEventListener('click', closeFilters);
filterPanelBackdrop?.addEventListener('click', closeFilters);

document.addEventListener('click', event => {
  const toggle = event.target.closest('[data-toggle-filter]');
  if (toggle) {
    toggleFilterValue(toggle.dataset.toggleFilter || '', toggle.dataset.filterValue || '');
    render();
    return;
  }
  const remove = event.target.closest('[data-remove-filter]');
  if (remove) {
    removeFilter(remove.dataset.removeFilter || '');
    render();
    return;
  }
  const clearAll = event.target.closest('[data-clear-all-filters]');
  if (clearAll) {
    clearAllFilters();
    render();
    return;
  }
  const applyPresetButton = event.target.closest('[data-apply-preset]');
  if (applyPresetButton) {
    const preset = savedFilterPresets.find(item => item.id === applyPresetButton.dataset.applyPreset);
    if (preset) applyPreset(preset);
    return;
  }
  const deletePresetButton = event.target.closest('[data-delete-preset]');
  if (deletePresetButton) {
    deleteSavedPreset(deletePresetButton.dataset.deletePreset || '');
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
  if (event.key === 'Escape') {
    closeViewer();
    closeFilters();
  }
});
window.addEventListener('resize', () => {
  if (window.innerWidth > 900) closeFilters();
});

savedFilterPresets = loadSavedFilters();

fetch(catalogUrl)
  .then(response => response.json())
  .then(data => {
    baseCatalog = Array.isArray(data) ? [...data] : [];
    restoreUrlFilters();
    const localData = localPublicData();
    if (localData?.tables) activeTables = mergeTables(localData.tables);
    catalog = mergeCatalogRows(baseCatalog, localData?.items);
    originalIndexById = new Map(catalog.map((item, index) => [item.codigo || item.archivo || item.referencia_csv || `${index}`, index]));
    render();
  });

window.addEventListener('storage', event => {
  if (event.key === SAVED_FILTERS_KEY) {
    savedFilterPresets = loadSavedFilters();
    renderSavedFilters();
  }
  if (!publicStorageKey || event.key !== publicStorageKey) return;
  refreshPublicCatalog();
});

window.addEventListener('jldv1508-public-updated', event => {
  if (!publicStorageKey) return;
  if (event?.detail?.key && event.detail.key !== publicStorageKey) return;
  refreshPublicCatalog();
});
