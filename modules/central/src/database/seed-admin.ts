/**
 * Seed Admin Script
 * 
 * Creates the initial superadmin account.
 * Usage: npm run seed:admin
 * 
 * Environment variables or interactive prompts for:
 * - ADMIN_USERNAME (default: admin)
 * - ADMIN_PASSWORD (required)
 */
import { query, closePool, checkConnection } from './postgres.js';
import { migrate } from './migrate.js';
import { hashPassword } from '../utils/password.js';
import { logger } from '../utils/logger.js';
import * as readline from 'readline';

async function prompt(question: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function seedAdmin(): Promise<void> {
  logger.info('Stellarity — Admin Seed Script');
  logger.info('─────────────────────────────────');

  // Connect to database
  const dbOk = await checkConnection();
  if (!dbOk) {
    logger.error('Cannot connect to database. Is PostgreSQL running?');
    process.exit(1);
  }

  // Run migrations first
  await migrate();

  // Get credentials
  const username = process.env.ADMIN_USERNAME || await prompt('Admin username [admin]: ') || 'admin';
  const password = process.env.ADMIN_PASSWORD || await prompt('Admin password: ');

  if (!password || password.length < 8) {
    logger.error('Password must be at least 8 characters');
    process.exit(1);
  }

  // Check if admin already exists
  const existing = await query(
    'SELECT id FROM admins WHERE LOWER(username) = LOWER($1)',
    [username]
  );

  if (existing.rows.length > 0) {
    logger.warn(`Admin "${username}" already exists. Skipping.`);
    await closePool();
    return;
  }

  // Create superadmin
  const passwordHash = await hashPassword(password);

  await query(
    `INSERT INTO admins (username, password_hash, display_name, role)
     VALUES ($1, $2, $3, 'superadmin')`,
    [username.toLowerCase(), passwordHash, username]
  );

  logger.info(`✓ Superadmin "${username}" created successfully`);
  logger.info('You can now log in to the admin panel with these credentials.');

  await closePool();
}

seedAdmin().catch((error) => {
  logger.error('Seed failed:', error);
  process.exit(1);
});
