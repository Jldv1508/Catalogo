import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

const DATA_DIR = path.join(process.cwd(), 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'catalogo-backups');
const STATE_FILE = path.join(DATA_DIR, 'catalogo-editor-state.json');
const PUBLIC_FILE = path.join(process.cwd(), 'public', 'catalogo-unificado.json');
const BACKUP_LIMIT = 40;

function normalizeFilters(filters) {
  return {
    q: String(filters?.q || ''),
    type: Array.isArray(filters?.type) ? filters.type : [],
    submodel: Array.isArray(filters?.submodel) ? filters.submodel : [],
    material: Array.isArray(filters?.material) ? filters.material : [],
    color: Array.isArray(filters?.color) ? filters.color : [],
    priceMin: String(filters?.priceMin || ''),
    priceMax: String(filters?.priceMax || ''),
  };
}

function normalizePayload(payload, updatedAt = new Date().toISOString()) {
  return {
    items: Array.isArray(payload?.items) ? payload.items : [],
    tables: payload?.tables && typeof payload.tables === 'object' ? payload.tables : {},
    filters: normalizeFilters(payload?.filters),
    updatedAt,
  };
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function ensureStorage() {
  await mkdir(BACKUP_DIR, { recursive: true });
}

async function pruneBackups() {
  const files = (await readdir(BACKUP_DIR))
    .filter(name => name.endsWith('.json'))
    .sort()
    .reverse();
  await Promise.all(files.slice(BACKUP_LIMIT).map(name => unlink(path.join(BACKUP_DIR, name)).catch(() => {})));
}

function backupFileName(updatedAt) {
  return `catalogo-editor-${updatedAt.replace(/[:.]/g, '-')}.json`;
}

export async function GET() {
  await ensureStorage();
  const saved = await readJson(STATE_FILE);
  if (Array.isArray(saved?.items)) {
    return NextResponse.json(saved, {
      headers: { 'cache-control': 'no-store' },
    });
  }

  const fallback = await readJson(PUBLIC_FILE);
  const payload = normalizePayload({ items: Array.isArray(fallback) ? fallback : [] });
  return NextResponse.json(payload, {
    headers: { 'cache-control': 'no-store' },
  });
}

export async function POST(request) {
  await ensureStorage();
  const rawText = await request.text();
  const rawPayload = rawText ? JSON.parse(rawText) : null;
  const updatedAt = new Date().toISOString();
  const payload = normalizePayload(rawPayload, updatedAt);
  const backupName = backupFileName(updatedAt);

  await writeFile(STATE_FILE, JSON.stringify(payload, null, 2));
  await writeFile(PUBLIC_FILE, JSON.stringify(payload.items, null, 2));
  await writeFile(path.join(BACKUP_DIR, backupName), JSON.stringify(payload, null, 2));
  await pruneBackups();

  return NextResponse.json({
    ok: true,
    updatedAt,
    backupName,
  }, {
    headers: { 'cache-control': 'no-store' },
  });
}
