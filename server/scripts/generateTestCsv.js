import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { stringify } from 'csv-stringify/sync';
const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(here, '../../test-data/students_test.csv');
const records = Array.from({ length: 200 }, (_, i) => {
  const n = String(i + 1).padStart(4, '0');
  return { name: `Fictional Student ${String(i + 1).padStart(3, '0')}`, scholarNumber: `99${n}`, email: `student${n}@example.com` };
});
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, stringify(records, { header: true, columns: ['name', 'scholarNumber', 'email'] }), 'utf8');
console.info(`Generated ${records.length} fictional test students: ${output}`);
