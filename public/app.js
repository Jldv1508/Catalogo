const TYPE = { PUL: 'Pulsera', ANI: 'Anillo', PEN: 'Pendiente', COL: 'Collar', CON: 'Conjunto', BRO: 'Broche', PIE: 'Pieza', CCH: 'Concha', ACC: 'Accesorio', PIN: 'Pin' };
const COLOR = { '000': 'Pendiente', '001': 'Multicolor', '002': 'Blanco', '003': 'Negro', '004': 'Rojo', '005': 'Plateado', '006': 'Verde', '007': 'Azul', '008': 'Marrón', '009': 'Multicolor', '010': 'Naranja', '011': 'Amarillo', '012': 'Morado', '013': 'Turquesa', '014': 'Rosa', '015': 'Gris', '016': 'Lila', '017': 'Fucsia', '999': 'Pendiente' };
const MATERIAL = { '000': 'Pendiente', '001': 'Resina', '002': 'Latón', '003': 'Piedra', '004': 'Cristal', '005': 'Acero inoxidable', '006': 'Metal', '007': 'Cuero', '008': 'Tela', '009': 'Material mixto', '010': 'Perla', '011': 'Acero', '012': 'Plata', '013': 'Dorado / baño oro', '999': 'Pendiente' };
const grid = document.querySelector('#grid');
const search = document.querySelector('#search');
const type = document.querySelector('#type');
const material = document.querySelector('#material');
const color = document.querySelector('#color');
let catalog = [];

function optionize(select, values) {
  Object.entries(values).forEach(([key, value]) => {
    select.insertAdjacentHTML('beforeend', `<option value="${key}">${value}</option>`);
  });
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
  </article>`).join('') : `<section class="empty-state"><strong>Catalogo en blanco</strong><span>Estamos preparando una nueva seleccion de piezas.</span></section>`;
}

optionize(type, TYPE);
optionize(material, MATERIAL);
optionize(color, COLOR);
[search, type, material, color].forEach(element => element.addEventListener('input', render));
fetch('catalogo-fotos.json?v=780-20260630').then(response => response.json()).then(data => {
  catalog = data;
  render();
});
