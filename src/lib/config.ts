import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Get the DATABASE_URL for Neon PostgreSQL.
 *
 * Strategy:
 * 1. If DATABASE_URL env var is set → use it (standard Vercel env var approach)
 * 2. If .z-ai-config file has a "databaseUrl" field → use it
 * 3. Return null (caller must handle missing DB)
 *
 * This allows the database URL to be embedded in the .z-ai-config file
 * which IS deployed to Vercel (unlike env vars which need dashboard setup).
 */
export function getDatabaseUrl(): string | null {
  // Strategy 1: Environment variable
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  // Strategy 2: Read from .z-ai-config file
  try {
    const configPaths = [
      join(process.cwd(), '.z-ai-config'),
      '/etc/.z-ai-config',
    ];

    for (const configPath of configPaths) {
      try {
        const configStr = readFileSync(configPath, 'utf-8');
        const configObj = JSON.parse(configStr);
        if (configObj.databaseUrl) {
          console.log('[config] DATABASE_URL read from config file:', configPath);
          return configObj.databaseUrl;
        }
      } catch {
        // File not found at this path, try next
      }
    }
  } catch (fileErr) {
    console.log('[config] Could not read config files:', fileErr instanceof Error ? fileErr.message : String(fileErr));
  }

  console.log('[config] DATABASE_URL not found in env vars or config file');
  return null;
}

/**
 * Get admin credentials from env vars or config file.
 */
export function getAdminCredentials(): { username: string; password: string } {
  return {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'champion2026',
  };
}
