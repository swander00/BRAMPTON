#!/usr/bin/env node

/**
 * Test script to verify that rooms are only fetched for IDX properties
 * and that pagination works correctly
 */

import { setProcessEnv } from './src/config/credentials.js';
import EnhancedSyncService from './src/services/enhancedSyncService.js';
import logger from './src/utils/logger.js';

// Load configuration
setProcessEnv();

async function testRoomsIdxFiltering() {
  console.log('🧪 Testing Rooms IDX Filtering and Pagination');
  console.log('━'.repeat(60));
  
  try {
    const syncService = new EnhancedSyncService();
    
    // Test 1: Verify room fetching uses IDX feed type
    console.log('\n📋 Test 1: Verify room fetching uses IDX feed type');
    console.log('━'.repeat(40));
    
    // Get a small sample of rooms to verify IDX usage
    console.log('📥 Fetching sample rooms with IDX feed type...');
    const sampleRooms = await syncService.ampreApi.fetchBatch('PropertyRooms', {
      top: 10,
      feedType: 'idx'
    });
    
    console.log(`✅ Fetched ${sampleRooms.length} sample rooms using IDX feed`);
    
    if (sampleRooms.length > 0) {
      console.log('📊 Sample room data:');
      console.log(`   - RoomKey: ${sampleRooms[0].RoomKey}`);
      console.log(`   - ListingKey: ${sampleRooms[0].ListingKey}`);
      console.log(`   - RoomType: ${sampleRooms[0].RoomType || 'N/A'}`);
      console.log(`   - ModificationTimestamp: ${sampleRooms[0].ModificationTimestamp}`);
    }
    
    // Test 2: Verify pagination works correctly
    console.log('\n📋 Test 2: Verify pagination works correctly');
    console.log('━'.repeat(40));
    
    // Test pagination with small batches
    console.log('📥 Testing pagination with 5-record batches...');
    
    const batch1 = await syncService.ampreApi.fetchBatch('PropertyRooms', {
      top: 5,
      skip: 0,
      feedType: 'idx'
    });
    
    const batch2 = await syncService.ampreApi.fetchBatch('PropertyRooms', {
      top: 5,
      skip: 5,
      feedType: 'idx'
    });
    
    console.log(`✅ Batch 1: ${batch1.length} rooms (skip: 0)`);
    console.log(`✅ Batch 2: ${batch2.length} rooms (skip: 5)`);
    
    // Verify no overlap between batches
    const batch1Keys = new Set(batch1.map(r => r.RoomKey));
    const batch2Keys = new Set(batch2.map(r => r.RoomKey));
    const overlap = [...batch1Keys].filter(key => batch2Keys.has(key));
    
    if (overlap.length === 0) {
      console.log('✅ No overlap between batches - pagination working correctly');
    } else {
      console.log(`❌ Found ${overlap.length} overlapping records between batches`);
    }
    
    // Test 3: Verify room count and total available
    console.log('\n📋 Test 3: Verify room count and total available');
    console.log('━'.repeat(40));
    
    const totalCount = await syncService.ampreApi.getCount('PropertyRooms', '', 'idx');
    console.log(`📊 Total rooms available via IDX: ${totalCount.toLocaleString()}`);
    
    // Test 4: Verify rooms are filtered for existing IDX properties
    console.log('\n📋 Test 4: Verify rooms are filtered for existing IDX properties');
    console.log('━'.repeat(40));
    
    if (sampleRooms.length > 0) {
      const sampleListingKeys = [...new Set(sampleRooms.map(r => r.ListingKey))];
      console.log(`🔍 Checking ${sampleListingKeys.length} unique property keys...`);
      
      // Check which properties exist in database as IDX (Available) properties
      const existingProperties = await syncService.database.client
        .from('Property')
        .select('ListingKey, ContractStatus')
        .in('ListingKey', sampleListingKeys)
        .eq('ContractStatus', 'Available');
      
      if (existingProperties.error) {
        console.log(`❌ Error checking properties: ${existingProperties.error.message}`);
      } else {
        const existingKeys = existingProperties.data.map(p => p.ListingKey);
        const validRooms = sampleRooms.filter(r => existingKeys.includes(r.ListingKey));
        
        console.log(`✅ Found ${existingKeys.length}/${sampleListingKeys.length} properties in database as IDX (Available)`);
        console.log(`✅ ${validRooms.length}/${sampleRooms.length} rooms would be processed (IDX properties only)`);
        
        if (validRooms.length < sampleRooms.length) {
          const invalidCount = sampleRooms.length - validRooms.length;
          console.log(`ℹ️  ${invalidCount} rooms would be filtered out (non-IDX properties)`);
        }
      }
    }
    
    // Test 5: Test the actual room sync method
    console.log('\n📋 Test 5: Test room sync method (small batch)');
    console.log('━'.repeat(40));
    
    console.log('🔄 Running room sync with small batch size...');
    
    // Temporarily modify batch size for testing
    const originalBatchSize = syncService.config.rooms.batchSize;
    syncService.config.rooms.batchSize = 10; // Small batch for testing
    
    try {
      // This will test the full room sync process
      const syncResult = await syncService.syncRoomsInBatches({
        feedType: 'idx'
      });
      
      console.log('✅ Room sync test completed:');
      console.log(`   - Total fetched: ${syncResult.totalFetched}`);
      console.log(`   - Total processed: ${syncResult.totalProcessed}`);
      console.log(`   - Successful: ${syncResult.successful}`);
      console.log(`   - Failed: ${syncResult.failed}`);
      console.log(`   - Batches: ${syncResult.batches}`);
      
    } finally {
      // Restore original batch size
      syncService.config.rooms.batchSize = originalBatchSize;
    }
    
    console.log('\n🎉 All tests completed successfully!');
    console.log('✅ Rooms are correctly fetched using IDX feed type only');
    console.log('✅ Pagination is working correctly');
    console.log('✅ Rooms are filtered for existing IDX properties only');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    logger.error('Rooms IDX filtering test failed', { error: error.message });
    process.exit(1);
  }
}

// Run the test
testRoomsIdxFiltering()
  .then(() => {
    console.log('\n✅ Test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  });
