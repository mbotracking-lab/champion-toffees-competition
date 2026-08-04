import ZAI from 'z-ai-web-dev-sdk';
import { readFileSync } from 'fs';

/**
 * Create a ZAI SDK instance that works on both Vercel and local environments.
 *
 * Strategy:
 * 1. If ZAI env vars (ZAI_BASE_URL + ZAI_API_KEY) are set → construct ZAI directly
 * 2. If .z-ai-config file exists in project root → read it and construct ZAI directly
 * 3. Fall back to ZAI.create() which reads from cwd/.z-ai-config, ~/.z-ai-config, /etc/.z-ai-config
 *
 * Note: The ZAI class has a "private" constructor in TypeScript, but JavaScript does NOT
 * enforce private constructors at runtime. So `new ZAI(config)` works perfectly in practice.
 */
export async function createZAI(): Promise<ZAI> {
  // Strategy 1: Use environment variables (best for Vercel)
  const baseUrl = process.env.ZAI_BASE_URL;
  const apiKey = process.env.ZAI_API_KEY;
  const token = process.env.ZAI_TOKEN;
  const userId = process.env.ZAI_USER_ID;
  const chatId = process.env.ZAI_CHAT_ID;

  if (baseUrl && apiKey) {
    console.log('[ZAI] Initializing from env vars:', baseUrl);
    // Runtime bypass of "private" constructor — works in JS even if TS complains
    const config = { baseUrl, apiKey, token, userId, chatId };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new (ZAI as any)(config) as ZAI;
  }

  // Strategy 2: Read .z-ai-config file from fixed locations
  // Use static paths to avoid Turbopack "very dynamic requires" errors
  try {
    const configPaths = [
      // process.cwd() is fine at runtime, but we avoid path.join(process.cwd(), dynamicVar)
      // which Turbopack can't statically analyze. Inline the path concatenation instead.
      process.cwd() + '/.z-ai-config',
      '/etc/.z-ai-config',
    ];

    for (const configPath of configPaths) {
      try {
        const configStr = readFileSync(configPath, 'utf-8');
        const configObj = JSON.parse(configStr);
        if (configObj.baseUrl && configObj.apiKey) {
          console.log('[ZAI] Initializing from config file:', configPath);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return new (ZAI as any)(configObj) as ZAI;
        }
      } catch {
        // File not found at this path, try next
      }
    }
  } catch (fileErr) {
    console.log('[ZAI] Could not read config files:', fileErr instanceof Error ? fileErr.message : String(fileErr));
  }

  // Strategy 3: Fall back to ZAI.create() (uses async loadConfig with 3 fixed paths)
  console.log('[ZAI] Env vars not set, config files not found, falling back to ZAI.create()');
  try {
    const instance = await ZAI.create();
    console.log('[ZAI] ZAI.create() succeeded');
    return instance;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[ZAI] All strategies failed. ZAI.create() error:', msg);
    throw new Error(
      `ZAI SDK initialization failed. Set ZAI_BASE_URL + ZAI_API_KEY env vars on Vercel, or ensure .z-ai-config file exists. Details: ${msg}`
    );
  }
}
