const DEFAULT_USER = 'jldv1508';
const DEFAULT_PASSWORD = 'Jldv1508-Edicion-7Qk4!mP9';
const STORAGE_KEY = 'jldv1508EditUnlocked';

function getConfig() {
  const body = document.body;
  return {
    user: body.dataset.editUser || DEFAULT_USER,
    password: body.dataset.editPassword || DEFAULT_PASSWORD,
  };
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

function createPanel() {
  const existing = document.querySelector('#publicEditPanel');
  if (existing) return existing;

  const panel = document.createElement('section');
  panel.id = 'publicEditPanel';
  panel.className = 'public-edit-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="public-edit-head">
      <div>
        <p class="public-edit-kicker">Cabecera de edicion</p>
        <h2>Edicion publica</h2>
      </div>
      <span class="public-edit-state" data-edit-state>Bloqueada</span>
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
    <div class="public-edit-links" data-edit-links hidden>
      <a href="/bisuteria">Bisuteria</a>
      <a href="/conchas">Conchas</a>
      <a href="/blog">Blog</a>
      <a href="/catalogo.html">Portada</a>
    </div>
  `;

  const mount = getMount();
  if (mount) {
    mount.insertAdjacentElement('beforebegin', panel);
  } else {
    document.body.appendChild(panel);
  }

  const form = panel.querySelector('[data-edit-form]');
  const closeButton = panel.querySelector('[data-edit-close]');
  const state = panel.querySelector('[data-edit-state]');
  const links = panel.querySelector('[data-edit-links]');

  const sync = () => {
    const unlocked = isUnlocked();
    panel.hidden = !panel.classList.contains('is-open');
    state.textContent = unlocked ? 'Activa' : 'Bloqueada';
    links.hidden = !unlocked;
    if (unlocked) {
      const userInput = form.querySelector('[name="user"]');
      const passInput = form.querySelector('[name="password"]');
      if (userInput) userInput.value = '';
      if (passInput) passInput.value = '';
    }
  };

  form.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(form);
    const { user, password } = getConfig();
    const ok = String(data.get('user') || '') === user && String(data.get('password') || '') === password;
    if (!ok) {
      state.textContent = 'Credenciales incorrectas';
      panel.classList.add('is-open');
      panel.hidden = false;
      links.hidden = true;
      return;
    }
    setUnlocked(true);
    panel.classList.add('is-open');
    sync();
  });

  closeButton.addEventListener('click', () => {
    setUnlocked(false);
    panel.classList.remove('is-open');
    panel.hidden = true;
  });

  sync();
  return panel;
}

function togglePanel() {
  const panel = createPanel();
  const opened = panel.classList.toggle('is-open');
  panel.hidden = !opened && !isUnlocked();
  if (opened) {
    const input = panel.querySelector('[name="user"]');
    if (input) input.focus();
  }
}

function init() {
  document.querySelectorAll('.home-edit, .blog-edit, .catalog-edit').forEach(trigger => {
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('tabindex', '0');
    trigger.addEventListener('click', event => {
      event.preventDefault();
      togglePanel();
    });
    trigger.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        togglePanel();
      }
    });
  });

  if (isUnlocked()) {
    const panel = createPanel();
    panel.hidden = false;
    panel.classList.add('is-open');
    panel.querySelector('[data-edit-links]').hidden = false;
  }
}

init();
