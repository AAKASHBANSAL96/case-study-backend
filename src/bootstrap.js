import bcrypt from 'bcryptjs';
import { User } from './models.js';

// Idempotent: safe to run at every local server start or Lambda cold start.
export async function ensureConfiguredAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return false;
  const existing = await User.findOne({ email });
  if (existing) return false;
  await User.create({ email, passwordHash: await bcrypt.hash(password, 12), role: 'admin' });
  console.log(`Created configured admin: ${email}`);
  return true;
}
