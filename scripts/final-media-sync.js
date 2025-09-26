#!/usr/bin/env node

/**
 * Final Media Sync - Simple and Effective Approach
 * This script uses the existing enhanced sync service but with proper configuration
 * Focuses on syncing media efficiently without overcomplicating the approach
 */

import SyncService from '../src/services/syncService.js';
import { setProcessEnv } from '../src/config/credentials.js';

// Set up environment variables from credentials config
setProcessEnv();

class FinalMediaSync {
  constructor() {
    this.syncService = new SyncService();
    this.stats = {
      startTime: null,
      endTime: null,
      totalMediaUpserted: 0,
      errors: 0
    };
  }

  async syncMediaForExistingProperties() {
    console.log('🎯 Final Media Sync - Simple and Effective');
    console.log('=========================================\n');

    this.stats.startTime = Date.now();

    try {
      // Use the existing enhanced sync service with optimized media sync
      console.log('📊 Starting optimized media sync...');
      
      const result = await this.syncService.syncMediaInBatches({
        useOptimizedApproach: true,
        testMode: false, // Set to true for testing
        maxProperties: null // No limit - sync all properties
      });

      this.stats.endTime = Date.now();
      this.stats.totalMediaUpserted = result.totalFetched || 0;
      this.stats.errors = result.errors || 0;

      this.printFinalStats(result);

    } catch (error) {
      console.error('❌ Media sync failed:', error.message);
      this.stats.endTime = Date.now();
      this.stats.errors++;
      throw error;
    }
  }

  printFinalStats(result) {
    const duration = Math.round((this.stats.endTime - this.stats.startTime) / 1000);
    const mediaPerSecond = this.stats.totalMediaUpserted > 0 ? Math.round(this.stats.totalMediaUpserted / duration) : 0;

    console.log('\n🎉 Final Media Sync Completed!');
    console.log('==============================');
    console.log(`⏱️  Duration: ${duration} seconds`);
    console.log(`📸 Media Fetched: ${result.totalFetched || 0}`);
    console.log(`💾 Media Upserted: ${result.successful || 0}`);
    console.log(`❌ Errors: ${result.errors || 0}`);
    console.log(`📊 Media/sec: ${mediaPerSecond}`);
    
    if (result.errors && result.errors > 0) {
      console.log(`⚠️  ${result.errors} errors occurred during sync`);
    } else {
      console.log('✅ No errors occurred during sync');
    }

    // Additional stats from the sync service
    if (result.totalProperties) {
      console.log(`🏠 Properties Processed: ${result.totalProperties}`);
    }

    if (result.totalProcessed) {
      console.log(`📊 Total Processed: ${result.totalProcessed}`);
    }

    // Performance report
    try {
      const performanceReport = this.syncService.getPerformanceReport();
      console.log('\n📊 Performance Report:');
      console.log(`   API Requests: ${performanceReport.apiRequests.total} (${performanceReport.apiRequests.successRate}% success)`);
      console.log(`   Database Queries: ${performanceReport.databaseQueries.total} (${performanceReport.databaseQueries.successRate}% success)`);
      console.log(`   Memory Usage: ${performanceReport.memoryUsage.currentMB}MB (Peak: ${performanceReport.memoryUsage.peakMB}MB)`);
      console.log(`   Batch Processing: ${performanceReport.batchProcessing.totalBatches} batches`);
    } catch (error) {
      console.log('⚠️  Could not get performance report:', error.message);
    }
  }
}

// Run the final media sync
async function runFinalMediaSync() {
  const sync = new FinalMediaSync();
  
  try {
    await sync.syncMediaForExistingProperties();
  } catch (error) {
    console.error('❌ Sync failed:', error.message);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the sync
runFinalMediaSync().catch(console.error);
