import { NextResponse } from 'next/server';

export function GET() {
  const user = process.env.EDIT_USER || 'jldv1508';
  const password = process.env.EDIT_PASSWORD || 'Jldv1508-Edicion-7Qk4!mP9';

  return NextResponse.json({ user, password }, {
    headers: {
      'cache-control': 'no-store',
    },
  });
}
