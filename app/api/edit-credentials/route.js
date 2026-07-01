import { NextResponse } from 'next/server';

export function GET() {
  const user = process.env.EDIT_USER;
  const password = process.env.EDIT_PASSWORD;

  if (!user || !password) {
    return NextResponse.json(
      { error: 'Missing EDIT_USER or EDIT_PASSWORD' },
      { status: 503 },
    );
  }

  return NextResponse.json({ user, password }, {
    headers: {
      'cache-control': 'no-store',
    },
  });
}
