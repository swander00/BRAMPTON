#!/usr/bin/env node

/**
 * Test script to verify pagination works beyond 100K records
 * Usage: node src/scripts/test-pagination.js [--idx|--vow]
 */

import { setProcessEnv } from '../config/credentials.js';
import AmpreApiService from '../services/ampreApiService.js';
import logger from '../utils/logger.js';

// Load configuration
setProcessEnv();

class PaginationTest {
  constructor() {
    this.ampreApi = new AmpreApiService();
  }

  async testPagination(feedType = 'idx') {
    console.log(`\n🧪 ===== PAGINATION TEST FOR ${feedType.toUpperCase()} =====`);
    console.log(`⏰ Started at: ${new Date().toISOString()}\n`);

    try {
      // Test 1: Get total count
      const filter = feedType === 'idx' 
        ? "ContractStatus eq 'Available'" 
        : "ContractStatus ne 'Available' and PropertyType ne 'Commercial'";
      
      console.log(`📊 Getting total count for ${feedType.toUpperCase()} properties...`);
      const totalCount = await this.ampreApi.getCount('Property', filter, feedType);
      console.log(`✅ Total ${feedType.toUpperCase()} properties: ${totalCount.toLocaleString()}`);

      if (totalCount <= 100000) {
        console.log(`⚠️  Total count (${totalCount.toLocaleString()}) is not beyond 100K limit`);
        return;
      }

      // Test 2: Test pagination beyond 100K
      console.log(`\n🔄 Testing pagination beyond 100K...`);
      
      const batchSize = 5000;
      let skip = 100000; // Start at 100K
      let hasMore = true;
      let batchNumber = 21; // Batch 21 (100K / 5K = 20, so 21 is beyond 100K)
      let totalFetched = 0;

      while (hasMore && skip < totalCount && batchNumber <= 25) { // Test up to batch 25
        console.log(`\n📦 Testing Batch ${batchNumber} (skip: ${skip.toLocaleString()})`);
        
        try {
          const properties = await this.ampreApi.fetchBatch('Property', {
            filter: filter,
            orderBy: 'ModificationTimestamp',
            top: batchSize,
            skip,
            feedType: feedType
          });

          console.log(`✅ Fetched ${properties.length.toLocaleString()} properties`);
          totalFetched += properties.length;

          if (properties.length === 0) {
            console.log('🏁 No more properties to fetch');
            break;
          }

          // Show sample property data
          if (properties.length > 0) {
            const sample = properties[0];
            console.log(`📋 Sample property: ${sample.ListingKey} - ${sample.ModificationTimestamp}`);
          }

          skip += batchSize;
          batchNumber++;
          hasMore = properties.length === batchSize && skip < totalCount;

        } catch (batchError) {
          console.error(`❌ Batch ${batchNumber} failed: ${batchError.message}`);
          break;
        }
      }

      console.log(`\n🎉 ===== PAGINATION TEST COMPLETED =====`);
      console.log(`📊 Total properties fetched beyond 100K: ${totalFetched.toLocaleString()}`);
      console.log(`📈 Successfully fetched data beyond 100K limit: ${totalFetched > 0 ? 'YES' : 'NO'}`);

      if (totalFetched > 0) {
        console.log(`✅ Pagination is working correctly beyond 100K records!`);
      } else {
        console.log(`❌ Pagination may have issues beyond 100K records`);
      }

    } catch (error) {
      console.error(`❌ Pagination test failed: ${error.message}`);
      logger.error('Pagination test failed', { error: error.message, feedType });
      throw error;
    }
  }

  async run() {
    const args = process.argv.slice(2);
    
    if (args.includes('--idx')) {
      await this.testPagination('idx');
    } else if (args.includes('--vow')) {
      await this.testPagination('vow');
    } else {
      // Test both by default
      await this.testPagination('idx');
      await this.testPagination('vow');
    }
  }
}

// Run if called directly
const normalizedArgv = process.argv[1].replace(/\\/g, '/');
if (import.meta.url === `file:///${normalizedArgv}`) {
  const test = new PaginationTest();
  test.run()
    .then(() => {
      console.log('\n✅ Pagination test completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Pagination test failed:', error.message);
      process.exit(1);
    });
}

export default PaginationTest;
