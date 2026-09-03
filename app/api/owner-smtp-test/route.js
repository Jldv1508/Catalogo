import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { ownerEmail } from '../../../lib/owner-access.js';

function isLocalRequest(request) {
  const host = String(request.headers.get('host') || '').toLowerCase();
  const forwarded = String(request.headers.get('x-forwarded-host') || '').toLowerCase();
  const candidates = [host, forwarded];
  const localPatterns = [
    /^localhost(?::\d+)?$/i,
    /^127\.0\.0\.1(?::\d+)?$/i,
    /^\[::1\](?::\d+)?$/i,
    /\.local(?::\d+)?$/i,
  ];
  if (candidates.some(candidate => localPatterns.some(pattern => pattern.test(candidate)))) {
    return true;
  }
  return process.env.NODE_ENV !== 'production';
}

function transportConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return {
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  };
}

export async function GET(request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json({ ok: false, error: 'LOCALHOST_ONLY' }, { status: 403 });
  }

  const to = ownerEmail();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || to;
  const config = transportConfig();
  if (!config) {
    return NextResponse.json({
      ok: false,
      error: 'SMTP_NOT_CONFIGURED',
      configured: false,
      to,
      from,
    });
  }

  let verifyOk = false;
  let verifyError = null;
  let sendOk = false;
  let sendError = null;
  let messageId = null;

  const transporter = nodemailer.createTransport(config);
  try {
    await transporter.verify();
    verifyOk = true;
  } catch (err) {
    verifyError = err instanceof Error
      ? { message: err.message, code: err?.code || null, response: err?.response || null }
      : { message: String(err) };
  }

  if (verifyOk) {
    try {
      const info = await transporter.sendMail({
        from,
        to,
        subject: 'Prueba SMTP propietario',
        text: 'Prueba de envio desde la ruta /api/owner-smtp-test. Si has recibido este correo, el envio funciona correctamente.',
      });
      sendOk = true;
      messageId = info?.messageId || null;
    } catch (err) {
      sendError = err instanceof Error
        ? { message: err.message, code: err?.code || null, response: err?.response || null }
        : { message: String(err) };
    }
  }

  return NextResponse.json({
    ok: verifyOk && sendOk,
    configured: true,
    to,
    from,
    host: config.host,
    port: config.port,
    secure: config.secure,
    verifyOk,
    verifyError,
    sendOk,
    sendError,
    messageId,
  });
}
