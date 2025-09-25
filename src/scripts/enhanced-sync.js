#!/usr/bin/env node

/**
 * Enhanced Sync Script with 5000-record batching and improved console output
 * Usage: node src/scripts/enhanced-sync.js [options]
 * Options:
 *   --properties-only : Sync only properties
 *   --media-only     : Sync only media  
 *   --single <key>   : Sync single property by ListingKey
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

      // Handle properties only
      if (args.includes('--properties-only')) {
        await this.syncService.syncPropertiesInBatches();
        return;
      }

      // Handle media only
      if (args.includes('--media-only')) {
        await this.syncService.syncMediaInBatches();
        return;
      }

      // Full sync (default)
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
if (import.meta.url === `file://${process.argv[1]}`) {
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
