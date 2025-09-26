#!/usr/bin/env node

/**
 * Smart Media Sync - Efficient Strategy for Existing Properties
 * This script uses a smarter approach:
 * 1. Gets ALL existing properties (not just first 10)
 * 2. Uses timestamp-based pagination to get recent media
 * 3. Focuses on media that belongs to existing properties
 * 4. Avoids the inefficient property-by-property approach
 */

import AmpreApiService from '../src/services/ampreApiService.js';
import DatabaseService from '../src/services/databaseService.js';
import logger from '../src/utils/logger.js';
import { mapMedia, validateMedia } from '../mappers/mapMedia.js';
import { setProcessEnv } from '../src/config/credentials.js';

// Set up environment variables from credentials config
setProcessEnv();

class SmartMediaSync {
  constructor() {
    this.ampreApi = new AmpreApiService();
    this.database = new DatabaseService();
    
    this.config = {
      batchSize: 2000, // API batch size
      maxBatches: 50, // Limit to prevent infinite loops
      delayBetweenBatches: 1000, // 1 second delay
      testMode: false // Set to true for testing
    };

    this.stats = {
      totalProperties: 0,
      totalMediaFetched: 0,
      totalMediaUpserted: 0,
      errors: 0,
      startTime: null,
      endTime: null,
      apiRequests: 0,
      databaseQueries: 0,
      batchesProcessed: 0
    };
  }

  async syncMediaForExistingProperties() {
    console.log('🧠 Smart Media Sync - Efficient Strategy');
    console.log('======================================\n');

    this.stats.startTime = Date.now();

    try {
      // Step 1: Get ALL existing property keys
      console.log('📊 Step 1: Getting ALL existing property keys...');
      const propertyKeys = await this.getAllExistingPropertyKeys();
      this.stats.totalProperties = propertyKeys.length;
      
      console.log(`✅ Found ${propertyKeys.length} existing properties`);
      
      if (propertyKeys.length === 0) {
        console.log('⚠️  No properties found. Please sync properties first.');
        return;
      }

      // Step 2: Smart media sync using timestamp-based approach
      console.log('\n📊 Step 2: Smart media sync with timestamp-based pagination...');
      await this.smartMediaSync(propertyKeys);

      // Step 3: Final statistics
      this.stats.endTime = Date.now();
      this.printFinalStats();

    } catch (error) {
      console.error('❌ Smart media sync failed:', error.message);
      logger.error('Smart media sync failed', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  async getAllExistingPropertyKeys() {
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
        console.log(`🧪 Test mode: Using first 100 properties instead of all ${propertyKeys.length}`);
        return propertyKeys.slice(0, 100);
      }
      
      return propertyKeys;
    } catch (error) {
      console.error('❌ Error getting property keys:', error.message);
      throw error;
    }
  }

  async smartMediaSync(propertyKeys) {
    // Create a Set for fast property lookup
    const propertySet = new Set(propertyKeys);
    console.log(`📦 Created property lookup set with ${propertySet.size} properties`);

    let lastTimestamp = null;
    let batchCount = 0;
    let totalRelevantMedia = 0;

    while (batchCount < this.config.maxBatches) {
      try {
        batchCount++;
        console.log(`\n🔄 Processing batch ${batchCount}/${this.config.maxBatches}...`);

        // Fetch media batch with timestamp filtering
        const mediaBatch = await this.fetchMediaBatch(lastTimestamp);
        this.stats.apiRequests++;

        if (!mediaBatch || mediaBatch.length === 0) {
          console.log('📊 No more media data available');
          break;
        }

        console.log(`📥 Fetched ${mediaBatch.length} media records`);

        // Filter for existing properties
        const relevantMedia = mediaBatch.filter(media => 
          media.ResourceRecordKey && propertySet.has(media.ResourceRecordKey)
        );

        console.log(`✅ Found ${relevantMedia.length} relevant media records (${Math.round((relevantMedia.length / mediaBatch.length) * 100)}% of batch)`);

        if (relevantMedia.length > 0) {
          // Process the relevant media
          const processed = await this.processMediaBatch(relevantMedia);
          totalRelevantMedia += processed;
        }

        // Update timestamp for next batch (use the oldest timestamp from this batch)
        const timestamps = mediaBatch
          .map(m => m.MediaModificationTimestamp)
          .filter(t => t)
          .sort();
        
        if (timestamps.length > 0) {
          lastTimestamp = timestamps[0]; // Use oldest timestamp
          console.log(`📅 Next batch will start from: ${lastTimestamp}`);
        }

        // Check if we should continue
        if (mediaBatch.length < this.config.batchSize) {
          console.log('📊 Reached end of data (batch size < requested)');
          break;
        }

        // Delay between batches
        console.log(`⏳ Waiting ${this.config.delayBetweenBatches}ms before next batch...`);
        await this.delay(this.config.delayBetweenBatches);

      } catch (error) {
        console.error(`❌ Batch ${batchCount} failed: ${error.message}`);
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

    this.stats.batchesProcessed = batchCount;
    console.log(`\n📊 Smart sync completed:`);
    console.log(`   Batches processed: ${batchCount}`);
    console.log(`   Total relevant media: ${totalRelevantMedia}`);
  }

  async fetchMediaBatch(lastTimestamp) {
    try {
      const options = {
        top: this.config.batchSize,
        feedType: 'idx',
        orderBy: 'MediaModificationTimestamp desc'
      };

      // Add timestamp filter if we have a last timestamp
      if (lastTimestamp) {
        options.filter = `MediaModificationTimestamp lt '${lastTimestamp}'`;
      }

      console.log(`📡 Fetching media batch with options:`, {
        top: options.top,
        filter: options.filter || 'none',
        orderBy: options.orderBy
      });

      const mediaBatch = await this.ampreApi.fetchBatch('Media', options);
      return mediaBatch;

    } catch (error) {
      console.error(`❌ Failed to fetch media batch: ${error.message}`);
      throw error;
    }
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

    console.log('\n🎉 Smart Media Sync Completed!');
    console.log('==============================');
    console.log(`⏱️  Duration: ${duration} seconds`);
    console.log(`🏠 Properties: ${this.stats.totalProperties}`);
    console.log(`📦 Batches Processed: ${this.stats.batchesProcessed}`);
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

    // Efficiency analysis
    if (this.stats.batchesProcessed > 0) {
      const avgMediaPerBatch = Math.round(this.stats.totalMediaUpserted / this.stats.batchesProcessed);
      console.log(`📊 Average media per batch: ${avgMediaPerBatch}`);
    }
  }
}

// Run the smart media sync
async function runSmartMediaSync() {
  const sync = new SmartMediaSync();
  
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
runSmartMediaSync().catch(console.error);
