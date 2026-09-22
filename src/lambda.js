import serverless from 'serverless-http';
import app from './app.js';
import { connectDb } from './db.js';
import { ensureConfiguredAdmin } from './bootstrap.js';

const server = serverless(app);
export const handler = async (event, context) => {
  await connectDb();
  await ensureConfiguredAdmin();
  return server(event, context);
};
