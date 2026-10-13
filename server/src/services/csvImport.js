import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { normalizeScholarNumber, escapeCsvCell } from '../utils/normalize.js';
import { HttpError } from '../utils/errors.js';
const REQUIRED = ['name', 'scholarnumber'];
const ALLOWED = ['name', 'scholarnumber', 'email'];
export function parseStudentCsv(buffer) {
  if (!buffer?.length) throw new HttpError(400, 'The CSV file is empty.');
  let rows;
  try { rows = parse(buffer, { bom: true, skip_empty_lines: true, relax_quotes: false, trim: true, max_record_size: 100_000, skip_records_with_error: false }); }
  catch (error) { throw new HttpError(400, `Malformed CSV: ${error.message}`); }
  if (!rows.length) throw new HttpError(400, 'The CSV file has no header row.');
  const headers = rows[0].map((h) => String(h).trim());
  const headerIds = headers.map((h) => h.toLowerCase());
  const missing = REQUIRED.filter((h) => !headerIds.includes(h));
  const unknown = headerIds.filter((h) => !ALLOWED.includes(h));
  if (missing.length || unknown.length || new Set(headerIds).size !== headerIds.length) {
    const bits = [];
    if (missing.length) bits.push(`missing required column(s): ${missing.map((h) => h === 'scholarnumber' ? 'scholarNumber' : h).join(', ')}`);
    if (unknown.length) bits.push(`unrecognized column(s): ${unknown.join(', ')}`);
    if (new Set(headerIds).size !== headerIds.length) bits.push('duplicate column names');
    throw new HttpError(400, `Invalid CSV headers (${bits.join('; ')}). Expected name,scholarNumber,email.`);
  }
  const normalizedHeaders = headerIds.map((h) => h === 'scholarnumber' ? 'scholarNumber' : h);
  const records = [];
  for (let i = 1; i < rows.length; i++) {
    const values = rows[i];
    if (values.every((v) => String(v ?? '').trim() === '')) continue;
    if (values.length !== headers.length) throw new HttpError(400, `Malformed CSV at row ${i + 1}: expected ${headers.length} columns, found ${values.length}.`);
    const original = Object.fromEntries(headers.map((h, index) => [h, String(values[index] ?? '')]));
    const record = Object.fromEntries(normalizedHeaders.map((h, index) => [h, String(values[index] ?? '').trim()]));
    records.push({ rowNumber: i + 1, original, record });
    if (records.length > 10000) throw new HttpError(413, 'CSV files are limited to 10,000 data rows.');
  }
  return records;
}
export function validateRows(rows, existingNumbers = new Set()) {
  const seen = new Set();
  const result = { totalRows: rows.length, imported: 0, duplicateSkipped: 0, invalidRejected: 0, existingSkipped: 0, candidates: [], failures: [] };
  for (const row of rows) {
    const name = (row.record.name ?? '').trim();
    const rawScholar = row.record.scholarNumber ?? '';
    const scholarNumber = normalizeScholarNumber(rawScholar);
    const email = (row.record.email ?? '').trim().toLowerCase();
    let reason = '';
    if (!name) reason = 'Missing required name.';
    else if (name.length > 120) reason = 'Name is longer than 120 characters.';
    else if (!scholarNumber) reason = 'Missing required scholar number.';
    else if (scholarNumber.length > 40) reason = 'Scholar number is longer than 40 characters.';
    else if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) reason = 'Invalid email address.';
    else if (email.length > 254) reason = 'Email is longer than 254 characters.';
    if (reason) { result.invalidRejected++; result.failures.push({ ...row.original, rowNumber: row.rowNumber, reason, category: 'invalid' }); continue; }
    if (seen.has(scholarNumber)) { result.duplicateSkipped++; result.failures.push({ ...row.original, rowNumber: row.rowNumber, reason: 'Duplicate scholar number within this file.', category: 'duplicate' }); continue; }
    seen.add(scholarNumber);
    if (existingNumbers.has(scholarNumber)) { result.existingSkipped++; result.failures.push({ ...row.original, rowNumber: row.rowNumber, reason: 'Scholar number already exists in the database.', category: 'existing' }); continue; }
    result.candidates.push({ rowNumber: row.rowNumber, name, scholarNumber, email });
  }
  return result;
}
export function makeFailureCsv(failures) {
  if (!failures.length) return '';
  const records = failures.map((f) => ({ name: escapeCsvCell(f.name), scholarNumber: escapeCsvCell(f.scholarNumber), email: escapeCsvCell(f.email), rowNumber: f.rowNumber, category: f.category, reason: escapeCsvCell(f.reason) }));
  return stringify(records, { header: true, columns: ['name', 'scholarNumber', 'email', 'rowNumber', 'category', 'reason'] });
}
