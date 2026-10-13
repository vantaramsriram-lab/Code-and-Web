export function normalizeScholarNumber(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, '').toUpperCase();
}
export function escapeCsvCell(value) {
  const text = String(value ?? '');
  return /^[\s\u0000-\u001f]*[=+@-]/.test(text) ? `'${text}` : text;
}
