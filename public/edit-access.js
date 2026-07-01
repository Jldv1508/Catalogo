const STORAGE_KEY = 'jldv1508EditUnlocked';
const PUBLIC_STORE_FALLBACK = `${STORAGE_KEY}:public-store`;
const DEFAULT_TABLES = {
  types: { PUL: 'Pulsera', ANI: 'Anillo', PEN: 'Pendiente', COL: 'Collar', CON: 'Conjunto', BRO: 'Broche', PIE: 'Pieza', CCH: 'Concha', ACC: 'Accesorio', PIN: 'Pin' },
  materials: { '000': 'Pendiente', '001': 'Resina', '002': 'Latón', '003': 'Piedra', '004': 'Cristal', '005': 'Acero inoxidable', '006': 'Metal', '007': 'Cuero', '008': 'Tela', '009': 'Material mixto', '010': 'Perla', '011': 'Acero', '012': 'Plata', '013': 'Dorado / baño oro', '999': 'Pendiente' },
  colors: { '000': 'Pendiente', '001': 'Multicolor', '002': 'Blanco', '003': 'Negro', '004': 'Rojo', '005': 'Plateado', '006': 'Verde', '007': 'Azul', '008': 'Marrón', '009': 'Multicolor', '010': 'Naranja', '011': 'Amarillo', '012': 'Morado', '013': 'Turquesa', '014': 'Rosa', '015': 'Gris', '016': 'Lila', '017': 'Fucsia', '999': 'Pendiente' },
};

let state = {
  unlocked: false,
  loading: false,
  items: [],
  tables: cloneTables(DEFAULT_TABLES),
  selected: new Set(),
  compact: false,
  filters: { q: '', type: '', material: '', color: '' },
  publicKey: '',
  catalogUrl: '',
};

function cloneTables(source) {
  return {
    types: { ...(source?.types || {}) },
    materials: { ...(source?.materials || {}) },
    colors: { ...(source?.colors || {}) },
  };
}

function mergeTables(source) {
  const base = source || {};
  return {
    types: { ...(DEFAULT_TABLES.types || {}), ...(base.types || {}) },
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

function getConfig() {
  return fetch('/api/edit-credentials', { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error(`edit-credentials:${response.status}`);
      return response.json();
    })
    .then(payload => ({
      user: String(payload?.user || ''),
      password: String(payload?.password || ''),
    }));
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

function tablesFor(kind) {
  return state.tables[kind] || DEFAULT_TABLES[kind] || {};
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

function code(item) {
  return `${itemType(item)}-${itemMaterial(item)}-${itemColor(item)}`;
}

function typeName(item) {
  return tablesFor('types')[itemType(item)] || item.tipo_nombre || 'Tipo pendiente';
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

function baseItem(item) {
  return {
    ...item,
    type: item.type || item.tipo || 'PIE',
    material: item.material || '000',
    color: item.color || '000',
    unit: String(item.unit || '001').padStart(3, '0'),
    price: normalizePrice(item.price ?? item.precio_eur),
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
  localStorage.setItem(state.publicKey, JSON.stringify({
    items: state.items,
    tables: state.tables,
    updatedAt: new Date().toISOString(),
  }));
  return true;
}

function loadEditorState() {
  const payload = loadPublicPayload();
  if (payload) {
    state.items = (payload.items || []).map(baseItem);
    state.tables = mergeTables(payload.tables || DEFAULT_TABLES);
  }
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
    state.items = Array.isArray(data) ? data.map(baseItem) : [];
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
          item.original, item.codigo, item.idf, code(item), item.productName, item.nombre_comercial,
          item.notes, item.descripcion, item.measures, item.medidas, item.type, item.material, item.color,
          typeName(item), materialName(item), colorName(item),
        ].join(' ').toLowerCase();
        if (!text.includes(q)) return false;
      }
      if (state.filters.type && itemType(item) !== state.filters.type) return false;
      if (state.filters.material && itemMaterial(item) !== state.filters.material) return false;
      if (state.filters.color && itemColor(item) !== state.filters.color) return false;
      return true;
    })
    .map(({ index }) => index);
}

function setFilter(key, value) {
  state.filters[key] = value;
  renderWorkspace();
}

function applyBulk() {
  if (!state.selected.size) return;
  const type = document.querySelector('[data-bulk-type]')?.value || '';
  const material = document.querySelector('[data-bulk-material]')?.value || '';
  const color = document.querySelector('[data-bulk-color]')?.value || '';
  state.selected.forEach(index => {
    const item = state.items[index];
    if (!item) return;
    if (type) item.type = type;
    if (material) item.material = material;
    if (color) item.color = color;
  });
  savePublicPayload();
  renderWorkspace();
}

function addTableEntry(kind) {
  const codeInput = document.querySelector(`[data-new-${kind}-code]`);
  const labelInput = document.querySelector(`[data-new-${kind}-label]`);
  const codeValue = normalizeCode(codeInput?.value);
  const labelValue = String(labelInput?.value || '').trim();
  if (!codeValue || !labelValue) return;
  state.tables[kind][codeValue] = labelValue;
  codeInput.value = '';
  labelInput.value = '';
  savePublicPayload();
  renderWorkspace();
}

function deleteTableEntry(kind) {
  const select = document.querySelector(`[data-delete-${kind}]`);
  const codeValue = select?.value || '';
  if (!codeValue) return;
  const fallback = kind === 'types' ? 'PIE' : '999';
  const affectedField = kind === 'types' ? 'type' : kind === 'materials' ? 'material' : 'color';
  const used = state.items.filter(item => item[affectedField] === codeValue).length;
  if (codeValue === fallback) return;
  delete state.tables[kind][codeValue];
  if (used) {
    state.items.forEach(item => {
      if (item[affectedField] === codeValue) item[affectedField] = fallback;
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
  renderWorkspace();
  return true;
}

function makeCsv(items) {
  const header = ['codigo', 'tipo', 'material', 'color', 'precio_eur', 'estado', 'descripcion', 'archivo'];
  return [header.join(',')].concat(items.map(item => header.map(key => `"${String(item?.[key] ?? '').replace(/"/g, '""')}"`).join(','))).join('\n');
}

function makeJson(items) {
  return JSON.stringify({ items, tables: state.tables, exportedAt: new Date().toISOString() }, null, 2);
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

function visibleItems() {
  return visibleIndexes().map(index => ({ item: state.items[index], index }));
}

function toggleSelected(index, checked) {
  if (checked) state.selected.add(index);
  else state.selected.delete(index);
  renderWorkspace();
}

function selectVisible() {
  visibleIndexes().forEach(index => state.selected.add(index));
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
  const typeOptions = Object.entries(tablesFor('types')).map(([codeValue, label]) => `<option value="${escapeAttr(codeValue)}">${escapeHtml(codeValue)} · ${escapeHtml(label)}</option>`).join('');
  const materialOptions = Object.entries(tablesFor('materials')).map(([codeValue, label]) => `<option value="${escapeAttr(codeValue)}">${escapeHtml(codeValue)} · ${escapeHtml(label)}</option>`).join('');
  const colorOptions = Object.entries(tablesFor('colors')).map(([codeValue, label]) => `<option value="${escapeAttr(codeValue)}">${escapeHtml(codeValue)} · ${escapeHtml(label)}</option>`).join('');
  const bulkTypeOptions = '<option value="">Sin cambio</option>' + typeOptions;
  const bulkMaterialOptions = '<option value="">Sin cambio</option>' + materialOptions;
  const bulkColorOptions = '<option value="">Sin cambio</option>' + colorOptions;
  const visibleCards = visible.map(({ item, index }) => `
    <article class="public-edit-card${state.selected.has(index) ? ' is-selected' : ''}">
      <button class="public-edit-card-image" type="button" data-toggle-card="${index}">
        <img src="${escapeAttr(catalogImage(item))}" alt="${escapeAttr(code(item))}" style="${imageStyle(item)}">
      </button>
      <div class="public-edit-card-body">
        <div class="public-edit-card-top">
          <label class="public-edit-check"><input type="checkbox" data-card-check="${index}" ${state.selected.has(index) ? 'checked' : ''}> Seleccionar</label>
          <strong>${escapeHtml(code(item))}</strong>
        </div>
        <div class="public-edit-card-meta">${escapeHtml(typeName(item))} · ${escapeHtml(materialName(item))} · ${escapeHtml(colorName(item))}</div>
        <div class="public-edit-card-fields">
          <label>Tipo<select data-item-field="type" data-index="${index}">${typeOptions}</select></label>
          <label>Material<select data-item-field="material" data-index="${index}">${materialOptions}</select></label>
          <label>Color<select data-item-field="color" data-index="${index}">${colorOptions}</select></label>
          <label>Unidad<input data-item-field="unit" data-index="${index}" value="${escapeAttr(item.unit || '')}" maxlength="3"></label>
          <label class="full">Nombre<input data-item-field="productName" data-index="${index}" value="${escapeAttr(item.productName || item.nombre_comercial || '')}"></label>
          <label class="full">Descripcion<textarea data-item-field="description" data-index="${index}">${escapeHtml(item.description || item.descripcion || '')}</textarea></label>
        </div>
      </div>
    </article>
  `).join('');

  workspace.innerHTML = `
    <section class="public-edit-section">
      <div class="public-edit-section-head">
        <strong>Edicion masiva</strong>
        <span>${visible.length} visibles · ${state.selected.size} seleccionadas</span>
      </div>
      <div class="public-edit-search">
        <input data-filter-q placeholder="Buscar por codigo, descripcion, material, color...">
        <select data-filter-type><option value="">Todos los tipos</option>${typeOptions}</select>
        <select data-filter-material><option value="">Todos los materiales</option>${materialOptions}</select>
        <select data-filter-color><option value="">Todos los colores</option>${colorOptions}</select>
        <button type="button" data-compact-toggle>${state.compact ? 'Vista completa' : 'Vista rapida'}</button>
        <button type="button" data-select-visible>Seleccionar visibles</button>
        <button type="button" data-invert-visible>Invertir visibles</button>
        <button type="button" data-clear-selection>Quitar seleccion</button>
        <button type="button" data-save-public>Actualizar publico</button>
      </div>
      <div class="public-edit-bulk">
        <label>Tipo<select data-bulk-type>${bulkTypeOptions}</select></label>
        <label>Material<select data-bulk-material>${bulkMaterialOptions}</select></label>
        <label>Color<select data-bulk-color>${bulkColorOptions}</select></label>
        <button type="button" data-apply-bulk>Aplicar a seleccionadas</button>
        <button type="button" data-download-csv>Exportar CSV</button>
        <button type="button" data-download-json>Descargar catalogo publico</button>
        <button type="button" data-download-html>Descargar HTML editable</button>
        <button type="button" data-restore-public>Restaurar publico</button>
      </div>
    </section>

    <section class="public-edit-section">
      <div class="public-edit-section-head">
        <strong>Crear modelos, materiales y colores</strong>
        <span>Las nuevas claves se guardan en el mismo publico</span>
      </div>
      <div class="public-edit-tables">
        ${['types', 'materials', 'colors'].map(kind => `
          <div class="public-edit-table-box">
            <strong>${kind === 'types' ? 'Modelos' : kind === 'materials' ? 'Materiales' : 'Colores'}</strong>
            <label>Codigo<input data-new-${kind}-code placeholder="Ej. NUEVO"></label>
            <label>Nombre<input data-new-${kind}-label placeholder="Etiqueta visible"></label>
            <div class="public-edit-inline-actions">
              <button type="button" data-add-${kind}>Añadir</button>
              <select data-delete-${kind}><option value="">Eliminar</option>${Object.entries(tablesFor(kind)).map(([codeValue, label]) => `<option value="${escapeAttr(codeValue)}">${escapeHtml(codeValue)} · ${escapeHtml(label)}</option>`).join('')}</select>
              <button type="button" data-remove-${kind}>Quitar</button>
            </div>
          </div>
        `).join('')}
      </div>
    </section>

    <section class="public-edit-section">
      <div class="public-edit-section-head">
        <strong>Vista rapida</strong>
        <span>Piezas compactas para seleccionar mas rapido</span>
      </div>
      <div class="public-edit-grid${state.compact ? ' is-compact' : ''}">
        ${visibleCards || '<div class="public-edit-empty">No hay piezas visibles.</div>'}
      </div>
    </section>
  `;

  workspace.querySelector('[data-filter-q]').value = state.filters.q;
  workspace.querySelector('[data-filter-type]').value = state.filters.type;
  workspace.querySelector('[data-filter-material]').value = state.filters.material;
  workspace.querySelector('[data-filter-color]').value = state.filters.color;

  workspace.querySelector('[data-filter-q]').addEventListener('input', event => setFilter('q', event.target.value));
  workspace.querySelector('[data-filter-type]').addEventListener('change', event => setFilter('type', event.target.value));
  workspace.querySelector('[data-filter-material]').addEventListener('change', event => setFilter('material', event.target.value));
  workspace.querySelector('[data-filter-color]').addEventListener('change', event => setFilter('color', event.target.value));
  workspace.querySelector('[data-compact-toggle]').addEventListener('click', toggleCompact);
  workspace.querySelector('[data-select-visible]').addEventListener('click', selectVisible);
  workspace.querySelector('[data-invert-visible]').addEventListener('click', invertVisible);
  workspace.querySelector('[data-clear-selection]').addEventListener('click', clearSelection);
  workspace.querySelector('[data-save-public]').addEventListener('click', () => {
    savePublicPayload();
    const stateEl = document.querySelector('[data-edit-state]');
    if (stateEl) stateEl.textContent = 'Actualizado';
  });
  workspace.querySelector('[data-apply-bulk]').addEventListener('click', () => {
    const type = workspace.querySelector('[data-bulk-type]').value;
    const material = workspace.querySelector('[data-bulk-material]').value;
    const color = workspace.querySelector('[data-bulk-color]').value;
    state.selected.forEach(index => {
      const item = state.items[index];
      if (!item) return;
      if (type) item.type = type;
      if (material) item.material = material;
      if (color) item.color = color;
    });
    savePublicPayload();
    renderWorkspace();
  });
  workspace.querySelectorAll('[data-add-types]').forEach(btn => btn.addEventListener('click', () => addTableEntry('types')));
  workspace.querySelectorAll('[data-add-materials]').forEach(btn => btn.addEventListener('click', () => addTableEntry('materials')));
  workspace.querySelectorAll('[data-add-colors]').forEach(btn => btn.addEventListener('click', () => addTableEntry('colors')));
  workspace.querySelectorAll('[data-remove-types]').forEach(btn => btn.addEventListener('click', () => deleteTableEntry('types')));
  workspace.querySelectorAll('[data-remove-materials]').forEach(btn => btn.addEventListener('click', () => deleteTableEntry('materials')));
  workspace.querySelectorAll('[data-remove-colors]').forEach(btn => btn.addEventListener('click', () => deleteTableEntry('colors')));

  workspace.querySelectorAll('[data-toggle-card]').forEach(button => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.toggleCard);
      toggleSelected(index, !state.selected.has(index));
    });
  });

  workspace.querySelectorAll('[data-card-check]').forEach(input => {
    input.addEventListener('change', () => toggleSelected(Number(input.dataset.cardCheck), input.checked));
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
        savePublicPayload();
        renderWorkspace();
      });
    } else if (input.tagName === 'INPUT') {
      if (field === 'unit') input.value = String(item.unit || '');
      if (field === 'productName') input.value = String(item.productName || item.nombre_comercial || '');
      input.addEventListener('input', () => {
        item[field] = field === 'unit' ? input.value.replace(/\D/g, '').padStart(3, '0').slice(-3) : input.value;
      });
      input.addEventListener('change', () => {
        savePublicPayload();
      });
    } else if (input.tagName === 'TEXTAREA') {
      input.addEventListener('change', () => {
        item[field] = input.value;
        savePublicPayload();
      });
    }
  });
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
        <a class="public-edit-tab" href="/bisuteria">Bisuteria</a>
        <a class="public-edit-tab" href="/conchas">Conchas</a>
        <a class="public-edit-tab" href="/blog">Blog</a>
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
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const input = panel.querySelector('[name="user"]');
  if (input && !isUnlocked()) input.focus();
}

function initTriggers() {
  document.querySelectorAll('.home-edit, .blog-edit, .catalog-edit').forEach(trigger => {
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('tabindex', '0');
    trigger.addEventListener('click', event => {
      event.preventDefault();
      openPanel();
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
  initTriggers();
  if (isUnlocked()) {
    const panel = createPanel();
    panel.hidden = false;
    panel.classList.add('is-open');
    state.unlocked = true;
    ensureWorkspace();
  }
}

init();
