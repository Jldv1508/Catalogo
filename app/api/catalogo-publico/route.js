import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

export async function GET() {
  const filePath = path.join(process.cwd(), 'public', 'catalogo-unificado.json');
  const raw = await readFile(filePath, 'utf8');
  const items = JSON.parse(raw);

  return NextResponse.json(items, {
    headers: {
      'cache-control': 'no-store',
    },
  });
}
