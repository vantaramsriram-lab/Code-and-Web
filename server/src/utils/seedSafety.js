import { HttpError } from './errors.js';
export function assertSafeSeedTarget(nodeEnv, uri) {
  if (nodeEnv === 'production') throw new Error('Refusing to seed fictional students in NODE_ENV=production.');
  if (!['development', 'test'].includes(nodeEnv)) throw new Error('Seeding is allowed only in development or test.');
  let dbName = '';
  try { dbName = decodeURIComponent(new URL(uri).pathname.replace(/^\//, '').split('/')[0] || ''); } catch { throw new Error('Could not determine MongoDB database name; refusing to seed.'); }
  const allowed = nodeEnv === 'test' ? 'spark_quiz_test' : 'spark_quiz_dev';
  if (dbName !== allowed) throw new Error(`Refusing to seed database "${dbName}". Development seed requires database "${allowed}".`);
  return true;
}
