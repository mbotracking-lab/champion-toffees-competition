#!/usr/bin/env node
/**
 * VLM Validation Scheduler
 * 
 * Runs the batch validation script every 30 minutes in the background.
 * Uses Node.js setInterval since crontab is not available in this environment.
 * 
 * Usage: node scripts/validate-scheduler.mjs [--interval=30]
 *   --interval=N  : Run every N minutes (default: 30, minimum: 5)
 */

import { execSync } from 'child_process';
import { readFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

const LOG_FILE = join(PROJECT_ROOT, 'scripts', 'validation-scheduler.log');
const VALIDATE_SCRIPT = join(PROJECT_ROOT, 'scripts', 'validate-pending-entries.mjs');

// Parse args
const args = process.argv.slice(2);
const INTERVAL_MINUTES = Math.max(5, parseInt(
  args.find(a => a.startsWith('--interval='))?.split('=')[1] || '30', 10
));

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  appendFileSync(LOG_FILE, line);
  console.log(line.trim());
}

function runValidation() {
  log('▶ Starting scheduled validation run...');
  try {
    const output = execSync(
      `node "${VALIDATE_SCRIPT}" --limit=50`,
      { cwd: PROJECT_ROOT, timeout: 300000, encoding: 'utf-8' }
    );
    // Parse the summary from output
    const summaryMatch = output.match(/Processed: (\d+)/);
    const confirmedMatch = output.match(/Confirmed: (\d+)/);
    const rejectedMatch = output.match(/Rejected: (\d+)/);
    const errorMatch = output.match(/Errors.*: (\d+)/);
    
    log(`✅ Validation completed — Processed: ${summaryMatch?.[1] || 0}, Confirmed: ${confirmedMatch?.[1] || 0}, Rejected: ${rejectedMatch?.[1] || 0}, Errors: ${errorMatch?.[1] || 0}`);
  } catch (err) {
    log(`❌ Validation run failed: ${err.message?.substring(0, 200)}`);
  }
}

// ─── Startup ───
log('========================================');
log(`VLM Validation Scheduler started`);
log(`Interval: every ${INTERVAL_MINUTES} minutes`);
log(`Next run in ${INTERVAL_MINUTES} minutes`);
log('========================================');

// Run immediately on startup
runValidation();

// Schedule recurring runs
const intervalMs = INTERVAL_MINUTES * 60 * 1000;
setInterval(() => {
  runValidation();
}, intervalMs);

// Keep the process alive
process.on('SIGINT', () => {
  log('Scheduler stopped by SIGINT');
  process.exit(0);
});
process.on('SIGTERM', () => {
  log('Scheduler stopped by SIGTERM');
  process.exit(0);
});

log(`Scheduler running. Next run in ${INTERVAL_MINUTES} minutes.`);
