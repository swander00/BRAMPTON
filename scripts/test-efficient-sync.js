#!/usr/bin/env node

/**
 * Test Efficient Media Sync with Limited Scope
 * Tests the efficient media sync with just a few properties to verify it works
 */

import AmpreApiService from '../src/services/ampreApiService.js';
import DatabaseService from '../src/services/databaseService.js';
import logger from '../src/utils/logger.js';
import { mapMedia, validateMedia } from '../mappers/mapMedia.js';
import { setProcessEnv } from '../src/config/credentials.js';

// Set up environment variables from credentials config
setProcessEnv();

class TestEfficientMediaSync {
  constructor() {
    this.ampreApi = new AmpreApiService();
    this.database = new DatabaseService();
    
    this.stats = {
      totalProperties: 0,
      processedProperties: 0,
      totalMediaFetched: 0,
      totalMediaUpserted: 0,
      errors: 0,
      startTime: null,
      endTime: null
    };
  }

  async testSyncWithLimitedProperties() {
    console.log('🧪 Testing Efficient Media Sync (Limited Scope)');
    console.log('==============================================\n');

    this.stats.startTime = Date.now();

    try {
      // Get a small sample of existing property keys
      console.log('📊 Getting sample property keys...');
      const propertyKeys = await this.getSamplePropertyKeys(5); // Test with just 5 properties
      this.stats.totalProperties = propertyKeys.length;
      
      console.log(`✅ Testing with ${propertyKeys.length} properties: ${propertyKeys.join(', ')}`);

      // Process each property individually
      for (let i = 0; i < propertyKeys.length; i++) {
        const listingKey = propertyKeys[i];
        console.log(`\n🔄 Processing property ${i + 1}/${propertyKeys.length}: ${listingKey}`);
        
        try {
          const result = await this.syncMediaForProperty(listingKey);
          this.stats.processedProperties++;
          this.stats.totalMediaFetched += result.mediaCount;
          this.stats.totalMediaUpserted += result.upserted;
          
          console.log(`   ✅ ${listingKey}: ${result.mediaCount} media records, ${result.upserted} upserted`);
        } catch (error) {
          console.error(`   ❌ ${listingKey} failed: ${error.message}`);
          this.stats.errors++;
        }
      }

      // Final statistics
      this.stats.endTime = Date.now();
      this.printFinalStats();

    } catch (error) {
      console.error('❌ Test failed:', error.message);
      logger.error('Test sync failed', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  async getSamplePropertyKeys(limit = 5) {
    try {
      const { data, error } = await this.database.client
        .from('Property')
        .select('ListingKey')
        .order('ListingKey')
        .limit(limit);

      if (error) {
        throw new Error(`Failed to get property keys: ${error.message}`);
      }

      return data.map(p => p.ListingKey);
    } catch (error) {
      console.error('❌ Error getting property keys:', error.message);
      throw error;
    }
  }

  async syncMediaForProperty(listingKey) {
    try {
      // Get media count first
      console.log(`   📊 Getting media count for ${listingKey}...`);
      const count = await this.ampreApi.getMediaCount(listingKey);
      console.log(`   📸 Found ${count} media records`);
      
      if (count === 0) {
        return { mediaCount: 0, upserted: 0 };
      }

      // Fetch media data
      console.log(`   📥 Fetching media data for ${listingKey}...`);
      const mediaData = await this.ampreApi.getMediaForProperty(listingKey);
      
      if (!mediaData || mediaData.length === 0) {
        return { mediaCount: 0, upserted: 0 };
      }

      console.log(`   📊 Fetched ${mediaData.length} media records`);

      // Process and validate media
      console.log(`   🔍 Processing and validating media...`);
      const validMedia = [];
      for (const mediaItem of mediaData) {
        try {
          const mappedMedia = mapMedia(mediaItem);
          if (validateMedia(mappedMedia)) {
            validMedia.push(mappedMedia);
          }
        } catch (error) {
          // Skip invalid media items
          continue;
        }
      }

      console.log(`   ✅ ${validMedia.length} valid media records after validation`);

      if (validMedia.length === 0) {
        return { mediaCount: 0, upserted: 0 };
      }

      // Upsert to database
      console.log(`   💾 Upserting ${validMedia.length} media records to database...`);
      const upsertResult = await this.database.upsertMedia(validMedia);
      
      if (upsertResult.success) {
        console.log(`   ✅ Successfully upserted ${upsertResult.upserted} media records`);
        return { mediaCount: validMedia.length, upserted: upsertResult.upserted };
      } else {
        throw new Error(`Database upsert failed: ${upsertResult.error}`);
      }

    } catch (error) {
      throw new Error(`Failed to sync media for ${listingKey}: ${error.message}`);
    }
  }

  printFinalStats() {
    const duration = Math.round((this.stats.endTime - this.stats.startTime) / 1000);

    console.log('\n🎉 Test Completed!');
    console.log('==================');
    console.log(`⏱️  Duration: ${duration} seconds`);
    console.log(`🏠 Properties: ${this.stats.processedProperties}/${this.stats.totalProperties}`);
    console.log(`📸 Media Fetched: ${this.stats.totalMediaFetched}`);
    console.log(`💾 Media Upserted: ${this.stats.totalMediaUpserted}`);
    console.log(`❌ Errors: ${this.stats.errors}`);
    
    if (this.stats.errors > 0) {
      console.log(`⚠️  ${this.stats.errors} errors occurred during test`);
    } else {
      console.log('✅ No errors occurred during test');
    }

    if (this.stats.totalMediaFetched > 0) {
      console.log(`📊 Average media per property: ${Math.round(this.stats.totalMediaFetched / this.stats.processedProperties)}`);
    }
  }
}

// Run the test
async function runTest() {
  const test = new TestEfficientMediaSync();
  
  try {
    await test.testSyncWithLimitedProperties();
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the test
runTest().catch(console.error);
