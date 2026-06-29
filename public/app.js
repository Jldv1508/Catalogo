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

window.setProductImage = function(cardId, src, button) {
  const img = document.querySelector(`[data-card-image="${cardId}"]`);
  if (!img) return;
  img.src = src;
  button.parentElement.querySelectorAll('button').forEach(item => item.classList.remove('active'));
  button.classList.add('active');
};

function renderImages(item, cardId) {
  const images = item.imagenes?.length ? item.imagenes : [item.archivo].filter(Boolean);
  const first = images[0] || '';
  const thumbs = images.length > 1 ? `<div class="thumbs">${images.map((src, index) => `<button class="${index === 0 ? 'active' : ''}" type="button" onclick="setProductImage('${cardId}', '${src}', this)"><img src="${src}" alt="${escapeHtml(item.codigo)} foto ${index + 1}" loading="lazy"></button>`).join('')}</div>` : '';
  return `<div class="image"><img data-card-image="${cardId}" src="${first}" alt="${escapeHtml(item.codigo)}" loading="lazy"></div>${thumbs}`;
}

function render() {
  const query = search.value.trim().toLowerCase();
  const rows = catalog.filter(item =>
    (!type.value || item.tipo === type.value) &&
    (!material.value || item.material === material.value) &&
    (!color.value || item.color === color.value) &&
    (!query || JSON.stringify(item).toLowerCase().includes(query))
  );
  grid.innerHTML = rows.length ? rows.map((item, index) => {
    const cardId = `card-${index}`;
    return `<article class="card type-${item.tipo}">
      ${renderImages(item, cardId)}
    </article>`;
  }).join('') : `<section class="empty-state"><strong>Catalogo en blanco</strong><span>Estamos preparando una nueva seleccion de piezas.</span></section>`;
}

optionize(type, TYPE);
optionize(material, MATERIAL);
optionize(color, COLOR);
[search, type, material, color].forEach(element => element.addEventListener('input', render));
fetch('catalogo.json').then(response => response.json()).then(data => {
  catalog = data;
  render();
});
