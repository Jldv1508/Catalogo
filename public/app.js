const TYPE = { PUL: 'Pulsera', ANI: 'Anillo', PEN: 'Pendiente', COL: 'Collar', CON: 'Conjunto', BRO: 'Broche', PIE: 'Pieza', CCH: 'Concha', ACC: 'Accesorio', PIN: 'Pin' };
const COLOR = { '000': 'Pendiente', '001': 'Multicolor', '002': 'Blanco', '003': 'Negro', '004': 'Rojo', '005': 'Plateado', '006': 'Verde', '007': 'Azul', '008': 'Marrón', '009': 'Multicolor', '010': 'Naranja', '011': 'Amarillo', '012': 'Morado', '013': 'Turquesa', '014': 'Rosa', '015': 'Gris', '016': 'Lila', '017': 'Fucsia', '999': 'Pendiente' };
const MATERIAL = { '000': 'Pendiente', '001': 'Resina', '002': 'Latón', '003': 'Piedra', '004': 'Cristal', '005': 'Acero inoxidable', '006': 'Metal', '007': 'Cuero', '008': 'Tela', '009': 'Material mixto', '010': 'Perla', '011': 'Acero', '012': 'Plata', '013': 'Dorado / baño oro', '999': 'Pendiente' };
const grid = document.querySelector('#grid');
const search = document.querySelector('#search');
const type = document.querySelector('#type');
const material = document.querySelector('#material');
const color = document.querySelector('#color');
const catalogUrl = document.body.dataset.catalogUrl || 'catalogo-fotos.json?v=780-20260630';
const emptyTitle = document.body.dataset.emptyTitle || 'Catálogo en blanco';
const emptyText = document.body.dataset.emptyText || 'Estamos preparando una nueva selección de piezas.';
let catalog = [];

function optionize(select, values) {
  const selected = select.value;
  const first = select.querySelector('option')?.outerHTML || '<option value="">Todos</option>';
  select.innerHTML = first;
  Object.entries(values).forEach(([key, value]) => {
    select.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(key)}">${escapeHtml(value)}</option>`);
  });
  select.value = values[selected] ? selected : '';
}

function filterOptions(base, field, nameField) {
  return catalog.reduce((options, item) => {
    const key = item[field];
    if (key && !options[key]) options[key] = item[nameField] || key;
    return options;
  }, { ...base });
}

function price(value) {
  const number = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(number) && number > 0 ? `${number.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : '';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
}

function render() {
  const query = search.value.trim().toLowerCase();
  const rows = catalog.filter(item =>
    (!type.value || item.tipo === type.value) &&
    (!material.value || item.material === material.value) &&
    (!color.value || item.color === color.value) &&
    (!query || JSON.stringify(item).toLowerCase().includes(query))
  );
  grid.innerHTML = rows.length ? rows.map(item => `<article class="card type-${item.tipo}">
    <div class="image"><img src="${item.archivo}" alt="${escapeHtml(item.codigo)}" loading="lazy"></div>
  </article>`).join('') : `<section class="empty-state"><strong>${escapeHtml(emptyTitle)}</strong><span>${escapeHtml(emptyText)}</span></section>`;
}

[search, type, material, color].forEach(element => element.addEventListener('input', render));
fetch(catalogUrl).then(response => response.json()).then(data => {
  catalog = data;
  optionize(type, filterOptions(TYPE, 'tipo', 'tipo_nombre'));
  optionize(material, filterOptions(MATERIAL, 'material', 'material_nombre'));
  optionize(color, filterOptions(COLOR, 'color', 'color_nombre'));
  render();
});
