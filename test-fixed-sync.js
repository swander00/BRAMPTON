#!/usr/bin/env node

/**
 * Test the fixed sync service to verify the count is now correct
 */

import SyncService from './src/services/syncService.js';
import { setProcessEnv } from './src/config/credentials.js';

// Set up environment variables
setProcessEnv();

// Override the SYNC_START_DATE for testing
process.env.SYNC_START_DATE = '2025-09-25T00:00:00Z';

console.log('🧪 Testing Fixed Sync Service');
console.log('==============================');

async function testFixedSync() {
  try {
    const syncService = new SyncService();
    
    console.log(`📅 Sync start date: ${syncService.syncStartDate}`);
    
    // Test the getTotalCount method directly
    console.log('\n🔍 Testing getTotalCount method:');
    
    // Test IDX properties
    const idxCount = await syncService.getTotalCount('idx', 'Property', null);
    console.log(`📊 IDX properties count: ${idxCount.toLocaleString()}`);
    
    // Test VOW properties  
    const vowCount = await syncService.getTotalCount('vow', 'Property', null);
    console.log(`📊 VOW properties count: ${vowCount.toLocaleString()}`);
    
    // Test Media
    const mediaCount = await syncService.getTotalCount('idx', 'Media', null);
    console.log(`📊 Media count: ${mediaCount.toLocaleString()}`);
    
    // Test PropertyRooms
    const roomsCount = await syncService.getTotalCount('idx', 'PropertyRooms', null);
    console.log(`📊 PropertyRooms count: ${roomsCount.toLocaleString()}`);
    
    // Test OpenHouse
    const openHouseCount = await syncService.getTotalCount('idx', 'OpenHouse', null);
    console.log(`📊 OpenHouse count: ${openHouseCount.toLocaleString()}`);
    
    const totalCount = idxCount + vowCount + mediaCount + roomsCount + openHouseCount;
    console.log(`\n📊 Total records to sync: ${totalCount.toLocaleString()}`);
    
    if (totalCount < 50000) {
      console.log('✅ Count looks reasonable for ~1 day of data');
    } else {
      console.log('⚠️  Count still seems high - may need further investigation');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

testFixedSync();
