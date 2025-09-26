#!/usr/bin/env node

/**
 * Efficient Media Sync V2 - Using Existing API Methods
 * This script focuses on syncing media efficiently for existing properties
 * Uses the existing fetchBatch method from AmpreApiService
 */

import AmpreApiService from '../src/services/ampreApiService.js';
import DatabaseService from '../src/services/databaseService.js';
import logger from '../src/utils/logger.js';
import { mapMedia, validateMedia } from '../mappers/mapMedia.js';
import { setProcessEnv } from '../src/config/credentials.js';

// Set up environment variables from credentials config
setProcessEnv();

class EfficientMediaSyncV2 {
  constructor() {
    this.ampreApi = new AmpreApiService();
    this.database = new DatabaseService();
    
    // Optimized configuration
    this.config = {
      batchSize: 2000, // API batch size
      maxConcurrent: 2, // Conservative concurrency
      delayBetweenBatches: 1000, // 1 second delay
      maxProperties: null, // No limit
      testMode: false // Set to true for testing with limited properties
    };

    this.stats = {
      totalProperties: 0,
      processedProperties: 0,
      totalMediaFetched: 0,
      totalMediaUpserted: 0,
      errors: 0,
      startTime: null,
      endTime: null,
      apiRequests: 0,
      databaseQueries: 0
    };
  }

  async syncMediaForExistingProperties() {
    console.log('🚀 Efficient Media Sync V2 - For Existing Properties Only');
    console.log('======================================================\n');

    this.stats.startTime = Date.now();

    try {
      // Step 1: Get existing property keys
      console.log('📊 Step 1: Getting existing property keys...');
      const propertyKeys = await this.getExistingPropertyKeys();
      this.stats.totalProperties = propertyKeys.length;
      
      console.log(`✅ Found ${propertyKeys.length} existing properties`);
      
      if (propertyKeys.length === 0) {
        console.log('⚠️  No properties found. Please sync properties first.');
        return;
      }

      // Step 2: Fetch all media in batches and filter for existing properties
      console.log('\n📊 Step 2: Fetching media in batches...');
      await this.fetchAndProcessMediaBatches(propertyKeys);

      // Step 3: Final statistics
      this.stats.endTime = Date.now();
      this.printFinalStats();

    } catch (error) {
      console.error('❌ Media sync failed:', error.message);
      logger.error('Media sync failed', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  async getExistingPropertyKeys() {
    try {
      const { data, error } = await this.database.client
        .from('Property')
        .select('ListingKey')
        .order('ListingKey');

      if (error) {
        throw new Error(`Failed to get property keys: ${error.message}`);
      }

      const propertyKeys = data.map(p => p.ListingKey);
      
      // Limit for testing if in test mode
      if (this.config.testMode) {
        return propertyKeys.slice(0, 10); // Test with first 10 properties
      }
      
      return propertyKeys;
    } catch (error) {
      console.error('❌ Error getting property keys:', error.message);
      throw error;
    }
  }

  async fetchAndProcessMediaBatches(propertyKeys) {
    // Create a Set for fast property lookup
    const propertySet = new Set(propertyKeys);
    console.log(`📦 Created property lookup set with ${propertySet.size} properties`);

    let skip = 0;
    let totalFetched = 0;
    let totalProcessed = 0;
    let hasMoreData = true;

    while (hasMoreData) {
      try {
        console.log(`\n🔄 Fetching media batch (skip: ${skip}, top: ${this.config.batchSize})...`);
        
        const startTime = Date.now();
        const mediaBatch = await this.ampreApi.fetchBatch('Media', {
          top: this.config.batchSize,
          skip: skip,
          feedType: 'idx'
        });
        const fetchTime = Date.now() - startTime;
        
        this.stats.apiRequests++;
        
        if (!mediaBatch || mediaBatch.length === 0) {
          console.log('📊 No more media data available');
          hasMoreData = false;
          break;
        }

        console.log(`📥 Fetched ${mediaBatch.length} media records in ${fetchTime}ms`);
        totalFetched += mediaBatch.length;

        // Filter media for existing properties only
        console.log(`🔍 Filtering media for existing properties...`);
        const relevantMedia = mediaBatch.filter(media => 
          media.ResourceRecordKey && propertySet.has(media.ResourceRecordKey)
        );

        console.log(`✅ Found ${relevantMedia.length} relevant media records (${Math.round((relevantMedia.length / mediaBatch.length) * 100)}% of batch)`);

        if (relevantMedia.length > 0) {
          // Process the relevant media
          const processed = await this.processMediaBatch(relevantMedia);
          totalProcessed += processed;
        }

        // Check if we should continue
        if (mediaBatch.length < this.config.batchSize) {
          console.log('📊 Reached end of data (batch size < requested)');
          hasMoreData = false;
        } else {
          skip += this.config.batchSize;
          
          // Delay between batches to avoid rate limits
          console.log(`⏳ Waiting ${this.config.delayBetweenBatches}ms before next batch...`);
          await this.delay(this.config.delayBetweenBatches);
        }

      } catch (error) {
        console.error(`❌ Batch fetch failed: ${error.message}`);
        this.stats.errors++;
        
        // If we get too many errors, stop
        if (this.stats.errors > 5) {
          console.error('❌ Too many errors, stopping sync');
          break;
        }
        
        // Wait longer before retrying
        await this.delay(this.config.delayBetweenBatches * 2);
      }
    }

    console.log(`\n📊 Batch processing completed:`);
    console.log(`   Total fetched: ${totalFetched} media records`);
    console.log(`   Total processed: ${totalProcessed} media records`);
    console.log(`   API requests: ${this.stats.apiRequests}`);
  }

  async processMediaBatch(mediaRecords) {
    try {
      console.log(`🔄 Processing ${mediaRecords.length} media records...`);
      
      // Process and validate media
      const validMedia = [];
      for (const mediaItem of mediaRecords) {
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

      console.log(`✅ ${validMedia.length} valid media records after validation`);

      if (validMedia.length === 0) {
        return 0;
      }

      // Upsert to database in smaller chunks
      const chunkSize = 100;
      let totalUpserted = 0;
      
      for (let i = 0; i < validMedia.length; i += chunkSize) {
        const chunk = validMedia.slice(i, i + chunkSize);
        
        try {
          const upsertResult = await this.database.upsertMedia(chunk);
          this.stats.databaseQueries++;
          
          if (upsertResult.success) {
            totalUpserted += upsertResult.upserted;
            console.log(`   💾 Upserted chunk ${Math.floor(i/chunkSize) + 1}: ${upsertResult.upserted} records`);
          } else {
            console.error(`   ❌ Chunk upsert failed: ${upsertResult.error}`);
            this.stats.errors++;
          }
        } catch (error) {
          console.error(`   ❌ Chunk processing error: ${error.message}`);
          this.stats.errors++;
        }
      }

      this.stats.totalMediaUpserted += totalUpserted;
      return totalUpserted;

    } catch (error) {
      console.error(`❌ Media batch processing failed: ${error.message}`);
      this.stats.errors++;
      return 0;
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  printFinalStats() {
    const duration = Math.round((this.stats.endTime - this.stats.startTime) / 1000);
    const mediaPerSecond = this.stats.totalMediaUpserted > 0 ? Math.round(this.stats.totalMediaUpserted / duration) : 0;

    console.log('\n🎉 Media Sync Completed!');
    console.log('========================');
    console.log(`⏱️  Duration: ${duration} seconds`);
    console.log(`🏠 Properties: ${this.stats.totalProperties}`);
    console.log(`📸 Media Upserted: ${this.stats.totalMediaUpserted}`);
    console.log(`🌐 API Requests: ${this.stats.apiRequests}`);
    console.log(`🗄️  Database Queries: ${this.stats.databaseQueries}`);
    console.log(`❌ Errors: ${this.stats.errors}`);
    console.log(`📊 Media/sec: ${mediaPerSecond}`);
    
    if (this.stats.errors > 0) {
      console.log(`⚠️  ${this.stats.errors} errors occurred during sync`);
    } else {
      console.log('✅ No errors occurred during sync');
    }

    // Performance analysis
    if (this.stats.apiRequests > 0) {
      const avgResponseTime = Math.round(duration * 1000 / this.stats.apiRequests);
      console.log(`📊 Average API response time: ${avgResponseTime}ms`);
    }
  }
}

// Run the efficient media sync
async function runEfficientMediaSync() {
  const sync = new EfficientMediaSyncV2();
  
  // Uncomment the next line to run in test mode (limited properties)
  sync.config.testMode = true;
  
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
runEfficientMediaSync().catch(console.error);
