import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStudentCsv, validateRows, makeFailureCsv } from '../src/services/csvImport.js';
import { normalizeScholarNumber } from '../src/utils/normalize.js';
import { assertSafeSeedTarget } from '../src/utils/seedSafety.js';
const csv = (text) => Buffer.from(text, 'utf8');

test('valid CSV imports every valid row in the preview result', () => {
  const rows = parseStudentCsv(csv('name,scholarNumber,email\nA Person,00120,a@example.com\nB Person,00121,\n'));
  const summary = validateRows(rows);
  assert.equal(summary.totalRows, 2); assert.equal(summary.candidates.length, 2); assert.equal(summary.invalidRejected, 0); assert.equal(summary.candidates[0].scholarNumber, '00120');
});
test('missing required columns are rejected', () => { assert.throws(() => parseStudentCsv(csv('name,email\nA,a@example.com')), /missing required column.*scholarNumber/i); });
test('missing names and scholar numbers are reported as invalid rows', () => {
  const summary = validateRows(parseStudentCsv(csv('name,scholarNumber,email\n,123,a@example.com\nNo number,,\n')));
  assert.equal(summary.invalidRejected, 2); assert.match(summary.failures[0].reason, /name/i); assert.match(summary.failures[1].reason, /scholar number/i);
});
test('duplicate scholar numbers in one file are skipped and counted', () => {
  const summary = validateRows(parseStudentCsv(csv('name,scholarNumber,email\nA,001,a@example.com\nB, 001 ,b@example.com')));
  assert.equal(summary.candidates.length, 1); assert.equal(summary.duplicateSkipped, 1); assert.equal(summary.failures[0].category, 'duplicate');
});
test('existing database scholar numbers are not duplicated', () => {
  const summary = validateRows(parseStudentCsv(csv('name,scholarNumber,email\nA,ABC-1,a@example.com')) , new Set(['ABC-1']));
  assert.equal(summary.candidates.length, 0); assert.equal(summary.existingSkipped, 1);
});
test('leading zeroes are preserved while whitespace and case are normalized', () => {
  const summary = validateRows(parseStudentCsv(csv('name,scholarNumber,email\nA, 0012ab ,')));
  assert.equal(summary.candidates[0].scholarNumber, '0012AB'); assert.equal(normalizeScholarNumber(' 0012ab '), '0012AB');
});
test('empty files and header-only files are handled gracefully', () => {
  assert.throws(() => parseStudentCsv(Buffer.alloc(0)), /empty/i);
  const summary = validateRows(parseStudentCsv(csv('name,scholarNumber,email\n')));
  assert.equal(summary.totalRows, 0); assert.equal(summary.candidates.length, 0);
});
test('malformed CSV returns a useful validation error', () => { assert.throws(() => parseStudentCsv(csv('name,scholarNumber,email\n"unclosed,123,x@example.com')), /Malformed CSV/i); });
test('mixed valid, invalid, duplicate, and existing rows have accurate counts and safe failure report', () => {
  const rows = parseStudentCsv(csv('name,scholarNumber,email\nA,501,a@example.com\n,502,b@example.com\nC,501,c@example.com\nD,503,d@example.com\n'));
  const summary = validateRows(rows, new Set(['503']));
  assert.equal(summary.totalRows, 4); assert.equal(summary.candidates.length, 1); assert.equal(summary.invalidRejected, 1); assert.equal(summary.duplicateSkipped, 1); assert.equal(summary.existingSkipped, 1);
  const report = makeFailureCsv(summary.failures); assert.match(report, /reason/); assert.match(report, /D,503,d@example.com/); assert.match(report, /already exists/);
  const formula = makeFailureCsv([{ name: '=SUM(A1:A2)', scholarNumber: '1', email: '', rowNumber: 2, category: 'invalid', reason: 'bad' }]); assert.match(formula, /'=SUM/);
});
test('retrying the same import is safe because already-added numbers become existing rows', () => {
  const rows = parseStudentCsv(csv('name,scholarNumber,email\nRetry User,00777,try@example.com'));
  assert.equal(validateRows(rows).candidates.length, 1);
  const retry = validateRows(rows, new Set(['00777'])); assert.equal(retry.candidates.length, 0); assert.equal(retry.existingSkipped, 1);
});
test('large imports are capped at 10,000 data rows', () => {
  const data = ['name,scholarNumber,email', ...Array.from({ length: 10001 }, (_, i) => `Fictional ${i},${i},f${i}@example.com`)].join('\n');
  assert.throws(() => parseStudentCsv(csv(data)), /10,000 data rows/i);
});
test('development and test seed targets are isolated; production seed is refused', () => {
  assert.equal(assertSafeSeedTarget('development', 'mongodb://localhost:27017/spark_quiz_dev'), true);
  assert.equal(assertSafeSeedTarget('test', 'mongodb://localhost:27017/spark_quiz_test'), true);
  assert.throws(() => assertSafeSeedTarget('production', 'mongodb+srv://host/spark_quiz_dev'), /production/i);
  assert.throws(() => assertSafeSeedTarget('development', 'mongodb://localhost:27017/prod'), /refusing to seed/i);
});
