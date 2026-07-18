import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data');
const CLIENT_AREA_FILE = path.join(DATA_DIR, 'client-area.json');

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

async function readClientAreaFile() {
  try {
    const value = JSON.parse(await readFile(CLIENT_AREA_FILE, 'utf8'));
    return {
      favoritesByEmail: value?.favoritesByEmail && typeof value.favoritesByEmail === 'object' ? value.favoritesByEmail : {},
      profilesByEmail: value?.profilesByEmail && typeof value.profilesByEmail === 'object' ? value.profilesByEmail : {},
    };
  } catch {
    return { favoritesByEmail: {}, profilesByEmail: {} };
  }
}

async function writeClientAreaFile(value) {
  await ensureDataDir();
  await writeFile(CLIENT_AREA_FILE, JSON.stringify(value, null, 2));
}

export async function readClientArea(email) {
  const store = await readClientAreaFile();
  const normalized = normalizeEmail(email);
  return {
    favorites: Array.isArray(store.favoritesByEmail[normalized]) ? store.favoritesByEmail[normalized] : [],
    profile: store.profilesByEmail[normalized] && typeof store.profilesByEmail[normalized] === 'object' ? store.profilesByEmail[normalized] : {},
  };
}

export async function writeClientFavorites(email, favorites) {
  const store = await readClientAreaFile();
  const normalized = normalizeEmail(email);
  store.favoritesByEmail[normalized] = Array.isArray(favorites) ? favorites : [];
  await writeClientAreaFile(store);
}

export async function writeClientProfile(email, profile) {
  const store = await readClientAreaFile();
  const normalized = normalizeEmail(email);
  store.profilesByEmail[normalized] = profile && typeof profile === 'object' ? profile : {};
  await writeClientAreaFile(store);
}

export async function readAllClientAreas() {
  const store = await readClientAreaFile();
  const emails = [...new Set([
    ...Object.keys(store.favoritesByEmail || {}),
    ...Object.keys(store.profilesByEmail || {}),
  ])].sort((a, b) => a.localeCompare(b, 'es'));

  return emails.map(email => ({
    email,
    favorites: Array.isArray(store.favoritesByEmail?.[email]) ? store.favoritesByEmail[email] : [],
    profile: store.profilesByEmail?.[email] && typeof store.profilesByEmail[email] === 'object' ? store.profilesByEmail[email] : {},
  }));
}
