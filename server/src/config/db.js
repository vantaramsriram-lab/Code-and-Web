import mongoose from 'mongoose';
import { env } from './env.js';
export async function connectDB(uri = env.MONGODB_URI) {
  mongoose.set('sanitizeFilter', true);
  await mongoose.connect(uri, { maxPoolSize: 30, minPoolSize: 2, serverSelectionTimeoutMS: 10000, autoIndex: false });
  console.info(JSON.stringify({ level: 'info', event: 'mongo_connected', database: mongoose.connection.name }));
}
