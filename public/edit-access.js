const STORAGE_KEY = 'jldv1508EditUnlocked';
const PUBLIC_STORE_FALLBACK = `${STORAGE_KEY}:public-store`;
const AUTO_BACKUP_INTERVAL_MS = 5 * 60 * 1000;
const AUTO_BACKUP_LIMIT = 12;
const STATUS_OPTIONS = {
  disponible: 'Disponible',
  reservado: 'Reservado',
  vendido: 'Vendido',
  oculto: 'Oculto',
};
const DEFAULT_TABLES = {
  types: { PUL: 'Pulsera', ANI: 'Anillo', PEN: 'Pendiente', COL: 'Collar', CON: 'Conjunto', BRO: 'Broche', PIE: 'Pieza', CCH: 'Concha', ACC: 'Accesorio', PIN: 'Pin' },
  submodels: {},
  materials: { '000': 'Pendiente', '001': 'Resina', '002': 'Latón', '003': 'Piedra', '004': 'Cristal', '005': 'Acero inoxidable', '006': 'Metal', '007': 'Cuero', '008': 'Tela', '009': 'Material mixto', '010': 'Perla', '011': 'Acero', '012': 'Plata', '013': 'Dorado / baño oro', '999': 'Pendiente' },
  colors: { '000': 'Pendiente', '001': 'Multicolor', '002': 'Blanco', '003': 'Negro', '004': 'Rojo', '005': 'Plateado', '006': 'Verde', '007': 'Azul', '008': 'Marrón', '009': 'Multicolor', '010': 'Naranja', '011': 'Amarillo', '012': 'Morado', '013': 'Turquesa', '014': 'Rosa', '015': 'Gris', '016': 'Lila', '017': 'Fucsia', '999': 'Pendiente' },
};

let state = {
  unlocked: false,
  loading: false,
  items: [],
  tables: cloneTables(DEFAULT_TABLES),
  selected: new Set(),
  selectionAnchor: -1,
  compact: false,
  filters: { q: '', type: [], submodel: [], material: [], color: [], priceMin: '', priceMax: '' },
  draft: createDraftItem(),
  publicKey: '',
  catalogUrl: '',
  lastAutoBackupAt: '',
};
let autoBackupTimer = null;
let lastAutoBackupSignature = '';

function createDraftItem() {
  return {
    codigo: '',
    referencia_csv: '',
    idf: '',
    codigo_producto: '',
    productName: '',
    descripcion: '',
    medidas: '',
    type: 'PIE',
    submodel: '',
    material: '000',
    color: '000',
    unit: '001',
    price: '',
    stock: '1',
    estado: 'disponible',
    archivo: '',
    image_x: '50',
    image_y: '50',
    image_zoom: '1',
  };
}

function cloneTables(source) {
  return {
    types: { ...(source?.types || {}) },
    submodels: { ...(source?.submodels || {}) },
    materials: { ...(source?.materials || {}) },
    colors: { ...(source?.colors || {}) },
  };
}

function mergeTables(source) {
  const base = source || {};
  return {
    types: { ...(DEFAULT_TABLES.types || {}), ...(base.types || {}) },
    submodels: { ...(DEFAULT_TABLES.submodels || {}), ...(base.submodels || {}) },
    materials: { ...(DEFAULT_TABLES.materials || {}), ...(base.materials || {}) },
    colors: { ...(DEFAULT_TABLES.colors || {}), ...(base.colors || {}) },
  };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

async function getConfig() {
  const response = await fetch('/api/edit-credentials', { cache: 'no-store' });
  if (!response.ok) throw new Error(`edit-credentials:${response.status}`);
  const payload = await response.json();
  return {
    user: String(payload?.user || ''),
    password: String(payload?.password || ''),
  };
}

function getPanel() {
  return document.querySelector('#publicEditPanel');
}

function getMount() {
  return document.querySelector('.home-main, .blog-main, .catalog-shell, main');
}

function isUnlocked() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function setUnlocked(value) {
  try {
    if (value) sessionStorage.setItem(STORAGE_KEY, '1');
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
}

function currentCatalogUrl() {
  return document.body.dataset.catalogUrl || '';
}

function currentPublicKey() {
  return document.body.dataset.publicStorageKey || '';
}

function currentAutoBackupKey() {
  return `${state.publicKey || currentPublicKey() || PUBLIC_STORE_FALLBACK}:auto-backups`;
}

function tablesFor(kind) {
  return state.tables[kind] || DEFAULT_TABLES[kind] || {};
}

function itemType(item) {
  return item.type || item.tipo || 'PIE';
}

function itemMaterial(item) {
  return item.material || '000';
}

function itemSubmodel(item) {
  return item.submodel || item.submodelo || '';
}

function itemColor(item) {
  return item.color || '000';
}

function itemUnit(item) {
  return String(item.unit || '').trim();
}

function technicalCode(item) {
  return [itemType(item), itemSubmodel(item), itemMaterial(item), itemColor(item), itemUnit(item)]
    .filter(Boolean)
    .join('-');
}

function code(item) {
  const stored = normalizeCode(item.codigo);
  const composed = technicalCode(item);
  const submodel = itemSubmodel(item);
  if (!stored) return composed;
  if (!submodel) return stored;
  return normalizeText(stored).includes(normalizeText(submodel)) ? stored : `${stored} · ${composed}`;
}

function pieceName(item) {
  const parts = [typeName(item)];
  if (itemSubmodel(item)) parts.push(submodelName(item));
  return parts.filter(Boolean).join(' · ') || 'Pieza';
}

function syncPieceName(item) {
  const name = pieceName(item);
  item.productName = name;
  item.nombre_comercial = name;
  return name;
}

function typeName(item) {
  return tablesFor('types')[itemType(item)] || item.tipo_nombre || 'Tipo pendiente';
}

function submodelName(item) {
  const value = itemSubmodel(item);
  const entry = tablesFor('submodels')[value];
  if (!value) return 'Sin submodelo';
  if (typeof entry === 'string') return entry;
  return entry?.label || value;
}

function baseDescription(item) {
  return String(item.description || item.descripcion || '').trim();
}

function generatedDescription(item) {
  const parts = [typeName(item)];
  if (itemSubmodel(item)) parts.push(`submodelo ${submodelName(item)}`);
  if (itemMaterial(item) && itemMaterial(item) !== '000') parts.push(`material ${materialName(item)}`);
  if (itemColor(item) && itemColor(item) !== '000') parts.push(`color ${colorName(item)}`);
  return parts.filter(Boolean).join(' · ');
}

function articleDescription(item) {
  const manual = baseDescription(item);
  if (!itemSubmodel(item)) return manual || generatedDescription(item);
  const submodelCode = itemSubmodel(item);
  const submodelLabel = submodelName(item);
  const source = normalizeText(manual);
  const mentionsSubmodel = source && [submodelCode, submodelLabel].some(token => normalizeText(token) && source.includes(normalizeText(token)));
  if (manual) return mentionsSubmodel ? manual : `Submodelo ${submodelLabel}. ${manual}`;
  return generatedDescription(item);
}

function materialName(item) {
  return tablesFor('materials')[itemMaterial(item)] || item.material_nombre || 'Material pendiente';
}

function colorName(item) {
  return tablesFor('colors')[itemColor(item)] || item.color_nombre || 'Color pendiente';
}

function normalizeCode(value) {
  return String(value || '').trim().replace(/[\u0000-\u001F\u007F]/g, '');
}

function normalizePrice(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const cleaned = raw.replace(/\s/g, '').replace('€', '').replace(',', '.');
  const number = Number(cleaned);
  if (!Number.isFinite(number) || number < 0) return '';
  return number.toFixed(2);
}

function normalizeStock(value) {
  const number = Number(String(value ?? '').replace(/\D/g, ''));
  return Number.isFinite(number) && number > 0 ? String(number) : '';
}

function normalizePosition(value, fallback = 50) {
  const number = Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(number)) return fallback;
  return Math.min(100, Math.max(0, number));
}

function normalizeZoom(value, fallback = 1) {
  const number = Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(number)) return fallback;
  return Math.min(2.2, Math.max(.7, number));
}

function normalizeImagePath(value) {
  return String(value || '').trim().replace(/^\/+/, '');
}

function normalizeTableCode(value, size = 3) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return /^\d+$/.test(raw) ? raw.padStart(size, '0') : raw;
}

function imageStyle(item) {
  const x = Number(item.image_x ?? item.imageX ?? 50);
  const y = Number(item.image_y ?? item.imageY ?? 50);
  const zoom = Number(item.image_zoom ?? item.imageZoom ?? 1);
  const safeX = Number.isFinite(x) ? Math.min(100, Math.max(0, x)) : 50;
  const safeY = Number.isFinite(y) ? Math.min(100, Math.max(0, y)) : 50;
  const safeZoom = Number.isFinite(zoom) ? Math.min(2.2, Math.max(.7, zoom)) : 1;
  return `--image-x:${safeX}%;--image-y:${safeY}%;--image-zoom:${safeZoom};`;
}

function catalogImage(item) {
  return item.archivo || item.image || '';
}

function imageSrc(item) {
  const image = catalogImage(item).replace(/^public\//, '').replace(/^\/+/, '');
  return image ? `/${image}` : '';
}

function editorImageHtml(item) {
  const image = imageSrc(item);
  if (!image) return '<span class="public-edit-card-image-empty">Sin imagen</span>';
  return `<img src="${escapeAttr(image)}" alt="${escapeAttr(code(item) || item.codigo || 'Pieza')}" style="${imageStyle(item)}">`;
}

function baseItem(item) {
  const material = normalizeTableCode(item.material, 3) || '000';
  const color = normalizeTableCode(item.color, 3) || '000';
  const submodel = normalizeTableCode(item.submodel || item.submodelo, 3);
  const unit = normalizeTableCode(item.unit, 3) || '001';
  return {
    ...item,
    type: item.type || item.tipo || 'PIE',
    submodel,
    submodelo: submodel,
    material,
    color,
    unit,
    price: normalizePrice(item.price ?? item.precio_eur),
    precio_eur: normalizePrice(item.price ?? item.precio_eur),
    stock: normalizeStock(item.stock),
    image_x: Number.isFinite(Number(item.image_x ?? item.imageX)) ? Number(item.image_x ?? item.imageX) : 50,
    image_y: Number.isFinite(Number(item.image_y ?? item.imageY)) ? Number(item.image_y ?? item.imageY) : 50,
    image_zoom: Number.isFinite(Number(item.image_zoom ?? item.imageZoom)) ? Number(item.image_zoom ?? item.imageZoom) : 1,
  };
}

function loadPublicPayload() {
  const key = state.publicKey || currentPublicKey();
  if (!key) return null;
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null');
    if (Array.isArray(raw)) return { items: raw, tables: null };
    if (Array.isArray(raw?.items)) return raw;
  } catch {}
  return null;
}

function savePublicPayload() {
  if (!state.publicKey) return false;
  const updatedAt = new Date().toISOString();
  localStorage.setItem(state.publicKey, JSON.stringify({
    items: state.items,
    tables: state.tables,
    updatedAt,
  }));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('jldv1508-public-updated', {
      detail: { key: state.publicKey, updatedAt },
    }));
  }
  return true;
}

function currentSnapshotSignature() {
  return JSON.stringify({
    items: state.items,
    tables: state.tables,
    filters: state.filters,
  });
}

function readAutoBackups() {
  try {
    const raw = JSON.parse(localStorage.getItem(currentAutoBackupKey()) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function syncAutoBackupState() {
  const backups = readAutoBackups();
  state.lastAutoBackupAt = backups[0]?.savedAt || '';
  lastAutoBackupSignature = backups[0]?.signature || '';
}

function renderAutoBackupStatus() {
  const status = document.querySelector('[data-auto-backup-status]');
  if (!status) return;
  const backups = readAutoBackups();
  if (!backups.length) {
    status.textContent = 'Autorespaldo local cada 5 min. Aún no hay respaldos automáticos.';
    return;
  }
  const latest = backups[0]?.savedAt ? new Date(backups[0].savedAt).toLocaleString('es-ES') : 'sin fecha';
  status.textContent = `Autorespaldo local cada 5 min. Último: ${latest}. Historial: ${backups.length}.`;
}

function saveAutomaticBackup(reason = 'interval') {
  const signature = currentSnapshotSignature();
  if (!signature || signature === lastAutoBackupSignature) {
    renderAutoBackupStatus();
    return false;
  }
  const savedAt = new Date().toISOString();
  const backups = readAutoBackups().filter(entry => entry?.signature !== signature);
  backups.unshift({
    savedAt,
    reason,
    signature,
    payload: {
      items: state.items,
      tables: state.tables,
      filters: state.filters,
    },
  });
  localStorage.setItem(currentAutoBackupKey(), JSON.stringify(backups.slice(0, AUTO_BACKUP_LIMIT)));
  state.lastAutoBackupAt = savedAt;
  lastAutoBackupSignature = signature;
  renderAutoBackupStatus();
  return true;
}

function restoreLatestAutoBackup() {
  const backup = readAutoBackups()[0];
  const payload = backup?.payload;
  if (!Array.isArray(payload?.items)) return false;
  state.items = payload.items.map(baseItem);
  state.tables = mergeTables(payload.tables || DEFAULT_TABLES);
  state.filters = {
    q: String(payload.filters?.q || ''),
    type: Array.isArray(payload.filters?.type) ? payload.filters.type : [],
    submodel: Array.isArray(payload.filters?.submodel) ? payload.filters.submodel : [],
    material: Array.isArray(payload.filters?.material) ? payload.filters.material : [],
    color: Array.isArray(payload.filters?.color) ? payload.filters.color : [],
    priceMin: String(payload.filters?.priceMin || ''),
    priceMax: String(payload.filters?.priceMax || ''),
  };
  state.selected.clear();
  state.selectionAnchor = -1;
  state.lastAutoBackupAt = backup.savedAt || '';
  lastAutoBackupSignature = backup.signature || currentSnapshotSignature();
  savePublicPayload();
  renderWorkspace();
  return true;
}

function startAutoBackupTimer() {
  if (autoBackupTimer || typeof window === 'undefined') return;
  syncAutoBackupState();
  autoBackupTimer = window.setInterval(() => {
    if (!state.unlocked) return;
    saveAutomaticBackup('interval');
  }, AUTO_BACKUP_INTERVAL_MS);
  window.addEventListener('pagehide', () => {
    if (state.unlocked) saveAutomaticBackup('pagehide');
  });
}

function loadEditorState() {
  const payload = loadPublicPayload();
  if (payload) {
    state.items = (payload.items || []).map(baseItem);
    state.tables = mergeTables(payload.tables || DEFAULT_TABLES);
    state.items.forEach(syncPieceName);
  }
  syncAutoBackupState();
}

async function ensureWorkspace() {
  if (state.loading) return;
  state.loading = true;
  state.publicKey = currentPublicKey();
  state.catalogUrl = currentCatalogUrl();
  if (!state.items.length) {
    loadEditorState();
  }
  if (!state.items.length && state.catalogUrl) {
    const response = await fetch(state.catalogUrl, { cache: 'no-store' });
    const data = await response.json();
    const rows = Array.isArray(data) ? data : data?.items;
    if (Array.isArray(rows)) state.items = rows.map(baseItem);
    if (data && !Array.isArray(data)) state.tables = mergeTables(data.tables || state.tables || DEFAULT_TABLES);
    state.items.forEach(syncPieceName);
  }
  state.loading = false;
  renderWorkspace();
}

function visibleIndexes() {
  const q = state.filters.q.trim().toLowerCase();
  return state.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => {
      if (q) {
        const text = [
          item.original, item.codigo, item.idf, code(item), pieceName(item), item.productName, item.nombre_comercial,
          item.notes, item.descripcion, item.measures, item.medidas, item.type, item.submodel, item.material, item.color,
          typeName(item), submodelName(item), materialName(item), colorName(item),
        ].join(' ').toLowerCase();
        if (!text.includes(q)) return false;
      }
      if (state.filters.type.length && !state.filters.type.includes(itemType(item))) return false;
      if (state.filters.submodel.length && !state.filters.submodel.includes(itemSubmodel(item))) return false;
      if (state.filters.material.length && !state.filters.material.includes(itemMaterial(item))) return false;
      if (state.filters.color.length && !state.filters.color.includes(itemColor(item))) return false;
      const price = Number(item.price || item.precio_eur || 0);
      const min = Number(String(state.filters.priceMin || '').replace(',', '.'));
      const max = Number(String(state.filters.priceMax || '').replace(',', '.'));
      if (state.filters.priceMin && (!Number.isFinite(price) || price < min)) return false;
      if (state.filters.priceMax && (!Number.isFinite(price) || price > max)) return false;
      return true;
    })
    .map(({ index }) => index);
}

function setFilter(key, value) {
  state.filters[key] = value;
  renderWorkspace();
}

function toggleMultiFilter(key, value, checked) {
  if (!value) {
    state.filters[key] = [];
    renderWorkspace();
    return;
  }
  const values = new Set(state.filters[key] || []);
  if (checked) values.add(value);
  else values.delete(value);
  state.filters[key] = [...values];
  renderWorkspace();
}

function checkboxFilterHtml(key, title, kind) {
  const selected = new Set(state.filters[key] || []);
  const entries = Object.entries(tablesFor(kind));
  const choices = entries.map(([codeValue, value]) => {
    const label = typeof value === 'string' ? value : value?.label || codeValue;
    const prefix = kind === 'submodels' && value?.model ? `${tablesFor('types')[value.model] || value.model} / ` : '';
    return `
      <label class="public-edit-check-option">
        <input type="checkbox" data-filter-multi="${key}" data-filter-value="${escapeAttr(codeValue)}" ${selected.has(codeValue) ? 'checked' : ''}>
        <span>${escapeHtml(prefix)}${escapeHtml(label)}</span>
      </label>
    `;
  }).join('');
  return `
    <fieldset class="public-edit-filter-group">
      <legend>${escapeHtml(title)}</legend>
      <label class="public-edit-check-option">
        <input type="checkbox" data-filter-multi="${key}" data-filter-value="" ${selected.size ? '' : 'checked'}>
        <span>Todos</span>
      </label>
      ${choices || '<div class="public-edit-empty-inline">Sin opciones.</div>'}
    </fieldset>
  `;
}

function applyBulk() {
  if (!state.selected.size) return;
  const type = document.querySelector('[data-bulk-type]')?.value || '';
  const submodel = document.querySelector('[data-bulk-submodel]')?.value || '';
  const material = document.querySelector('[data-bulk-material]')?.value || '';
  const color = document.querySelector('[data-bulk-color]')?.value || '';
  state.selected.forEach(index => {
    const item = state.items[index];
    if (!item) return;
    if (type) {
      item.type = type;
      item.tipo = type;
    }
    if (submodel) {
      item.submodel = submodel;
      item.submodelo = submodel;
    }
    if (material) item.material = material;
    if (color) item.color = color;
    syncPieceName(item);
  });
  savePublicPayload();
  renderWorkspace();
}

function tableValue(kind, codeValue) {
  const value = tablesFor(kind)[codeValue];
  if (typeof value === 'string') return value;
  return value?.label || '';
}

function submodelParent(codeValue) {
  const value = tablesFor('submodels')[codeValue];
  return typeof value === 'object' && value ? value.model || '' : '';
}

function optionHtml(kind, includeBlank = false) {
  const entries = Object.entries(tablesFor(kind));
  const options = entries.map(([codeValue, value]) => {
    const label = typeof value === 'string' ? value : value?.label || codeValue;
    const prefix = kind === 'submodels' && value?.model ? `${tablesFor('types')[value.model] || value.model} / ` : '';
    return `<option value="${escapeAttr(codeValue)}">${escapeHtml(codeValue)} · ${escapeHtml(prefix)}${escapeHtml(label)}</option>`;
  }).join('');
  return includeBlank ? `<option value="">Sin cambio</option>${options}` : options;
}

function submodelOptionsFor(modelCode, current = '') {
  const entries = Object.entries(tablesFor('submodels')).filter(([, value]) => {
    const parent = typeof value === 'object' && value ? value.model || '' : '';
    return !parent || !modelCode || parent === modelCode;
  });
  const options = entries.map(([codeValue, value]) => {
    const label = typeof value === 'string' ? value : value?.label || codeValue;
    return `<option value="${escapeAttr(codeValue)}" ${codeValue === current ? 'selected' : ''}>${escapeHtml(codeValue)} · ${escapeHtml(label)}</option>`;
  }).join('');
  return `<option value="">Sin submodelo</option>${options}`;
}

function addTableEntry(kind) {
  const codeInput = document.querySelector(`[data-new-${kind}-code]`);
  const labelInput = document.querySelector(`[data-new-${kind}-label]`);
  const codeValue = normalizeCode(codeInput?.value);
  const labelValue = String(labelInput?.value || '').trim();
  if (!codeValue || !labelValue) return;
  if (kind === 'submodels') {
    const modelValue = document.querySelector('[data-new-submodels-model]')?.value || '';
    if (!modelValue) return;
    state.tables.submodels[codeValue] = { model: modelValue, label: labelValue };
  } else {
    state.tables[kind][codeValue] = labelValue;
  }
  codeInput.value = '';
  labelInput.value = '';
  savePublicPayload();
  renderWorkspace();
}

function editTableEntry(kind) {
  const select = document.querySelector(`[data-edit-${kind}-select]`);
  const codeValue = select?.value || '';
  if (!codeValue) return;
  const labelInput = document.querySelector(`[data-edit-${kind}-label]`);
  const labelValue = String(labelInput?.value || '').trim();
  if (!labelValue) return;
  if (kind === 'submodels') {
    const modelValue = document.querySelector('[data-edit-submodels-model]')?.value || '';
    if (!modelValue) return;
    state.tables.submodels[codeValue] = { model: modelValue, label: labelValue };
  } else {
    state.tables[kind][codeValue] = labelValue;
  }
  savePublicPayload();
  renderWorkspace();
}

function syncEditEntry(kind) {
  const select = document.querySelector(`[data-edit-${kind}-select]`);
  const codeValue = select?.value || '';
  const labelInput = document.querySelector(`[data-edit-${kind}-label]`);
  const modelSelect = document.querySelector(`[data-edit-${kind}-model]`);
  if (labelInput) labelInput.value = tableValue(kind, codeValue);
  if (modelSelect) modelSelect.value = submodelParent(codeValue);
}

function deleteTableEntry(kind) {
  const select = document.querySelector(`[data-delete-${kind}]`);
  const codeValue = select?.value || '';
  if (!codeValue) return;
  const fallback = kind === 'types' ? 'PIE' : kind === 'submodels' ? '' : '999';
  const affectedField = kind === 'types' ? 'type' : kind === 'submodels' ? 'submodel' : kind === 'materials' ? 'material' : 'color';
  const used = state.items.filter(item => item[affectedField] === codeValue).length;
  if (codeValue === fallback) return;
  delete state.tables[kind][codeValue];
  if (used) {
    state.items.forEach(item => {
      if (item[affectedField] === codeValue) item[affectedField] = fallback;
      if (kind === 'submodels' && item.submodelo === codeValue) item.submodelo = fallback;
    });
  }
  savePublicPayload();
  renderWorkspace();
}

function restorePublicCatalog() {
  const payload = loadPublicPayload();
  if (!payload?.items) return false;
  state.items = payload.items.map(baseItem);
  state.tables = mergeTables(payload.tables || DEFAULT_TABLES);
  state.selected.clear();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('jldv1508-public-updated', {
      detail: { key: state.publicKey, restored: true },
    }));
  }
  renderWorkspace();
  return true;
}

function makeCsv(items) {
  const rows = items.map(item => ({
    ...item,
    codigo_visible: code(item),
    submodelo: itemSubmodel(item),
    descripcion_visible: articleDescription(item),
  }));
  const header = ['codigo', 'codigo_visible', 'tipo', 'submodelo', 'material', 'color', 'precio_eur', 'estado', 'descripcion', 'descripcion_visible', 'archivo'];
  return [header.join(',')].concat(rows.map(item => header.map(key => `"${String(item?.[key] ?? '').replace(/"/g, '""')}"`).join(','))).join('\n');
}

function makeJson(items) {
  return JSON.stringify({ items, tables: state.tables, exportedAt: new Date().toISOString() }, null, 2);
}

function statusOptionsHtml(current = 'disponible', includeBlank = false) {
  const options = Object.entries(STATUS_OPTIONS).map(([value, label]) => (
    `<option value="${escapeAttr(value)}" ${value === current ? 'selected' : ''}>${escapeHtml(label)}</option>`
  )).join('');
  return includeBlank ? `<option value="">Sin cambio</option>${options}` : options;
}

function updateDraftField(field, value) {
  state.draft[field] = value;
}

function createItemFromDraft() {
  const draft = state.draft || createDraftItem();
  const codigo = normalizeCode(draft.codigo);
  if (!codigo) {
    alert('Indica un codigo para la nueva tarjeta.');
    return;
  }
  const type = draft.type || 'PIE';
  const submodel = draft.submodel || '';
  const material = draft.material || '000';
  const color = draft.color || '000';
  const nombre = pieceName({ type, submodel });
  const descripcion = String(draft.descripcion || '').trim();
  const medidas = String(draft.medidas || '').trim();
  const referencia = normalizeCode(draft.referencia_csv) || codigo;
  const idf = normalizeCode(draft.idf) || referencia;
  const codigoProducto = normalizeCode(draft.codigo_producto) || idf;
  const item = baseItem({
    codigo,
    referencia_csv: referencia,
    idf,
    codigo_producto: codigoProducto,
    archivo: normalizeImagePath(draft.archivo),
    nombre_comercial: nombre,
    productName: nombre,
    descripcion,
    description: descripcion,
    medidas,
    type,
    tipo: type,
    submodel,
    submodelo: submodel,
    material,
    color,
    unit: String(draft.unit || '001').replace(/\D/g, '').padStart(3, '0').slice(-3),
    price: normalizePrice(draft.price),
    precio_eur: normalizePrice(draft.price),
    stock: normalizeStock(draft.stock),
    estado: draft.estado || 'disponible',
    image_x: normalizePosition(draft.image_x, 50),
    image_y: normalizePosition(draft.image_y, 50),
    image_zoom: normalizeZoom(draft.image_zoom, 1),
    fotos: normalizeImagePath(draft.archivo) ? 1 : 0,
    foto_numero: normalizeImagePath(draft.archivo) ? 1 : 0,
    fotos_producto: normalizeImagePath(draft.archivo) ? 1 : 0,
  });
  if (!descripcion) {
    item.descripcion = generatedDescription(item);
    item.description = item.descripcion;
  }
  syncPieceName(item);

  state.items.unshift(item);
  state.selected.clear();
  state.selected.add(0);
  state.selectionAnchor = 0;
  state.filters = { q: codigo, type: [], submodel: [], material: [], color: [], priceMin: '', priceMax: '' };
  state.draft = createDraftItem();
  savePublicPayload();
  renderWorkspace();
}

function download(name, text, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importCatalogFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    try {
      const payload = JSON.parse(String(reader.result || ''));
      const rows = Array.isArray(payload) ? payload : payload.items;
      if (!Array.isArray(rows)) throw new Error('items');
      state.items = rows.map(baseItem);
      state.tables = mergeTables(payload.tables || state.tables || DEFAULT_TABLES);
      state.filters = {
        q: String(payload.filters?.q || ''),
        type: Array.isArray(payload.filters?.type) ? payload.filters.type.map(value => normalizeTableCode(value, 3) || String(value || '')) : [],
        submodel: Array.isArray(payload.filters?.submodel) ? payload.filters.submodel.map(value => normalizeTableCode(value, 3) || String(value || '')) : [],
        material: Array.isArray(payload.filters?.material) ? payload.filters.material.map(value => normalizeTableCode(value, 3) || String(value || '')) : [],
        color: Array.isArray(payload.filters?.color) ? payload.filters.color.map(value => normalizeTableCode(value, 3) || String(value || '')) : [],
        priceMin: String(payload.filters?.priceMin || ''),
        priceMax: String(payload.filters?.priceMax || ''),
      };
      state.items.forEach(syncPieceName);
      state.selected.clear();
      state.selectionAnchor = -1;
      savePublicPayload();
      renderWorkspace();
      const stateEl = document.querySelector('[data-edit-state]');
      if (stateEl) stateEl.textContent = 'Importado';
    } catch {
      alert('No se pudo importar. Usa un JSON de catalogo o respaldo valido.');
    }
  });
  reader.readAsText(file);
}

function visibleItems() {
  return visibleIndexes().map(index => ({ item: state.items[index], index }));
}

function modelEntries() {
  const models = new Map();
  state.items.forEach(item => {
    const idf = String(item.idf || '').trim();
    if (!idf) return;
    if (!models.has(idf)) models.set(idf, { idf, count: 0 });
    models.get(idf).count += 1;
  });
  return [...models.values()].sort((a, b) => a.idf.localeCompare(b.idf, 'es', { numeric: true }));
}

function modelChipsHtml() {
  const models = modelEntries();
  if (!models.length) return '<div class="public-edit-empty-inline">Sin modelos cargados.</div>';
  return models.map(model => `<span class="public-edit-chip" title="${escapeAttr(`${model.count} piezas`)}">${escapeHtml(model.idf)}<em>${model.count}</em></span>`).join('');
}

function toggleSelected(index, checked) {
  state.selectionAnchor = index;
  if (checked) state.selected.add(index);
  else state.selected.delete(index);
  renderWorkspace();
}

function selectRange(index, checked) {
  const anchor = Number.isInteger(state.selectionAnchor) && state.selectionAnchor >= 0 ? state.selectionAnchor : index;
  const start = Math.min(anchor, index);
  const end = Math.max(anchor, index);
  for (let current = start; current <= end; current += 1) {
    if (checked) state.selected.add(current);
    else state.selected.delete(current);
  }
  state.selectionAnchor = index;
  renderWorkspace();
}

function handleCardSelection(index, checked, useRange = false) {
  if (useRange && state.selectionAnchor >= 0) {
    selectRange(index, checked);
    return;
  }
  toggleSelected(index, checked);
}

function selectVisible() {
  visibleIndexes().forEach(index => state.selected.add(index));
  const visible = visibleIndexes();
  state.selectionAnchor = visible.length ? visible[visible.length - 1] : state.selectionAnchor;
  renderWorkspace();
}

function invertVisible() {
  visibleIndexes().forEach(index => {
    if (state.selected.has(index)) state.selected.delete(index);
    else state.selected.add(index);
  });
  renderWorkspace();
}

function clearSelection() {
  state.selected.clear();
  state.selectionAnchor = -1;
  renderWorkspace();
}

function toggleCompact() {
  state.compact = !state.compact;
  renderWorkspace();
}

function renderWorkspace() {
  const workspace = document.querySelector('[data-edit-workspace]');
  if (!workspace || !state.unlocked) return;

  const visible = visibleItems();
  const typeOptions = optionHtml('types');
  const submodelOptions = optionHtml('submodels');
  const materialOptions = optionHtml('materials');
  const colorOptions = optionHtml('colors');
  const bulkTypeOptions = '<option value="">Sin cambio</option>' + typeOptions;
  const bulkSubmodelOptions = '<option value="">Sin cambio</option>' + submodelOptions;
  const bulkMaterialOptions = '<option value="">Sin cambio</option>' + materialOptions;
  const bulkColorOptions = '<option value="">Sin cambio</option>' + colorOptions;
  const draft = state.draft || createDraftItem();
  const draftSubmodelOptions = submodelOptionsFor(draft.type || 'PIE', draft.submodel || '');
  const draftName = pieceName({ type: draft.type || 'PIE', submodel: draft.submodel || '' });
  const visibleCards = visible.map(({ item, index }) => `
    <article class="public-edit-card${state.selected.has(index) ? ' is-selected' : ''}" data-card-index="${index}">
      <div class="public-edit-card-image">
        ${editorImageHtml(item)}
      </div>
      <div class="public-edit-card-body">
        <div class="public-edit-card-top">
          <label class="public-edit-check"><input type="checkbox" data-card-check="${index}" ${state.selected.has(index) ? 'checked' : ''}> Seleccionar</label>
          <strong>${escapeHtml(code(item))}</strong>
        </div>
        <div class="public-edit-card-name">${escapeHtml(pieceName(item))}</div>
        <div class="public-edit-card-meta">
          <span>${escapeHtml(materialName(item))} · ${escapeHtml(colorName(item))}</span>
          <span>${catalogImage(item) ? 'Imagen lista' : 'Sin imagen'}</span>
        </div>
        <details class="public-edit-card-editor">
          <summary>Abrir edición de la pieza</summary>
          <div class="public-edit-card-fields">
            <label>Tipo<select data-item-field="type" data-index="${index}">${typeOptions}</select></label>
            <label>Submodelo<select data-item-field="submodel" data-index="${index}">${submodelOptionsFor(itemType(item), itemSubmodel(item))}</select></label>
            <label>Material<select data-item-field="material" data-index="${index}">${materialOptions}</select></label>
            <label>Color<select data-item-field="color" data-index="${index}">${colorOptions}</select></label>
            <label>Unidad<input data-item-field="unit" data-index="${index}" value="${escapeAttr(item.unit || '')}" maxlength="3"></label>
            <label>Precio<input data-item-field="price" data-index="${index}" value="${escapeAttr(item.price || item.precio_eur || '')}" inputmode="decimal" placeholder="0,00"></label>
            <label>Stock<input data-item-field="stock" data-index="${index}" value="${escapeAttr(item.stock || '')}" inputmode="numeric" placeholder="1"></label>
            <label>Estado<select data-item-field="estado" data-index="${index}">${statusOptionsHtml(item.estado || 'disponible')}</select></label>
            <label class="full">Imagen<input data-item-field="archivo" data-index="${index}" value="${escapeAttr(catalogImage(item))}" placeholder="image-catalog/nombre.jpg"></label>
            <label class="full">Nombre generado<input value="${escapeAttr(pieceName(item))}" readonly></label>
            <label class="full">Medidas<input data-item-field="medidas" data-index="${index}" value="${escapeAttr(item.medidas || item.measures || '')}"></label>
            <label class="full">Descripcion<textarea data-item-field="description" data-index="${index}">${escapeHtml(item.description || item.descripcion || '')}</textarea></label>
          </div>
        </details>
      </div>
    </article>
  `).join('');

  workspace.innerHTML = `
    <details class="public-edit-section public-edit-section--overview public-edit-section--collapsible public-edit-section--sticky">
      <summary class="public-edit-section-summary">
        <div class="public-edit-section-head">
          <div>
            <strong>Buscar</strong>
            <span>Por palabra, modelo, submodelo, material, color y precio</span>
          </div>
          <span class="public-edit-state public-edit-state--inline">${visible.length} resultados</span>
        </div>
      </summary>
      <div class="public-edit-section-content">
        <div class="public-edit-search public-edit-search--minimal">
          <label>Palabra<input data-filter-q placeholder="Código, descripción, material..."></label>
          <label>Precio mínimo<input data-filter-price-min inputmode="decimal" placeholder="0,00"></label>
          <label>Precio máximo<input data-filter-price-max inputmode="decimal" placeholder="99,00"></label>
          ${checkboxFilterHtml('type', 'Modelo', 'types')}
          ${checkboxFilterHtml('submodel', 'Submodelo', 'submodels')}
          ${checkboxFilterHtml('material', 'Material', 'materials')}
          ${checkboxFilterHtml('color', 'Color', 'colors')}
        </div>
      </div>
    </details>

    <details class="public-edit-section public-edit-section--collapsible">
      <summary class="public-edit-section-summary">
        <div class="public-edit-section-head">
          <div>
            <strong>Importación / Exportación</strong>
            <span>Entrada y salida de catálogo, resultados y respaldo</span>
          </div>
        </div>
      </summary>
      <div class="public-edit-section-content">
        <div class="public-edit-actions-row public-edit-actions-row--backup">
          <input data-import-json type="file" accept=".json,application/json" hidden>
          <button type="button" data-import-json-button>Importar JSON</button>
          <button type="button" data-download-csv>Exportar CSV visible</button>
          <button type="button" data-download-json>Exportar catálogo público</button>
          <button type="button" data-download-backup>Exportar respaldo completo</button>
          <button type="button" data-restore-public>Restaurar guardado local</button>
          <button type="button" data-restore-auto-backup>Restaurar último autorespaldo</button>
        </div>
        <div class="public-edit-helper" data-auto-backup-status></div>
      </div>
    </details>

    <details class="public-edit-section public-edit-section--collapsible">
      <summary class="public-edit-section-summary">
        <div class="public-edit-section-head">
          <div>
            <strong>Nueva tarjeta</strong>
            <span>Formulario con nombre generado por modelo y submodelo</span>
          </div>
        </div>
      </summary>
      <div class="public-edit-section-content">
        <div class="public-edit-create-grid">
          <label>Codigo<input data-create-field="codigo" value="${escapeAttr(draft.codigo)}" placeholder="Ej. BISU-PEN-0001"></label>
          <label>Referencia<input data-create-field="referencia_csv" value="${escapeAttr(draft.referencia_csv)}" placeholder="Si la dejas vacia usa el codigo"></label>
          <label>IDF<input data-create-field="idf" value="${escapeAttr(draft.idf)}" placeholder="Modelo o identificador interno"></label>
          <label>Codigo producto<input data-create-field="codigo_producto" value="${escapeAttr(draft.codigo_producto)}" placeholder="Opcional"></label>
          <label>Tipo<select data-create-field="type">${typeOptions}</select></label>
          <label>Submodelo<select data-create-field="submodel">${draftSubmodelOptions}</select></label>
          <label>Material<select data-create-field="material">${materialOptions}</select></label>
          <label>Color<select data-create-field="color">${colorOptions}</select></label>
          <label>Unidad<input data-create-field="unit" value="${escapeAttr(draft.unit)}" maxlength="3" inputmode="numeric" placeholder="001"></label>
          <label>Precio<input data-create-field="price" value="${escapeAttr(draft.price)}" inputmode="decimal" placeholder="0,00"></label>
          <label>Stock<input data-create-field="stock" value="${escapeAttr(draft.stock)}" inputmode="numeric" placeholder="1"></label>
          <label>Estado<select data-create-field="estado">${statusOptionsHtml(draft.estado || 'disponible')}</select></label>
          <label class="full">Imagen<input data-create-field="archivo" value="${escapeAttr(draft.archivo)}" placeholder="image-catalog/mi-nueva-pieza.jpg"></label>
          <label class="full">Nombre generado<input value="${escapeAttr(draftName)}" readonly></label>
          <label class="full">Medidas<input data-create-field="medidas" value="${escapeAttr(draft.medidas)}" placeholder="Opcional"></label>
          <label class="full">Descripcion<textarea data-create-field="descripcion" placeholder="Descripcion breve de la pieza">${escapeHtml(draft.descripcion)}</textarea></label>
        </div>
        <div class="public-edit-actions-row public-edit-actions-row--compact">
          <button type="button" data-create-item>Anadir tarjeta</button>
          <button type="button" data-reset-draft>Limpiar formulario</button>
        </div>
      </div>
    </details>

    <details class="public-edit-section public-edit-section--tables public-edit-section--collapsible">
      <summary class="public-edit-section-summary">
        <div class="public-edit-section-head">
          <div>
            <strong>Tablas</strong>
            <span>Modelos, submodelos, materiales y colores en modo minimalista</span>
          </div>
        </div>
      </summary>
      <div class="public-edit-section-content">
        <div class="public-edit-tables public-edit-tables--creation">
          <details class="public-edit-table-box">
            <summary class="public-edit-table-summary"><strong>Modelos</strong><span>Crear, editar y borrar</span></summary>
            <div class="public-edit-table-content">
              <label>Codigo<input data-new-types-code placeholder="Ej. PUL"></label>
              <label>Nombre<input data-new-types-label placeholder="Nombre del modelo"></label>
              <div class="public-edit-inline-actions public-edit-inline-actions--single">
                <button type="button" data-add-types>Crear modelo</button>
              </div>
              <div class="public-edit-divider"></div>
              <label>Modelo a editar<select data-edit-types-select><option value="">Elegir</option>${typeOptions}</select></label>
              <label>Nuevo nombre<input data-edit-types-label placeholder="Nombre actualizado"></label>
              <div class="public-edit-inline-actions public-edit-inline-actions--single">
                <button type="button" data-edit-types>Guardar cambios</button>
              </div>
              <div class="public-edit-divider"></div>
              <label>Borrar modelo<select data-delete-types><option value="">Elegir</option>${typeOptions}</select></label>
              <div class="public-edit-inline-actions public-edit-inline-actions--single">
                <button type="button" data-remove-types>Borrar modelo</button>
              </div>
            </div>
          </details>
          <details class="public-edit-table-box public-edit-table-box--models">
            <summary class="public-edit-table-summary"><strong>Submodelos</strong><span>Dependen del modelo</span></summary>
            <div class="public-edit-table-content">
              <label>Modelo padre<select data-new-submodels-model>${typeOptions}</select></label>
              <label>Codigo<input data-new-submodels-code placeholder="Ej. PUL-001"></label>
              <label>Nombre<input data-new-submodels-label placeholder="Nombre del submodelo"></label>
              <div class="public-edit-inline-actions public-edit-inline-actions--single">
                <button type="button" data-add-submodels>Crear submodelo</button>
              </div>
              <div class="public-edit-divider"></div>
              <label>Submodelo a editar<select data-edit-submodels-select><option value="">Elegir</option>${submodelOptions}</select></label>
              <label>Modelo padre<select data-edit-submodels-model>${typeOptions}</select></label>
              <label>Nuevo nombre<input data-edit-submodels-label placeholder="Nombre actualizado"></label>
              <div class="public-edit-inline-actions public-edit-inline-actions--single">
                <button type="button" data-edit-submodels>Guardar cambios</button>
              </div>
              <div class="public-edit-divider"></div>
              <label>Borrar submodelo<select data-delete-submodels><option value="">Elegir</option>${submodelOptions}</select></label>
              <div class="public-edit-inline-actions public-edit-inline-actions--single">
                <button type="button" data-remove-submodels>Borrar submodelo</button>
              </div>
            </div>
          </details>
          <details class="public-edit-table-box">
            <summary class="public-edit-table-summary"><strong>Materiales</strong><span>Gestion rápida</span></summary>
            <div class="public-edit-table-content">
              <label>Codigo<input data-new-materials-code placeholder="Ej. 014"></label>
              <label>Nombre<input data-new-materials-label placeholder="Nombre del material"></label>
              <div class="public-edit-inline-actions public-edit-inline-actions--single">
                <button type="button" data-add-materials>Crear material</button>
              </div>
              <div class="public-edit-divider"></div>
              <label>Material a editar<select data-edit-materials-select><option value="">Elegir</option>${materialOptions}</select></label>
              <label>Nuevo nombre<input data-edit-materials-label placeholder="Nombre actualizado"></label>
              <div class="public-edit-inline-actions public-edit-inline-actions--single">
                <button type="button" data-edit-materials>Guardar cambios</button>
              </div>
              <div class="public-edit-divider"></div>
              <label>Borrar material<select data-delete-materials><option value="">Elegir</option>${materialOptions}</select></label>
              <div class="public-edit-inline-actions public-edit-inline-actions--single">
                <button type="button" data-remove-materials>Borrar material</button>
              </div>
            </div>
          </details>
          <details class="public-edit-table-box">
            <summary class="public-edit-table-summary"><strong>Colores</strong><span>Gestion rápida</span></summary>
            <div class="public-edit-table-content">
              <label>Codigo<input data-new-colors-code placeholder="Ej. 018"></label>
              <label>Nombre<input data-new-colors-label placeholder="Nombre del color"></label>
              <div class="public-edit-inline-actions public-edit-inline-actions--single">
                <button type="button" data-add-colors>Crear color</button>
              </div>
              <div class="public-edit-divider"></div>
              <label>Color a editar<select data-edit-colors-select><option value="">Elegir</option>${colorOptions}</select></label>
              <label>Nuevo nombre<input data-edit-colors-label placeholder="Nombre actualizado"></label>
              <div class="public-edit-inline-actions public-edit-inline-actions--single">
                <button type="button" data-edit-colors>Guardar cambios</button>
              </div>
              <div class="public-edit-divider"></div>
              <label>Borrar color<select data-delete-colors><option value="">Elegir</option>${colorOptions}</select></label>
              <div class="public-edit-inline-actions public-edit-inline-actions--single">
                <button type="button" data-remove-colors>Borrar color</button>
              </div>
            </div>
          </details>
        </div>
      </div>
    </details>

    <details class="public-edit-section public-edit-section--collapsible public-edit-section--sticky">
      <summary class="public-edit-section-summary">
        <div class="public-edit-section-head">
          <div>
            <strong>Edición masiva</strong>
            <span>Selección, acciones rápidas y cambios en lote</span>
          </div>
          <span class="public-edit-state public-edit-state--inline">${state.selected.size} seleccionadas</span>
        </div>
      </summary>
      <div class="public-edit-section-content">
        <div class="public-edit-actions-row public-edit-actions-row--header">
          <a href="/catalogo-publico?volverEdicion=1" target="_blank" rel="noopener">Ver publico</a>
          <button type="button" data-select-visible>Seleccionar visibles</button>
          <button type="button" data-clear-selection>Quitar seleccion</button>
          <button type="button" data-compact-toggle>${state.compact ? 'Vista completa' : 'Vista rapida'}</button>
          <button type="button" data-invert-visible>Invertir visibles</button>
          <button type="button" data-apply-bulk>Aplicar a seleccionadas</button>
        </div>
        <div class="public-edit-bulk">
          <label>Tipo<select data-bulk-type>${bulkTypeOptions}</select></label>
          <label>Submodelo<select data-bulk-submodel>${bulkSubmodelOptions}</select></label>
          <label>Material<select data-bulk-material>${bulkMaterialOptions}</select></label>
          <label>Color<select data-bulk-color>${bulkColorOptions}</select></label>
        </div>
        <div class="public-edit-selection-help">
          <strong>Navegación</strong>
          <span>Abre solo las tarjetas que necesites y mantén visible este bloque mientras te desplazas.</span>
        </div>
      </div>
    </details>

    <section class="public-edit-section public-edit-section--cards">
      <div class="public-edit-section-head">
        <div>
          <strong>Tarjetas</strong>
          <span>Vista clara con edición desplegable por pieza</span>
        </div>
      </div>
      <div class="public-edit-section-content">
        <div class="public-edit-grid${state.compact ? ' is-compact' : ''}">
          ${visibleCards || '<div class="public-edit-empty">No hay piezas visibles.</div>'}
        </div>
      </div>
    </section>
  `;

  workspace.querySelector('[data-filter-q]').value = state.filters.q;
  workspace.querySelector('[data-filter-price-min]').value = state.filters.priceMin;
  workspace.querySelector('[data-filter-price-max]').value = state.filters.priceMax;

  workspace.querySelector('[data-filter-q]').addEventListener('input', event => setFilter('q', event.target.value));
  workspace.querySelector('[data-filter-price-min]').addEventListener('input', event => setFilter('priceMin', event.target.value));
  workspace.querySelector('[data-filter-price-max]').addEventListener('input', event => setFilter('priceMax', event.target.value));
  workspace.querySelectorAll('[data-create-field]').forEach(input => {
    const field = input.dataset.createField;
    if (!field) return;
    input.addEventListener('input', () => {
      updateDraftField(field, input.value);
      if (field === 'type') {
        state.draft.submodel = '';
        renderWorkspace();
      }
    });
    if (input.tagName === 'SELECT') {
      input.value = String(state.draft[field] || '');
      input.addEventListener('change', () => {
        updateDraftField(field, input.value);
        if (field === 'type') {
          state.draft.submodel = '';
          renderWorkspace();
        }
      });
    }
  });
  workspace.querySelector('[data-create-item]').addEventListener('click', createItemFromDraft);
  workspace.querySelector('[data-reset-draft]').addEventListener('click', () => {
    state.draft = createDraftItem();
    renderWorkspace();
  });
  workspace.querySelectorAll('[data-filter-multi]').forEach(input => {
    input.addEventListener('change', event => {
      toggleMultiFilter(event.target.dataset.filterMulti, event.target.dataset.filterValue, event.target.checked);
    });
  });
  workspace.querySelector('[data-compact-toggle]').addEventListener('click', toggleCompact);
  workspace.querySelector('[data-select-visible]').addEventListener('click', selectVisible);
  workspace.querySelector('[data-invert-visible]').addEventListener('click', invertVisible);
  workspace.querySelector('[data-clear-selection]').addEventListener('click', clearSelection);
  workspace.querySelector('[data-import-json-button]').addEventListener('click', () => {
    workspace.querySelector('[data-import-json]').click();
  });
  workspace.querySelector('[data-import-json]').addEventListener('change', event => {
    importCatalogFile(event.target.files?.[0]);
    event.target.value = '';
  });
  workspace.querySelector('[data-download-csv]').addEventListener('click', () => {
    download('catalogo-visible-jldv1508.csv', makeCsv(visible.map(({ item }) => item)), 'text/csv;charset=utf-8');
  });
  workspace.querySelector('[data-download-json]').addEventListener('click', () => {
    download('catalogo-publico-jldv1508.json', makeJson(state.items), 'application/json;charset=utf-8');
  });
  workspace.querySelector('[data-download-backup]').addEventListener('click', () => {
    download('respaldo-editor-jldv1508.json', JSON.stringify({
      items: state.items,
      tables: state.tables,
      filters: state.filters,
      exportedAt: new Date().toISOString(),
    }, null, 2), 'application/json;charset=utf-8');
  });
  workspace.querySelector('[data-restore-public]').addEventListener('click', () => {
    restorePublicCatalog();
  });
  workspace.querySelector('[data-restore-auto-backup]').addEventListener('click', () => {
    if (!restoreLatestAutoBackup()) {
      alert('Todavia no hay respaldos automaticos para restaurar.');
    }
  });
  workspace.querySelector('[data-apply-bulk]').addEventListener('click', applyBulk);
  workspace.querySelectorAll('[data-add-types]').forEach(btn => btn.addEventListener('click', () => addTableEntry('types')));
  workspace.querySelectorAll('[data-add-submodels]').forEach(btn => btn.addEventListener('click', () => addTableEntry('submodels')));
  workspace.querySelectorAll('[data-add-materials]').forEach(btn => btn.addEventListener('click', () => addTableEntry('materials')));
  workspace.querySelectorAll('[data-add-colors]').forEach(btn => btn.addEventListener('click', () => addTableEntry('colors')));
  workspace.querySelectorAll('[data-remove-types]').forEach(btn => btn.addEventListener('click', () => deleteTableEntry('types')));
  workspace.querySelectorAll('[data-remove-submodels]').forEach(btn => btn.addEventListener('click', () => deleteTableEntry('submodels')));
  workspace.querySelectorAll('[data-remove-materials]').forEach(btn => btn.addEventListener('click', () => deleteTableEntry('materials')));
  workspace.querySelectorAll('[data-remove-colors]').forEach(btn => btn.addEventListener('click', () => deleteTableEntry('colors')));
  workspace.querySelectorAll('[data-edit-types]').forEach(btn => btn.addEventListener('click', () => editTableEntry('types')));
  workspace.querySelectorAll('[data-edit-submodels]').forEach(btn => btn.addEventListener('click', () => editTableEntry('submodels')));
  workspace.querySelectorAll('[data-edit-materials]').forEach(btn => btn.addEventListener('click', () => editTableEntry('materials')));
  workspace.querySelectorAll('[data-edit-colors]').forEach(btn => btn.addEventListener('click', () => editTableEntry('colors')));
  workspace.querySelectorAll('[data-edit-types-select]').forEach(select => select.addEventListener('change', () => syncEditEntry('types')));
  workspace.querySelectorAll('[data-edit-submodels-select]').forEach(select => select.addEventListener('change', () => syncEditEntry('submodels')));
  workspace.querySelectorAll('[data-edit-materials-select]').forEach(select => select.addEventListener('change', () => syncEditEntry('materials')));
  workspace.querySelectorAll('[data-edit-colors-select]').forEach(select => select.addEventListener('change', () => syncEditEntry('colors')));

  workspace.querySelectorAll('[data-card-check]').forEach(input => {
    input.addEventListener('click', event => {
      event.preventDefault();
      const index = Number(input.dataset.cardCheck);
      const checked = !state.selected.has(index);
      handleCardSelection(index, checked, event.shiftKey);
    });
  });

  workspace.querySelectorAll('[data-card-index]').forEach(card => {
    card.addEventListener('click', event => {
      const interactive = event.target.closest('input, select, textarea, button, a, summary, label, details');
      if (interactive) return;
      const index = Number(card.dataset.cardIndex);
      const checked = !state.selected.has(index);
      handleCardSelection(index, checked, event.shiftKey);
    });
  });

  workspace.querySelectorAll('[data-item-field]').forEach(input => {
    const index = Number(input.dataset.index);
    const field = input.dataset.itemField;
    const item = state.items[index];
    if (!item) return;
    if (input.tagName === 'SELECT') {
      input.value = String(item[field] || '');
      input.addEventListener('change', () => {
        item[field] = input.value;
        if (field === 'estado') item.estado = input.value;
        if (field === 'type') {
          item.type = input.value;
          item.tipo = input.value;
          if (item.submodel && submodelParent(item.submodel) && submodelParent(item.submodel) !== input.value) {
            item.submodel = '';
            item.submodelo = '';
          }
          syncPieceName(item);
        }
        if (field === 'submodel') {
          item.submodelo = input.value;
          syncPieceName(item);
        }
        savePublicPayload();
        renderWorkspace();
      });
    } else if (input.tagName === 'INPUT') {
      if (field === 'unit') input.value = String(item.unit || '');
      if (field === 'productName') input.value = String(item.productName || item.nombre_comercial || '');
      input.addEventListener('input', () => {
        if (field === 'unit') item[field] = input.value.replace(/\D/g, '').padStart(3, '0').slice(-3);
        else if (field === 'stock') item[field] = normalizeStock(input.value);
        else if (field === 'price') {
          item[field] = input.value;
          item.precio_eur = input.value;
        } else if (field === 'archivo') item[field] = normalizeImagePath(input.value);
        else if (field === 'image_x') item[field] = input.value;
        else if (field === 'image_y') item[field] = input.value;
        else if (field === 'image_zoom') item[field] = input.value;
        else if (field === 'medidas') {
          item[field] = input.value;
          item.measures = input.value;
        } else if (field === 'productName') {
          item[field] = input.value;
          item.nombre_comercial = input.value;
        } else item[field] = input.value;
      });
      input.addEventListener('change', () => {
        if (field === 'price') {
          item.price = normalizePrice(input.value);
          item.precio_eur = item.price;
          input.value = item.price;
        }
        if (field === 'stock') {
          item.stock = normalizeStock(input.value);
          input.value = item.stock;
        }
        if (field === 'archivo') {
          item.archivo = normalizeImagePath(input.value);
          input.value = item.archivo;
        }
        if (field === 'image_x') {
          item.image_x = normalizePosition(input.value, 50);
          input.value = String(item.image_x);
        }
        if (field === 'image_y') {
          item.image_y = normalizePosition(input.value, 50);
          input.value = String(item.image_y);
        }
        if (field === 'image_zoom') {
          item.image_zoom = normalizeZoom(input.value, 1);
          input.value = String(item.image_zoom);
        }
        savePublicPayload();
        renderWorkspace();
      });
    } else if (input.tagName === 'TEXTAREA') {
      input.addEventListener('change', () => {
        item[field] = input.value;
        if (field === 'description') item.descripcion = input.value;
        savePublicPayload();
      });
    }
  });
  renderAutoBackupStatus();
}

function createPanel() {
  const existing = getPanel();
  if (existing) return existing;

  const panel = document.createElement('section');
  panel.id = 'publicEditPanel';
  panel.className = 'public-edit-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="public-edit-head">
      <div>
        <p class="public-edit-kicker">Cabecera de edicion</p>
        <h2>${escapeHtml(document.body.dataset.catalogTitle || document.title || 'Edicion publica')}</h2>
      </div>
      <span class="public-edit-state" data-edit-state>Bloqueada</span>
    </div>
    <div class="public-edit-toolbar" data-edit-toolbar hidden>
      <div class="public-edit-tabs">
        <span class="public-edit-tab public-edit-tab--static">Catalogo unificado</span>
      </div>
    </div>
    <form class="public-edit-form" data-edit-form>
      <label>
        <span>Usuario</span>
        <input name="user" autocomplete="username" placeholder="admin">
      </label>
      <label>
        <span>Contraseña</span>
        <input name="password" type="password" autocomplete="current-password" placeholder="password">
      </label>
      <div class="public-edit-actions">
        <button type="submit">Abrir edicion</button>
        <button type="button" data-edit-close>Cerrar</button>
      </div>
    </form>
    <div class="public-edit-note" data-edit-note hidden>Edicion activa sobre la hoja publica.</div>
    <div data-edit-workspace hidden></div>
  `;

  const mount = getMount();
  if (mount) mount.insertAdjacentElement('beforebegin', panel);
  else document.body.appendChild(panel);

  const form = panel.querySelector('[data-edit-form]');
  const closeButton = panel.querySelector('[data-edit-close]');
  const stateLabel = panel.querySelector('[data-edit-state]');
  const note = panel.querySelector('[data-edit-note]');
  const toolbar = panel.querySelector('[data-edit-toolbar]');
  const workspace = panel.querySelector('[data-edit-workspace]');

  const sync = () => {
    const unlocked = isUnlocked();
    state.unlocked = unlocked;
    panel.hidden = !panel.classList.contains('is-open');
    stateLabel.textContent = unlocked ? 'Activa' : 'Bloqueada';
    toolbar.hidden = !unlocked;
    note.hidden = !unlocked;
    workspace.hidden = !unlocked;
  };

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(form);
    try {
      const config = await getConfig();
      const ok = String(data.get('user') || '') === config.user && String(data.get('password') || '') === config.password;
      if (!ok) {
        stateLabel.textContent = 'Credenciales incorrectas';
        panel.classList.add('is-open');
        panel.hidden = false;
        return;
      }
      setUnlocked(true);
      state.unlocked = true;
      panel.classList.add('is-open');
      await ensureWorkspace();
      sync();
    } catch {
      stateLabel.textContent = 'No se pueden cargar credenciales';
      panel.classList.add('is-open');
      panel.hidden = false;
    }
  });

  closeButton.addEventListener('click', () => {
    setUnlocked(false);
    state.unlocked = false;
    panel.classList.remove('is-open');
    panel.hidden = true;
  });

  return panel;
}

function openPanel() {
  const panel = createPanel();
  panel.classList.add('is-open');
  panel.hidden = false;
  const input = panel.querySelector('[name="user"]');
  if (input && !isUnlocked()) input.focus();
}

function initTriggers() {
  document.querySelectorAll('.home-edit, .blog-edit, .catalog-edit').forEach(trigger => {
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('tabindex', '0');
    trigger.addEventListener('click', event => {
      if (trigger.tagName !== 'A') event.preventDefault();
      openPanel();
      if (trigger.tagName === 'A') {
        history.replaceState(null, '', '#publicEditPanel');
      }
      if (isUnlocked()) ensureWorkspace();
    });
    trigger.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openPanel();
        if (isUnlocked()) ensureWorkspace();
      }
    });
  });
}

function init() {
  createPanel();
  initTriggers();
  startAutoBackupTimer();
  if (isUnlocked()) {
    const panel = createPanel();
    panel.hidden = false;
    panel.classList.add('is-open');
    state.unlocked = true;
    ensureWorkspace();
  }
}

init();
