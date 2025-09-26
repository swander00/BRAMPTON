#!/usr/bin/env node

/**
 * Efficient Media Sync for Existing Properties Only
 * This script focuses on syncing media only for properties that already exist in the database
 * It avoids the overhead of property validation and focuses on speed and efficiency
 */

import AmpreApiService from '../src/services/ampreApiService.js';
import DatabaseService from '../src/services/databaseService.js';
import logger from '../src/utils/logger.js';
import { mapMedia, validateMedia } from '../mappers/mapMedia.js';
import { setProcessEnv } from '../src/config/credentials.js';

// Set up environment variables from credentials config
setProcessEnv();

class EfficientMediaSync {
  constructor() {
    this.ampreApi = new AmpreApiService();
    this.database = new DatabaseService();
    
    // Optimized configuration for existing properties only
    this.config = {
      batchSize: 1000, // Smaller batches for better API stability
      maxConcurrent: 2, // Conservative concurrency to avoid rate limits
      delayBetweenBatches: 1000, // 1 second delay between batches
      maxProperties: null // No limit - sync all existing properties
    };

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

  async syncMediaForExistingProperties() {
    console.log('🚀 Efficient Media Sync for Existing Properties');
    console.log('==============================================\n');

    this.stats.startTime = Date.now();

    try {
      // Step 1: Get all existing property keys
      console.log('📊 Step 1: Getting existing property keys...');
      const propertyKeys = await this.getExistingPropertyKeys();
      this.stats.totalProperties = propertyKeys.length;
      
      console.log(`✅ Found ${propertyKeys.length} existing properties`);
      
      if (propertyKeys.length === 0) {
        console.log('⚠️  No properties found. Please sync properties first.');
        return;
      }

      // Step 2: Process properties in batches
      console.log('\n📊 Step 2: Processing properties in batches...');
      await this.processPropertiesInBatches(propertyKeys);

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
      const { data, error } = await this.database.supabase
        .from('Property')
        .select('ListingKey')
        .order('ListingKey');

      if (error) {
        throw new Error(`Failed to get property keys: ${error.message}`);
      }

      return data.map(p => p.ListingKey);
    } catch (error) {
      console.error('❌ Error getting property keys:', error.message);
      throw error;
    }
  }

  async processPropertiesInBatches(propertyKeys) {
    const batches = this.createBatches(propertyKeys, this.config.batchSize);
    console.log(`📦 Processing ${batches.length} batches of ${this.config.batchSize} properties each`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`\n🔄 Processing batch ${i + 1}/${batches.length} (${batch.length} properties)`);

      try {
        await this.processPropertyBatch(batch, i + 1);
        this.stats.processedProperties += batch.length;

        // Progress update
        const progress = Math.round((this.stats.processedProperties / this.stats.totalProperties) * 100);
        console.log(`📈 Progress: ${progress}% (${this.stats.processedProperties}/${this.stats.totalProperties})`);

        // Delay between batches to avoid rate limits
        if (i < batches.length - 1) {
          console.log(`⏳ Waiting ${this.config.delayBetweenBatches}ms before next batch...`);
          await this.delay(this.config.delayBetweenBatches);
        }

      } catch (error) {
        console.error(`❌ Batch ${i + 1} failed:`, error.message);
        this.stats.errors++;
        
        // Continue with next batch instead of failing completely
        if (this.stats.errors > 5) {
          console.error('❌ Too many errors, stopping sync');
          break;
        }
      }
    }
  }

  async processPropertyBatch(propertyKeys, batchNumber) {
    const batchPromises = propertyKeys.map(async (listingKey, index) => {
      try {
        return await this.syncMediaForProperty(listingKey, batchNumber, index + 1);
      } catch (error) {
        console.error(`   ❌ Property ${listingKey} failed: ${error.message}`);
        this.stats.errors++;
        return { mediaCount: 0, success: false };
      }
    });

    // Process with limited concurrency
    const results = await this.processWithConcurrency(batchPromises, this.config.maxConcurrent);
    
    // Update stats
    const totalMedia = results.reduce((sum, result) => sum + (result.mediaCount || 0), 0);
    const successful = results.filter(r => r.success).length;
    
    console.log(`   ✅ Batch ${batchNumber}: ${successful}/${propertyKeys.length} properties, ${totalMedia} media records`);
    this.stats.totalMediaFetched += totalMedia;
  }

  async syncMediaForProperty(listingKey, batchNumber, propertyIndex) {
    try {
      // Get media count first
      const count = await this.ampreApi.getMediaCount(listingKey);
      
      if (count === 0) {
        return { mediaCount: 0, success: true };
      }

      // Fetch media data
      const mediaData = await this.ampreApi.getMediaForProperty(listingKey);
      
      if (!mediaData || mediaData.length === 0) {
        return { mediaCount: 0, success: true };
      }

      // Process and validate media
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

      if (validMedia.length === 0) {
        return { mediaCount: 0, success: true };
      }

      // Upsert to database
      const upsertResult = await this.database.upsertMedia(validMedia);
      
      if (upsertResult.success) {
        this.stats.totalMediaUpserted += upsertResult.upserted;
        return { mediaCount: validMedia.length, success: true };
      } else {
        throw new Error(`Database upsert failed: ${upsertResult.error}`);
      }

    } catch (error) {
      throw new Error(`Failed to sync media for ${listingKey}: ${error.message}`);
    }
  }

  async processWithConcurrency(promises, maxConcurrent) {
    const results = [];
    
    for (let i = 0; i < promises.length; i += maxConcurrent) {
      const batch = promises.slice(i, i + maxConcurrent);
      const batchResults = await Promise.allSettled(batch);
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({ mediaCount: 0, success: false });
        }
      }
    }
    
    return results;
  }

  createBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  printFinalStats() {
    const duration = Math.round((this.stats.endTime - this.stats.startTime) / 1000);
    const propertiesPerSecond = Math.round(this.stats.processedProperties / duration);
    const mediaPerSecond = Math.round(this.stats.totalMediaFetched / duration);

    console.log('\n🎉 Media Sync Completed!');
    console.log('========================');
    console.log(`⏱️  Duration: ${duration} seconds`);
    console.log(`🏠 Properties: ${this.stats.processedProperties}/${this.stats.totalProperties}`);
    console.log(`📸 Media Fetched: ${this.stats.totalMediaFetched}`);
    console.log(`💾 Media Upserted: ${this.stats.totalMediaUpserted}`);
    console.log(`❌ Errors: ${this.stats.errors}`);
    console.log(`📊 Properties/sec: ${propertiesPerSecond}`);
    console.log(`📊 Media/sec: ${mediaPerSecond}`);
    
    if (this.stats.errors > 0) {
      console.log(`⚠️  ${this.stats.errors} errors occurred during sync`);
    } else {
      console.log('✅ No errors occurred during sync');
    }
  }
}

// Run the efficient media sync
async function runEfficientMediaSync() {
  const sync = new EfficientMediaSync();
  
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
