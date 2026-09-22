import 'dotenv/config';
import app from './app.js';
import { connectDb } from './db.js';
import { ensureConfiguredAdmin } from './bootstrap.js';

await connectDb();
await ensureConfiguredAdmin();
app.listen(process.env.PORT || 3001, () => console.log(`API listening on ${process.env.PORT || 3001}`));
