function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function ownerEmail() {
  return normalizeEmail(process.env.ACCESS_APPROVER_EMAIL || 'jldv1508@icloud.com');
}

export function isOwnerEmail(value) {
  return normalizeEmail(value) === ownerEmail();
}
