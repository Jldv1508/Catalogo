const STORAGE_KEY = 'jldv1508RenameItemsV6';
const TABLES_KEY = 'jldv1508CodeTablesV1';
let items = hydrateItems(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || window.INITIAL_ITEMS);
let tables = hydrateTables(JSON.parse(localStorage.getItem(TABLES_KEY) || 'null') || window.CODE_TABLES);
const grid = document.getElementById('grid');
const selected = new Set();
const previewImages = new Map();
let qualityByOriginal = {};
let qualityByCode = {};

function ext(name) {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '.jpg';
}
function code(item) {
  return `${item.type}-${item.material}-${item.color}-${item.unit}`;
}
function newName(item) {
  const outputExtension = item.transparent || String(item.image || '').toLowerCase().endsWith('.png') ? '.png' : ext(item.original);
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
function hydrateTables(source) {
  const base = source || { types: {}, materials: {}, colors: {} };
  return {
    types: { ...(base.types || {}) },
    materials: { ...(base.materials || {}) },
    colors: { ...(base.colors || {}) },
  };
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
    image: persistedImageFor(item),
    productName: item.productName || item.nombre || '',
    price: normalizePrice(item.price),
    stock: normalizeStock(item.stock),
    measures: item.measures || item.medidas || '',
    status: item.status || item.estado || 'disponible',
    description: '',
  }));
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
    if (items[index]) items[index].description = defaultDescription(items[index]);
  });
}
function capitalize(value) {
  const text = String(value || '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
function options(table, selected) {
  return Object.entries(table).map(([k, v]) => `<option value="${k}" ${k === selected ? 'selected' : ''}>${k} · ${escapeHtml(v)}</option>`).join('');
}
function noChangeOptions(table) {
  return '<option value="">Sin cambio</option>' + Object.entries(table).map(([k, v]) => `<option value="${k}">${k} · ${escapeHtml(v)}</option>`).join('');
}
function updateSelectedCount() {
  document.getElementById('selectedCount').textContent = `${selected.size} seleccionada${selected.size === 1 ? '' : 's'}`;
}
function renumberAll() {
  const counters = {};
  items.forEach(item => {
    const key = `${item.type}-${item.material}-${item.color}`;
    counters[key] = (counters[key] || 0) + 1;
    item.unit = String(counters[key]).padStart(2, '0');
  });
}
function initBulkEditor() {
  document.getElementById('bulkType').innerHTML = noChangeOptions(tables.types);
  document.getElementById('bulkMaterial').innerHTML = noChangeOptions(tables.materials);
  document.getElementById('bulkColor').innerHTML = noChangeOptions(tables.colors);
}
function initFilterEditor() {
  document.getElementById('filterType').innerHTML = '<option value="">Todos</option>' + options(tables.types, '');
  document.getElementById('filterMaterial').innerHTML = '<option value="">Todos</option>' + options(tables.materials, '');
  document.getElementById('filterColor').innerHTML = '<option value="">Todos</option>' + options(tables.colors, '');
  ['filterSearch', 'filterType', 'filterMaterial', 'filterColor', 'filterStatus', 'filterQuality'].forEach(id => {
    document.getElementById(id).addEventListener('input', render);
  });
}
function refreshCodeEditors() {
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
  const raw = String(value || '').trim().toUpperCase();
  if (kind === 'types') return raw.replace(/[^A-Z0-9]/g, '').slice(0, 4);
  return raw.replace(/\D/g, '').padStart(3, '0').slice(-3);
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
  const type = document.getElementById('filterType')?.value || '';
  const material = document.getElementById('filterMaterial')?.value || '';
  const color = document.getElementById('filterColor')?.value || '';
  const status = document.getElementById('filterStatus')?.value || '';
  const quality = document.getElementById('filterQuality')?.value || '';
  return items.map((item, index) => ({ item, index })).filter(({ item }) => {
    if (type && item.type !== type) return false;
    if (material && item.material !== material) return false;
    if (color && item.color !== color) return false;
    if (status && (item.status || 'disponible') !== status) return false;
    if (quality && !qualityIssues(item).includes(quality)) return false;
    if (!query) return true;
    return [item.original, newName(item), item.productName, item.notes, item.measures, item.type, item.material, item.color].join(' ').toLowerCase().includes(query);
  });
}
window.toggleCardSelection = function(index, checked) {
  checked ? selected.add(index) : selected.delete(index);
  render();
};
window.selectAllCards = function() {
  items.forEach((_, index) => selected.add(index));
  render();
};
window.clearCardSelection = function() {
  selected.clear();
  render();
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
  ['filterSearch', 'filterType', 'filterMaterial', 'filterColor', 'filterStatus', 'filterQuality'].forEach(id => {
    const element = document.getElementById(id);
    if (element) element.value = '';
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
  grid.innerHTML = entries.map(({ item, index }) => `<article class="card type-${item.type} ${selected.has(index) ? 'selected' : ''}" data-index="${index}">
    <label class="select-card"><input type="checkbox" data-select onchange="toggleCardSelection(${index}, this.checked)" ${selected.has(index) ? 'checked' : ''}> Elegir</label>
    <img src="${imageSrc(item, index)}" alt="${escapeHtml(item.original)}">
    <div class="body">
      <div class="original">${escapeHtml(item.original)}</div>
      <div class="code">${escapeHtml(code(item))}</div>
      <div class="descriptor">${escapeHtml(tableLabel(tables.types, item.type))} · ${escapeHtml(tableLabel(tables.materials, item.material))} · ${escapeHtml(item.color)} ${escapeHtml(tableLabel(tables.colors, item.color))}</div>
      ${item.referenceCsv || item.idf ? `<div class="csv-ref">${escapeHtml(item.referenceCsv || '')}${item.idf ? ` · ${escapeHtml(item.idf)}` : ''}</div>` : ''}
      ${item.description ? `<div class="description">${escapeHtml(item.description)}</div>` : ''}
      ${qualityIssues(item).length ? `<div class="quality-warning">${qualityIssues(item).map(issue => issue === 'posible_desenfoque' ? 'Posible desenfoque' : 'Relleno central').join(' · ')}</div>` : ''}
      <div class="price-display">${escapeHtml(formatPrice(item.price))}</div>
      <div class="fields">
        <div class="field full"><label>Nombre comercial</label><input data-field="productName" value="${escapeAttr(item.productName || '')}" placeholder="Nombre para tienda"></div>
        <div class="field"><label>Tipo</label><select data-field="type">${options(tables.types, item.type)}</select></div>
        <div class="field"><label>Material</label><select data-field="material">${options(tables.materials, item.material)}</select></div>
        <div class="field"><label>Color</label><select data-field="color">${options(tables.colors, item.color)}</select></div>
        <div class="field"><label>Unidad</label><input data-field="unit" value="${escapeAttr(item.unit)}" maxlength="2"></div>
        <div class="field"><label>Precio €</label><input data-field="price" inputmode="decimal" placeholder="0,00" value="${escapeAttr(item.price || '')}"></div>
        <div class="field"><label>Stock</label><input data-field="stock" inputmode="numeric" placeholder="Cantidad" value="${escapeAttr(item.stock || '')}"></div>
        <div class="field"><label>Medidas</label><input data-field="measures" placeholder="Ej. 18 cm / talla 12" value="${escapeAttr(item.measures || '')}"></div>
        <div class="field full"><label>Foto nueva</label><input type="file" accept="image/*" data-replace-image onchange="replaceCardImage(${index}, this)">${item.replacementFileName ? `<span class="replacement-note">Nueva foto pendiente de subir: ${escapeHtml(item.replacementFileName)}</span>` : ''}</div>
        <div class="field full"><label>Estado</label><select data-field="status">
          <option value="disponible" ${item.status === 'disponible' ? 'selected' : ''}>Disponible</option>
          <option value="reservado" ${item.status === 'reservado' ? 'selected' : ''}>Reservado</option>
          <option value="vendido" ${item.status === 'vendido' ? 'selected' : ''}>Vendido</option>
          <option value="oculto" ${item.status === 'oculto' ? 'selected' : ''}>Oculto</option>
        </select></div>
        <div class="field full"><label>Notas</label><textarea data-field="notes">${escapeHtml(item.notes || '')}</textarea></div>
      </div>
      <button class="delete-card" type="button" onclick="deleteCard(${index})">Eliminar de la lista</button>
    </div>
  </article>`).join('');
  document.querySelectorAll('.card').forEach(card => {
    const index = Number(card.dataset.index);
    card.querySelectorAll('[data-field]').forEach(input => {
      input.addEventListener('input', () => {
        const field = input.dataset.field;
        items[index][field] = field === 'unit' ? input.value.replace(/\D/g, '').padStart(2, '0').slice(-2) : field === 'stock' ? input.value.replace(/\D/g, '') : input.value;
        if (field === 'price') {
          card.querySelector('.price-display').textContent = formatPrice(items[index].price);
        }
        card.querySelector('.code').textContent = code(items[index]);
        if (field === 'type') {
          card.className = `card type-${items[index].type} ${selected.has(index) ? 'selected' : ''}`;
        }
      });
      input.addEventListener('change', () => {
        const field = input.dataset.field;
        items[index][field] = field === 'price' ? normalizePrice(input.value) : field === 'stock' ? normalizeStock(input.value) : input.value;
        if (field === 'price') input.value = items[index][field];
        if (field === 'stock') input.value = items[index][field];
        if (field === 'price') {
          card.querySelector('.price-display').textContent = formatPrice(items[index].price);
        }
        card.querySelector('.code').textContent = code(items[index]);
        if (field === 'type') {
          card.className = `card type-${items[index].type} ${selected.has(index) ? 'selected' : ''}`;
        }
      });
      input.addEventListener('blur', () => {
        if (input.dataset.field !== 'price') return;
        items[index].price = normalizePrice(input.value);
        input.value = items[index].price;
        card.querySelector('.price-display').textContent = formatPrice(items[index].price);
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
  a.click();
  URL.revokeObjectURL(url);
}
function toCsv() {
  const header = ['original','nuevo_nombre','nombre_comercial','tipo','tipo_nombre','material','material_nombre','color_codigo','color_nombre','unidad','precio_eur','precio_mostrado','stock','medidas','estado','foto_reemplazada','notas'];
  const rows = items.map(i => [i.original, newName(i), i.productName || '', i.type, tableLabel(tables.types, i.type), i.material, tableLabel(tables.materials, i.material), i.color, tableLabel(tables.colors, i.color), i.unit, normalizePrice(i.price), formatPrice(i.price), normalizeStock(i.stock), i.measures || '', i.status || 'disponible', i.replacementFileName || '', i.notes || '']);
  return [header, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
}
document.getElementById('saveBtn').addEventListener('click', () => { save(); alert('Guardado en este navegador.'); });
document.getElementById('csvBtn').addEventListener('click', () => { save(); download('renombrado-jldv1508.csv', toCsv(), 'text/csv'); });
document.getElementById('jsonBtn').addEventListener('click', () => {
  save();
  download('renombrado-jldv1508.json', JSON.stringify({
    tables,
    items: items.map(i => ({ ...i, newName: newName(i), code: code(i) })),
  }, null, 2), 'application/json');
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
