import dotenv from 'dotenv';
import mongoose from 'mongoose';
dotenv.config({ path: new URL('../.env', import.meta.url) });

try {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set in backend/.env');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  const collections = await mongoose.connection.db.listCollections().toArray();
  const counts = Object.fromEntries(await Promise.all(['checks', 'uploads', 'clearevents'].map(async name => [name, collections.some(x => x.name === name) ? await mongoose.connection.db.collection(name).countDocuments() : 0])));
  console.log(JSON.stringify({ connected: true, database: mongoose.connection.name, collections: collections.map(x => x.name), counts }));
} catch (error) {
  console.error(JSON.stringify({ connected: false, error: error.message }));
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
