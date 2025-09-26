#!/usr/bin/env node

/**
 * Simple Media Sync Performance Test
 * Tests the optimized media sync without requiring database indexes
 */

import SyncService from '../src/services/syncService.js';
import logger from '../src/utils/logger.js';
import { setProcessEnv } from '../src/config/credentials.js';

// Set up environment variables from credentials config
setProcessEnv();

async function testSyncPerformance() {
  console.log('🚀 Media Sync Performance Test');
  console.log('==============================\n');

  const syncService = new SyncService();

  try {
    // Test 1: Check database connection and get property count
    console.log('📊 Test 1: Database Connection and Property Count');
    console.log('=================================================');
    
    const dbStartTime = Date.now();
    const propertyCountResult = await syncService.database.client
      .from('Property')
      .select('ListingKey', { count: 'exact', head: true });
    
    const dbTime = Date.now() - dbStartTime;
    
    if (propertyCountResult.error) {
      console.error('❌ Database connection failed:', propertyCountResult.error.message);
      return;
    }
    
    const propertyCount = propertyCountResult.count || 0;
    console.log(`✅ Database connection successful (${dbTime}ms)`);
    console.log(`📊 Total properties in database: ${propertyCount.toLocaleString()}`);
    
    // Track the database query
    syncService.trackDatabaseQuery(dbTime, true);

    // Test 2: Test property streaming (small sample)
    console.log('\n📊 Test 2: Property Streaming Test');
    console.log('===================================');
    
    const streamStartTime = Date.now();
    let streamedProperties = 0;
    let streamBatches = 0;
    
    // Test streaming with a small batch size for demo
    for await (const propertyBatch of syncService.streamPropertyKeys(50)) {
      streamedProperties += propertyBatch.length;
      streamBatches++;
      
      // Limit to first 3 batches for testing
      if (streamBatches >= 3) break;
    }
    
    const streamTime = Date.now() - streamStartTime;
    
    console.log(`✅ Streamed ${streamedProperties} properties in ${streamBatches} batches (${streamTime}ms)`);
    console.log(`📈 Streaming rate: ${Math.round(streamedProperties / (streamTime / 1000))} properties/sec`);

    // Test 3: Performance metrics
    console.log('\n📊 Test 3: Performance Metrics');
    console.log('==============================');
    
    // Track memory usage
    syncService.trackMemoryUsage();
    
    // Get performance report
    const performanceReport = syncService.getPerformanceReport();
    
    console.log('\n📈 Current Performance Metrics:');
    console.log(`   Database Queries: ${performanceReport.databaseQueries.total} total`);
    console.log(`   Database Success Rate: ${performanceReport.databaseQueries.successRate}%`);
    console.log(`   Average Query Time: ${performanceReport.databaseQueries.averageQueryTime}ms`);
    console.log(`   Memory Usage: ${performanceReport.memoryUsage.currentMB}MB current, ${performanceReport.memoryUsage.peakMB}MB peak`);

    // Test 4: Configuration check
    console.log('\n📊 Test 4: Configuration Check');
    console.log('==============================');
    
    console.log('📋 Current Configuration:');
    console.log(`   Media API Batch Size: ${syncService.config.media.batchSize}`);
    console.log(`   Media Property Batch Size: ${syncService.config.media.propertyBatchSize}`);
    console.log(`   Media DB Batch Size: ${syncService.config.media.dbBatchSize}`);
    console.log(`   Media Throttle Delay: ${syncService.config.media.throttleDelay}ms`);

    // Recommendations
    console.log('\n💡 Recommendations:');
    console.log('===================');
    
    if (propertyCount > 0) {
      console.log('✅ Database has properties - ready for media sync');
      console.log('📈 To optimize further:');
      console.log('   1. Run the SQL indexes from database/manual-indexes.sql in your Supabase dashboard');
      console.log('   2. Then run a full media sync to see the performance improvements');
    } else {
      console.log('⚠️  No properties found in database');
      console.log('   Please sync properties first before testing media sync');
    }
    
    if (performanceReport.databaseQueries.averageQueryTime > 1000) {
      console.log('⚠️  Database queries are slow (>1s average)');
      console.log('   Creating indexes will significantly improve this');
    } else {
      console.log('✅ Database query performance looks good');
    }
    
    if (performanceReport.memoryUsage.currentMB > 200) {
      console.log('⚠️  Memory usage is high');
      console.log('   The streaming optimizations will help reduce this');
    } else {
      console.log('✅ Memory usage is reasonable');
    }

    console.log('\n🎉 Performance test completed successfully!');
    console.log('\n🚀 Next Steps:');
    console.log('1. If you want maximum performance, run the SQL indexes from database/manual-indexes.sql');
    console.log('2. Start a media sync: syncService.syncMediaInBatches()');
    console.log('3. Monitor the performance metrics during sync');

  } catch (error) {
    console.error('❌ Performance test failed:', error.message);
    logger.error('Performance test failed', { error: error.message });
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
  process.exit(1);
});

// Run the test
testSyncPerformance().catch(console.error);
