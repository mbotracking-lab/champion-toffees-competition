import { NextResponse } from 'next/server';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import os from 'os';
import { getDatabaseUrl } from '@/lib/config';
import { createZAI } from '@/lib/zai';

// Diagnostic endpoint to debug ZAI config file issues on Vercel
export async function GET() {
  const cwd = process.cwd();
  const homeDir = os.homedir();
  
  const diagnostics: Record<string, any> = {
    cwd,
    homeDir,
    envVars: {
      ZAI_BASE_URL: process.env.ZAI_BASE_URL || 'NOT SET',
      ZAI_API_KEY: process.env.ZAI_API_KEY ? 'SET (hidden)' : 'NOT SET',
      ZAI_TOKEN: process.env.ZAI_TOKEN ? 'SET (hidden)' : 'NOT SET',
      ZAI_USER_ID: process.env.ZAI_USER_ID || 'NOT SET',
      ZAI_CHAT_ID: process.env.ZAI_CHAT_ID || 'NOT SET',
      DATABASE_URL_ENV: process.env.DATABASE_URL ? `SET (${process.env.DATABASE_URL.substring(0, 30)}...)` : 'NOT SET',
      DATABASE_URL_CONFIG: (() => { const url = getDatabaseUrl(); return url ? `SET (${url.substring(0, 30)}...)` : 'NOT SET'; })(),
      ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'NOT SET',
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ? 'SET (hidden)' : 'NOT SET',
    },
    configFileChecks: {},
  };

  // Check all paths where ZAI SDK looks for config
  const configPaths = [
    join(cwd, '.z-ai-config'),
    join(homeDir, '.z-ai-config'),
    '/etc/.z-ai-config',
  ];

  for (const p of configPaths) {
    try {
      const stat = statSync(p);
      const content = readFileSync(p, 'utf-8');
      const parsed = JSON.parse(content);
      diagnostics.configFileChecks[p] = {
        exists: true,
        size: stat.size,
        hasBaseUrl: Boolean(parsed.baseUrl),
        hasApiKey: Boolean(parsed.apiKey),
        baseUrl: String(parsed.baseUrl || ''),
      };
    } catch (e) {
      diagnostics.configFileChecks[p] = {
        exists: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  // Check what files are in cwd
  try {
    const cwdFiles = readdirSync(cwd);
    diagnostics.cwdFiles = cwdFiles.filter(f => f.startsWith('.z-ai') || f.startsWith('.env') || f === 'package.json');
  } catch (e) {
    diagnostics.cwdFilesError = e instanceof Error ? e.message : String(e);
  }

  // Try initializing ZAI and capture the result
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    
    // Strategy 1: Direct constructor from config file
    try {
      const configStr = readFileSync(join(cwd, '.z-ai-config'), 'utf-8');
      const configObj = JSON.parse(configStr);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const zaiDirect = new (ZAI as any)(configObj);
      diagnostics.directConstructor = {
        success: true,
        configKeys: Object.keys(zaiDirect),
      };
    } catch (e) {
      diagnostics.directConstructor = {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }

    // Strategy 2: ZAI.create()
    try {
      const zaiCreate = await ZAI.create();
      diagnostics.zaiCreate = {
        success: true,
        configKeys: Object.keys(zaiCreate),
      };
    } catch (e) {
      diagnostics.zaiCreate = {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  } catch (e) {
    diagnostics.zaiImportError = e instanceof Error ? e.message : String(e);
  }

  // Test database connectivity
  const dbUrl = getDatabaseUrl();
  if (dbUrl) {
    try {
      const { neon } = await import('@neondatabase/serverless');
      const sql = neon(dbUrl);
      const result = await sql`SELECT COUNT(*)::int as count FROM "CompetitionEntry"`;
      diagnostics.dbTest = { success: true, entryCount: result[0]?.count ?? 0 };
    } catch (dbErr) {
      diagnostics.dbTest = { success: false, error: dbErr instanceof Error ? dbErr.message : String(dbErr) };
    }

    try {
      const { neon } = await import('@neondatabase/serverless');
      const sql = neon(dbUrl);
      const tables = await sql`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public'
      `;
      diagnostics.dbTables = tables.map((t: Record<string, any>) => t.table_name);
    } catch (tblErr) {
      diagnostics.dbTablesError = tblErr instanceof Error ? tblErr.message : String(tblErr);
    }
  } else {
    diagnostics.dbTest = { success: false, error: 'DATABASE_URL not set' };
  }

  // Test direct fetch to ZAI API endpoint
  try {
    const configStr = readFileSync(join(cwd, '.z-ai-config'), 'utf-8');
    const configObj = JSON.parse(configStr);
    const baseUrl = configObj.baseUrl || 'https://internal-api.z.ai/v1';
    
    // Test 1: Simple GET to base URL
    try {
      const response = await fetch(baseUrl, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${configObj.token || ''}` },
      });
      diagnostics.directFetchTest = {
        success: true,
        status: response.status,
        statusText: response.statusText,
        url: baseUrl,
      };
    } catch (fetchErr) {
      diagnostics.directFetchTest = {
        success: false,
        error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
        errorCause: (fetchErr as any)?.cause?.message || (fetchErr as any)?.cause?.code || 'no cause',
        errorStack: fetchErr instanceof Error ? fetchErr.stack?.substring(0, 500) : undefined,
        url: baseUrl,
      };
    }

    // Test 2: POST to chat/completions endpoint with a simple text message
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${configObj.token || ''}`,
        },
        body: JSON.stringify({
          model: 'glm-4-plus',
          messages: [{ role: 'user', content: 'Say hello' }],
        }),
      });
      const bodyText = await response.text();
      diagnostics.chatCompletionsFetch = {
        success: true,
        status: response.status,
        bodyPreview: bodyText.substring(0, 300),
      };
    } catch (chatFetchErr) {
      diagnostics.chatCompletionsFetch = {
        success: false,
        error: chatFetchErr instanceof Error ? chatFetchErr.message : String(chatFetchErr),
        errorCause: (chatFetchErr as any)?.cause?.message || (chatFetchErr as any)?.cause?.code || 'no cause',
        errorStack: chatFetchErr instanceof Error ? chatFetchErr.stack?.substring(0, 500) : undefined,
      };
    }
  } catch (configErr) {
    diagnostics.directFetchTest = { success: false, error: 'Config file not found' };
  }

  // Test VLM vision call
  try {
    const zai = await createZAI();
    diagnostics.vlmInit = { success: true, instanceType: typeof zai };

    // Try a simple text-only chat completion first
    try {
      const textResponse = await zai.chat.completions.create({
        messages: [
          { role: 'user', content: 'Say "VLM test OK" in exactly those words.' }
        ],
        thinking: { type: 'disabled' },
      });
      diagnostics.vlmTextTest = {
        success: true,
        response: textResponse.choices?.[0]?.message?.content || 'no content',
        model: textResponse.model || 'unknown',
      };
    } catch (textErr) {
      diagnostics.vlmTextTest = {
        success: false,
        error: textErr instanceof Error ? textErr.message : String(textErr),
        errorStack: textErr instanceof Error ? textErr.stack?.substring(0, 500) : undefined,
      };
    }

    // Try a vision call with a tiny test image
    try {
      // Create a minimal 1x1 red pixel PNG
      const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';
      const visionResponse = await zai.chat.completions.createVision({
        model: 'glm-4v-plus',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What color is this image? Reply with just the color name.' },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${tinyPng}` } },
            ],
          },
        ],
        thinking: { type: 'disabled' },
      });
      diagnostics.vlmVisionTest = {
        success: true,
        response: visionResponse.choices?.[0]?.message?.content || 'no content',
        model: visionResponse.model || 'unknown',
      };
    } catch (visionErr) {
      diagnostics.vlmVisionTest = {
        success: false,
        error: visionErr instanceof Error ? visionErr.message : String(visionErr),
        errorStack: visionErr instanceof Error ? visionErr.stack?.substring(0, 500) : undefined,
      };
    }
  } catch (zaiErr) {
    diagnostics.vlmInit = {
      success: false,
      error: zaiErr instanceof Error ? zaiErr.message : String(zaiErr),
    };
  }

  return NextResponse.json(diagnostics);
}
