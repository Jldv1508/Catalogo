import nodemailer from 'nodemailer';

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

export function mailerReady() {
  return Boolean(transportConfig());
}

export async function sendAccessRequestEmail({ requesterEmail, approveUrl, denyUrl, requestId }) {
  const config = transportConfig();
  const approver = process.env.ACCESS_APPROVER_EMAIL || 'bisut2U@icloud.com';
  if (!config) {
    throw new Error('SMTP_NOT_CONFIGURED');
  }

  const transporter = nodemailer.createTransport(config);
  await transporter.sendMail({
    from: process.env.SMTP_FROM || approver,
    to: approver,
    subject: `Solicitud de acceso al catalogo: ${requesterEmail}`,
    text: [
      `Se ha solicitado acceso al catalogo con el email: ${requesterEmail}`,
      `ID de solicitud: ${requestId}`,
      '',
      `Aprobar: ${approveUrl}`,
      `Denegar: ${denyUrl}`,
    ].join('\n'),
    html: `
      <p>Se ha solicitado acceso al catalogo con el email <strong>${requesterEmail}</strong>.</p>
      <p>ID de solicitud: <code>${requestId}</code></p>
      <p><a href="${approveUrl}">Aprobar acceso</a></p>
      <p><a href="${denyUrl}">Denegar acceso</a></p>
    `,
  });
}

export async function sendOwnerSignInEmail({ signInUrl }) {
  const config = transportConfig();
  const approver = process.env.ACCESS_APPROVER_EMAIL || 'bisut2U@icloud.com';
  if (!config) {
    throw new Error('SMTP_NOT_CONFIGURED');
  }

  const transporter = nodemailer.createTransport(config);
  await transporter.sendMail({
    from: process.env.SMTP_FROM || approver,
    to: approver,
    subject: 'Acceso seguro propietario al catalogo',
    text: [
      'Has solicitado acceso seguro como propietario.',
      '',
      `Entrar ahora: ${signInUrl}`,
      '',
      'Si no has sido tu, ignora este correo.',
    ].join('\n'),
    html: `
      <p>Has solicitado acceso seguro como propietario.</p>
      <p><a href="${signInUrl}">Entrar ahora</a></p>
      <p>Si no has sido tu, ignora este correo.</p>
    `,
  });
}
