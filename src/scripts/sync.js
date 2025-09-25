#!/usr/bin/env node

/**
 * Enhanced Sync Script with 5000-record batching and improved console output
 * Usage: node src/scripts/sync.js [options]
 * Options:
 *   --idx          : Sync IDX feed
 *   --vow          : Sync VOW feed
 *   --media        : Sync only media
 *   --rooms        : Sync only rooms
 *   --openhouse    : Sync only open houses
 *   --incremental  : Perform incremental sync
 *   --scheduled    : Run scheduled sync
 *   --single <key> : Sync single property by ListingKey
 */

import { setProcessEnv } from '../config/credentials.js';
import EnhancedSyncService from '../services/enhancedSyncService.js';
import logger from '../utils/logger.js';

// Load configuration
setProcessEnv();

class EnhancedSyncScript {
  constructor() {
    this.syncService = new EnhancedSyncService();
  }

  async run() {
    const args = process.argv.slice(2);
    
    console.log('🚀 Enhanced Sync Script Started');
    console.log('━'.repeat(50));
    console.log(`📅 ${new Date().toISOString()}`);
    console.log(`🔧 Arguments: ${args.join(' ') || 'none'}`);
    console.log('━'.repeat(50));
    
    console.log('🔧 Initializing Enhanced Sync Service...');
    try {
      console.log('✅ Enhanced Sync Service initialized');
    } catch (initError) {
      console.error('❌ Failed to initialize Enhanced Sync Service:', initError.message);
      throw initError;
    }

    try {
      // Handle single property sync
      if (args.includes('--single')) {
        const keyIndex = args.indexOf('--single') + 1;
        if (keyIndex >= args.length) {
          throw new Error('--single requires a ListingKey argument');
        }
        const listingKey = args[keyIndex];
        await this.syncService.syncSingleProperty(listingKey);
        return;
      }

      // Handle IDX feed sync
      if (args.includes('--idx')) {
        console.log('🔄 Starting IDX feed sync...');
        await this.syncService.syncIdxFeed();
        return;
      }

      // Handle VOW feed sync
      if (args.includes('--vow')) {
        console.log('🔄 Starting VOW feed sync...');
        await this.syncService.syncVowFeed();
        return;
      }

      // Handle media only sync
      if (args.includes('--media')) {
        console.log('🔄 Starting media sync...');
        await this.syncService.syncMediaInBatches();
        return;
      }

      // Handle rooms only sync
      if (args.includes('--rooms')) {
        console.log('🔄 Starting rooms sync...');
        await this.syncService.syncRoomsInBatches();
        return;
      }

      // Handle open houses only sync
      if (args.includes('--openhouse')) {
        console.log('🔄 Starting open houses sync...');
        await this.syncService.syncOpenHousesInBatches();
        return;
      }

      // Handle incremental sync
      if (args.includes('--incremental')) {
        console.log('🔄 Starting incremental sync...');
        await this.syncService.executeIncrementalSync();
        return;
      }

      // Handle scheduled sync
      if (args.includes('--scheduled')) {
        console.log('🔄 Starting scheduled sync...');
        await this.syncService.executeScheduledSync();
        return;
      }

      // Full sync (default)
      console.log('🔄 Starting full sync...');
      await this.syncService.executeFullSync();

    } catch (error) {
      console.error('\n❌ Enhanced sync failed:');
      console.error(`   ${error.message}`);
      logger.error('Enhanced sync script failed', { error: error.message });
      process.exit(1);
    }
  }
}

// Handle graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Run if called directly
const normalizedArgv = process.argv[1].replace(/\\/g, '/');
if (import.meta.url === `file:///${normalizedArgv}`) {
  const script = new EnhancedSyncScript();
  script.run()
    .then(() => {
      console.log('\n✅ Enhanced sync completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Enhanced sync failed:', error.message);
      process.exit(1);
    });
}

export default EnhancedSyncScript;
