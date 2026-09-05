const STORAGE_KEY = 'jldv1508EditUnlocked';
const PUBLIC_STORE_FALLBACK = `${STORAGE_KEY}:public-store`;
const SERVER_STATE_URL = '/api/catalogo-edicion';
const AUTO_BACKUP_INTERVAL_MS = 4 * 60 * 1000;
const AUTO_BACKUP_LIMIT = 96;
const MANUAL_BACKUP_LIMIT = 60;
const SNAPSHOT_RETENTION_AUTO_MS = 30 * 24 * 60 * 60 * 1000;
const SNAPSHOT_RETENTION_MANUAL_MS = 180 * 24 * 60 * 60 * 1000;
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

const THUMBNAIL_ZOOM_LEVELS = [2, 4, 8, 16, 32, 64];

let state = {
  unlocked: false,
  loading: false,
  items: [],
  tables: cloneTables(DEFAULT_TABLES),
  selected: new Set(),
  selectionAnchor: -1,
  compact: false,
  thumbnailZoom: 2,
  filters: { q: '', type: [], submodel: [], material: [], color: [], priceMin: '', priceMax: '' },
  draft: createDraftItem(),
  publicKey: '',
  catalogUrl: '',
  lastAutoBackupAt: '',
  snapshots: {
    auto: [],
    manual: [],
  },
  detailsOpen: new Set(),
};
let autoBackupTimer = null;
let lastAutoBackupSignature = '';
let lastSnapshotChecksum = '';
let openCardEditors = new Set();
let serverSaveTimer = null;
let serverSavePromise = null;
let lastServerSavedAt = '';
let lastServerSaveError = '';

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
    submodelIds: [],
    material: '000',
    materialIds: ['000'],
    color: '000',
    colorIds: ['000'],
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

function currentSnapshotIndexKey(kind = 'all') {
  const base = `${state.publicKey || currentPublicKey() || PUBLIC_STORE_FALLBACK}:snapshots`;
  return kind === 'all' ? base : `${base}:${kind}`;
}

function currentSnapshotPayloadKey(id) {
  return `${state.publicKey || currentPublicKey() || PUBLIC_STORE_FALLBACK}:snapshots:${id}`;
}

function snapshotChecksum32(text) {
  let h1 = 0x811c9dc5;
  let h2 = 0xdeadbeef;
  const s = String(text || '');
  for (let i = 0; i < s.length; i += 1) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193);
    h2 = Math.imul(h2 ^ ch, 0x85ebca77);
  }
  h1 = (h1 ^ (h1 >>> 16)) >>> 0;
  h2 = (h2 ^ (h2 >>> 13)) >>> 0;
  const out = (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0'));
  return out;
}

function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (!n || n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDateLocal(iso) {
  if (!iso) return 'sin fecha';
  try {
    const d = new Date(iso);
    if (Number.isNaN(+d)) return String(iso);
    return d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return String(iso);
  }
}

function snapshotRetentionLimitFor(kind) {
  return kind === 'auto' ? AUTO_BACKUP_LIMIT : MANUAL_BACKUP_LIMIT;
}

function snapshotRetentionMsFor(kind) {
  return kind === 'auto' ? SNAPSHOT_RETENTION_AUTO_MS : SNAPSHOT_RETENTION_MANUAL_MS;
}

function readSnapshotIndex() {
  try {
    const raw = JSON.parse(localStorage.getItem(currentSnapshotIndexKey()) || '{"auto":[],"manual":[]}');
    return {
      auto: Array.isArray(raw?.auto) ? raw.auto.filter(Boolean) : [],
      manual: Array.isArray(raw?.manual) ? raw.manual.filter(Boolean) : [],
    };
  } catch {
    return { auto: [], manual: [] };
  }
}

function writeSnapshotIndex(index) {
  const safe = {
    auto: Array.isArray(index?.auto) ? index.auto : [],
    manual: Array.isArray(index?.manual) ? index.manual : [],
  };
  localStorage.setItem(currentSnapshotIndexKey(), JSON.stringify(safe));
  state.snapshots = safe;
  return safe;
}

function removeSnapshotPayload(id) {
  if (!id) return;
  try {
    localStorage.removeItem(currentSnapshotPayloadKey(id));
  } catch {}
}

function readSnapshotPayload(id) {
  if (!id) return null;
  try {
    const raw = localStorage.getItem(currentSnapshotPayloadKey(id));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeSnapshotPayload(id, payload) {
  if (!id) return false;
  try {
    localStorage.setItem(currentSnapshotPayloadKey(id), JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

function snapshotSummaryFromPayload(meta, payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const tables = payload?.tables || {};
  return {
    itemsCount: items.length,
    tablesCount: Object.keys(tables).reduce((acc, k) => acc + Object.keys(tables[k] || {}).length, 0),
    tablesRows: {
      types: Object.keys(tables?.types || {}).length,
      submodels: Object.keys(tables?.submodels || {}).length,
      materials: Object.keys(tables?.materials || {}).length,
      colors: Object.keys(tables?.colors || {}).length,
    },
    sampleCodes: items.slice(0, 5).map(item => code(item)),
    kind: meta?.kind || 'auto',
  };
}

function createSnapshot({ kind = 'auto', reason = '', name = '', tag = '', extra = {} } = {}) {
  const payload = {
    items: state.items,
    tables: state.tables,
    filters: state.filters,
    updatedAt: new Date().toISOString(),
  };
  const jsonForChecksum = JSON.stringify(payload);
  const checksum = snapshotChecksum32(jsonForChecksum);
  const bytes = new Blob([jsonForChecksum]).size;
  const id = `${kind}-${Date.now().toString(36)}-${checksum.slice(0, 6)}`;
  const savedAt = new Date().toISOString();
  const meta = {
    id,
    kind,
    savedAt,
    reason: String(reason || ''),
    name: String(name || '').trim(),
    tag: String(tag || '').trim(),
    checksum,
    bytes,
    payloadSize: bytes,
    itemsCount: Array.isArray(payload.items) ? payload.items.length : 0,
    ...snapshotSummaryFromPayload({ kind }, payload),
    extra: extra || {},
  };
  const ok = writeSnapshotPayload(id, {
    __snapshotMeta: meta,
    items: payload.items,
    tables: payload.tables,
    filters: payload.filters,
    updatedAt: payload.updatedAt,
  });
  if (!ok) return null;
  const index = readSnapshotIndex();
  const list = index[kind] || [];
  list.unshift(meta);
  index[kind] = list;
  writeSnapshotIndex(index);
  return meta;
}

function getSnapshotById(id) {
  const index = readSnapshotIndex();
  const all = [...(index.auto || []), ...(index.manual || [])];
  const meta = all.find(entry => entry?.id === id);
  if (!meta) return null;
  const payload = readSnapshotPayload(id);
  return { meta, payload };
}

function deleteSnapshotById(id, { silent = false } = {}) {
  if (!id) return false;
  const index = readSnapshotIndex();
  let removed = false;
  ['auto', 'manual'].forEach(kind => {
    const before = (index[kind] || []).length;
    index[kind] = (index[kind] || []).filter(entry => entry?.id !== id);
    if (index[kind].length !== before) removed = true;
  });
  writeSnapshotIndex(index);
  removeSnapshotPayload(id);
  if (!silent) renderWorkspace();
  return removed;
}

function purgeOldSnapshots() {
  const now = Date.now();
  const index = readSnapshotIndex();
  ['auto', 'manual'].forEach(kind => {
    const limit = snapshotRetentionLimitFor(kind);
    const retentionMs = snapshotRetentionMsFor(kind);
    const list = (index[kind] || []).filter(entry => {
      if (!entry?.id || !entry?.savedAt) return false;
      const t = Date.parse(entry.savedAt);
      if (!Number.isFinite(t)) return false;
      return (now - t) <= retentionMs;
    });
    while (list.length > limit) {
      const drop = list.pop();
      if (drop?.id) removeSnapshotPayload(drop.id);
    }
    index[kind] = list;
  });
  writeSnapshotIndex(index);
  return index;
}

function clearAutoBackupsLegacy() {
  try {
    const legacyKey = currentAutoBackupKey();
    if (legacyKey) localStorage.removeItem(legacyKey);
  } catch {}
}

function migrateLegacyAutoBackups() {
  try {
    const raw = localStorage.getItem(currentAutoBackupKey());
    if (!raw) return 0;
    const entries = JSON.parse(raw);
    if (!Array.isArray(entries)) {
      clearAutoBackupsLegacy();
      return 0;
    }
    let migrated = 0;
    entries.forEach(entry => {
      if (!entry?.payload || !Array.isArray(entry.payload?.items)) return;
      const payload = entry.payload;
      const jsonForChecksum = JSON.stringify({ items: payload.items, tables: payload.tables || {}, filters: payload.filters || {}, updatedAt: entry.savedAt || new Date().toISOString() });
      const checksum = snapshotChecksum32(jsonForChecksum);
      const id = `auto-mig-${Date.now().toString(36)}-${migrated}-${checksum.slice(0, 5)}`;
      const bytes = new Blob([jsonForChecksum]).size;
      const meta = {
        id,
        kind: 'auto',
        savedAt: entry.savedAt || new Date().toISOString(),
        reason: `migrated:${entry.reason || 'legacy'}`,
        name: '',
        tag: 'migrado',
        checksum,
        bytes,
        payloadSize: bytes,
        itemsCount: Array.isArray(payload.items) ? payload.items.length : 0,
        ...snapshotSummaryFromPayload({ kind: 'auto' }, payload),
        extra: { migrated: true },
      };
      const ok = writeSnapshotPayload(id, {
        __snapshotMeta: meta,
        items: payload.items,
        tables: payload.tables || {},
        filters: payload.filters || {},
        updatedAt: entry.savedAt || new Date().toISOString(),
      });
      if (ok) {
        const index = readSnapshotIndex();
        index.auto.unshift(meta);
        writeSnapshotIndex(index);
        migrated += 1;
      }
    });
    clearAutoBackupsLegacy();
    return migrated;
  } catch {
    clearAutoBackupsLegacy();
    return 0;
  }
}

function renameSnapshot(id, nextName) {
  if (!id) return false;
  const index = readSnapshotIndex();
  let updated = false;
  ['auto', 'manual'].forEach(kind => {
    index[kind] = (index[kind] || []).map(entry => {
      if (entry?.id !== id) return entry;
      updated = true;
      return { ...entry, name: String(nextName || '').trim() };
    });
  });
  if (updated) writeSnapshotIndex(index);
  return updated;
}

function promoteSnapshotToManual(id, name = '') {
  if (!id) return false;
  const index = readSnapshotIndex();
  const pos = (index.auto || []).findIndex(entry => entry?.id === id);
  if (pos === -1) return false;
  const entry = index.auto[pos];
  index.auto.splice(pos, 1);
  const promoted = { ...entry, kind: 'manual', name: String(name || entry.name || '').trim() || 'Promovido desde automático' };
  index.manual.unshift(promoted);
  writeSnapshotIndex(index);
  return true;
}

function downloadSnapshot(id, { format = 'json' } = {}) {
  const wrap = getSnapshotById(id);
  if (!wrap?.payload) return false;
  const savedAt = wrap.meta?.savedAt || new Date().toISOString();
  const stamp = savedAt.replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const tag = (wrap.meta?.kind || 'auto') === 'manual' ? 'manual' : 'auto';
  const payload = {
    ...wrap.payload,
    __snapshotMeta: wrap.meta,
    exportedAt: new Date().toISOString(),
    integrity: {
      checksum: wrap.meta?.checksum || '',
      algorithm: 'fnv1a-64trunc',
      bytes: wrap.meta?.bytes || new Blob([JSON.stringify(wrap.payload)]).size,
    },
  };
  const name = `jldv1508-snapshot-${tag}-${stamp}.${format === 'md' ? 'manifest.json' : 'json'}`;
  download(name, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
  return true;
}

function downloadAllSnapshots() {
  const index = readSnapshotIndex();
  const list = [...(index.manual || []), ...(index.auto || [])];
  const packages = list.map(meta => {
    const payload = readSnapshotPayload(meta.id);
    return {
      meta,
      payload,
      payloadSize: payload ? new Blob([JSON.stringify(payload)]).size : 0,
      payloadChecksum: payload ? snapshotChecksum32(JSON.stringify(payload)) : null,
    };
  });
  const manifest = {
    generatedAt: new Date().toISOString(),
    snapshots: packages.map(p => ({
      id: p.meta?.id,
      kind: p.meta?.kind,
      savedAt: p.meta?.savedAt,
      name: p.meta?.name,
      tag: p.meta?.tag,
      itemsCount: p.meta?.itemsCount,
      checksum: p.meta?.checksum,
      bytes: p.meta?.bytes,
      payloadChecksum: p.payloadChecksum,
      payloadSize: p.payloadSize,
    })),
    totals: {
      auto: (index.auto || []).length,
      manual: (index.manual || []).length,
      bytes: packages.reduce((acc, p) => acc + (p.payloadSize || 0), 0),
    },
  };
  const bundle = { manifest, snapshots: packages };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  download(`jldv1508-snapshots-bundle-${stamp}.json`, JSON.stringify(bundle, null, 2), 'application/json;charset=utf-8');
  return true;
}

function verifyAllSnapshots() {
  const index = readSnapshotIndex();
  const report = { ok: 0, corrupt: 0, missing: 0, details: [] };
  [...(index.auto || []), ...(index.manual || [])].forEach(meta => {
    if (!meta?.id) return;
    const payload = readSnapshotPayload(meta.id);
    if (!payload) {
      report.missing += 1;
      report.details.push({ id: meta.id, savedAt: meta.savedAt, verdict: 'missing' });
      return;
    }
    const payloadCopy = { items: payload.items, tables: payload.tables || {}, filters: payload.filters || {}, updatedAt: payload.updatedAt };
    const checksum = snapshotChecksum32(JSON.stringify(payloadCopy));
    if (checksum !== meta.checksum) {
      report.corrupt += 1;
      report.details.push({ id: meta.id, savedAt: meta.savedAt, verdict: 'corrupt', expected: meta.checksum, got: checksum });
      return;
    }
    report.ok += 1;
    report.details.push({ id: meta.id, savedAt: meta.savedAt, verdict: 'ok' });
  });
  return report;
}

function restoreSnapshotById(id, { dryRun = false } = {}) {
  const wrap = getSnapshotById(id);
  const payload = wrap?.payload;
  if (!Array.isArray(payload?.items)) return { ok: false, reason: 'payload' };
  const payloadCopy = { items: payload.items, tables: payload.tables || {}, filters: payload.filters || {}, updatedAt: payload.updatedAt };
  const checksum = snapshotChecksum32(JSON.stringify(payloadCopy));
  if (wrap.meta?.checksum && wrap.meta.checksum !== checksum) {
    return { ok: false, reason: 'checksum', expected: wrap.meta.checksum, got: checksum };
  }
  if (dryRun) {
    return { ok: true, dryRun: true, itemsCount: payload.items.length, meta: wrap.meta };
  }
  state.items = payload.items.map(baseItem);
  openCardEditors.clear();
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
  state.items.forEach(syncPieceName);
  state.selected.clear();
  state.selectionAnchor = -1;
  lastSnapshotChecksum = checksum;
  savePublicPayload({ reason: `restore-snapshot:${id}` });
  renderWorkspace();
  return { ok: true, itemsCount: payload.items.length, meta: wrap.meta };
}

function importSnapshotJsonFile(file) {
  if (!file) return Promise.resolve({ ok: false, reason: 'file' });
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      try {
        const parsed = JSON.parse(String(reader.result || ''));
        const items = Array.isArray(parsed) ? parsed : (parsed?.snapshots ? null : parsed.items);
        if (parsed?.snapshots && Array.isArray(parsed.snapshots)) {
          const list = parsed.snapshots;
          let imported = 0;
          list.forEach(entry => {
            const innerMeta = entry?.meta || entry;
            const innerPayload = entry?.payload || entry;
            if (!Array.isArray(innerPayload?.items)) return;
            const clean = { items: innerPayload.items, tables: innerPayload.tables || {}, filters: innerPayload.filters || {}, updatedAt: innerMeta?.savedAt || innerPayload.updatedAt || new Date().toISOString() };
            const checksum = snapshotChecksum32(JSON.stringify(clean));
            const id = `manual-imp-${Date.now().toString(36)}-${imported}-${checksum.slice(0, 5)}`;
            const bytes = new Blob([JSON.stringify(clean)]).size;
            const meta = {
              id,
              kind: 'manual',
              savedAt: innerMeta?.savedAt || new Date().toISOString(),
              reason: `imported:${innerMeta?.reason || file.name}`,
              name: String(innerMeta?.name || parsed?.manifest?.generatedAt ? `Importado ${formatDateLocal(innerMeta?.savedAt)}` : innerMeta?.name || '').trim() || `Importado de ${file.name}`,
              tag: innerMeta?.tag || 'importado',
              checksum,
              bytes,
              payloadSize: bytes,
              itemsCount: clean.items.length,
              ...snapshotSummaryFromPayload({ kind: 'manual' }, clean),
              extra: { importedFrom: file.name, importedAt: new Date().toISOString() },
            };
            const ok = writeSnapshotPayload(id, {
              __snapshotMeta: meta,
              items: clean.items,
              tables: clean.tables,
              filters: clean.filters,
              updatedAt: clean.updatedAt,
            });
            if (ok) {
              const index = readSnapshotIndex();
              index.manual.unshift(meta);
              writeSnapshotIndex(index);
              imported += 1;
            }
          });
          resolve({ ok: imported > 0, imported, reason: imported ? '' : 'no-snapshots' });
          return;
        }
        if (!Array.isArray(items)) {
          resolve({ ok: false, reason: 'items' });
          return;
        }
        const clean = { items, tables: (parsed?.tables || state.tables || DEFAULT_TABLES), filters: parsed?.filters || state.filters || {}, updatedAt: parsed?.updatedAt || parsed?.exportedAt || new Date().toISOString() };
        const checksum = snapshotChecksum32(JSON.stringify(clean));
        const id = `manual-imp-${Date.now().toString(36)}-s-${checksum.slice(0, 5)}`;
        const bytes = new Blob([JSON.stringify(clean)]).size;
        const meta = {
          id,
          kind: 'manual',
          savedAt: clean.updatedAt,
          reason: `imported-file:${file.name}`,
          name: `Importado ${formatDateLocal(clean.updatedAt)}`,
          tag: 'importado',
          checksum,
          bytes,
          payloadSize: bytes,
          itemsCount: clean.items.length,
          ...snapshotSummaryFromPayload({ kind: 'manual' }, clean),
          extra: { importedFrom: file.name },
        };
        const ok = writeSnapshotPayload(id, {
          __snapshotMeta: meta,
          items: clean.items,
          tables: clean.tables,
          filters: clean.filters,
          updatedAt: clean.updatedAt,
        });
        if (ok) {
          const index = readSnapshotIndex();
          index.manual.unshift(meta);
          writeSnapshotIndex(index);
        }
        resolve({ ok, imported: ok ? 1 : 0 });
      } catch (err) {
        resolve({ ok: false, reason: 'parse', error: err?.message || String(err) });
      }
    });
    reader.readAsText(file);
  });
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

function normalizeIdArray(value, fallback) {
  if (Array.isArray(value)) return value.map(v => String(v || '').trim()).filter(Boolean);
  const arr = String(value || '').split(',').map(v => v.trim()).filter(Boolean);
  if (fallback && !arr.length) return [fallback];
  return arr;
}

function itemMaterials(item) {
  const arr = normalizeIdArray(item?.materialIds, itemMaterial(item));
  if (!arr.includes(itemMaterial(item))) arr.unshift(itemMaterial(item));
  return [...new Set(arr)];
}

function itemColors(item) {
  const arr = normalizeIdArray(item?.colorIds, itemColor(item));
  if (!arr.includes(itemColor(item))) arr.unshift(itemColor(item));
  return [...new Set(arr)];
}

function itemSubmodels(item) {
  const base = itemSubmodel(item);
  const arr = normalizeIdArray(item?.submodelIds, base);
  if (base && !arr.includes(base)) arr.unshift(base);
  return [...new Set(arr)];
}

function syncMultiPrimaryFromArray(item, kind) {
  if (!item) return;
  if (kind === 'material') {
    const ids = normalizeIdArray(item.materialIds);
    if (!ids.includes(itemMaterial(item))) item.material = ids[0] || itemMaterial(item) || '000';
    if (!item.materialIds?.length) item.materialIds = [itemMaterial(item)];
  } else if (kind === 'color') {
    const ids = normalizeIdArray(item.colorIds);
    if (!ids.includes(itemColor(item))) item.color = ids[0] || itemColor(item) || '000';
    if (!item.colorIds?.length) item.colorIds = [itemColor(item)];
  } else if (kind === 'submodel') {
    const ids = normalizeIdArray(item.submodelIds);
    if (!ids.includes(itemSubmodel(item))) item.submodel = ids[0] || itemSubmodel(item) || '';
    if (item.submodelo !== item.submodel) item.submodelo = item.submodel;
    if (!item.submodelIds?.length) item.submodelIds = [itemSubmodel(item)].filter(Boolean);
  }
}

function syncMultiPrimary(item) {
  syncMultiPrimaryFromArray(item, 'material');
  syncMultiPrimaryFromArray(item, 'color');
  syncMultiPrimaryFromArray(item, 'submodel');
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
  const base = {
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
  const materialIds = normalizeIdArray(item.materialIds, material).map(v => normalizeTableCode(v, 3) || '000');
  const colorIds = normalizeIdArray(item.colorIds, color).map(v => normalizeTableCode(v, 3) || '000');
  const submodelIds = normalizeIdArray(item.submodelIds, submodel).map(v => normalizeTableCode(v, 3)).filter(Boolean);
  base.materialIds = materialIds.includes(material) ? materialIds : [material, ...materialIds];
  base.colorIds = colorIds.includes(color) ? colorIds : [color, ...colorIds];
  base.submodelIds = !submodel ? submodelIds : (submodelIds.includes(submodel) ? submodelIds : [submodel, ...submodelIds]);
  syncMultiPrimary(base);
  return base;
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

function currentEditorPayload() {
  return {
    items: state.items,
    tables: state.tables,
    filters: state.filters,
    updatedAt: new Date().toISOString(),
  };
}

function payloadTimestamp(payload) {
  const time = Date.parse(String(payload?.updatedAt || payload?.exportedAt || payload?.savedAt || ''));
  return Number.isFinite(time) ? time : 0;
}

async function loadServerPayload() {
  try {
    const response = await fetch(SERVER_STATE_URL, { cache: 'no-store' });
    if (!response.ok) return null;
    const payload = await response.json();
    return Array.isArray(payload?.items) ? payload : null;
  } catch {
    return null;
  }
}

async function persistServerPayload(reason = 'change', immediate = false) {
  const payload = { ...currentEditorPayload(), reason };
  try {
    const response = await fetch(SERVER_STATE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
      keepalive: immediate,
    });
    if (!response.ok) throw new Error(`server-save:${response.status}`);
    const saved = await response.json().catch(() => ({}));
    lastServerSavedAt = String(saved?.updatedAt || payload.updatedAt || '');
    lastServerSaveError = '';
    renderAutoBackupStatus();
    return true;
  } catch {
    lastServerSaveError = 'No se pudo guardar en disco. El respaldo local sigue activo.';
    renderAutoBackupStatus();
    return false;
  }
}

function queueServerSave(reason = 'change', immediate = false) {
  if (typeof window === 'undefined') return null;
  if (serverSaveTimer) {
    window.clearTimeout(serverSaveTimer);
    serverSaveTimer = null;
  }
  const run = () => {
    serverSavePromise = persistServerPayload(reason, immediate).finally(() => {
      serverSavePromise = null;
    });
    return serverSavePromise;
  };
  if (immediate) return run();
  serverSaveTimer = window.setTimeout(run, 900);
  return null;
}

async function restoreServerSnapshot() {
  const payload = await loadServerPayload();
  if (!Array.isArray(payload?.items)) return false;
  state.items = payload.items.map(baseItem);
  state.items.forEach(syncPieceName);
  openCardEditors.clear();
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
  lastServerSavedAt = String(payload.updatedAt || '');
  lastServerSaveError = '';
  savePublicPayload({ skipServer: true });
  renderWorkspace();
  return true;
}

function savePublicPayload(options = {}) {
  const { skipServer = false, reason = 'change' } = options;
  if (!state.publicKey) return false;
  const payload = currentEditorPayload();
  localStorage.setItem(state.publicKey, JSON.stringify(payload));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('jldv1508-public-updated', {
      detail: { key: state.publicKey, updatedAt: payload.updatedAt },
    }));
  }
  if (!skipServer) queueServerSave(reason);
  return true;
}

function currentSnapshotSignature() {
  return JSON.stringify({
    items: state.items,
    tables: state.tables,
    filters: state.filters,
  });
}

function legacySignature(signature) {
  try {
    const parsed = JSON.parse(String(signature || ''));
    if (parsed?.items && parsed?.tables) return snapshotChecksum32(JSON.stringify(parsed));
  } catch {}
  return '';
}

function readAutoBackups() {
  return [...(readSnapshotIndex().auto || [])].map(meta => ({
    savedAt: meta.savedAt,
    reason: meta.reason,
    signature: meta.checksum,
    payloadStoredSeparately: true,
    payloadRef: meta.id,
    itemsCount: meta.itemsCount,
    meta,
  }));
}

function syncAutoBackupState() {
  try {
    const migrated = migrateLegacyAutoBackups();
    if (migrated > 0 && typeof window !== 'undefined') {
      window.setTimeout(() => {
        const st = document.querySelector('[data-auto-backup-status]');
        if (st) st.textContent = `Se migraron ${migrated} respaldos antiguos al nuevo sistema. ${st.textContent || ''}`;
      }, 300);
    }
  } catch {}
  purgeOldSnapshots();
  const backups = readSnapshotIndex().auto || [];
  state.lastAutoBackupAt = backups[0]?.savedAt || '';
  lastAutoBackupSignature = backups[0]?.checksum || '';
  state.snapshots = readSnapshotIndex();
}

function renderAutoBackupStatus() {
  const status = document.querySelector('[data-auto-backup-status]');
  if (!status) return;
  const index = readSnapshotIndex();
  const auto = index.auto || [];
  const manual = index.manual || [];
  const intervalMin = Math.round(AUTO_BACKUP_INTERVAL_MS / 60000);
  const totalBytes = [...auto, ...manual].reduce((acc, m) => acc + (m?.bytes || 0), 0);
  const localText = auto.length
    ? `Autorespaldo cada ${intervalMin} min. Último: ${formatDateLocal(auto[0]?.savedAt)}. Automáticos: ${auto.length} · Manuales: ${manual.length} · ${formatBytes(totalBytes)}.`
    : `Autorespaldo cada ${intervalMin} min. Aún no hay respaldos automáticos (hay ${manual.length} manuales).`;
  const serverText = lastServerSaveError
    ? lastServerSaveError
    : lastServerSavedAt
      ? `Guardado en disco: ${formatDateLocal(lastServerSavedAt)}.`
      : 'Guardado en disco pendiente.';
  status.textContent = `${localText} ${serverText}`;
}

function saveAutomaticBackup(reason = 'interval') {
  purgeOldSnapshots();
  const signature = currentSnapshotSignature();
  const checksum = snapshotChecksum32(signature);
  if (!signature || checksum === lastAutoBackupSignature) {
    renderAutoBackupStatus();
    return false;
  }
  const meta = createSnapshot({ kind: 'auto', reason });
  if (!meta) return false;
  state.lastAutoBackupAt = meta.savedAt;
  lastAutoBackupSignature = meta.checksum;
  lastSnapshotChecksum = meta.checksum;
  renderAutoBackupStatus();
  return true;
}

function restoreLatestAutoBackup() {
  const first = (readSnapshotIndex().auto || [])[0];
  if (!first) return false;
  const result = restoreSnapshotById(first.id);
  return !!result?.ok;
}

function startAutoBackupTimer() {
  if (autoBackupTimer || typeof window === 'undefined') return;
  syncAutoBackupState();
  autoBackupTimer = window.setInterval(() => {
    if (!state.unlocked) return;
    saveAutomaticBackup('interval');
  }, AUTO_BACKUP_INTERVAL_MS);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        purgeOldSnapshots();
        state.snapshots = readSnapshotIndex();
        renderAutoBackupStatus();
      }
    });
  }
  window.addEventListener('pagehide', () => {
    if (!state.unlocked) return;
    saveAutomaticBackup('pagehide');
    queueServerSave('pagehide', true);
  });
  window.setTimeout(() => {
    if (!state.unlocked) return;
    saveAutomaticBackup('session-start');
  }, 6000);
}

async function loadEditorState() {
  const localPayload = loadPublicPayload();
  const serverPayload = await loadServerPayload();
  const payload = payloadTimestamp(serverPayload) >= payloadTimestamp(localPayload) ? (serverPayload || localPayload) : (localPayload || serverPayload);
  if (payload) {
    state.items = (payload.items || []).map(baseItem);
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
    state.items.forEach(syncPieceName);
  }
  lastServerSavedAt = String(serverPayload?.updatedAt || '');
  lastServerSaveError = '';
  if (localPayload && payloadTimestamp(localPayload) > payloadTimestamp(serverPayload)) {
    queueServerSave('sync-local-to-disk', true);
  }
  syncAutoBackupState();
}

function snapshotRowHtml(meta, index, kind = 'auto') {
  if (!meta?.id) return '';
  const label = meta.name || (kind === 'auto' ? `Automático #${index + 1}` : `Manual #${index + 1}`);
  const sample = Array.isArray(meta.sampleCodes) ? meta.sampleCodes.slice(0, 3) : [];
  const tagChip = meta.tag ? `<span class="public-edit-chip public-edit-chip--tag">${escapeHtml(meta.tag)}</span>` : '';
  const reasonChip = meta.reason ? `<span class="public-edit-chip public-edit-chip--reason" title="${escapeAttr(meta.reason)}">${escapeHtml(meta.reason.slice(0, 24))}</span>` : '';
  const tablesTitle = `${meta.tablesRows?.types || 0} tipos · ${meta.tablesRows?.submodels || 0} subm · ${meta.tablesRows?.materials || 0} mat · ${meta.tablesRows?.colors || 0} col`;
  const promoteBtn = kind === 'auto'
    ? `<button type="button" class="is-link" data-snapshot-promote="${escapeAttr(meta.id)}" title="Guardar como manualmente y mantener más tiempo">★ Guardar como manual</button>`
    : '';
  const sampleHtml = sample.length
    ? `<div class="public-edit-snapshots-sample"><em>Muestra:</em> ${sample.map(c => `<code>${escapeHtml(c)}</code>`).join(' · ')}</div>`
    : '';
  return [
    `<li class="public-edit-snapshots-row" data-snapshot-row data-snapshot-id="${escapeAttr(meta.id)}" data-snapshot-kind="${escapeAttr(kind)}">`,
    '  <div class="public-edit-snapshots-main">',
    '    <div class="public-edit-snapshots-title">',
    `      <strong data-snapshot-label="${escapeAttr(meta.id)}">${escapeHtml(label)}</strong>`,
    `      ${tagChip} ${reasonChip} ${promoteBtn}`,
    `      <button type="button" class="is-link" data-snapshot-rename="${escapeAttr(meta.id)}" title="Cambiar nombre">✎</button>`,
    '    </div>',
    '    <div class="public-edit-snapshots-meta">',
    `      <span>${formatDateLocal(meta.savedAt)}</span>`,
    `      <span>${escapeHtml(String(meta.itemsCount || 0))} piezas</span>`,
    `      <span title="${escapeAttr(tablesTitle)}">${escapeHtml(String(meta.tablesCount || 0))} filas tablas</span>`,
    `      <span>${formatBytes(meta.bytes || 0)}</span>`,
    `      <span class="public-edit-snapshots-checksum" title="${escapeAttr(meta.checksum || '')}">#${escapeHtml(String(meta.checksum || '').slice(0, 10))}</span>`,
    '    </div>',
    `    ${sampleHtml}`,
    '    <div class="public-edit-snapshots-actions">',
    `      <button type="button" data-snapshot-preview="${escapeAttr(meta.id)}">Ver detalle</button>`,
    `      <button type="button" data-snapshot-restore="${escapeAttr(meta.id)}">Restaurar</button>`,
    `      <button type="button" data-snapshot-download="${escapeAttr(meta.id)}">Descargar</button>`,
    `      <button type="button" class="is-danger" data-snapshot-delete="${escapeAttr(meta.id)}">Borrar</button>`,
    '    </div>',
    '  </div>',
    '</li>',
  ].join('\n');
}

function snapshotsPanelHtml() {
  const index = readSnapshotIndex();
  const auto = index.auto || [];
  const manual = index.manual || [];
  const totalBytes = [...auto, ...manual].reduce((acc, m) => acc + (m?.bytes || 0), 0);
  const retentionAutoDays = Math.round(SNAPSHOT_RETENTION_AUTO_MS / (24 * 3600 * 1000));
  const retentionManualDays = Math.round(SNAPSHOT_RETENTION_MANUAL_MS / (24 * 3600 * 1000));
  const manualListHtml = manual.length
    ? `<ul>${manual.map((m, i) => snapshotRowHtml(m, i, 'manual')).join('')}</ul>`
    : `<div class="public-edit-empty-inline">No hay snapshots manuales. Crea uno antes de cambios importantes.</div>`;
  const autoListHtml = auto.length
    ? `<ul>${auto.map((m, i) => snapshotRowHtml(m, i, 'auto')).join('')}</ul>`
    : `<div class="public-edit-empty-inline">Aún no hay snapshots automáticos. Se crea el primero a los ~4 minutos o al cerrar la pestaña.</div>`;
  const rows = [];
  rows.push('<div class="public-edit-snapshots" data-snapshots-root>');
  rows.push('  <div class="public-edit-snapshots-toolbar">');
  rows.push('    <label>');
  rows.push('      <span>Nombre del snapshot (opcional)</span>');
  rows.push('      <input data-snapshot-manual-name placeholder="Ej. Antes de borrar colores 015 a 020" maxlength="120">');
  rows.push('    </label>');
  rows.push('    <label>');
  rows.push('      <span>Etiqueta / tag</span>');
  rows.push('      <input data-snapshot-manual-tag placeholder="Ej. version-cliente | limpieza-tablas-antes-deploy" maxlength="60">');
  rows.push('    </label>');
  rows.push('    <div class="public-edit-snapshots-actions-row">');
  rows.push('      <button type="button" data-snapshot-create-manual class="is-primary">Crear snapshot AHORA</button>');
  rows.push('      <button type="button" data-snapshot-verify>Verificar integridad</button>');
  rows.push('      <button type="button" data-snapshot-download-all>Exportar paquete completo</button>');
  rows.push('      <button type="button" data-snapshot-purge>Limpiar antiguos (retention)</button>');
  rows.push('      <label class="public-edit-import-snapshots">');
  rows.push('        <input type="file" data-snapshot-import-file accept=".json,application/json" hidden>');
  rows.push('        <button type="button" data-snapshot-import-button>Importar respaldo .json</button>');
  rows.push('      </label>');
  rows.push('    </div>');
  rows.push('  </div>');
  rows.push('  <div class="public-edit-snapshots-summary">');
  rows.push(`    <span><strong>${escapeHtml(String(manual.length))}</strong> manuales · <strong>${escapeHtml(String(auto.length))}</strong> automáticos · <strong>${formatBytes(totalBytes)}</strong> totales · retención auto ${retentionAutoDays} días y manual ${retentionManualDays} días.</span>`);
  rows.push('  </div>');
  rows.push('  <div class="public-edit-snapshots-report" data-snapshot-report hidden></div>');
  rows.push('  <nav class="public-edit-snapshots-tabs">');
  rows.push(`    <button type="button" class="is-primary" data-snapshot-tab="manual" data-snapshot-tab-state="open">Manuales (${manual.length})</button>`);
  rows.push(`    <button type="button" data-snapshot-tab="auto">Automáticos (${auto.length})</button>`);
  rows.push('  </nav>');
  rows.push(`  <section class="public-edit-snapshots-list" data-snapshot-list="manual">${manualListHtml}</section>`);
  rows.push(`  <section class="public-edit-snapshots-list" data-snapshot-list="auto" hidden>${autoListHtml}</section>`);
  rows.push('  <dialog class="public-edit-snapshots-modal" data-snapshot-modal hidden>');
  rows.push('    <div class="public-edit-snapshots-modal-inner" data-snapshot-modal-inner></div>');
  rows.push('  </dialog>');
  rows.push('</div>');
  return rows.join('\n');
}

async function ensureWorkspace() {
  if (state.loading) return;
  state.loading = true;
  state.publicKey = currentPublicKey();
  state.catalogUrl = currentCatalogUrl();
  if (!state.items.length) {
    await loadEditorState();
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
          item.materialIds?.join(' '), item.colorIds?.join(' '), item.submodelIds?.join(' '),
          typeName(item), submodelName(item), materialName(item), colorName(item),
          itemMaterials(item).map(m => tablesFor('materials')[m]).filter(Boolean).join(' '),
          itemColors(item).map(c => tablesFor('colors')[c]).filter(Boolean).join(' '),
          itemSubmodels(item).map(s => {
            const v = tablesFor('submodels')[s];
            return typeof v === 'string' ? v : v?.label || '';
          }).filter(Boolean).join(' '),
        ].join(' ').toLowerCase();
        if (!text.includes(q)) return false;
      }
      if (state.filters.type.length && !state.filters.type.includes(itemType(item))) return false;
      if (state.filters.submodel.length) {
        const available = new Set(itemSubmodels(item));
        if (!state.filters.submodel.some(v => available.has(v))) return false;
      }
      if (state.filters.material.length) {
        const available = new Set(itemMaterials(item));
        if (!state.filters.material.some(v => available.has(v))) return false;
      }
      if (state.filters.color.length) {
        const available = new Set(itemColors(item));
        if (!state.filters.color.some(v => available.has(v))) return false;
      }
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
  const entries = sortedEntries(kind);
  const choices = entries.map(([codeValue, value]) => {
    const label = typeof value === 'string' ? value : value?.label || codeValue;
    const models = kind === 'submodels' ? submodelModels(codeValue) : [];
    const prefix = kind === 'submodels' && models.length
      ? `${models.map(model => tablesFor('types')[model] || model).join(', ')} / `
      : '';
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

function multiCheckboxHtml({ field, kind, selected = [], modelCode = '', dataAttr = '', extras = '' }) {
  const selectedSet = new Set(selected.filter(Boolean));
  const entries = sortedEntries(kind).filter(([codeValue]) => {
    if (kind !== 'submodels') return true;
    const parents = submodelModels(codeValue);
    return !parents.length || !modelCode || parents.includes(modelCode);
  });
  if (!entries.length) return '<div class="public-edit-empty-inline">Sin opciones. Crea alguna en Tablas.</div>';
  const rows = entries.map(([codeValue, value]) => {
    const label = typeof value === 'string' ? value : value?.label || codeValue;
    const models = kind === 'submodels' ? submodelModels(codeValue) : [];
    const prefix = kind === 'submodels' && models.length
      ? `${models.map(model => tablesFor('types')[model] || model).join(', ')} / `
      : '';
    return `
      <label class="public-edit-check-option">
        <input type="checkbox" ${dataAttr}${extras ? ' ' + extras : ''} value="${escapeAttr(codeValue)}"${selectedSet.has(codeValue) ? ' checked' : ''}>
        <span>${escapeHtml(codeValue)} · ${escapeHtml(prefix)}${escapeHtml(label)}</span>
      </label>
    `;
  }).join('');
  return `<div class="public-edit-filter-group public-edit-check-inline-list">${rows}</div>`;
}

function applyBulk() {
  if (!state.selected.size) return;
  const type = document.querySelector('[data-bulk-type]')?.value || '';
  const bulkSubmodelValues = [...new Set([...document.querySelectorAll('[data-bulk-multi="submodelIds"][data-bulk-action="toggle"]:checked')].map(i => String(i.value || '').trim()).filter(Boolean))];
  const bulkMaterialValues = [...new Set([...document.querySelectorAll('[data-bulk-multi="materialIds"][data-bulk-action="toggle"]:checked')].map(i => String(i.value || '').trim()).filter(Boolean))];
  const bulkColorValues = [...new Set([...document.querySelectorAll('[data-bulk-multi="colorIds"][data-bulk-action="toggle"]:checked')].map(i => String(i.value || '').trim()).filter(Boolean))];
  state.selected.forEach(index => {
    const item = state.items[index];
    if (!item) return;
    if (type) {
      item.type = type;
      item.tipo = type;
    }
    if (bulkSubmodelValues.length) {
      item.submodelIds = [...new Set([...itemSubmodels(item), ...bulkSubmodelValues])];
    }
    if (bulkMaterialValues.length) {
      item.materialIds = [...new Set([...itemMaterials(item), ...bulkMaterialValues])];
    }
    if (bulkColorValues.length) {
      item.colorIds = [...new Set([...itemColors(item), ...bulkColorValues])];
    }
    syncMultiPrimary(item);
    syncPieceName(item);
  });
  document.querySelectorAll('[data-bulk-multi]').forEach(i => { i.checked = false; });
  savePublicPayload();
  renderWorkspace();
}

function tableValue(kind, codeValue) {
  const value = tablesFor(kind)[codeValue];
  if (typeof value === 'string') return value;
  return value?.label || '';
}

function sortedEntries(kind) {
  return Object.entries(tablesFor(kind)).sort((a, b) => {
    const leftLabel = typeof a[1] === 'string' ? a[1] : a[1]?.label || a[0];
    const rightLabel = typeof b[1] === 'string' ? b[1] : b[1]?.label || b[0];
    return leftLabel.localeCompare(rightLabel, 'es', { sensitivity: 'base', numeric: true });
  });
}

function submodelModels(codeValue) {
  const value = tablesFor('submodels')[codeValue];
  if (!value || typeof value === 'string') return [];
  if (Array.isArray(value.models)) return value.models.filter(Boolean);
  return value.model ? [value.model] : [];
}

function submodelParent(codeValue) {
  return submodelModels(codeValue)[0] || '';
}

function optionHtml(kind, includeBlank = false) {
  const entries = sortedEntries(kind);
  const options = entries.map(([codeValue, value]) => {
    const label = typeof value === 'string' ? value : value?.label || codeValue;
    const models = kind === 'submodels' ? submodelModels(codeValue) : [];
    const prefix = kind === 'submodels' && models.length
      ? `${models.map(model => tablesFor('types')[model] || model).join(', ')} / `
      : '';
    return `<option value="${escapeAttr(codeValue)}">${escapeHtml(codeValue)} · ${escapeHtml(prefix)}${escapeHtml(label)}</option>`;
  }).join('');
  return includeBlank ? `<option value="">Sin cambio</option>${options}` : options;
}

function submodelOptionsFor(modelCode, current = '') {
  const entries = sortedEntries('submodels').filter(([codeValue]) => {
    const parents = submodelModels(codeValue);
    return !parents.length || !modelCode || parents.includes(modelCode);
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
    const modelValues = [...document.querySelectorAll('[data-new-submodels-model]:checked')].map(input => input.value).filter(Boolean);
    state.tables.submodels[codeValue] = modelValues.length ? { models: modelValues, label: labelValue } : { label: labelValue };
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
    const modelValues = [...document.querySelectorAll('[data-edit-submodels-model]:checked')].map(input => input.value).filter(Boolean);
    state.tables.submodels[codeValue] = modelValues.length ? { models: modelValues, label: labelValue } : { label: labelValue };
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
  const modelInputs = document.querySelectorAll(`[data-edit-${kind}-model]`);
  if (labelInput) labelInput.value = tableValue(kind, codeValue);
  if (modelInputs.length) {
    const models = new Set(submodelModels(codeValue));
    modelInputs.forEach(input => {
      input.checked = models.has(input.value);
    });
  }
}

function deleteTableEntry(kind) {
  const select = document.querySelector(`[data-delete-${kind}]`);
  const codeValue = select?.value || '';
  if (!codeValue) return;
  const fallback = kind === 'types' ? 'PIE' : kind === 'submodels' ? '' : '999';
  const affectedField = kind === 'types' ? 'type' : kind === 'submodels' ? 'submodel' : kind === 'materials' ? 'material' : 'color';
  const multiField = kind === 'submodels' ? 'submodelIds' : kind === 'materials' ? 'materialIds' : 'colorIds';
  const used = state.items.filter(item => item[affectedField] === codeValue || (Array.isArray(item[multiField]) && item[multiField].includes(codeValue))).length;
  if (codeValue === fallback) return;
  delete state.tables[kind][codeValue];
  if (used) {
    state.items.forEach(item => {
      if (item[affectedField] === codeValue) item[affectedField] = fallback;
      if (kind === 'submodels' && item.submodelo === codeValue) item.submodelo = fallback;
      if (Array.isArray(item[multiField])) item[multiField] = item[multiField].filter(v => v !== codeValue);
      syncMultiPrimary(item);
    });
  }
  savePublicPayload();
  renderWorkspace();
}

function deleteItemsByIndexes(indexes) {
  const unique = [...new Set(indexes)].filter(i => Number.isInteger(i) && i >= 0 && i < state.items.length);
  if (!unique.length) return 0;
  const preview = unique.length === 1
    ? `Código: ${code(state.items[unique[0]])} — ${pieceName(state.items[unique[0]])}`
    : unique.slice(0, 4).map(i => code(state.items[i])).join(' · ') + (unique.length > 4 ? ` · y ${unique.length - 4} más` : '');
  const confirmMsg = unique.length === 1
    ? `Vas a eliminar 1 ficha permanentemente.\n\n${preview}\n\nEsta acción no se puede deshacer (pero puedes restaurar un snapshot automático o manual).\n\n¿Confirmar eliminación?`
    : `Vas a eliminar ${unique.length} fichas permanentemente.\n\n${preview}\n\nEsta acción no se puede deshacer (pero puedes restaurar un snapshot automático o manual).\n\n¿Confirmar eliminación?`;
  if (!confirm(confirmMsg)) return 0;
  const sortedDesc = unique.sort((a, b) => b - a);
  sortedDesc.forEach(i => {
    state.items.splice(i, 1);
    openCardEditors.delete(i);
  });
  const remainingSelected = new Set();
  state.selected.forEach(selIdx => {
    let shift = 0;
    sortedDesc.forEach(delIdx => { if (delIdx < selIdx) shift++; });
    const newIdx = selIdx - shift;
    if (newIdx >= 0 && newIdx < state.items.length) remainingSelected.add(newIdx);
  });
  state.selected = remainingSelected;
  if (state.selectionAnchor >= state.items.length) state.selectionAnchor = -1;
  savePublicPayload();
  renderWorkspace();
  return unique.length;
}

function setThumbnailZoom(level) {
  const n = Number(level);
  if (!THUMBNAIL_ZOOM_LEVELS.includes(n)) return;
  state.thumbnailZoom = n;
  if (!state.compact) state.compact = true;
  renderWorkspace();
}

function restorePublicCatalog() {
  const payload = loadPublicPayload();
  if (!payload?.items) return false;
  state.items = payload.items.map(baseItem);
  openCardEditors.clear();
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
    submodelIds: Array.isArray(draft.submodelIds) ? [...draft.submodelIds] : [],
    material,
    materialIds: Array.isArray(draft.materialIds) ? [...draft.materialIds] : [material],
    color,
    colorIds: Array.isArray(draft.colorIds) ? [...draft.colorIds] : [color],
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
  openCardEditors.clear();
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
      openCardEditors.clear();
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

function captureOpenDetails() {
  try {
    const workspace = document.querySelector('[data-edit-workspace]');
    if (!workspace) return;
    const captured = new Set();
    workspace.querySelectorAll('details[open]').forEach((el, i) => {
      const classes = el.className ? '.' + el.className.trim().split(/\s+/).filter(Boolean).map(s => CSS.escape(s)).join('.') : '';
      const cardEditorIdx = el.dataset.cardEditor;
      if (cardEditorIdx != null && cardEditorIdx !== '') {
        captured.add(`card-editor:${cardEditorIdx}`);
        return;
      }
      const sectionIdx = [...workspace.querySelectorAll('details.public-edit-section')].indexOf(el);
      if (sectionIdx >= 0 && el.classList.contains('public-edit-section')) {
        captured.add(`section:${sectionIdx}`);
        return;
      }
      const tableIdx = [...workspace.querySelectorAll('details.public-edit-table-box')].indexOf(el);
      if (tableIdx >= 0) {
        captured.add(`table:${tableIdx}`);
        return;
      }
      captured.add(`fallback:${classes}:${i}`);
    });
    state.detailsOpen = captured;
  } catch {}
}

function restoreOpenDetails() {
  try {
    const workspace = document.querySelector('[data-edit-workspace]');
    if (!workspace) return;
    workspace.querySelectorAll('details').forEach(el => {
      const cardEditorIdx = el.dataset.cardEditor;
      if (cardEditorIdx != null && cardEditorIdx !== '') {
        if (state.detailsOpen.has(`card-editor:${cardEditorIdx}`)) el.setAttribute('open', '');
        else el.removeAttribute('open');
        return;
      }
    });
    const sections = [...workspace.querySelectorAll('details.public-edit-section')];
    sections.forEach((el, idx) => {
      if (state.detailsOpen.has(`section:${idx}`)) el.setAttribute('open', '');
      else if (el.classList.contains('public-edit-section--sticky')) ;
      else el.removeAttribute('open');
    });
    const tableBoxes = [...workspace.querySelectorAll('details.public-edit-table-box')];
    tableBoxes.forEach((el, idx) => {
      if (state.detailsOpen.has(`table:${idx}`)) el.setAttribute('open', '');
      else el.removeAttribute('open');
    });
  } catch {}
}

function renderWorkspace() {
  captureOpenDetails();
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
  const modelChecklistHtml = (fieldName, selected = []) => sortedEntries('types').map(([codeValue, label]) => `
    <label class="public-edit-check-option">
      <input type="checkbox" ${fieldName} value="${escapeAttr(codeValue)}" ${selected.includes(codeValue) ? 'checked' : ''}>
      <span>${escapeHtml(label)}</span>
    </label>
  `).join('');
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
        <details class="public-edit-card-editor" data-card-editor="${index}" ${openCardEditors.has(index) ? 'open' : ''}>
          <summary>Abrir edición de la pieza</summary>
          <div class="public-edit-card-fields">
            <label>Tipo<select data-item-field="type" data-index="${index}">${typeOptions}</select></label>
            <fieldset class="public-edit-multi-field">
              <legend>Submodelos (puedes marcar varios)</legend>
              ${multiCheckboxHtml({ field: 'submodelIds', kind: 'submodels', selected: itemSubmodels(item), modelCode: itemType(item), dataAttr: `data-item-multi="submodelIds" data-index="${index}"` })}
            </fieldset>
            <fieldset class="public-edit-multi-field">
              <legend>Materiales (puedes marcar varios)</legend>
              ${multiCheckboxHtml({ field: 'materialIds', kind: 'materials', selected: itemMaterials(item), dataAttr: `data-item-multi="materialIds" data-index="${index}"` })}
            </fieldset>
            <fieldset class="public-edit-multi-field">
              <legend>Colores (puedes marcar varios)</legend>
              ${multiCheckboxHtml({ field: 'colorIds', kind: 'colors', selected: itemColors(item), dataAttr: `data-item-multi="colorIds" data-index="${index}"` })}
            </fieldset>
            <label>Unidad<input data-item-field="unit" data-index="${index}" value="${escapeAttr(item.unit || '')}" maxlength="3"></label>
            <label>Precio<input data-item-field="price" data-index="${index}" value="${escapeAttr(item.price || item.precio_eur || '')}" inputmode="decimal" placeholder="0,00"></label>
            <label>Stock<input data-item-field="stock" data-index="${index}" value="${escapeAttr(item.stock || '')}" inputmode="numeric" placeholder="1"></label>
            <label>Estado<select data-item-field="estado" data-index="${index}">${statusOptionsHtml(item.estado || 'disponible')}</select></label>
            <label class="full">Imagen<input data-item-field="archivo" data-index="${index}" value="${escapeAttr(catalogImage(item))}" placeholder="image-catalog/nombre.jpg"></label>
            <label class="full">Nombre generado<input value="${escapeAttr(pieceName(item))}" readonly></label>
            <label class="full">Medidas<input data-item-field="medidas" data-index="${index}" value="${escapeAttr(item.medidas || item.measures || '')}"></label>
            <label class="full">Descripcion<textarea data-item-field="description" data-index="${index}">${escapeHtml(item.description || item.descripcion || '')}</textarea></label>
            <div class="public-edit-inline-actions public-edit-inline-actions--danger">
              <button type="button" class="is-danger" data-delete-item="${index}">Eliminar esta pieza</button>
            </div>
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
          <button type="button" data-restore-server>Restaurar guardado en disco</button>
          <button type="button" data-restore-public>Restaurar guardado local</button>
          <button type="button" data-restore-auto-backup>Restaurar último autorespaldo</button>
        </div>
        <div class="public-edit-helper" data-auto-backup-status></div>
        ${snapshotsPanelHtml()}
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
          <fieldset class="public-edit-multi-field public-edit-create-grid public-edit-create-grid--multi">
            <legend>Submodelos (puedes marcar varios)</legend>
            ${multiCheckboxHtml({ field: 'submodelIds', kind: 'submodels', selected: normalizeIdArray(draft.submodelIds, draft.submodel || ''), modelCode: draft.type || 'PIE', dataAttr: 'data-create-multi="submodelIds"' })}
          </fieldset>
          <fieldset class="public-edit-multi-field public-edit-create-grid public-edit-create-grid--multi">
            <legend>Materiales (puedes marcar varios)</legend>
            ${multiCheckboxHtml({ field: 'materialIds', kind: 'materials', selected: normalizeIdArray(draft.materialIds, draft.material || '000'), dataAttr: 'data-create-multi="materialIds"' })}
          </fieldset>
          <fieldset class="public-edit-multi-field public-edit-create-grid public-edit-create-grid--multi">
            <legend>Colores (puedes marcar varios)</legend>
            ${multiCheckboxHtml({ field: 'colorIds', kind: 'colors', selected: normalizeIdArray(draft.colorIds, draft.color || '000'), dataAttr: 'data-create-multi="colorIds"' })}
          </fieldset>
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
              <fieldset class="public-edit-filter-group">
                <legend>Modelos vinculados</legend>
                ${modelChecklistHtml('data-new-submodels-model')}
              </fieldset>
              <label>Codigo<input data-new-submodels-code placeholder="Ej. PUL-001"></label>
              <label>Nombre<input data-new-submodels-label placeholder="Nombre del submodelo"></label>
              <div class="public-edit-inline-actions public-edit-inline-actions--single">
                <button type="button" data-add-submodels>Crear submodelo</button>
              </div>
              <div class="public-edit-divider"></div>
              <label>Submodelo a editar<select data-edit-submodels-select><option value="">Elegir</option>${submodelOptions}</select></label>
              <fieldset class="public-edit-filter-group">
                <legend>Modelos vinculados</legend>
                ${modelChecklistHtml('data-edit-submodels-model', submodelModels(document.querySelector('[data-edit-submodels-select]')?.value || ''))}
              </fieldset>
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
          <button type="button" class="is-danger" data-delete-selected>Eliminar seleccionadas</button>
        </div>
        <div class="public-edit-actions-row public-edit-actions-row--zoom">
          <span class="public-edit-zoom-label"><strong>Miniaturas</strong> (vista rápida)</span>
          ${THUMBNAIL_ZOOM_LEVELS.map(lv => `
            <button type="button" data-set-thumbnail-zoom="${lv}" class="public-edit-zoom-btn${state.thumbnailZoom === lv ? ' is-active' : ''}" title="Tamaño miniatura ${lv}x">${lv}x</button>
          `).join('')}
        </div>
        <div class="public-edit-bulk">
          <label>Tipo<select data-bulk-type>${bulkTypeOptions}</select></label>
          <fieldset class="public-edit-multi-field public-edit-bulk-multi">
            <legend>Submodelos (añadir / quitar en lote)</legend>
            ${multiCheckboxHtml({ field: 'submodelIds', kind: 'submodels', selected: [], dataAttr: 'data-bulk-multi="submodelIds"', extras: 'data-bulk-action="toggle"' })}
          </fieldset>
          <fieldset class="public-edit-multi-field public-edit-bulk-multi">
            <legend>Materiales (añadir / quitar en lote)</legend>
            ${multiCheckboxHtml({ field: 'materialIds', kind: 'materials', selected: [], dataAttr: 'data-bulk-multi="materialIds"', extras: 'data-bulk-action="toggle"' })}
          </fieldset>
          <fieldset class="public-edit-multi-field public-edit-bulk-multi">
            <legend>Colores (añadir / quitar en lote)</legend>
            ${multiCheckboxHtml({ field: 'colorIds', kind: 'colors', selected: [], dataAttr: 'data-bulk-multi="colorIds"', extras: 'data-bulk-action="toggle"' })}
          </fieldset>
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
        <div class="public-edit-grid${state.compact ? ' is-compact' : ''}" data-thumbnail-zoom="${state.thumbnailZoom}">
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
          state.draft.submodelIds = [];
          renderWorkspace();
        }
      });
    }
  });
  workspace.querySelectorAll('[data-create-multi]').forEach(input => {
    const field = input.dataset.createMulti;
    if (!field) return;
    input.addEventListener('change', () => {
      const checked = [...document.querySelectorAll(`[data-create-multi="${field}"]:checked`)].map(i => String(i.value || '').trim()).filter(Boolean);
      if (!Array.isArray(state.draft[field])) state.draft[field] = [];
      state.draft[field] = [...new Set(checked)];
      const primary = state.draft[field][0];
      if (field === 'materialIds') state.draft.material = primary || '000';
      if (field === 'colorIds') state.draft.color = primary || '000';
      if (field === 'submodelIds') {
        state.draft.submodel = primary || '';
        state.draft.submodelo = state.draft.submodel;
      }
      savePublicPayload({ reason: 'typing' });
    });
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
  workspace.querySelectorAll('[data-set-thumbnail-zoom]').forEach(btn => {
    btn.addEventListener('click', () => setThumbnailZoom(btn.dataset.setThumbnailZoom));
  });
  workspace.querySelector('[data-select-visible]').addEventListener('click', selectVisible);
  workspace.querySelector('[data-invert-visible]').addEventListener('click', invertVisible);
  workspace.querySelector('[data-clear-selection]').addEventListener('click', clearSelection);
  workspace.querySelector('[data-delete-selected]')?.addEventListener('click', () => {
    if (!state.selected.size) {
      alert('No hay fichas seleccionadas para eliminar.');
      return;
    }
    deleteItemsByIndexes([...state.selected]);
  });
  workspace.querySelectorAll('[data-delete-item]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.deleteItem);
      if (!Number.isInteger(idx) || idx < 0 || idx >= state.items.length) return;
      deleteItemsByIndexes([idx]);
    });
  });
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
  workspace.querySelector('[data-restore-server]').addEventListener('click', async () => {
    if (!await restoreServerSnapshot()) {
      alert('No se encontró un guardado en disco para restaurar.');
    }
  });
  workspace.querySelector('[data-restore-public]').addEventListener('click', () => {
    restorePublicCatalog();
  });
  workspace.querySelector('[data-restore-auto-backup]').addEventListener('click', () => {
    if (!restoreLatestAutoBackup()) {
      alert('Todavia no hay respaldos automaticos para restaurar.');
    }
  });

  workspace.querySelectorAll('[data-snapshot-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.snapshotTab;
      workspace.querySelectorAll('[data-snapshot-list]').forEach(sec => {
        sec.hidden = sec.dataset.snapshotList !== tab;
      });
      workspace.querySelectorAll('[data-snapshot-tab]').forEach(b => {
        b.classList.toggle('is-primary', b === btn);
        if (b === btn) b.setAttribute('data-snapshot-tab-state', 'open');
        else b.removeAttribute('data-snapshot-tab-state');
      });
    });
  });

  workspace.querySelector('[data-snapshot-create-manual]')?.addEventListener('click', () => {
    const nameInput = workspace.querySelector('[data-snapshot-manual-name]');
    const tagInput = workspace.querySelector('[data-snapshot-manual-tag]');
    const name = String(nameInput?.value || '').trim();
    const tag = String(tagInput?.value || '').trim();
    const meta = createSnapshot({ kind: 'manual', reason: 'manual-button', name, tag });
    if (!meta) {
      alert('No se pudo crear el snapshot manual (puede que localStorage esté lleno).');
      return;
    }
    const report = workspace.querySelector('[data-snapshot-report]');
    if (report) {
      report.hidden = false;
      report.className = 'public-edit-snapshots-report';
      report.textContent = `Snapshot manual creado: ${formatDateLocal(meta.savedAt)} · ${meta.itemsCount} piezas · ${formatBytes(meta.bytes)} · id=${meta.id}`;
      report.classList.add('is-ok');
    }
    if (nameInput) nameInput.value = '';
    if (tagInput) tagInput.value = '';
    renderWorkspace();
  });

  workspace.querySelector('[data-snapshot-verify]')?.addEventListener('click', () => {
    const report = verifyAllSnapshots();
    const el = workspace.querySelector('[data-snapshot-report]');
    if (!el) return;
    el.hidden = false;
    el.className = 'public-edit-snapshots-report';
    const verdict = report.corrupt || report.missing ? 'Atención:' : 'OK.';
    const details = report.details.slice(0, 12).map(d => {
      if (d.verdict === 'ok') return `✓ ${d.id.slice(-10)}`;
      if (d.verdict === 'missing') return `✗ missing ${d.id.slice(-10)}`;
      return `✗ corrupt ${d.id.slice(-10)}`;
    }).join(' · ');
    el.textContent = `${verdict} ${report.ok} válidos · ${report.corrupt} corruptos · ${report.missing} ausentes. ${details}`;
    if (report.corrupt || report.missing) el.classList.add('is-error');
    else el.classList.add('is-ok');
    renderWorkspace();
  });

  workspace.querySelector('[data-snapshot-download-all]')?.addEventListener('click', () => {
    const ok = downloadAllSnapshots();
    if (!ok) alert('No hay snapshots para empaquetar.');
  });

  workspace.querySelector('[data-snapshot-purge]')?.addEventListener('click', () => {
    const before = readSnapshotIndex();
    const after = purgeOldSnapshots();
    const el = workspace.querySelector('[data-snapshot-report]');
    if (el) {
      el.hidden = false;
      el.className = 'public-edit-snapshots-report is-ok';
      el.textContent = `Limpieza retention. Antes: ${(before.auto || []).length + (before.manual || []).length} → ahora: ${(after.auto || []).length + (after.manual || []).length}.`;
    }
    renderWorkspace();
  });

  workspace.querySelector('[data-snapshot-import-button]')?.addEventListener('click', () => {
    workspace.querySelector('[data-snapshot-import-file]')?.click();
  });

  workspace.querySelector('[data-snapshot-import-file]')?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const res = await importSnapshotJsonFile(file);
    const el = workspace.querySelector('[data-snapshot-report]');
    if (el) {
      el.hidden = false;
      el.className = 'public-edit-snapshots-report';
      if (res?.ok) {
        el.classList.add('is-ok');
        el.textContent = `Importado OK · ${res.imported || 1} snapshot(s) desde "${file.name}".`;
      } else {
        el.classList.add('is-error');
        el.textContent = `Error importando "${file.name}" (${res?.reason || 'desconocido'}). Asegúrate que sea un JSON de respaldo válido.`;
      }
    }
    renderWorkspace();
  });

  workspace.querySelectorAll('[data-snapshot-preview]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.snapshotPreview;
      const wrap = getSnapshotById(id);
      if (!wrap?.meta || !wrap?.payload) {
        alert('Snapshot no encontrado.');
        return;
      }
      const meta = wrap.meta;
      const sample = (wrap.payload.items || []).slice(0, 8).map(it => {
        return [
          `<li><code>${escapeHtml(code(it))}</code> · <strong>${escapeHtml(pieceName(it))}</strong> · ${escapeHtml(normalizePrice(it.price) || '—')}€ · ${escapeHtml(normalizeStock(it.stock) || '—')}uds</li>`
        ].join('');
      }).join('');
      const extraLines = Object.entries(meta.extra || {}).map(([k, v]) => `<li><em>${escapeHtml(k)}:</em> <code>${escapeHtml(String(v))}</code></li>`).join('');
      const inner = workspace.querySelector('[data-snapshot-modal-inner]');
      const modal = workspace.querySelector('[data-snapshot-modal]');
      if (!inner || !modal) return;
      inner.innerHTML = `
        <div class="public-edit-snapshots-modal-head">
          <strong>${escapeHtml(meta.name || (meta.kind === 'auto' ? 'Snapshot automático' : 'Snapshot manual'))}</strong>
          <button type="button" class="is-link" data-snapshot-modal-close>✕ Cerrar</button>
        </div>
        <dl class="public-edit-snapshots-modal-meta">
          <dt>ID</dt><dd><code>${escapeHtml(meta.id)}</code></dd>
          <dt>Fecha</dt><dd>${escapeHtml(formatDateLocal(meta.savedAt))}</dd>
          <dt>Motivo / reason</dt><dd>${escapeHtml(meta.reason || '—')}</dd>
          <dt>Tag</dt><dd>${escapeHtml(meta.tag || '—')}</dd>
          <dt>Piezas</dt><dd>${escapeHtml(String(meta.itemsCount || 0))}</dd>
          <dt>Tablas</dt><dd>Tipos ${escapeHtml(String(meta.tablesRows?.types || 0))} · Subm. ${escapeHtml(String(meta.tablesRows?.submodels || 0))} · Mat. ${escapeHtml(String(meta.tablesRows?.materials || 0))} · Col. ${escapeHtml(String(meta.tablesRows?.colors || 0))}</dd>
          <dt>Tamaño</dt><dd>${escapeHtml(formatBytes(meta.bytes || 0))}</dd>
          <dt>Checksum (fnv1a-64trunc)</dt><dd><code>${escapeHtml(meta.checksum || '')}</code></dd>
          ${extraLines ? `<dt>Extra</dt><dd><ul>${extraLines}</ul></dd>` : ''}
        </dl>
        <div class="public-edit-snapshots-modal-samples">
          <p><strong>Muestra del contenido (primeras 8 piezas)</strong></p>
          ${sample ? `<ul class="public-edit-snapshots-modal-samples-list">${sample}</ul>` : '<div class="public-edit-empty-inline">Sin piezas en este snapshot.</div>'}
        </div>
        <div class="public-edit-snapshots-modal-actions">
          <button type="button" class="is-primary" data-snapshot-restore="${escapeAttr(id)}">Restaurar este snapshot</button>
          <button type="button" data-snapshot-download="${escapeAttr(id)}">Descargar</button>
          <button type="button" class="is-danger" data-snapshot-delete="${escapeAttr(id)}">Borrar</button>
        </div>
      `;
      modal.hidden = false;
      modal.style.display = 'block';
      modal.querySelector('[data-snapshot-modal-close]')?.addEventListener('click', () => {
        modal.hidden = true;
        modal.style.display = 'none';
      });
      ['data-snapshot-restore', 'data-snapshot-download', 'data-snapshot-delete'].forEach(attr => {
        modal.querySelectorAll(`[${attr}]`).forEach(b => b.addEventListener('click', () => {
          const bid = b.getAttribute(attr);
          const real = workspace.querySelector(`[${attr}="${bid}"]`);
          if (real) real.click();
          else if (attr === 'data-snapshot-restore') doRestoreSnapshot(bid);
          else if (attr === 'data-snapshot-download') downloadSnapshot(bid);
          else if (attr === 'data-snapshot-delete') deleteSnapshotById(bid);
          modal.hidden = true;
          modal.style.display = 'none';
        }));
      });
    });
  });

  workspace.querySelectorAll('[data-snapshot-restore]').forEach(btn => {
    if (btn.closest('[data-snapshot-modal]')) return;
    btn.addEventListener('click', () => doRestoreSnapshot(btn.dataset.snapshotRestore));
  });

  function doRestoreSnapshot(id) {
    if (!id) return;
    const preview = restoreSnapshotById(id, { dryRun: true });
    if (!preview?.ok) {
      const reason = preview?.reason || 'desconocido';
      alert(`No se puede restaurar este snapshot (${reason}).`);
      return;
    }
    const m = preview.meta;
    const ok = window.confirm([
      `¿Restaurar este snapshot?`,
      `· Fecha: ${formatDateLocal(m?.savedAt)}`,
      `· Nombre: ${m?.name || '(sin nombre)'}`,
      `· Piezas: ${preview.itemsCount}`,
      `· Checksum: ${m?.checksum?.slice(0, 10) || ''}…`,
      '',
      'Esto SUSTITUIRÁ tu catálogo actual. Esta acción no se puede deshacer (pero sí crear un snapshot manual ahora mismo si te arrepientes).',
    ].join('\n'));
    if (!ok) return;
    const result = restoreSnapshotById(id);
    const el = workspace.querySelector('[data-snapshot-report]');
    if (el) {
      el.hidden = false;
      el.className = 'public-edit-snapshots-report';
      if (result?.ok) {
        el.classList.add('is-ok');
        el.textContent = `Restaurado OK. ${result.itemsCount} piezas desde ${formatDateLocal(result.meta?.savedAt)}.`;
      } else {
        el.classList.add('is-error');
        el.textContent = `Fallo al restaurar (${result?.reason || 'desconocido'}).`;
      }
    }
    if (!result?.ok) alert('Fallo al restaurar.');
  }

  workspace.querySelectorAll('[data-snapshot-download]').forEach(btn => {
    if (btn.closest('[data-snapshot-modal]')) return;
    btn.addEventListener('click', () => {
      const ok = downloadSnapshot(btn.dataset.snapshotDownload);
      if (!ok) alert('No se pudo descargar el snapshot.');
    });
  });

  workspace.querySelectorAll('[data-snapshot-delete]').forEach(btn => {
    if (btn.closest('[data-snapshot-modal]')) return;
    btn.addEventListener('click', () => {
      const id = btn.dataset.snapshotDelete;
      const wrap = getSnapshotById(id);
      if (!wrap?.meta) return;
      if (!window.confirm([
        `¿Borrar este snapshot?`,
        `· Fecha: ${formatDateLocal(wrap.meta.savedAt)}`,
        `· Nombre: ${wrap.meta.name || '(sin nombre)'}`,
        `· Piezas: ${wrap.meta.itemsCount || 0}`,
      ].join('\n'))) return;
      deleteSnapshotById(id);
    });
  });

  workspace.querySelectorAll('[data-snapshot-promote]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.snapshotPromote;
      const existing = getSnapshotById(id)?.meta;
      const proposedName = existing?.name ? String(existing.name) : `Promovido ${formatDateLocal(existing?.savedAt)}`;
      const name = window.prompt('Nombre para el snapshot manual (lo mantendrás más tiempo en retention):', proposedName);
      if (name === null) return;
      const ok = promoteSnapshotToManual(id, name);
      if (!ok) alert('No se pudo promocionar.');
      else renderWorkspace();
    });
  });

  workspace.querySelectorAll('[data-snapshot-rename]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.snapshotRename;
      const wrap = getSnapshotById(id);
      if (!wrap?.meta) return;
      const current = wrap.meta.name || '';
      const next = window.prompt('Nombre del snapshot:', current);
      if (next === null) return;
      renameSnapshot(id, next);
      renderWorkspace();
    });
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

  workspace.querySelectorAll('[data-card-editor]').forEach(details => {
    details.addEventListener('toggle', () => {
      const index = Number(details.dataset.cardEditor);
      if (details.open) openCardEditors.add(index);
      else openCardEditors.delete(index);
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
          const parents = submodelModels(item.submodel);
          if (item.submodel && parents.length && !parents.includes(input.value)) {
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
        savePublicPayload({ reason: 'typing' });
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
      input.addEventListener('input', () => {
        item[field] = input.value;
        if (field === 'description') item.descripcion = input.value;
        savePublicPayload({ reason: 'typing' });
      });
      input.addEventListener('change', () => {
        item[field] = input.value;
        if (field === 'description') item.descripcion = input.value;
        savePublicPayload();
      });
    }
  });

  workspace.querySelectorAll('[data-item-multi]').forEach(input => {
    const index = Number(input.dataset.index);
    const field = input.dataset.itemMulti;
    const item = state.items[index];
    if (!item || !field) return;
    const applySelected = () => {
      const checked = [...new Set([...document.querySelectorAll(`[data-item-multi="${field}"][data-index="${index}"]:checked`)].map(i => String(i.value || '').trim()).filter(Boolean))];
      item[field] = checked;
      syncMultiPrimary(item);
      syncPieceName(item);
    };
    input.addEventListener('change', () => {
      applySelected();
      savePublicPayload();
      renderWorkspace();
    });
  });

  renderAutoBackupStatus();
  if (typeof window !== 'undefined') {
    window.requestAnimationFrame(() => window.requestAnimationFrame(restoreOpenDetails));
  }
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
