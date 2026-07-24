import ZAI from 'z-ai-web-dev-sdk';
import { writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Create a ZAI SDK instance.
 * 
 * On Vercel/serverless: writes config from env vars to cwd/.z-ai-config
 * so that ZAI.create() can find it. The .z-ai-config file is also included
 * in the deployment as a fallback.
 * 
 * Locally: uses existing .z-ai-config in project root (or /etc/ fallback).
 */
export async function createZAI(): Promise<ZAI> {
  const baseUrl = process.env.ZAI_BASE_URL;
  const apiKey = process.env.ZAI_API_KEY;
  const token = process.env.ZAI_TOKEN;
  const userId = process.env.ZAI_USER_ID;
  const chatId = process.env.ZAI_CHAT_ID;

  // If env vars are set, write/update the config file that ZAI.create() reads
  // This ensures the config is always fresh and available
  if (baseUrl && apiKey) {
    const config = JSON.stringify({ baseUrl, apiKey, token, userId, chatId });
    try {
      writeFileSync(join(process.cwd(), '.z-ai-config'), config);
      console.log('[ZAI] Config written from env vars to cwd/.z-ai-config');
    } catch (writeErr) {
      // Vercel's cwd may be read-only — try /tmp as fallback
      // The SDK won't check /tmp, but we can try writing there anyway
      // as a last resort
      console.log('[ZAI] Could not write to cwd, config file from deployment will be used');
    }
  }

  // Call ZAI.create() which reads from cwd/.z-ai-config, ~/.z-ai-config, /etc/.z-ai-config
  try {
    const instance = await ZAI.create();
    console.log('[ZAI] SDK initialized successfully');
    return instance;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[ZAI] ZAI.create() failed:', msg);
    throw new Error(
      `ZAI SDK initialization failed. Ensure .z-ai-config file exists in the project, or set ZAI_BASE_URL + ZAI_API_KEY env vars. Details: ${msg}`
    );
  }
}
