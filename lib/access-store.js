import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data');
const REQUESTS_FILE = path.join(DATA_DIR, 'access-requests.json');
const APPROVALS_FILE = path.join(DATA_DIR, 'approved-access.json');

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await ensureDataDir();
  await writeFile(filePath, JSON.stringify(value, null, 2));
}

export async function readAccessRequests() {
  return readJson(REQUESTS_FILE, []);
}

export async function writeAccessRequests(requests) {
  await writeJson(REQUESTS_FILE, requests);
}

export async function readApprovedAccess() {
  return readJson(APPROVALS_FILE, []);
}

export async function writeApprovedAccess(entries) {
  await writeJson(APPROVALS_FILE, entries);
}

export async function isEmailApproved(email) {
  const normalized = String(email || '').trim().toLowerCase();
  const entries = await readApprovedAccess();
  return entries.some(entry => String(entry?.email || '').trim().toLowerCase() === normalized && entry?.status === 'approved');
}
