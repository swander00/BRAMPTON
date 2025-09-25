#!/usr/bin/env node

/**
 * Quick Backfill Runner
 * Sets up environment and executes the backfill sync
 */

import { setProcessEnv, config } from './src/config/credentials.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Load hardcoded configuration
setProcessEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 AMPRE Backfill Sync Runner');
console.log('================================\n');

console.log('✅ Using hardcoded configuration!');
console.log(`📍 Supabase URL: ${config.supabase.url}`);
console.log(`🔑 API Token: ${config.ampre.tokens.access ? 'Set' : 'Missing'}`);
console.log('');

// Import and run backfill
console.log('🔄 Starting backfill synchronization...');
console.log('This may take several minutes depending on data volume.\n');

try {
  const { default: BackfillSync } = await import('./src/scripts/backfill-sync.js');
  
  const backfill = new BackfillSync();
  
  // Parse command line options
  const args = process.argv.slice(2);
  const options = {
    saveToFiles: args.includes('--save-files'),
    resetDatabase: args.includes('--reset-db'),
    syncProperties: !args.includes('--no-properties'),
    syncMedia: !args.includes('--no-media')
  };

  console.log('Options:', options);
  console.log('');

  const report = await backfill.execute(options);
  
  console.log('\n🎉 BACKFILL COMPLETED SUCCESSFULLY!');
  console.log('===================================');
  console.log(`Properties synced: ${report.properties.successful}/${report.properties.total} (${report.properties.successRate}%)`);
  console.log(`Media synced: ${report.media.successful}/${report.media.total} (${report.media.successRate}%)`);
  console.log(`Total duration: ${report.summary.duration.minutes} minutes`);
  console.log(`Overall success rate: ${report.summary.overall.successRate}%`);
  
  if (report.properties.failed > 0 || report.media.failed > 0) {
    console.log('\n⚠️  Some records failed to sync. Check logs for details.');
  }

} catch (error) {
  console.error('\n❌ BACKFILL FAILED!');
  console.error('==================');
  console.error('Error:', error.message);
  console.log('\nPossible solutions:');
  console.log('1. Check your Supabase credentials and permissions');
  console.log('2. Verify your AMPRE API token is valid');
  console.log('3. Ensure your database tables are created (run the SQL in database/create-tables.sql)');
  console.log('4. Check the logs for more detailed error information');
  
  process.exit(1);
}
