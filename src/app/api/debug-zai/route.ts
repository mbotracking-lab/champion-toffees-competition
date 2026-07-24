import { NextResponse } from 'next/server';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import os from 'os';

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
      DATABASE_URL: process.env.DATABASE_URL ? `SET (${process.env.DATABASE_URL.substring(0, 30)}...)` : 'NOT SET',
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
  const dbUrl = process.env.DATABASE_URL;
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

  return NextResponse.json(diagnostics);
}
