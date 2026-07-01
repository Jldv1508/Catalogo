const STORAGE_KEY = document.body.dataset.storageKey || 'jldv1508RenameItemsV9';
const TABLES_KEY = document.body.dataset.tablesKey || 'jldv1508CodeTablesV1';
const PUBLIC_STORAGE_KEY = document.body.dataset.publicStorageKey || '';
const PUBLIC_FILE = document.body.dataset.publicFile || 'catalogo-fotos.json';
const LEGACY_STORAGE_KEYS = (document.body.dataset.legacyStorageKeys || '').split(',').map(key => key.trim()).filter(Boolean);
const LEGACY_TABLES_KEYS = (document.body.dataset.legacyTablesKeys || '').split(',').map(key => key.trim()).filter(Boolean);
const BACKUP_KEY = `${STORAGE_KEY}:ultimo-respaldo`;
const TYPE_CORRECTIONS = {
  accesorio_001: { from: 'ACC', to: 'PEN' },
  conjunto_0011: { from: 'CON', to: 'COL' },
  pin_0011: { from: 'PIN', to: 'COL' },
};
let items = hydrateItems(loadStoredList(STORAGE_KEY, LEGACY_STORAGE_KEYS, window.INITIAL_ITEMS));
let tables = hydrateTables(loadStoredObject(TABLES_KEY, LEGACY_TABLES_KEYS, window.CODE_TABLES));
const grid = document.getElementById('grid');
const selected = new Set();
const previewImages = new Map();
let qualityByOriginal = {};
let qualityByCode = {};
let lastSelectedIndex = null;
let draggedIndex = null;
let compactView = parseStoredJson(`${STORAGE_KEY}:vista-compacta`) === true;
if (compactView) document.body.classList.add('fast-select');

function ext(name) {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '.jpg';
}
function code(item) {
  return `${item.type}-${item.material}-${item.color}-${item.unit}`;
}
function typeClass(value) {
  return `type-${String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}
function newName(item) {
  const outputExtension = item.transparent ? ext(item.transparent) : String(item.image || '').toLowerCase().endsWith('.webp') ? '.webp' : ext(item.original);
  return `${code(item)}${outputExtension}`;
}
function initialImageFor(item) {
  return window.INITIAL_ITEMS?.find(initial => initial.original === item.original)?.image || item.image || '';
}
function persistedImageFor(item) {
  return String(item.image || '').startsWith('data:image/') ? initialImageFor(item) : item.image;
}
function imageSrc(item, index) {
  return previewImages.get(index) || persistedImageFor(item);
}
function imageNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}
function imageStyle(item) {
  const x = imageNumber(item.imageX ?? item.image_x, 50, 0, 100);
  const y = imageNumber(item.imageY ?? item.image_y, 50, 0, 100);
  const zoom = imageNumber(item.imageZoom ?? item.image_zoom, 1, .7, 2.2);
  return `--image-x:${x}%;--image-y:${y}%;--image-zoom:${zoom};`;
}
function hydrateTables(source) {
  const base = source || { types: {}, materials: {}, colors: {} };
  const defaults = window.CODE_TABLES || { types: {}, materials: {}, colors: {} };
  return {
    types: { ...(defaults.types || {}), ...(base.types || {}) },
    materials: { ...(defaults.materials || {}), ...(base.materials || {}) },
    colors: { ...(defaults.colors || {}), ...(base.colors || {}) },
  };
}
function parseStoredJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function storedCandidates() {
  const rows = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || !key.toLowerCase().includes('jldv1508')) continue;
    const value = parseStoredJson(key);
    const list = listFromBackup(value);
    if (!list?.length) continue;
    const edited = hasCardEdits(list, window.INITIAL_ITEMS);
    const matching = list.filter(item => window.INITIAL_ITEMS?.some(initial => initial.original === item.original)).length;
    rows.push({
      key,
      value,
      count: list.length,
      edited,
      matching,
      createdAt: value?.createdAt || '',
    });
  }
  return rows.sort((a, b) => Number(b.edited) - Number(a.edited) || b.matching - a.matching || b.count - a.count);
}
function restoreBackupObject(backup) {
  const restoredItems = listFromBackup(backup);
  if (!restoredItems?.length) throw new Error('No hay tarjetas para restaurar.');
  items = hydrateItems(mergeWithInitial(restoredItems, window.INITIAL_ITEMS));
  tables = hydrateTables(backup.tables || tables);
  previewImages.forEach(url => URL.revokeObjectURL(url));
  previewImages.clear();
  selected.clear();
  save();
  refreshCodeEditors();
}
function loadStoredObject(key, legacyKeys, fallback) {
  const current = parseStoredJson(key);
  if (current) return current;
  for (const legacyKey of legacyKeys) {
    const legacy = parseStoredJson(legacyKey);
    if (legacy) {
      localStorage.setItem(key, JSON.stringify(legacy));
      return legacy;
    }
  }
  return fallback;
}
function listFromBackup(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  return null;
}
function mergeWithInitial(saved, initial) {
  const savedList = listFromBackup(saved);
  if (!savedList?.length) return initial;
  const savedByOriginal = new Map(savedList.map(item => [item.original, item]));
  const merged = (initial || []).map(initialItem => {
    const savedItem = savedByOriginal.get(initialItem.original);
    return savedItem ? {
      ...initialItem,
      ...savedItem,
      image: initialItem.image || savedItem.image,
      images: initialItem.images?.length ? initialItem.images : savedItem.images,
      transparent: initialItem.transparent || savedItem.transparent,
    } : initialItem;
  });
  const initialOriginals = new Set((initial || []).map(item => item.original));
  savedList.forEach(item => {
    if (!initialOriginals.has(item.original)) merged.push(item);
  });
  return merged;
}
function hasCardEdits(list, initial) {
  const savedList = listFromBackup(list) || [];
  const initialByOriginal = new Map((initial || []).map(item => [item.original, item]));
  return savedList.some(item => {
    const base = initialByOriginal.get(item.original) || {};
    return Boolean(
      item.productName || item.nombre || item.price || item.notes || item.measures || item.medidas ||
      item.replacementFileName || item.replacementPending ||
      (item.status && item.status !== 'disponible') ||
      item.type !== base.type || item.material !== base.material || item.color !== base.color ||
      String(item.unit || '') !== String(base.unit || '') ||
      String(item.stock || '') !== String(base.stock || '') ||
      imageNumber(item.imageX ?? item.image_x, 50, 0, 100) !== imageNumber(base.imageX ?? base.image_x, 50, 0, 100) ||
      imageNumber(item.imageY ?? item.image_y, 50, 0, 100) !== imageNumber(base.imageY ?? base.image_y, 50, 0, 100) ||
      imageNumber(item.imageZoom ?? item.image_zoom, 1, .7, 2.2) !== imageNumber(base.imageZoom ?? base.image_zoom, 1, .7, 2.2)
    );
  });
}
function loadStoredList(key, legacyKeys, fallback) {
  const current = parseStoredJson(key);
  const legacy = legacyKeys.map(parseStoredJson).find(Boolean);
  if (current) {
    if (legacy && hasCardEdits(legacy, fallback) && !hasCardEdits(current, fallback)) {
      const migrated = mergeWithInitial(legacy, fallback);
      localStorage.setItem(key, JSON.stringify(migrated));
      return migrated;
    }
    return mergeWithInitial(current, fallback);
  }
  for (const legacyKey of legacyKeys) {
    const legacyValue = parseStoredJson(legacyKey);
    if (legacyValue) {
      const migrated = mergeWithInitial(legacyValue, fallback);
      localStorage.setItem(key, JSON.stringify(migrated));
      return migrated;
    }
  }
  return fallback;
}
function normalizePrice(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const cleaned = raw.replace(/\s/g, '').replace('€', '').replace(',', '.');
  const number = Number(cleaned);
  if (!Number.isFinite(number) || number < 0) return '';
  return number.toFixed(2);
}
function formatPrice(value) {
  const normalized = normalizePrice(value);
  if (!normalized) return 'Precio pendiente';
  return `${Number(normalized).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}
function tableLabel(table, code) {
  return table?.[code] || 'Pendiente de clasificar';
}
function typeLabel(item) {
  return tableLabel(tables.types, item.type).toLowerCase();
}
function materialLabel(item) {
  return tableLabel(tables.materials, item.material).toLowerCase();
}
function colorLabel(item) {
  return tableLabel(tables.colors, item.color).toLowerCase();
}
function defaultDescription(item) {
  const tipo = typeLabel(item);
  const material = materialLabel(item);
  const color = colorLabel(item);
  const materialText = item.material === '999' ? 'material pendiente de confirmar' : material;
  const colorText = item.color === '999' ? 'color pendiente de confirmar' : `tono ${color}`;
  return `${capitalize(tipo)} de ${materialText}, en ${colorText}. Pieza revisable para catalogar con nombre comercial, precio y observaciones.`;
}
function hydrateItems(source) {
  return (source || []).map(item => ({
    ...item,
    type: correctedType(item),
    image: persistedImageFor(item),
    productName: item.productName || item.nombre || '',
    price: normalizePrice(item.price),
    stock: normalizeStock(item.stock),
    measures: item.measures || item.medidas || '',
    status: item.status || item.estado || 'disponible',
    description: item.description || '',
    imageX: imageNumber(item.imageX ?? item.image_x, 50, 0, 100),
    imageY: imageNumber(item.imageY ?? item.image_y, 50, 0, 100),
    imageZoom: imageNumber(item.imageZoom ?? item.image_zoom, 1, .7, 2.2),
  }));
}
function correctedType(item) {
  const key = Object.keys(TYPE_CORRECTIONS).find(prefix => String(item.original || item.idf || '').startsWith(prefix));
  const correction = key ? TYPE_CORRECTIONS[key] : null;
  return correction && item.type === correction.from ? correction.to : item.type;
}
function normalizeStock(value) {
  const number = Number(String(value ?? '').replace(/\D/g, ''));
  return Number.isFinite(number) && number > 0 ? String(number) : '';
}
function defaultDescriptionWithFallback(item) {
  const fallbackTables = window.CODE_TABLES || { types: {}, materials: {}, colors: {} };
  const tipo = (fallbackTables.types?.[item.type] || 'Pieza').toLowerCase();
  const material = (fallbackTables.materials?.[item.material] || 'material pendiente de confirmar').toLowerCase();
  const color = (fallbackTables.colors?.[item.color] || 'color pendiente de confirmar').toLowerCase();
  const materialText = item.material === '999' ? 'material pendiente de confirmar' : material;
  const colorText = item.color === '999' ? 'color pendiente de confirmar' : `tono ${color}`;
  return `${capitalize(tipo)} de ${materialText}, en ${colorText}. Pieza revisable para catalogar con nombre comercial, precio y observaciones.`;
}
function refreshDescriptionsFor(indexes) {
  indexes.forEach(index => {
    if (items[index]) items[index].description = '';
  });
}
function capitalize(value) {
  const text = String(value || '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
function options(table, selected) {
  return Object.entries(table).map(([k, v]) => `<option value="${escapeAttr(k)}" ${k === selected ? 'selected' : ''}>${escapeHtml(k)} · ${escapeHtml(v)}</option>`).join('');
}
function noChangeOptions(table) {
  return '<option value="">Sin cambio</option>' + Object.entries(table).map(([k, v]) => `<option value="${escapeAttr(k)}">${escapeHtml(k)} · ${escapeHtml(v)}</option>`).join('');
}
function deleteOptions(table) {
  return '<option value="">Elige una categoría</option>' + Object.entries(table).map(([k, v]) => `<option value="${escapeAttr(k)}">${escapeHtml(k)} · ${escapeHtml(v)}</option>`).join('');
}
function multiFilterOptions(table, name) {
  return Object.entries(table).map(([k, v]) => `<label class="multi-option">
    <input type="checkbox" name="${name}" value="${escapeAttr(k)}">
    <span>${escapeHtml(k)} · ${escapeHtml(v)}</span>
  </label>`).join('');
}
function selectedFilterValues(name) {
  return new Set([...document.querySelectorAll(`input[name="${name}"]:checked`)].map(input => input.value));
}
function updateFilterSummary(boxId, selected) {
  const summary = document.querySelector(`#${boxId} summary span`);
  if (summary) summary.textContent = selected.size ? `${selected.size} seleccionado${selected.size === 1 ? '' : 's'}` : 'Todos';
}
function updateSelectedCount() {
  document.getElementById('selectedCount').textContent = `${selected.size} seleccionada${selected.size === 1 ? '' : 's'}`;
  const fastViewBtn = document.getElementById('fastViewBtn');
  if (fastViewBtn) fastViewBtn.textContent = compactView ? 'Vista completa' : 'Vista rapida';
}
function renumberAll() {
  const counters = {};
  items.forEach(item => {
    const key = `${item.type}-${item.material}-${item.color}`;
    counters[key] = (counters[key] || 0) + 1;
    item.unit = String(counters[key]).padStart(3, '0');
  });
}
function initBulkEditor() {
  document.getElementById('bulkType').innerHTML = noChangeOptions(tables.types);
  document.getElementById('bulkMaterial').innerHTML = noChangeOptions(tables.materials);
  document.getElementById('bulkColor').innerHTML = noChangeOptions(tables.colors);
}
function initCodeManager() {
  document.getElementById('typesDelete').innerHTML = deleteOptions(tables.types);
  document.getElementById('materialsDelete').innerHTML = deleteOptions(tables.materials);
  document.getElementById('colorsDelete').innerHTML = deleteOptions(tables.colors);
}
function initFilterEditor() {
  document.getElementById('filterTypeOptions').innerHTML = multiFilterOptions(tables.types, 'filterType');
  document.getElementById('filterMaterialOptions').innerHTML = multiFilterOptions(tables.materials, 'filterMaterial');
  document.getElementById('filterColorOptions').innerHTML = multiFilterOptions(tables.colors, 'filterColor');
  ['filterSearch', 'filterStatus', 'filterQuality'].forEach(id => {
    document.getElementById(id).addEventListener('input', render);
  });
  document.querySelectorAll('input[name="filterType"], input[name="filterMaterial"], input[name="filterColor"]').forEach(input => {
    input.addEventListener('change', render);
  });
}
function refreshCodeEditors() {
  initCodeManager();
  initBulkEditor();
  initFilterEditor();
  renderLegend();
  render();
}
function renderLegend() {
  const typeLegend = document.getElementById('typeLegend');
  const materialLegend = document.getElementById('materialLegend');
  const colorLegend = document.getElementById('colorLegend');
  if (typeLegend) typeLegend.innerHTML = legendText(tables.types);
  if (materialLegend) materialLegend.innerHTML = legendText(tables.materials);
  if (colorLegend) colorLegend.innerHTML = legendText(tables.colors);
}
function legendText(table) {
  return Object.entries(table).map(([key, value]) => `<b>${escapeHtml(key)}</b> ${escapeHtml(value)}`).join(', ');
}
function normalizeCode(kind, value) {
  return String(value || '').trim().replace(/[\u0000-\u001F\u007F]/g, '');
}
function saveTables() {
  localStorage.setItem(TABLES_KEY, JSON.stringify(tables));
}
window.addCodeOption = function(kind) {
  const codeInput = document.getElementById(`${kind}Code`);
  const nameInput = document.getElementById(`${kind}Name`);
  const codeValue = normalizeCode(kind, codeInput?.value);
  const nameValue = String(nameInput?.value || '').trim();
  if (!codeValue || !nameValue) {
    alert('Escribe un codigo y un nombre.');
    return;
  }
  if (tables[kind]?.[codeValue] && !confirm(`${codeValue} ya existe. Quieres cambiar su nombre?`)) return;
  tables[kind][codeValue] = nameValue;
  saveTables();
  if (codeInput) codeInput.value = '';
  if (nameInput) nameInput.value = '';
  refreshCodeEditors();
};
window.deleteCodeOption = function(kind) {
  const select = document.getElementById(`${kind}Delete`);
  const codeValue = select?.value || '';
  if (!codeValue || !tables[kind]?.[codeValue]) {
    alert('Elige primero una categoria para eliminar.');
    return;
  }
  const labels = { types: 'tipo', materials: 'material', colors: 'color' };
  const fields = { types: 'type', materials: 'material', colors: 'color' };
  const fallbacks = { types: 'PIE', materials: '999', colors: '999' };
  const field = fields[kind];
  const fallback = fallbacks[kind];
  const affected = items.filter(item => item[field] === codeValue).length;
  if (codeValue === fallback) {
    alert('No se puede eliminar la categoria pendiente, porque se usa como destino de seguridad.');
    return;
  }
  const fallbackExists = Boolean(tables[kind]?.[fallback]);
  const affectedText = affected && fallbackExists ? `\n\n${affected} pieza(s) usan esta categoria y pasaran a ${fallback} · ${tables[kind][fallback]}.` : affected ? `\n\n${affected} pieza(s) usan esta categoria y conservaran el codigo, pero ya no aparecera como opcion.` : '';
  if (!confirm(`Eliminar ${labels[kind]} "${codeValue} · ${tables[kind][codeValue]}"?${affectedText}`)) return;
  delete tables[kind][codeValue];
  if (affected && fallbackExists) {
    items.forEach(item => {
      if (item[field] === codeValue) item[field] = fallback;
    });
    selected.clear();
    renumberAll();
    save();
  }
  saveTables();
  refreshCodeEditors();
};
window.resetCodeTables = function() {
  if (!confirm('Restaurar tipos, materiales y colores iniciales? No cambia las piezas ya editadas.')) return;
  tables = hydrateTables(window.CODE_TABLES);
  saveTables();
  refreshCodeEditors();
};
function qualityIssues(item) {
  return qualityByOriginal[item.original]?.issues || qualityByCode[code(item)]?.issues || [];
}
function filteredEntries() {
  const query = document.getElementById('filterSearch')?.value.trim().toLowerCase() || '';
  const types = selectedFilterValues('filterType');
  const materials = selectedFilterValues('filterMaterial');
  const colors = selectedFilterValues('filterColor');
  const status = document.getElementById('filterStatus')?.value || '';
  const quality = document.getElementById('filterQuality')?.value || '';
  updateFilterSummary('filterTypeBox', types);
  updateFilterSummary('filterMaterialBox', materials);
  updateFilterSummary('filterColorBox', colors);
  return items.map((item, index) => ({ item, index })).filter(({ item }) => {
    if (types.size && !types.has(item.type)) return false;
    if (materials.size && !materials.has(item.material)) return false;
    if (colors.size && !colors.has(item.color)) return false;
    if (status && (item.status || 'disponible') !== status) return false;
    if (quality && !qualityIssues(item).includes(quality)) return false;
    if (!query) return true;
    return [item.original, newName(item), item.productName, item.notes, item.measures, item.type, item.material, item.color].join(' ').toLowerCase().includes(query);
  });
}
function selectRange(fromIndex, toIndex, checked = true) {
  const visible = filteredEntries().map(entry => entry.index);
  const fromPosition = visible.indexOf(fromIndex);
  const toPosition = visible.indexOf(toIndex);
  if (fromPosition < 0 || toPosition < 0) return false;
  const start = Math.min(fromPosition, toPosition);
  const end = Math.max(fromPosition, toPosition);
  visible.slice(start, end + 1).forEach(index => {
    checked ? selected.add(index) : selected.delete(index);
  });
  return true;
}
function setCardSelection(index, checked, event) {
  if (event?.shiftKey && lastSelectedIndex !== null && selectRange(lastSelectedIndex, index, checked)) {
    lastSelectedIndex = index;
    render();
    return;
  }
  checked ? selected.add(index) : selected.delete(index);
  lastSelectedIndex = index;
  render();
}
window.toggleCardSelection = function(index, checked, event) {
  setCardSelection(index, checked, event);
};
window.quickSelectCard = function(index, event) {
  event?.preventDefault();
  setCardSelection(index, !selected.has(index), event);
};
window.selectAllCards = function() {
  filteredEntries().forEach(({ index }) => selected.add(index));
  render();
};
window.invertVisibleSelection = function() {
  filteredEntries().forEach(({ index }) => {
    selected.has(index) ? selected.delete(index) : selected.add(index);
  });
  render();
};
window.clearCardSelection = function() {
  selected.clear();
  lastSelectedIndex = null;
  render();
};
window.toggleFastSelectView = function() {
  compactView = !compactView;
  document.body.classList.toggle('fast-select', compactView);
  localStorage.setItem(`${STORAGE_KEY}:vista-compacta`, JSON.stringify(compactView));
  updateSelectedCount();
};
function restoreSelectionByOriginal(selectedOriginals) {
  selected.clear();
  items.forEach((item, index) => {
    if (selectedOriginals.has(item.original)) selected.add(index);
  });
}
function moveCard(fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) return;
  const selectedOriginals = new Set([...selected].map(index => items[index]?.original).filter(Boolean));
  const [moved] = items.splice(fromIndex, 1);
  items.splice(toIndex, 0, moved);
  restoreSelectionByOriginal(selectedOriginals);
  lastSelectedIndex = null;
  save();
  render();
}
window.moveCardByOffset = function(index, offset) {
  moveCard(index, Math.max(0, Math.min(items.length - 1, index + offset)));
};
window.startCardDrag = function(index, event) {
  draggedIndex = index;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', String(index));
};
window.dragOverCard = function(index, event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.card.drag-over').forEach(card => card.classList.remove('drag-over'));
  document.querySelector(`.card[data-index="${index}"]`)?.classList.add('drag-over');
};
window.dropCard = function(index, event) {
  event.preventDefault();
  document.querySelectorAll('.card.drag-over').forEach(card => card.classList.remove('drag-over'));
  const fromIndex = draggedIndex ?? Number(event.dataTransfer.getData('text/plain'));
  draggedIndex = null;
  moveCard(fromIndex, index);
};
window.endCardDrag = function() {
  draggedIndex = null;
  document.querySelectorAll('.card.drag-over').forEach(card => card.classList.remove('drag-over'));
};
window.applyBulkChanges = function() {
  if (!selected.size) {
    alert('Selecciona primero una o varias tarjetas.');
    return;
  }
  const type = document.getElementById('bulkType').value;
  const material = document.getElementById('bulkMaterial').value;
  const color = document.getElementById('bulkColor').value;
  const price = normalizePrice(document.getElementById('bulkPrice').value);
  selected.forEach(index => {
    if (type) items[index].type = type;
    if (material) items[index].material = material;
    if (color) items[index].color = color;
    if (price) items[index].price = price;
  });
  renumberAll();
  save();
  render();
};
window.renumberAndRender = function() {
  renumberAll();
  save();
  render();
};
window.deleteCard = function(index) {
  const item = items[index];
  if (!item) return;
  if (!confirm(`Eliminar ${item.original} de esta lista? No se borrara la foto original.`)) return;
  items.splice(index, 1);
  selected.clear();
  renumberAll();
  save();
  render();
};
window.deleteSelectedCards = function() {
  if (!selected.size) {
    alert('Selecciona primero una o varias tarjetas.');
    return;
  }
  if (!confirm(`Eliminar ${selected.size} pieza(s) de esta lista? No se borraran las fotos originales.`)) return;
  items = items.filter((_, index) => !selected.has(index));
  selected.clear();
  renumberAll();
  save();
  render();
};
window.restoreInitialItems = function() {
  if (!confirm('Restaurar la lista inicial? Se perderan los cambios guardados en este navegador.')) return;
  items = hydrateItems(window.INITIAL_ITEMS);
  previewImages.forEach(url => URL.revokeObjectURL(url));
  previewImages.clear();
  selected.clear();
  save();
  render();
};
window.clearFilters = function() {
  ['filterSearch', 'filterStatus', 'filterQuality'].forEach(id => {
    const element = document.getElementById(id);
    if (element) element.value = '';
  });
  document.querySelectorAll('input[name="filterType"], input[name="filterMaterial"], input[name="filterColor"]').forEach(input => {
    input.checked = false;
  });
  render();
};
function render() {
  const entries = filteredEntries();
  if (!entries.length) {
    grid.innerHTML = '<section class="empty-state"><strong>Catalogo en blanco</strong><span>No hay piezas cargadas todavia. Puedes empezar creando tipos, materiales y colores, y despues importamos las nuevas fotos.</span></section>';
    updateSelectedCount();
    const visibleCount = document.getElementById('visibleCount');
    if (visibleCount) visibleCount.textContent = '0 visibles';
    return;
  }
  grid.innerHTML = entries.map(({ item, index }) => `<article class="card ${escapeAttr(typeClass(item.type))} ${selected.has(index) ? 'selected' : ''}" data-index="${index}" ondragover="dragOverCard(${index}, event)" ondrop="dropCard(${index}, event)">
    <label class="select-card"><input type="checkbox" data-select onchange="toggleCardSelection(${index}, this.checked, event)" ${selected.has(index) ? 'checked' : ''}> <span>Elegir</span></label>
    <button class="drag-card" type="button" draggable="true" ondragstart="startCardDrag(${index}, event)" ondragend="endCardDrag()" aria-label="Arrastrar ${escapeAttr(item.original)}">Mover</button>
    <button class="image-picker" type="button" onclick="quickSelectCard(${index}, event)" aria-label="Seleccionar ${escapeAttr(item.original)}">
      <img src="${imageSrc(item, index)}" alt="${escapeHtml(item.original)}" style="${imageStyle(item)}">
    </button>
    <div class="body">
      <div class="code">${escapeHtml(code(item))}</div>
      <div class="descriptor">${escapeHtml(tableLabel(tables.types, item.type))} · ${escapeHtml(tableLabel(tables.materials, item.material))} · ${escapeHtml(item.color)} ${escapeHtml(tableLabel(tables.colors, item.color))}</div>
      ${qualityIssues(item).length ? `<div class="quality-warning">${qualityIssues(item).map(issue => issue === 'posible_desenfoque' ? 'Posible desenfoque' : 'Relleno central').join(' · ')}</div>` : ''}
      <div class="fields">
        <div class="field"><label>Tipo</label><select data-field="type">${options(tables.types, item.type)}</select></div>
        <div class="field"><label>Material</label><select data-field="material">${options(tables.materials, item.material)}</select></div>
        <div class="field"><label>Color</label><select data-field="color">${options(tables.colors, item.color)}</select></div>
        <div class="field"><label>Unidad</label><input data-field="unit" value="${escapeAttr(item.unit)}" maxlength="3"></div>
        <div class="field"><label>Precio €</label><input data-field="price" inputmode="decimal" placeholder="0,00" value="${escapeAttr(item.price || '')}"></div>
        <div class="field"><label>Stock</label><input data-field="stock" inputmode="numeric" placeholder="Cantidad" value="${escapeAttr(item.stock || '')}"></div>
        <div class="field"><label>Horizontal</label><input data-field="imageX" type="range" min="0" max="100" step="1" value="${escapeAttr(item.imageX)}"></div>
        <div class="field"><label>Vertical</label><input data-field="imageY" type="range" min="0" max="100" step="1" value="${escapeAttr(item.imageY)}"></div>
        <div class="field full"><label>Tamaño foto</label><input data-field="imageZoom" type="range" min="0.7" max="2.2" step="0.05" value="${escapeAttr(item.imageZoom)}"></div>
        <div class="field full"><label>Foto nueva</label><input type="file" accept="image/*" data-replace-image onchange="replaceCardImage(${index}, this)">${item.replacementFileName ? `<span class="replacement-note">Nueva foto pendiente de subir: ${escapeHtml(item.replacementFileName)}</span>` : ''}</div>
        <div class="field full"><label>Estado</label><select data-field="status">
          <option value="disponible" ${item.status === 'disponible' ? 'selected' : ''}>Disponible</option>
          <option value="reservado" ${item.status === 'reservado' ? 'selected' : ''}>Reservado</option>
          <option value="vendido" ${item.status === 'vendido' ? 'selected' : ''}>Vendido</option>
          <option value="oculto" ${item.status === 'oculto' ? 'selected' : ''}>Oculto</option>
        </select></div>
        <div class="field full"><label>Notas</label><textarea data-field="notes">${escapeHtml(item.notes || '')}</textarea></div>
      </div>
      <div class="order-actions">
        <button type="button" onclick="moveCardByOffset(${index}, -1)" ${index === 0 ? 'disabled' : ''}>Subir</button>
        <button type="button" onclick="moveCardByOffset(${index}, 1)" ${index === items.length - 1 ? 'disabled' : ''}>Bajar</button>
      </div>
      <button class="delete-card" type="button" onclick="deleteCard(${index})">Eliminar de la lista</button>
    </div>
  </article>`).join('');
  document.querySelectorAll('.card').forEach(card => {
    const index = Number(card.dataset.index);
    card.querySelectorAll('[data-field]').forEach(input => {
      input.addEventListener('input', () => {
        const field = input.dataset.field;
        items[index][field] = field === 'unit' ? input.value.replace(/\D/g, '').padStart(3, '0').slice(-3) : field === 'stock' ? input.value.replace(/\D/g, '') : field === 'imageX' || field === 'imageY' ? imageNumber(input.value, 50, 0, 100) : field === 'imageZoom' ? imageNumber(input.value, 1, .7, 2.2) : input.value;
        if (field === 'imageX' || field === 'imageY' || field === 'imageZoom') {
          card.querySelector('img').setAttribute('style', imageStyle(items[index]));
        }
        card.querySelector('.code').textContent = code(items[index]);
        if (field === 'type') {
          card.className = `card ${typeClass(items[index].type)} ${selected.has(index) ? 'selected' : ''}`;
        }
      });
      input.addEventListener('change', () => {
        const field = input.dataset.field;
        items[index][field] = field === 'price' ? normalizePrice(input.value) : field === 'stock' ? normalizeStock(input.value) : field === 'imageX' || field === 'imageY' ? imageNumber(input.value, 50, 0, 100) : field === 'imageZoom' ? imageNumber(input.value, 1, .7, 2.2) : input.value;
        if (field === 'price') input.value = items[index][field];
        if (field === 'stock') input.value = items[index][field];
        if (field === 'imageX' || field === 'imageY' || field === 'imageZoom') {
          card.querySelector('img').setAttribute('style', imageStyle(items[index]));
        }
        card.querySelector('.code').textContent = code(items[index]);
        if (field === 'type') {
          card.className = `card ${typeClass(items[index].type)} ${selected.has(index) ? 'selected' : ''}`;
        }
      });
      input.addEventListener('blur', () => {
        if (input.dataset.field !== 'price') return;
        items[index].price = normalizePrice(input.value);
        input.value = items[index].price;
      });
    });
  });
  updateSelectedCount();
  const visibleCount = document.getElementById('visibleCount');
  if (visibleCount) visibleCount.textContent = `${entries.length} visibles`;
}
function save() {
  const storableItems = items.map(item => ({
    ...item,
    image: persistedImageFor(item),
  }));
  const previous = localStorage.getItem(STORAGE_KEY);
  if (previous) {
    localStorage.setItem(BACKUP_KEY, JSON.stringify({
      createdAt: new Date().toISOString(),
      tables,
      items: listFromBackup(parseStoredJson(STORAGE_KEY)) || [],
    }));
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(storableItems));
  saveTables();
}
window.replaceCardImage = function(index, input) {
  const file = input.files?.[0];
  if (!file || !file.type.startsWith('image/')) return;
  const previousPreview = previewImages.get(index);
  if (previousPreview) URL.revokeObjectURL(previousPreview);
  previewImages.set(index, URL.createObjectURL(file));
  items[index].replacementFileName = file.name;
  items[index].replacementPending = true;
  save();
  render();
};
function download(filename, text, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}
function publicCatalogJson() {
  return JSON.stringify(publicCatalogRows(), null, 2);
}
function updatePublicPreview(downloadFile = false) {
  save();
  if (!PUBLIC_STORAGE_KEY) {
    alert('Esta pagina no tiene configurada una clave publica.');
    return false;
  }
  const payload = {
    createdAt: new Date().toISOString(),
    items: publicCatalogRows(),
  };
  localStorage.setItem(PUBLIC_STORAGE_KEY, JSON.stringify(payload));
  if (downloadFile) {
    download(PUBLIC_FILE, publicCatalogJson(), 'application/json');
  }
  alert(downloadFile
    ? 'Vista publica actualizada en este navegador y archivo descargado.'
    : 'Vista publica actualizada en este navegador. Abre la pagina publica para revisar los cambios.');
  return true;
}
function safeScriptJson(value) {
  return JSON.stringify(value, null, 2).replace(/</g, '\\u003c');
}
function toCsv() {
  const header = ['original','nuevo_nombre','nombre_comercial','tipo','tipo_nombre','material','material_nombre','color_codigo','color_nombre','unidad','precio_eur','precio_mostrado','stock','medidas','estado','imagen_x','imagen_y','imagen_zoom','foto_reemplazada','notas'];
  const rows = items.map(i => [i.original, newName(i), i.productName || '', i.type, tableLabel(tables.types, i.type), i.material, tableLabel(tables.materials, i.material), i.color, tableLabel(tables.colors, i.color), i.unit, normalizePrice(i.price), formatPrice(i.price), normalizeStock(i.stock), i.measures || '', i.status || 'disponible', i.imageX, i.imageY, i.imageZoom, i.replacementFileName || '', i.notes || '']);
  return [header, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
}
function backupPayload() {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    page: document.title,
    storageKey: STORAGE_KEY,
    tables,
    items: items.map(i => ({ ...i, image: persistedImageFor(i), newName: newName(i), code: code(i) })),
  };
}
function catalogSlug() {
  return STORAGE_KEY.toLowerCase().includes('conchas') ? 'conchas' : 'bisuteria';
}
function publicCatalogRows() {
  return items.map(item => ({
    codigo: code(item),
    referencia_csv: item.referenceCsv || item.codigoProducto || item.idf || item.original,
    idf: item.idf || item.original,
    archivo: String(persistedImageFor(item) || '').replace(/^\//, ''),
    nombre_comercial: item.productName || '',
    tipo: item.type,
    tipo_nombre: tableLabel(tables.types, item.type),
    material: item.material,
    material_nombre: tableLabel(tables.materials, item.material),
    color: item.color,
    color_nombre: tableLabel(tables.colors, item.color),
    piedra: item.stone || '',
    piedra_nombre: item.stoneName || '',
    precio_eur: normalizePrice(item.price),
    stock: normalizeStock(item.stock),
    medidas: item.measures || '',
    estado: item.status || 'disponible',
    descripcion: item.description || defaultDescription(item),
    fotos: item.imageCount || item.fotos || 1,
    codigo_producto: item.codigoProducto || item.referenceCsv || code(item),
    foto_numero: item.fotoNumero || 1,
    fotos_producto: item.fotosProducto || item.imageCount || 1,
    image_x: imageNumber(item.imageX ?? item.image_x, 50, 0, 100),
    image_y: imageNumber(item.imageY ?? item.image_y, 50, 0, 100),
    image_zoom: imageNumber(item.imageZoom ?? item.image_zoom, 1, .7, 2.2),
  }));
}
function editableHtml() {
  const payload = backupPayload();
  const fields = [
    ['productName', 'Nombre'],
    ['type', 'Tipo'],
    ['material', 'Material'],
    ['color', 'Color'],
    ['unit', 'Unidad'],
    ['price', 'Precio'],
    ['stock', 'Stock'],
    ['status', 'Estado'],
    ['imageX', 'Horizontal'],
    ['imageY', 'Vertical'],
    ['imageZoom', 'Tamaño'],
    ['notes', 'Notas'],
  ];
  const cards = payload.items.map((item, index) => `<article class="card" data-index="${index}">
    <img src="${escapeAttr(item.image || '')}" alt="${escapeAttr(item.original || '')}">
    <strong>${escapeHtml(item.code || code(item))}</strong>
    <small>${escapeHtml(item.original || '')}</small>
    <div class="fields">
      ${fields.map(([field, label]) => `<label>${label}<input data-field="${field}" value="${escapeAttr(item[field] ?? '')}"></label>`).join('')}
    </div>
  </article>`).join('');
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Respaldo editable jldv1508</title>
  <style>
    body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f3eee7;color:#24211f}
    header{position:sticky;top:0;z-index:2;background:#fffdf9;border-bottom:1px solid #ded5cc;padding:14px 18px;display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}
    h1{margin:0;font:28px Georgia,serif}button{border:1px solid #ded5cc;border-radius:8px;background:white;padding:10px 12px;font:inherit;cursor:pointer}
    main{padding:18px;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}.card{background:#fffdf9;border:1px solid #ded5cc;border-radius:8px;padding:10px;display:grid;gap:8px}
    img{width:100%;aspect-ratio:1/1;object-fit:contain;background:white;border-radius:6px}.fields{display:grid;grid-template-columns:1fr 1fr;gap:7px}label{display:grid;gap:3px;font-size:12px;font-weight:800;color:#706860}
    input{width:100%;box-sizing:border-box;border:1px solid #ded5cc;border-radius:7px;padding:7px;background:white}.fields label:last-child{grid-column:1/-1}
  </style>
</head>
<body>
  <header><h1>Respaldo editable jldv1508</h1><div><button id="downloadHtml">Descargar HTML actualizado</button> <button id="downloadJson">Descargar JSON</button></div></header>
  <main>${cards}</main>
  <script id="jldv1508-backup" type="application/json">${safeScriptJson(payload)}</script>
  <script>
    const backup = JSON.parse(document.getElementById('jldv1508-backup').textContent);
    function syncScript(){ document.getElementById('jldv1508-backup').textContent = JSON.stringify(backup, null, 2).replace(/</g, '\\\\u003c'); }
    document.querySelectorAll('[data-field]').forEach(input => input.addEventListener('input', () => {
      const card = input.closest('[data-index]');
      backup.items[Number(card.dataset.index)][input.dataset.field] = input.value;
      backup.createdAt = new Date().toISOString();
      syncScript();
    }));
    function download(name, text, type){
      const blob = new Blob([text], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
    }
    document.getElementById('downloadJson').onclick = () => { syncScript(); download('respaldo-jldv1508-editado.json', JSON.stringify(backup, null, 2), 'application/json'); };
    document.getElementById('downloadHtml').onclick = () => { syncScript(); download('respaldo-jldv1508-editado.html', '<!doctype html>\\n' + document.documentElement.outerHTML, 'text/html'); };
  </script>
</body>
</html>`;
}
function parseBackupFile(text) {
  try {
    return JSON.parse(text);
  } catch {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const embedded = doc.querySelector('#jldv1508-backup')?.textContent;
    if (!embedded) throw new Error('No encuentro datos de respaldo dentro del archivo.');
    return JSON.parse(embedded);
  }
}
document.getElementById('saveBtn').addEventListener('click', () => { save(); alert('Guardado en este navegador.'); });
document.getElementById('csvBtn').addEventListener('click', () => { save(); download('renombrado-jldv1508.csv', toCsv(), 'text/csv'); });
document.getElementById('publishPreviewBtn')?.addEventListener('click', () => {
  updatePublicPreview(true);
});
document.getElementById('publicJsonBtn')?.addEventListener('click', () => {
  save();
  download(PUBLIC_FILE, publicCatalogJson(), 'application/json');
});
document.getElementById('jsonBtn').addEventListener('click', () => {
  save();
  download(`respaldo-${catalogSlug()}-jldv1508.json`, JSON.stringify(backupPayload(), null, 2), 'application/json');
});
document.getElementById('htmlBtn')?.addEventListener('click', () => {
  save();
  download(`respaldo-editable-${catalogSlug()}-jldv1508.html`, editableHtml(), 'text/html');
});
document.getElementById('restoreJsonInput')?.addEventListener('change', event => {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const backup = parseBackupFile(String(reader.result || ''));
      const restoredItems = listFromBackup(backup);
      if (!restoredItems?.length) throw new Error('El archivo no contiene tarjetas.');
      if (!confirm(`Restaurar ${restoredItems.length} tarjeta(s) desde este respaldo?`)) return;
      restoreBackupObject(backup);
      alert('Respaldo restaurado.');
    } catch (error) {
      alert(`No se pudo restaurar el respaldo: ${error.message}`);
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsText(file);
});
document.getElementById('restoreLastBackupBtn')?.addEventListener('click', () => {
  const backup = parseStoredJson(BACKUP_KEY);
  const restoredItems = listFromBackup(backup);
  if (!restoredItems?.length) {
    alert('Todavia no hay un respaldo anterior en este navegador.');
    return;
  }
  if (!confirm(`Restaurar el ultimo respaldo automatico con ${restoredItems.length} tarjeta(s)?`)) return;
  restoreBackupObject(backup);
});
document.getElementById('recoverDataBtn')?.addEventListener('click', () => {
  const candidates = storedCandidates();
  if (!candidates.length) {
    alert('No encuentro copias guardadas de jldv1508 en este navegador. Si trabajaste en otro dominio o navegador, abre ese mismo sitio o importa un respaldo descargado.');
    return;
  }
  const summary = candidates.slice(0, 8).map((candidate, index) => {
    const edited = candidate.edited ? 'con cambios' : 'sin cambios claros';
    const date = candidate.createdAt ? ` · ${candidate.createdAt}` : '';
    return `${index + 1}. ${candidate.key} · ${candidate.count} tarjetas · ${candidate.matching} coinciden · ${edited}${date}`;
  }).join('\n');
  const answer = prompt(`Copias encontradas:\n\n${summary}\n\nEscribe el numero que quieres restaurar.`, '1');
  if (answer === null) return;
  const index = Number(answer) - 1;
  const chosen = candidates[index];
  if (!chosen) {
    alert('Numero no valido.');
    return;
  }
  if (!confirm(`Restaurar "${chosen.key}" con ${chosen.count} tarjeta(s)?`)) return;
  restoreBackupObject(chosen.value);
  alert('Datos recuperados.');
});
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
}
function escapeAttr(value) { return escapeHtml(value); }
refreshCodeEditors();
fetch('revision-calidad.json').then(response => response.ok ? response.json() : []).then(rows => {
  qualityByOriginal = Object.fromEntries(rows.map(row => [row.original, row]));
  qualityByCode = Object.fromEntries(rows.map(row => [row.codigo, row]));
  render();
}).catch(() => {});
