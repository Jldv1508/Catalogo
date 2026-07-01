const TYPE = { PUL: 'Pulsera', ANI: 'Anillo', PEN: 'Pendiente', COL: 'Collar', CON: 'Conjunto', BRO: 'Broche', PIE: 'Pieza', CCH: 'Concha', ACC: 'Accesorio', PIN: 'Pin' };
const COLOR = { '000': 'Pendiente', '001': 'Multicolor', '002': 'Blanco', '003': 'Negro', '004': 'Rojo', '005': 'Plateado', '006': 'Verde', '007': 'Azul', '008': 'Marrón', '009': 'Multicolor', '010': 'Naranja', '011': 'Amarillo', '012': 'Morado', '013': 'Turquesa', '014': 'Rosa', '015': 'Gris', '016': 'Lila', '017': 'Fucsia', '999': 'Pendiente' };
const MATERIAL = { '000': 'Pendiente', '001': 'Resina', '002': 'Latón', '003': 'Piedra', '004': 'Cristal', '005': 'Acero inoxidable', '006': 'Metal', '007': 'Cuero', '008': 'Tela', '009': 'Material mixto', '010': 'Perla', '011': 'Acero', '012': 'Plata', '013': 'Dorado / baño oro', '999': 'Pendiente' };
const STATUS = { disponible: 'Disponible', reservado: 'Reservado', vendido: 'Vendido', oculto: 'Oculto' };

const grid = document.querySelector('#grid');
const search = document.querySelector('#search');
const status = document.querySelector('#status');
const filterTree = document.querySelector('#filterTree');
const visibleCount = document.querySelector('#visibleCount');
const clearFilters = document.querySelector('#clearFilters');
const catalogUrl = document.body.dataset.catalogUrl || 'catalogo-fotos.json?v=780-20260630';
const publicStorageKey = document.body.dataset.publicStorageKey || '';
const emptyTitle = document.body.dataset.emptyTitle || 'Catálogo en blanco';
const emptyText = document.body.dataset.emptyText || 'Estamos preparando una nueva selección de piezas.';
let catalog = [];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
}

function labelFor(table, key, fallback) {
  return fallback || table[key] || key || 'Pendiente';
}

function nodeValue(...parts) {
  return parts.filter(Boolean).join('|');
}

function selectedTreeValues() {
  return [...document.querySelectorAll('input[name="treeFilter"]:checked')].map(input => input.value);
}

function matchesTree(item, selectedValues) {
  if (!selectedValues.length) return true;
  const itemType = nodeValue(item.tipo);
  const itemMaterial = nodeValue(item.tipo, item.material);
  const itemColor = nodeValue(item.tipo, item.material, item.color);
  return selectedValues.some(value => value === itemType || value === itemMaterial || value === itemColor);
}

function syncParentChecks() {
  document.querySelectorAll('[data-tree-node]').forEach(node => {
    const checkbox = node.querySelector(':scope > .tree-row input[type="checkbox"]');
    const childChecks = [...node.querySelectorAll(':scope .tree-children input[type="checkbox"]')];
    if (!checkbox || !childChecks.length) return;
    const checked = childChecks.filter(input => input.checked).length;
    checkbox.indeterminate = checked > 0 && checked < childChecks.length;
  });
}

function syncUrl() {
  const params = new URLSearchParams();
  if (search.value.trim()) params.set('q', search.value.trim());
  selectedTreeValues().forEach(value => params.append('f', value));
  if (status?.value) params.set('estado', status.value);
  history.replaceState(null, '', `${location.pathname}${params.toString() ? `?${params}` : ''}`);
}

function restoreUrlFilters() {
  const params = new URLSearchParams(location.search);
  search.value = params.get('q') || '';
  if (status) status.value = params.get('estado') || '';
  const filters = new Set(params.getAll('f'));
  document.querySelectorAll('input[name="treeFilter"]').forEach(input => {
    input.checked = filters.has(input.value);
  });
  syncParentChecks();
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

function buildFilterTree() {
  const tree = new Map();
  catalog.forEach(item => {
    const typeKey = item.tipo || 'PIE';
    const materialKey = item.material || '000';
    const colorKey = item.color || '000';
    if (!tree.has(typeKey)) {
      tree.set(typeKey, { count: 0, label: labelFor(TYPE, typeKey), materials: new Map() });
    }
    const typeNode = tree.get(typeKey);
    typeNode.count += 1;
    if (!typeNode.materials.has(materialKey)) {
      typeNode.materials.set(materialKey, { count: 0, label: labelFor(MATERIAL, materialKey, item.material_nombre), colors: new Map() });
    }
    const materialNode = typeNode.materials.get(materialKey);
    materialNode.count += 1;
    if (!materialNode.colors.has(colorKey)) {
      materialNode.colors.set(colorKey, { count: 0, label: labelFor(COLOR, colorKey, item.color_nombre) });
    }
    materialNode.colors.get(colorKey).count += 1;
  });

  filterTree.innerHTML = [...tree.entries()]
    .sort((a, b) => a[1].label.localeCompare(b[1].label, 'es'))
    .map(([typeKey, typeNode]) => {
      const materials = [...typeNode.materials.entries()]
        .sort((a, b) => a[1].label.localeCompare(b[1].label, 'es'))
        .map(([materialKey, materialNode]) => {
          const colors = [...materialNode.colors.entries()]
            .sort((a, b) => a[1].label.localeCompare(b[1].label, 'es'))
            .map(([colorKey, colorNode]) => `<label class="tree-row tree-color" data-tree-label="${escapeHtml(`${colorKey} ${colorNode.label}`.toLowerCase())}">
              <input type="checkbox" name="treeFilter" value="${escapeHtml(nodeValue(typeKey, materialKey, colorKey))}">
              <span>${escapeHtml(colorNode.label)}</span><em>${colorNode.count}</em>
            </label>`).join('');
          return `<details data-tree-node class="tree-node tree-material" data-tree-label="${escapeHtml(`${materialKey} ${materialNode.label}`.toLowerCase())}">
            <summary class="tree-row">
              <input type="checkbox" name="treeFilter" value="${escapeHtml(nodeValue(typeKey, materialKey))}">
              <span>${escapeHtml(materialNode.label)}</span><em>${materialNode.count}</em>
            </summary>
            <div class="tree-children">${colors}</div>
          </details>`;
        }).join('');
      return `<details data-tree-node class="tree-node tree-type" data-tree-label="${escapeHtml(`${typeKey} ${typeNode.label}`.toLowerCase())}">
        <summary class="tree-row">
          <input type="checkbox" name="treeFilter" value="${escapeHtml(nodeValue(typeKey))}">
          <span>${escapeHtml(typeNode.label)}</span><em>${typeNode.count}</em>
        </summary>
        <div class="tree-children">${materials}</div>
      </details>`;
    }).join('');
}

function filterTreeBranches(rows, query) {
  const visibleTypes = new Set();
  const visibleMaterials = new Set();
  const visibleColors = new Set();
  rows.forEach(item => {
    visibleTypes.add(nodeValue(item.tipo));
    visibleMaterials.add(nodeValue(item.tipo, item.material));
    visibleColors.add(nodeValue(item.tipo, item.material, item.color));
  });
  const text = query.trim().toLowerCase();
  const typeNodes = [...document.querySelectorAll('.tree-type')];
  typeNodes.forEach(typeNode => {
    const typeValue = typeNode.querySelector(':scope > summary input[name="treeFilter"]')?.value || '';
    const typeMatchesText = !text || (typeNode.dataset.treeLabel || '').includes(text);
    let showType = visibleTypes.has(typeValue) && typeMatchesText;
    typeNode.querySelectorAll('.tree-material').forEach(materialNode => {
      const materialValue = materialNode.querySelector(':scope > summary input[name="treeFilter"]')?.value || '';
      const materialMatchesText = typeMatchesText || (materialNode.dataset.treeLabel || '').includes(text);
      let showMaterial = visibleMaterials.has(materialValue) && materialMatchesText;
      materialNode.querySelectorAll('.tree-color').forEach(colorNode => {
        const colorValue = colorNode.querySelector('input[name="treeFilter"]')?.value || '';
        const showColor = visibleColors.has(colorValue) && (materialMatchesText || (colorNode.dataset.treeLabel || '').includes(text));
        colorNode.hidden = !showColor;
        showMaterial = showMaterial || showColor;
      });
      materialNode.hidden = !showMaterial;
      if (showMaterial) materialNode.open = true;
      showType = showType || showMaterial;
    });
    typeNode.hidden = !showType;
    if (showType) typeNode.open = true;
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

function priceText(value) {
  const number = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(number) && number > 0 ? `${number.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : '';
}

function cardTitle(item) {
  return item.nombre_comercial || item.codigo || item.referencia_csv || 'Pieza';
}

function cardMeta(item) {
  return [
    labelFor(TYPE, item.tipo),
    item.material_nombre || labelFor(MATERIAL, item.material),
    item.color_nombre || labelFor(COLOR, item.color),
  ].filter(Boolean).join(' · ');
}

function itemDescription(item) {
  return item.descripcion || item.medidas || '';
}

function render() {
  const query = search.value.trim().toLowerCase();
  const selectedValues = selectedTreeValues();
  const rows = catalog.filter(item =>
    matchesTree(item, selectedValues) &&
    (!status?.value || (item.estado || 'disponible') === status.value) &&
    (!query || searchText(item).includes(query))
  );
  filterTreeBranches(rows, query);
  syncParentChecks();
  syncUrl();
  if (visibleCount) visibleCount.textContent = `${rows.length} de ${catalog.length}`;
  grid.innerHTML = rows.length ? rows.map(item => `<article class="card type-${escapeHtml(item.tipo)}">
    <div class="image"><img src="${escapeHtml(item.archivo)}" alt="${escapeHtml(item.codigo)}" loading="lazy" style="${imageStyle(item)}"></div>
    <div class="card-info">
      <strong>${escapeHtml(cardTitle(item))}</strong>
      <details class="card-details">
        <summary>Ver datos</summary>
        <dl>
          <div><dt>Código</dt><dd>${escapeHtml(item.codigo || '')}</dd></div>
          <div><dt>Tipo</dt><dd>${escapeHtml(labelFor(TYPE, item.tipo))}</dd></div>
          <div><dt>Material</dt><dd>${escapeHtml(item.material_nombre || labelFor(MATERIAL, item.material))}</dd></div>
          <div><dt>Color</dt><dd>${escapeHtml(item.color_nombre || labelFor(COLOR, item.color))}</dd></div>
          <div><dt>Precio</dt><dd>${priceText(item.precio_eur) ? escapeHtml(priceText(item.precio_eur)) : 'Precio pendiente'}</dd></div>
          <div><dt>Estado</dt><dd>${escapeHtml(STATUS[item.estado] || item.estado || 'Disponible')}${item.stock ? ` · Stock ${escapeHtml(item.stock)}` : ''}</dd></div>
          ${item.medidas ? `<div><dt>Medidas</dt><dd>${escapeHtml(item.medidas)}</dd></div>` : ''}
          ${item.descripcion ? `<div><dt>Descripción</dt><dd>${escapeHtml(item.descripcion)}</dd></div>` : ''}
        </dl>
      </details>
    </div>
  </article>`).join('') : `<section class="empty-state"><strong>${escapeHtml(emptyTitle)}</strong><span>${escapeHtml(emptyText)}</span></section>`;
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

search.addEventListener('input', render);
status?.addEventListener('input', render);
filterTree?.addEventListener('change', event => {
  const input = event.target.closest('input[name="treeFilter"]');
  if (!input) return;
  const node = input.closest('[data-tree-node]');
  node?.querySelectorAll('.tree-children input[name="treeFilter"]').forEach(child => {
    child.checked = input.checked;
  });
  render();
});
clearFilters?.addEventListener('click', () => {
  search.value = '';
  if (status) status.value = '';
  document.querySelectorAll('input[name="treeFilter"]').forEach(input => {
    input.checked = false;
    input.indeterminate = false;
  });
  render();
});

fetch(catalogUrl).then(response => response.json()).then(data => {
  catalog = localPublicCatalog() || data;
  optionizeStatus();
  buildFilterTree();
  restoreUrlFilters();
  render();
});
