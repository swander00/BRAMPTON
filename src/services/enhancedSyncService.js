import AmpreApiService from './ampreApiService.js';
import DatabaseService from './databaseService.js';
import logger from '../utils/logger.js';
import { mapProperty, validateProperty } from '../../mappers/mapProperty.js';
import { mapMedia, validateMedia } from '../../mappers/mapMedia.js';
import { mapRoom, validateRoom } from '../../mappers/mapRoom.js';
import { mapOpenHouse, validateOpenHouse } from '../../mappers/mapOpenHouse.js';

/**
 * Enhanced Sync Service with improved batching and error handling
 */
class EnhancedSyncService {
  constructor() {
    this.ampreApi = new AmpreApiService();
    this.database = new DatabaseService();
    
    // Enhanced sync configuration with intelligent throttling
    this.config = {
      property: {
        batchSize: 5000, // Increased to 5000 as requested
        endpoint: 'Property',
        keyField: 'ListingKey',
        timestampField: 'ModificationTimestamp',
        filter: null, // Removed problematic filter due to OData type issues
        dbBatchSize: 100, // Database operations in smaller chunks
        throttleDelay: 500 // 500ms delay between batches to avoid rate limits
      },
      media: {
        batchSize: 5000, // Increased to 5000 as requested
        endpoint: 'Media',
        keyField: 'MediaKey',
        timestampField: 'MediaModificationTimestamp', // Use correct timestamp field for media
        filter: "ClassName ne 'Commercial'", // Only exclude commercial media - sync ALL media for existing properties
        dbBatchSize: 100, // Database operations in smaller chunks
        throttleDelay: 750, // 750ms delay for media (more conservative due to volume)
        propertyBatchSize: 10 // Number of properties to process in each batch (reduced to avoid API limits)
      },
      rooms: {
        batchSize: 5000, // Increased to 5000 as requested
        endpoint: 'PropertyRooms',
        keyField: 'RoomKey',
        timestampField: 'ModificationTimestamp',
        filter: null, // No filter for rooms (IDX-only enforced at API level)
        dbBatchSize: 100, // Database operations in smaller chunks
        feedType: 'idx', // IDX ONLY - Rooms are only fetched for available properties
        throttleDelay: 500 // 500ms delay between batches
      },
      openHouse: {
        batchSize: 5000, // Increased to 5000 as requested
        endpoint: 'OpenHouse',
        keyField: 'OpenHouseKey',
        timestampField: 'ModificationTimestamp',
        filter: null, // No filter for open houses
        dbBatchSize: 100, // Database operations in smaller chunks
        throttleDelay: 500 // 500ms delay between batches
      }
    };

    // Intelligent throttling configuration
    this.throttlingConfig = {
      adaptiveDelay: true, // Enable adaptive delay based on response times
      baseDelay: 500, // Base delay between requests (ms)
      maxDelay: 5000, // Maximum delay (ms)
      minDelay: 100, // Minimum delay (ms)
      responseTimeThreshold: 2000, // If response time > 2s, increase delay
      errorThreshold: 3 // If 3+ errors in a row, increase delay
    };

    // Track performance metrics for adaptive throttling
    this.performanceMetrics = {
      recentResponseTimes: [],
      consecutiveErrors: 0,
      lastErrorTime: null
    };

    logger.info('Enhanced Sync Service initialized', { config: this.config });
  }

  /**
   * Sleep utility function
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Record performance metrics for adaptive throttling
   * @param {number} responseTime - Response time in milliseconds
   * @param {boolean} isError - Whether the request resulted in an error
   */
  recordPerformanceMetrics(responseTime, isError = false) {
    // Track recent response times (keep last 10)
    this.performanceMetrics.recentResponseTimes.push(responseTime);
    if (this.performanceMetrics.recentResponseTimes.length > 10) {
      this.performanceMetrics.recentResponseTimes.shift();
    }

    // Track consecutive errors
    if (isError) {
      this.performanceMetrics.consecutiveErrors++;
      this.performanceMetrics.lastErrorTime = Date.now();
    } else {
      this.performanceMetrics.consecutiveErrors = 0;
    }
  }

  /**
   * Calculate adaptive delay based on recent performance
   * @param {string} dataType - Type of data being processed (property, media, etc.)
   * @returns {number} Delay in milliseconds
   */
  calculateAdaptiveDelay(dataType) {
    if (!this.throttlingConfig.adaptiveDelay) {
      return this.config[dataType]?.throttleDelay || this.throttlingConfig.baseDelay;
    }

    let delay = this.config[dataType]?.throttleDelay || this.throttlingConfig.baseDelay;

    // Increase delay if we have recent errors
    if (this.performanceMetrics.consecutiveErrors >= this.throttlingConfig.errorThreshold) {
      delay *= Math.pow(2, this.performanceMetrics.consecutiveErrors - this.throttlingConfig.errorThreshold + 1);
    }

    // Increase delay if response times are slow
    if (this.performanceMetrics.recentResponseTimes.length > 0) {
      const avgResponseTime = this.performanceMetrics.recentResponseTimes.reduce((a, b) => a + b, 0) / this.performanceMetrics.recentResponseTimes.length;
      if (avgResponseTime > this.throttlingConfig.responseTimeThreshold) {
        delay *= 1.5;
      }
    }

    // Clamp delay to configured limits
    delay = Math.max(this.throttlingConfig.minDelay, delay);
    delay = Math.min(this.throttlingConfig.maxDelay, delay);

    return Math.round(delay);
  }

  /**
   * Apply intelligent throttling between batch operations
   * @param {string} dataType - Type of data being processed
   * @param {number} batchNumber - Current batch number
   * @param {number} totalBatches - Total number of batches
   */
  async applyIntelligentThrottling(dataType, batchNumber, totalBatches) {
    // Skip throttling for the first batch
    if (batchNumber === 1) {
      return;
    }

    const delay = this.calculateAdaptiveDelay(dataType);
    
    if (delay > 0) {
      console.log(`⏳ Intelligent throttling: waiting ${delay}ms before next batch (${batchNumber}/${totalBatches})`);
      await this.sleep(delay);
    }
  }

  /**
   * Enhanced property sync with 5000-record batching
   */
  async syncPropertiesInBatches(options = {}) {
    const {
      filter = this.config.property.filter,
      feedType = 'idx'
    } = options;

    const startTime = Date.now();
    console.log('\n🏠 ===== ENHANCED PROPERTY SYNC STARTED =====');
    console.log(`📊 Batch Size: ${this.config.property.batchSize} records`);
    console.log(`💾 Database Batch Size: ${this.config.property.dbBatchSize} records`);
    console.log(`🔗 Feed Type: ${feedType.toUpperCase()}`);
    console.log(`⏰ Started at: ${new Date().toISOString()}\n`);

    const stats = {
      totalFetched: 0,
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      errors: [],
      batches: 0
    };

    try {
      // Get total count first
      const totalCount = await this.ampreApi.getCount('Property', filter, feedType);
      console.log(`📈 Total properties available: ${totalCount.toLocaleString()}`);
      console.log(`🔄 Will process in batches of ${this.config.property.batchSize.toLocaleString()}\n`);

      let skip = 0;
      let hasMore = true;

      while (hasMore) {
        const batchNumber = Math.floor(skip / this.config.property.batchSize) + 1;
        const batchStartTime = Date.now();
        
        console.log(`\n📦 ===== BATCH ${batchNumber} =====`);
        console.log(`📥 Fetching records ${skip.toLocaleString()} - ${(skip + this.config.property.batchSize - 1).toLocaleString()}`);

        try {
          // Fetch batch from API
          const properties = await this.ampreApi.fetchBatch('Property', {
            filter: filter,
            orderBy: this.config.property.timestampField,
            top: this.config.property.batchSize,
            skip,
            feedType: feedType
          });

          stats.batches++;
          stats.totalFetched += properties.length;

          console.log(`✅ Fetched ${properties.length.toLocaleString()} properties`);

          if (properties.length === 0) {
            console.log('🏁 No more properties to fetch');
            break;
          }

          // Process the batch
          const batchResult = await this.processPropertyBatch(properties, batchNumber);
          
          stats.totalProcessed += batchResult.processed;
          stats.successful += batchResult.successful;
          stats.failed += batchResult.failed;
          stats.errors.push(...batchResult.errors);

          // Batch timing
          const batchDuration = Date.now() - batchStartTime;
          const recordsPerSecond = Math.round(properties.length / (batchDuration / 1000));
          
          console.log(`⏱️  Batch ${batchNumber} completed in ${Math.round(batchDuration / 1000)}s (${recordsPerSecond} records/sec)`);
          console.log(`📊 Batch Stats: ${batchResult.successful}/${batchResult.processed} successful (${Math.round((batchResult.successful / batchResult.processed) * 100)}%)`);
          
          // Overall progress
          const overallProgress = Math.round((stats.totalFetched / totalCount) * 100);
          console.log(`🎯 Overall Progress: ${stats.totalFetched.toLocaleString()}/${totalCount.toLocaleString()} (${overallProgress}%)`);

          // Record performance metrics
          this.recordPerformanceMetrics(batchDuration, false);

          // Apply intelligent throttling
          await this.applyIntelligentThrottling('property', batchNumber, Math.ceil(totalCount / this.config.property.batchSize));

          skip += this.config.property.batchSize;
          hasMore = properties.length === this.config.property.batchSize && skip < totalCount;

        } catch (batchError) {
          console.error(`❌ Batch ${batchNumber} failed: ${batchError.message}`);
          logger.error('Property batch failed', {
            batchNumber,
            skip,
            error: batchError.message
          });
          
          // Record error in performance metrics
          this.recordPerformanceMetrics(0, true);
          
          stats.failed += this.config.property.batchSize;
          stats.errors.push({
            batch: batchNumber,
            error: batchError.message,
            skip
          });

          // Continue with next batch
          skip += this.config.property.batchSize;
          hasMore = skip < totalCount;
        }
      }

      // Final summary
      const totalDuration = Date.now() - startTime;
      const avgRecordsPerSecond = Math.round(stats.totalProcessed / (totalDuration / 1000));
      
      console.log('\n🎉 ===== PROPERTY SYNC COMPLETED =====');
      console.log(`⏰ Total Duration: ${Math.round(totalDuration / 1000)}s (${Math.round(totalDuration / 60000)}m)`);
      console.log(`📊 Total Batches: ${stats.batches}`);
      console.log(`📥 Total Fetched: ${stats.totalFetched.toLocaleString()}`);
      console.log(`✅ Successful: ${stats.successful.toLocaleString()}`);
      console.log(`❌ Failed: ${stats.failed.toLocaleString()}`);
      console.log(`📈 Success Rate: ${Math.round((stats.successful / stats.totalProcessed) * 100)}%`);
      console.log(`⚡ Average Speed: ${avgRecordsPerSecond} records/sec`);
      
      if (stats.errors.length > 0) {
        console.log(`\n⚠️  ${stats.errors.length} errors occurred (check logs for details)`);
      }

      return stats;

    } catch (error) {
      console.error(`❌ Property sync failed: ${error.message}`);
      logger.error('Enhanced property sync failed', { error: error.message, stats });
      throw error;
    }
  }

  /**
   * Process a batch of properties with database batching
   */
  async processPropertyBatch(properties, batchNumber) {
    const results = {
      processed: properties.length,
      successful: 0,
      failed: 0,
      errors: []
    };

    console.log(`🔄 Processing ${properties.length.toLocaleString()} properties for batch ${batchNumber}...`);

    // Map and validate all properties first
    const mappedProperties = [];
    for (const rawProperty of properties) {
      try {
        const mappedProperty = mapProperty(rawProperty);
        validateProperty(mappedProperty);
        mappedProperties.push(mappedProperty);
      } catch (mappingError) {
        logger.error('Property mapping failed', {
          ListingKey: rawProperty?.ListingKey,
          error: mappingError.message
        });
        results.failed++;
        results.errors.push({
          ListingKey: rawProperty?.ListingKey,
          error: mappingError.message,
          stage: 'mapping'
        });
      }
    }

    console.log(`✅ Mapped ${mappedProperties.length}/${properties.length} properties successfully`);

    if (mappedProperties.length === 0) {
      return results;
    }

    // Upsert to database in smaller batches
    try {
      console.log(`💾 Upserting to database in batches of ${this.config.property.dbBatchSize}...`);
      
      const dbResult = await this.database.upsertProperties(
        mappedProperties, 
        this.config.property.dbBatchSize
      );

      results.successful = dbResult.successful;
      results.failed += dbResult.failed;
      
      if (dbResult.errors && dbResult.errors.length > 0) {
        results.errors.push(...dbResult.errors);
      }

      console.log(`💾 Database upsert: ${dbResult.successful}/${mappedProperties.length} successful`);

    } catch (dbError) {
      logger.error('Database upsert failed for property batch', {
        batchNumber,
        error: dbError.message
      });
      results.failed += mappedProperties.length;
      results.errors.push({
        batch: batchNumber,
        error: dbError.message,
        stage: 'database'
      });
    }

    return results;
  }

  /**
   * Enhanced media sync with property-based filtering (much more efficient)
   */
  async syncMediaInBatches(options = {}) {
    const {
      filter = this.config.media.filter,
      feedType = 'idx',
      usePropertyBasedSync = true // New default: use property-based sync
    } = options;
    
    // Add filter and feedType to options for the sub-methods
    const enhancedOptions = {
      ...options,
      filter,
      feedType
    };
    
    if (usePropertyBasedSync) {
      return this.syncMediaWithPropertyBasedFiltering(enhancedOptions);
    } else {
      // Fallback to timestamp-based pagination for edge cases
      return this.syncMediaWithTimestampPagination(enhancedOptions);
    }
  }

  /**
   * Media sync with property-based filtering (MUCH more efficient)
   * Only fetches media for properties that actually exist in the database
   */
  async syncMediaWithPropertyBasedFiltering(options = {}) {
    const {
      filter = this.config.media.filter,
      feedType = 'idx'
    } = options;

    const startTime = Date.now();
    console.log('\n📸 ===== EFFICIENT MEDIA SYNC (PROPERTY-BASED) STARTED =====');
    console.log(`📊 Batch Size: ${this.config.media.batchSize} records`);
    console.log(`💾 Database Batch Size: ${this.config.media.dbBatchSize} records`);
    console.log(`🔗 Feed Type: ${feedType.toUpperCase()}`);
    console.log(`🎯 Strategy: Fetch media only for existing properties`);
    console.log(`⏰ Started at: ${new Date().toISOString()}\n`);

    const stats = {
      totalProperties: 0,
      totalFetched: 0,
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      errors: [],
      propertyBatches: 0
    };

    try {
      // Get all existing property ListingKeys in batches
      console.log('🔍 Fetching existing property ListingKeys...');
      const propertyKeys = await this.getAllPropertyListingKeys();
      stats.totalProperties = propertyKeys.length;
      console.log(`📊 Found ${propertyKeys.length.toLocaleString()} existing properties`);
      
      if (propertyKeys.length === 0) {
        console.log('⚠️  No properties found in database. Run property sync first.');
        return stats;
      }

      // Process properties in batches to fetch their media
      // Use smaller batches to avoid API filter complexity limits
      const propertyBatchSize = this.config.media.propertyBatchSize || 10; // Configurable batch size
      const totalPropertyBatches = Math.ceil(propertyKeys.length / propertyBatchSize);
      
      console.log(`🔄 Processing ${totalPropertyBatches} property batches (${propertyBatchSize} properties per batch)\n`);

      for (let i = 0; i < propertyKeys.length; i += propertyBatchSize) {
        const propertyBatch = propertyKeys.slice(i, i + propertyBatchSize);
        const batchNumber = Math.floor(i / propertyBatchSize) + 1;
        
        console.log(`\n📦 ===== PROPERTY BATCH ${batchNumber}/${totalPropertyBatches} =====`);
        console.log(`🏠 Processing properties ${i + 1}-${Math.min(i + propertyBatchSize, propertyKeys.length)}`);

        try {
          const batchResult = await this.processPropertyBatchForMedia(propertyBatch, batchNumber, filter, feedType);
          
          stats.totalFetched += batchResult.totalFetched;
          stats.totalProcessed += batchResult.totalProcessed;
          stats.successful += batchResult.successful;
          stats.failed += batchResult.failed;
          stats.errors.push(...batchResult.errors);
          stats.propertyBatches++;

          console.log(`✅ Property batch ${batchNumber}: ${batchResult.successful}/${batchResult.totalProcessed} media records successful`);
          
          // Progress update
          const progress = Math.round((batchNumber / totalPropertyBatches) * 100);
          console.log(`🎯 Overall Progress: ${batchNumber}/${totalPropertyBatches} property batches (${progress}%)`);

          // Apply throttling between property batches
          if (batchNumber < totalPropertyBatches) {
            await this.sleep(this.config.media.throttleDelay);
          }

        } catch (batchError) {
          console.error(`❌ Property batch ${batchNumber} failed: ${batchError.message}`);
          stats.errors.push({
            propertyBatch: batchNumber,
            error: batchError.message
          });
        }
      }

      // Final summary
      const totalDuration = Date.now() - startTime;
      const avgRecordsPerSecond = Math.round(stats.totalProcessed / (totalDuration / 1000));
      
      console.log('\n🎉 ===== EFFICIENT MEDIA SYNC COMPLETED =====');
      console.log(`⏰ Total Duration: ${Math.round(totalDuration / 1000)}s (${Math.round(totalDuration / 60000)}m)`);
      console.log(`🏠 Total Properties: ${stats.totalProperties.toLocaleString()}`);
      console.log(`📊 Property Batches: ${stats.propertyBatches}`);
      console.log(`📥 Total Media Fetched: ${stats.totalFetched.toLocaleString()}`);
      console.log(`✅ Successful: ${stats.successful.toLocaleString()}`);
      console.log(`❌ Failed: ${stats.failed.toLocaleString()}`);
      console.log(`📈 Success Rate: ${Math.round((stats.successful / stats.totalProcessed) * 100)}%`);
      console.log(`⚡ Average Speed: ${avgRecordsPerSecond} records/sec`);
      
      if (stats.errors.length > 0) {
        console.log(`\n⚠️  ${stats.errors.length} errors occurred (check logs for details)`);
      }

      return stats;

    } catch (error) {
      console.error(`❌ Efficient media sync failed: ${error.message}`);
      logger.error('Efficient media sync failed', { error: error.message, stats });
      throw error;
    }
  }

  /**
   * Get all existing property ListingKeys from database
   */
  async getAllPropertyListingKeys() {
    try {
      console.log('🔍 Fetching all property ListingKeys from database...');
      
      const { data, error } = await this.database.client
        .from('Property')
        .select('ListingKey')
        .order('ListingKey');
      
      if (error) {
        throw new Error(`Failed to fetch property keys: ${error.message}`);
      }
      
      const listingKeys = data.map(row => row.ListingKey);
      console.log(`✅ Fetched ${listingKeys.length.toLocaleString()} property ListingKeys`);
      
      return listingKeys;
    } catch (error) {
      logger.error('Failed to fetch property ListingKeys', { error: error.message });
      throw error;
    }
  }

  /**
   * Process a batch of properties to fetch their media
   */
  async processPropertyBatchForMedia(propertyKeys, batchNumber, baseFilter, feedType) {
    const batchStats = {
      totalFetched: 0,
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      errors: []
    };

    try {
      // Try with the full batch first
      let batchCount = 0;
      let combinedFilter = '';
      
      try {
        // Build filter for this batch of properties
        // Use 'or' to match any of the property keys
        const propertyFilter = propertyKeys.map(key => `ResourceRecordKey eq '${key}'`).join(' or ');
        combinedFilter = baseFilter ? `(${baseFilter}) and (${propertyFilter})` : propertyFilter;
        
        console.log(`  🔍 Fetching media for ${propertyKeys.length} properties...`);
        
        // Get count for this batch
        batchCount = await this.ampreApi.getCount('Media', combinedFilter, feedType);
        console.log(`  📊 Found ${batchCount.toLocaleString()} media records for this property batch`);
        
      } catch (countError) {
        console.log(`  ⚠️  Batch filter too complex, falling back to individual property queries...`);
        // Fallback: process properties individually
        return await this.processPropertyBatchIndividually(propertyKeys, batchNumber, baseFilter, feedType);
      }
      
      if (batchCount === 0) {
        console.log('  ⏭️  No media records found for this property batch');
        return batchStats;
      }

      // Fetch all media for this batch of properties
      let skip = 0;
      let hasMore = true;
      let mediaBatchInPropertyBatch = 0;

      while (hasMore) {
        mediaBatchInPropertyBatch++;
        console.log(`  📦 Media batch ${mediaBatchInPropertyBatch} (skip: ${skip.toLocaleString()})`);

        try {
          const mediaRecords = await this.ampreApi.fetchBatch('Media', {
            filter: combinedFilter,
            orderBy: this.config.media.timestampField,
            top: this.config.media.batchSize,
            skip,
            feedType: feedType
          });

          batchStats.totalFetched += mediaRecords.length;

          if (mediaRecords.length === 0) {
            console.log('  🏁 No more media records for this property batch');
            break;
          }

          // Process the media batch (no need for property validation since we already filtered)
          const mediaBatchResult = await this.processMediaBatchDirect(mediaRecords, `${batchNumber}-${mediaBatchInPropertyBatch}`);
          
          batchStats.totalProcessed += mediaBatchResult.processed;
          batchStats.successful += mediaBatchResult.successful;
          batchStats.failed += mediaBatchResult.failed;
          batchStats.errors.push(...mediaBatchResult.errors);

          console.log(`  ✅ Media batch ${mediaBatchInPropertyBatch}: ${mediaBatchResult.successful}/${mediaBatchResult.processed} successful`);

          skip += this.config.media.batchSize;
          hasMore = mediaRecords.length === this.config.media.batchSize && skip < batchCount;

        } catch (mediaBatchError) {
          console.error(`  ❌ Media batch ${mediaBatchInPropertyBatch} failed: ${mediaBatchError.message}`);
          batchStats.failed += this.config.media.batchSize;
          batchStats.errors.push({
            propertyBatch: batchNumber,
            mediaBatch: mediaBatchInPropertyBatch,
            error: mediaBatchError.message
          });
          
          skip += this.config.media.batchSize;
          hasMore = skip < batchCount;
        }
      }

    } catch (error) {
      console.error(`❌ Failed to process property batch for media: ${error.message}`);
      throw error;
    }

    return batchStats;
  }

  /**
   * Fallback method: Process properties individually when batch filters are too complex
   */
  async processPropertyBatchIndividually(propertyKeys, batchNumber, baseFilter, feedType) {
    const batchStats = {
      totalFetched: 0,
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      errors: []
    };

    console.log(`  🔄 Processing ${propertyKeys.length} properties individually...`);

    for (let i = 0; i < propertyKeys.length; i++) {
      const propertyKey = propertyKeys[i];
      console.log(`    🏠 Processing property ${i + 1}/${propertyKeys.length}: ${propertyKey}`);

      try {
        // Build simple filter for single property
        const propertyFilter = `ResourceRecordKey eq '${propertyKey}'`;
        const combinedFilter = baseFilter ? `(${baseFilter}) and (${propertyFilter})` : propertyFilter;
        
        // Get count for this single property
        const propertyCount = await this.ampreApi.getCount('Media', combinedFilter, feedType);
        
        if (propertyCount === 0) {
          console.log(`    ⏭️  No media for property ${propertyKey}`);
          continue;
        }

        console.log(`    📊 Found ${propertyCount.toLocaleString()} media records for property ${propertyKey}`);

        // Fetch all media for this single property
        let skip = 0;
        let hasMore = true;
        let mediaBatchForProperty = 0;

        while (hasMore) {
          mediaBatchForProperty++;
          console.log(`    📦 Media batch ${mediaBatchForProperty} for property ${propertyKey}`);

          try {
            const mediaRecords = await this.ampreApi.fetchBatch('Media', {
              filter: combinedFilter,
              orderBy: this.config.media.timestampField,
              top: this.config.media.batchSize,
              skip,
              feedType: feedType
            });

            batchStats.totalFetched += mediaRecords.length;

            if (mediaRecords.length === 0) {
              console.log(`    🏁 No more media for property ${propertyKey}`);
              break;
            }

            // Process the media batch
            const mediaBatchResult = await this.processMediaBatchDirect(mediaRecords, `${batchNumber}-${propertyKey}-${mediaBatchForProperty}`);
            
            batchStats.totalProcessed += mediaBatchResult.processed;
            batchStats.successful += mediaBatchResult.successful;
            batchStats.failed += mediaBatchResult.failed;
            batchStats.errors.push(...mediaBatchResult.errors);

            console.log(`    ✅ Property ${propertyKey} media batch ${mediaBatchForProperty}: ${mediaBatchResult.successful}/${mediaBatchResult.processed} successful`);

            skip += this.config.media.batchSize;
            hasMore = mediaRecords.length === this.config.media.batchSize && skip < propertyCount;

          } catch (mediaBatchError) {
            console.error(`    ❌ Media batch ${mediaBatchForProperty} failed for property ${propertyKey}: ${mediaBatchError.message}`);
            batchStats.failed += this.config.media.batchSize;
            batchStats.errors.push({
              propertyBatch: batchNumber,
              property: propertyKey,
              mediaBatch: mediaBatchForProperty,
              error: mediaBatchError.message
            });
            
            skip += this.config.media.batchSize;
            hasMore = skip < propertyCount;
          }
        }

        // Small delay between properties to avoid overwhelming the API
        if (i < propertyKeys.length - 1) {
          await this.sleep(100); // 100ms delay between properties
        }

      } catch (propertyError) {
        console.error(`    ❌ Failed to process property ${propertyKey}: ${propertyError.message}`);
        batchStats.errors.push({
          propertyBatch: batchNumber,
          property: propertyKey,
          error: propertyError.message
        });
      }
    }

    return batchStats;
  }

  /**
   * Process media batch directly (without property validation since we already filtered)
   */
  async processMediaBatchDirect(mediaRecords, batchNumber) {
    const results = {
      processed: mediaRecords.length,
      successful: 0,
      failed: 0,
      errors: []
    };

    console.log(`🔄 Processing ${mediaRecords.length.toLocaleString()} media records for batch ${batchNumber}...`);

    // Map and validate all media records first
    const mappedMedia = [];
    for (const rawMedia of mediaRecords) {
      try {
        const mappedMediaRecord = mapMedia(rawMedia);
        validateMedia(mappedMediaRecord);
        mappedMedia.push(mappedMediaRecord);
      } catch (mappingError) {
        logger.error('Media mapping failed', {
          MediaKey: rawMedia?.MediaKey,
          ResourceRecordKey: rawMedia?.ResourceRecordKey,
          error: mappingError.message
        });
        results.failed++;
        results.errors.push({
          MediaKey: rawMedia?.MediaKey,
          ResourceRecordKey: rawMedia?.ResourceRecordKey,
          error: mappingError.message,
          stage: 'mapping'
        });
      }
    }

    console.log(`✅ Mapped ${mappedMedia.length}/${mediaRecords.length} media records successfully`);

    if (mappedMedia.length === 0) {
      return results;
    }

    // No need to filter by existing properties since we already fetched only for existing properties
    console.log(`💾 Upserting ${mappedMedia.length} media records to database in batches of ${this.config.media.dbBatchSize}...`);
    
    try {
      const dbResult = await this.database.upsertMediaBatch(
        mappedMedia, 
        this.config.media.dbBatchSize
      );

      results.successful = dbResult.successful;
      results.failed += dbResult.failed;
      
      if (dbResult.errors && dbResult.errors.length > 0) {
        results.errors.push(...dbResult.errors);
      }

      console.log(`💾 Database upsert: ${dbResult.successful}/${mappedMedia.length} successful`);

    } catch (dbError) {
      logger.error('Database upsert failed for media batch', {
        batchNumber,
        error: dbError.message
      });
      results.failed += mappedMedia.length;
      results.errors.push({
        batch: batchNumber,
        error: dbError.message,
        stage: 'database'
      });
    }

    return results;
  }

  /**
   * Media sync with skip-based pagination (original method, limited to 100K records)
   */
  async syncMediaWithSkipPagination(options = {}) {
    const {
      filter = this.config.media.filter,
      feedType = 'idx'
    } = options;

    const startTime = Date.now();
    console.log('\n📸 ===== ENHANCED MEDIA SYNC STARTED =====');
    console.log(`📊 Batch Size: ${this.config.media.batchSize} records`);
    console.log(`💾 Database Batch Size: ${this.config.media.dbBatchSize} records`);
    console.log(`🔗 Feed Type: ${feedType.toUpperCase()}`);
    console.log(`⏰ Started at: ${new Date().toISOString()}\n`);

    const stats = {
      totalFetched: 0,
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      errors: [],
      batches: 0
    };

    try {
      // Get total count first
      const totalCount = await this.ampreApi.getCount('Media', filter || '', feedType);
      console.log(`📈 Total media records available: ${totalCount.toLocaleString()}`);
      console.log(`🔄 Will process in batches of ${this.config.media.batchSize.toLocaleString()}\n`);

      let skip = 0;
      let hasMore = true;

      while (hasMore) {
        const batchNumber = Math.floor(skip / this.config.media.batchSize) + 1;
        const batchStartTime = Date.now();
        
        console.log(`\n📦 ===== MEDIA BATCH ${batchNumber} =====`);
        console.log(`📥 Fetching records ${skip.toLocaleString()} - ${(skip + this.config.media.batchSize - 1).toLocaleString()}`);

        try {
          // Fetch batch from API
          const mediaRecords = await this.ampreApi.fetchBatch('Media', {
            filter: filter,
            orderBy: this.config.media.timestampField,
            top: this.config.media.batchSize,
            skip,
            feedType: feedType
          });

          stats.batches++;
          stats.totalFetched += mediaRecords.length;

          console.log(`✅ Fetched ${mediaRecords.length.toLocaleString()} media records`);

          if (mediaRecords.length === 0) {
            console.log('🏁 No more media records to fetch');
            break;
          }

          // Process the batch
          const batchResult = await this.processMediaBatch(mediaRecords, batchNumber);
          
          stats.totalProcessed += batchResult.processed;
          stats.successful += batchResult.successful;
          stats.failed += batchResult.failed;
          stats.errors.push(...batchResult.errors);

          // Batch timing
          const batchDuration = Date.now() - batchStartTime;
          const recordsPerSecond = Math.round(mediaRecords.length / (batchDuration / 1000));
          
          console.log(`⏱️  Batch ${batchNumber} completed in ${Math.round(batchDuration / 1000)}s (${recordsPerSecond} records/sec)`);
          console.log(`📊 Batch Stats: ${batchResult.successful}/${batchResult.processed} successful (${Math.round((batchResult.successful / batchResult.processed) * 100)}%)`);
          
          // Overall progress
          const overallProgress = Math.round((stats.totalFetched / totalCount) * 100);
          console.log(`🎯 Overall Progress: ${stats.totalFetched.toLocaleString()}/${totalCount.toLocaleString()} (${overallProgress}%)`);

          skip += this.config.media.batchSize;
          hasMore = mediaRecords.length === this.config.media.batchSize && skip < totalCount;

        } catch (batchError) {
          console.error(`❌ Media batch ${batchNumber} failed: ${batchError.message}`);
          logger.error('Media batch failed', {
            batchNumber,
            skip,
            error: batchError.message
          });
          
          stats.failed += this.config.media.batchSize;
          stats.errors.push({
            batch: batchNumber,
            error: batchError.message,
            skip
          });

          // Continue with next batch
          skip += this.config.media.batchSize;
          hasMore = skip < totalCount;
        }
      }

      // Final summary
      const totalDuration = Date.now() - startTime;
      const avgRecordsPerSecond = Math.round(stats.totalProcessed / (totalDuration / 1000));
      
      console.log('\n🎉 ===== MEDIA SYNC COMPLETED =====');
      console.log(`⏰ Total Duration: ${Math.round(totalDuration / 1000)}s (${Math.round(totalDuration / 60000)}m)`);
      console.log(`📊 Total Batches: ${stats.batches}`);
      console.log(`📥 Total Fetched: ${stats.totalFetched.toLocaleString()}`);
      console.log(`✅ Successful: ${stats.successful.toLocaleString()}`);
      console.log(`❌ Failed: ${stats.failed.toLocaleString()}`);
      console.log(`📈 Success Rate: ${Math.round((stats.successful / stats.totalProcessed) * 100)}%`);
      console.log(`⚡ Average Speed: ${avgRecordsPerSecond} records/sec`);
      
      if (stats.errors.length > 0) {
        console.log(`\n⚠️  ${stats.errors.length} errors occurred (check logs for details)`);
      }

      return stats;

    } catch (error) {
      console.error(`❌ Media sync failed: ${error.message}`);
      logger.error('Enhanced media sync failed', { error: error.message, stats });
      throw error;
    }
  }

  /**
   * Media sync with timestamp-based pagination (bypasses 100K limit)
   * Now processes ALL media for existing properties, not just recent ones
   */
  async syncMediaWithTimestampPagination(options = {}) {
    const {
      filter = this.config.media.filter,
      feedType = 'idx'
    } = options;

    const startTime = Date.now();
    console.log('\n📸 ===== ENHANCED MEDIA SYNC (TIMESTAMP-BASED) STARTED =====');
    console.log(`📊 Batch Size: ${this.config.media.batchSize} records`);
    console.log(`💾 Database Batch Size: ${this.config.media.dbBatchSize} records`);
    console.log(`🔗 Feed Type: ${feedType.toUpperCase()}`);
    console.log(`🎯 Target: ALL media for existing properties (${filter})`);
    console.log(`⏰ Started at: ${new Date().toISOString()}\n`);

    const stats = {
      totalFetched: 0,
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      errors: [],
      timeRanges: 0
    };

    try {
      // Get total count first - this will show ALL media, not just recent
      const totalCount = await this.ampreApi.getCount('Media', filter || '', feedType);
      console.log(`📈 Total media records available: ${totalCount.toLocaleString()}`);
      console.log(`🔄 Will process using timestamp-based pagination to cover ALL historical data\n`);

      // Define time ranges to process using adaptive sizing - starting from 2020
      const timeRanges = this.generateAdaptiveTimeRanges('2020-01-01T00:00:00Z');
      console.log(`📅 Processing ${timeRanges.length} adaptive time ranges (2020-present)`);

      for (let i = 0; i < timeRanges.length; i++) {
        const range = timeRanges[i];
        console.log(`\n📦 ===== TIME RANGE ${i + 1}/${timeRanges.length} =====`);
        console.log(`📅 ${range.start} to ${range.end}`);

        try {
          const rangeResult = await this.processTimeRange(range, i + 1, feedType);
          
          stats.totalFetched += rangeResult.totalFetched;
          stats.totalProcessed += rangeResult.totalProcessed;
          stats.successful += rangeResult.successful;
          stats.failed += rangeResult.failed;
          stats.errors.push(...rangeResult.errors);
          stats.timeRanges++;

          const progress = Math.round(((i + 1) / timeRanges.length) * 100);
          console.log(`🎯 Overall Progress: ${i + 1}/${timeRanges.length} time ranges (${progress}%)`);

        } catch (rangeError) {
          console.error(`❌ Time range ${i + 1} failed: ${rangeError.message}`);
          stats.errors.push({
            timeRange: i + 1,
            range: range,
            error: rangeError.message
          });
        }
      }

      // Final summary
      const totalDuration = Date.now() - startTime;
      const avgRecordsPerSecond = Math.round(stats.totalProcessed / (totalDuration / 1000));
      
      console.log('\n🎉 ===== MEDIA SYNC COMPLETED =====');
      console.log(`⏰ Total Duration: ${Math.round(totalDuration / 1000)}s (${Math.round(totalDuration / 60000)}m)`);
      console.log(`📊 Total Time Ranges: ${stats.timeRanges}`);
      console.log(`📥 Total Fetched: ${stats.totalFetched.toLocaleString()}`);
      console.log(`✅ Successful: ${stats.successful.toLocaleString()}`);
      console.log(`❌ Failed: ${stats.failed.toLocaleString()}`);
      console.log(`📈 Success Rate: ${Math.round((stats.successful / stats.totalProcessed) * 100)}%`);
      console.log(`⚡ Average Speed: ${avgRecordsPerSecond} records/sec`);
      
      if (stats.errors.length > 0) {
        console.log(`\n⚠️  ${stats.errors.length} errors occurred (check logs for details)`);
      }

      return stats;

    } catch (error) {
      console.error(`❌ Media sync failed: ${error.message}`);
      logger.error('Enhanced media sync failed', { error: error.message, stats });
      throw error;
    }
  }

  /**
   * Generate time ranges for timestamp-based pagination with dynamic sizing
   * Uses smaller ranges when approaching 100K limits to ensure complete coverage
   */
  generateTimeRanges() {
    const ranges = [];
    const now = new Date();
    const startDate = new Date('2025-01-01T00:00:00Z');
    
    // Start with monthly ranges, but will adjust based on record counts
    let currentDate = new Date(startDate);
    let rangeSizeMonths = 1; // Start with 1 month ranges
    
    while (currentDate < now) {
      const rangeStart = new Date(currentDate);
      
      // Move to next range based on current size
      const nextDate = new Date(currentDate);
      nextDate.setMonth(nextDate.getMonth() + rangeSizeMonths);
      const rangeEnd = nextDate > now ? new Date(now) : new Date(nextDate);
      
      ranges.push({
        start: rangeStart.toISOString(),
        end: rangeEnd.toISOString(),
        sizeMonths: rangeSizeMonths,
        estimatedRecords: null // Will be populated during processing
      });
      
      currentDate = new Date(nextDate);
    }
    
    return ranges;
  }

  /**
   * Generate adaptive time ranges that adjust based on record density
   * This helps bypass the 100K limit by using smaller ranges where needed
   * Now covers ALL historical data, not just 2025
   */
  generateAdaptiveTimeRanges(baseStartDate = '2020-01-01T00:00:00Z') {
    const ranges = [];
    const now = new Date();
    const startDate = new Date(baseStartDate);
    
    // Start with larger ranges (6 months) for older data, reduce for recent data
    let currentDate = new Date(startDate);
    let rangeSizeMonths = 6; // Start with 6 months for historical data
    
    while (currentDate < now) {
      const rangeStart = new Date(currentDate);
      
      // Create range
      const nextDate = new Date(currentDate);
      nextDate.setMonth(nextDate.getMonth() + rangeSizeMonths);
      const rangeEnd = nextDate > now ? new Date(now) : new Date(nextDate);
      
      ranges.push({
        start: rangeStart.toISOString(),
        end: rangeEnd.toISOString(),
        sizeMonths: rangeSizeMonths,
        adaptive: true
      });
      
      currentDate = new Date(nextDate);
      
      // Reduce range size for more recent data (higher density)
      const monthsSinceStart = (currentDate - startDate) / (1000 * 60 * 60 * 24 * 30);
      if (monthsSinceStart > 24) { // After 2 years
        rangeSizeMonths = 3; // Reduce to 3 months
      }
      if (monthsSinceStart > 36) { // After 3 years
        rangeSizeMonths = 2; // Reduce to 2 months
      }
      if (monthsSinceStart > 48) { // After 4 years (2024+)
        rangeSizeMonths = 1; // Reduce to 1 month for very recent data
      }
    }
    
    return ranges;
  }

  /**
   * Generate time ranges for property timestamp-based pagination (broader range)
   */
  generatePropertyTimeRanges() {
    const ranges = [];
    const now = new Date();
    const startDate = new Date('2020-01-01T00:00:00Z'); // Start from 2020 for properties
    
    // Create monthly ranges from 2020-01-01 to now
    let currentDate = new Date(startDate);
    
    while (currentDate < now) {
      const rangeStart = new Date(currentDate);
      
      // Move to next month
      currentDate.setMonth(currentDate.getMonth() + 1);
      const rangeEnd = currentDate > now ? new Date(now) : new Date(currentDate);
      
      ranges.push({
        start: rangeStart.toISOString(),
        end: rangeEnd.toISOString()
      });
    }
    
    return ranges;
  }

  /**
   * Process a single time range using adaptive pagination to bypass 100K limit
   * Combines base filter (exclude commercial) with timestamp range
   */
  async processTimeRange(range, rangeNumber, feedType = 'idx') {
    const rangeStats = {
      totalFetched: 0,
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      errors: []
    };

    // Build combined filter: base filter + timestamp range
    const baseFilter = this.config.media.filter || '';
    const timeFilter = `MediaModificationTimestamp ge ${range.start} and MediaModificationTimestamp lt ${range.end}`;
    const combinedFilter = baseFilter ? `(${baseFilter}) and (${timeFilter})` : timeFilter;
    
    try {
      // Get count for this time range
      const rangeCount = await this.ampreApi.getCount('Media', combinedFilter, feedType);
      console.log(`📊 Records in range: ${rangeCount.toLocaleString()}`);

      if (rangeCount === 0) {
        console.log('⏭️  No records in this time range, skipping');
        return rangeStats;
      }

      // If range has more than 80K records, split it into smaller sub-ranges
      if (rangeCount > 80000) {
        console.log(`⚠️  Range has ${rangeCount.toLocaleString()} records (>80K), splitting into sub-ranges`);
        return await this.processLargeTimeRange(range, rangeNumber, feedType, rangeCount);
      }

      // Process this range in batches (skip-based, but within 100K limit per range)
      let skip = 0;
      let hasMore = true;
      let batchInRange = 0;

      while (hasMore && skip < 100000) { // Limit to 100K per range
        batchInRange++;
        console.log(`\n  📦 Range ${rangeNumber} - Batch ${batchInRange}`);
        console.log(`  📥 Fetching records ${skip.toLocaleString()} - ${(skip + this.config.media.batchSize - 1).toLocaleString()}`);

        try {
          const mediaRecords = await this.ampreApi.fetchBatch('Media', {
            filter: combinedFilter,
            orderBy: this.config.media.timestampField,
            top: this.config.media.batchSize,
            skip,
            feedType: feedType
          });

          rangeStats.totalFetched += mediaRecords.length;

          if (mediaRecords.length === 0) {
            console.log('  🏁 No more records in this range');
            break;
          }

          // Process the batch
          const batchResult = await this.processMediaBatch(mediaRecords, `${rangeNumber}-${batchInRange}`);
          
          rangeStats.totalProcessed += batchResult.processed;
          rangeStats.successful += batchResult.successful;
          rangeStats.failed += batchResult.failed;
          rangeStats.errors.push(...batchResult.errors);

          console.log(`  ✅ Batch ${batchInRange}: ${batchResult.successful}/${batchResult.processed} successful`);

          skip += this.config.media.batchSize;
          hasMore = mediaRecords.length === this.config.media.batchSize && skip < rangeCount;

        } catch (batchError) {
          console.error(`  ❌ Batch ${batchInRange} failed: ${batchError.message}`);
          rangeStats.failed += this.config.media.batchSize;
          rangeStats.errors.push({
            range: rangeNumber,
            batch: batchInRange,
            error: batchError.message
          });
          
          skip += this.config.media.batchSize;
          hasMore = skip < rangeCount && skip < 100000;
        }
      }

      if (skip >= 100000 && hasMore) {
        console.log(`  ⚠️  Hit 100K limit for this range, some records may be skipped`);
      }

    } catch (error) {
      console.error(`❌ Failed to process time range: ${error.message}`);
      throw error;
    }

    return rangeStats;
  }

  /**
   * Process a large time range by splitting it into smaller sub-ranges
   * This ensures we can handle ranges with more than 100K records
   */
  async processLargeTimeRange(range, rangeNumber, feedType, totalCount) {
    const rangeStats = {
      totalFetched: 0,
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      errors: []
    };

    console.log(`🔄 Splitting large range into sub-ranges to bypass 100K limit`);

    // Split the time range into smaller chunks (weekly or daily depending on density)
    const subRanges = this.splitTimeRange(range, totalCount);
    console.log(`📅 Created ${subRanges.length} sub-ranges`);

    for (let i = 0; i < subRanges.length; i++) {
      const subRange = subRanges[i];
      const subRangeNumber = `${rangeNumber}.${i + 1}`;
      
      console.log(`\n  📦 Sub-range ${subRangeNumber}: ${subRange.start} to ${subRange.end}`);
      
      try {
        const subResult = await this.processTimeRange(subRange, subRangeNumber, feedType);
        
        rangeStats.totalFetched += subResult.totalFetched;
        rangeStats.totalProcessed += subResult.totalProcessed;
        rangeStats.successful += subResult.successful;
        rangeStats.failed += subResult.failed;
        rangeStats.errors.push(...subResult.errors);

      } catch (subError) {
        console.error(`  ❌ Sub-range ${subRangeNumber} failed: ${subError.message}`);
        rangeStats.errors.push({
          range: subRangeNumber,
          error: subError.message
        });
      }
    }

    return rangeStats;
  }

  /**
   * Split a large time range into smaller sub-ranges based on record density
   */
  splitTimeRange(range, totalCount) {
    const startDate = new Date(range.start);
    const endDate = new Date(range.end);
    const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    
    // Calculate appropriate sub-range size based on density
    const recordsPerDay = totalCount / totalDays;
    let subRangeDays;
    
    if (recordsPerDay > 5000) {
      subRangeDays = 1; // Daily ranges for very dense data
    } else if (recordsPerDay > 2000) {
      subRangeDays = 3; // 3-day ranges for dense data
    } else if (recordsPerDay > 1000) {
      subRangeDays = 7; // Weekly ranges for moderate density
    } else {
      subRangeDays = 14; // Bi-weekly ranges for sparse data
    }

    const subRanges = [];
    let currentDate = new Date(startDate);
    
    while (currentDate < endDate) {
      const rangeStart = new Date(currentDate);
      const rangeEnd = new Date(Math.min(
        currentDate.getTime() + (subRangeDays * 24 * 60 * 60 * 1000),
        endDate.getTime()
      ));
      
      subRanges.push({
        start: rangeStart.toISOString(),
        end: rangeEnd.toISOString()
      });
      
      currentDate = new Date(rangeEnd);
    }
    
    return subRanges;
  }

  /**
   * Process a single property time range using skip-based pagination within the range
   */
  async processPropertyTimeRange(range, rangeNumber) {
    const rangeStats = {
      totalFetched: 0,
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      errors: []
    };

    // Build filter for this time range with IDX constraint (excluding commercial properties)
    const timeFilter = `ContractStatus eq 'Available' and PropertyType ne 'Commercial' and ModificationTimestamp ge ${range.start} and ModificationTimestamp lt ${range.end}`;
    
    try {
      // Get count for this time range
      const rangeCount = await this.ampreApi.getCount('Property', timeFilter, 'idx');
      console.log(`📊 Records in range: ${rangeCount.toLocaleString()}`);

      if (rangeCount === 0) {
        console.log('⏭️  No records in this time range, skipping');
        return rangeStats;
      }

      // Process this range in batches (skip-based, but within 100K limit per range)
      let skip = 0;
      let hasMore = true;
      let batchInRange = 0;

      while (hasMore && skip < 100000) { // Limit to 100K per range
        batchInRange++;
        console.log(`\n  📦 Range ${rangeNumber} - Batch ${batchInRange}`);
        console.log(`  📥 Fetching records ${skip.toLocaleString()} - ${(skip + this.config.property.batchSize - 1).toLocaleString()}`);

        try {
          const properties = await this.ampreApi.fetchBatch('Property', {
            filter: timeFilter,
            orderBy: this.config.property.timestampField,
            top: this.config.property.batchSize,
            skip,
            feedType: 'idx'
          });

          rangeStats.totalFetched += properties.length;

          if (properties.length === 0) {
            console.log('  🏁 No more records in this range');
            break;
          }

          // Process the batch
          const batchResult = await this.processPropertyBatch(properties, `${rangeNumber}-${batchInRange}`);
          
          rangeStats.totalProcessed += batchResult.processed;
          rangeStats.successful += batchResult.successful;
          rangeStats.failed += batchResult.failed;
          rangeStats.errors.push(...batchResult.errors);

          console.log(`  ✅ Batch ${batchInRange}: ${batchResult.successful}/${batchResult.processed} successful`);

          skip += this.config.property.batchSize;
          hasMore = properties.length === this.config.property.batchSize && skip < rangeCount;

        } catch (batchError) {
          console.error(`  ❌ Batch ${batchInRange} failed: ${batchError.message}`);
          rangeStats.failed += this.config.property.batchSize;
          rangeStats.errors.push({
            range: rangeNumber,
            batch: batchInRange,
            error: batchError.message
          });
          
          skip += this.config.property.batchSize;
          hasMore = skip < rangeCount && skip < 100000;
        }
      }

      if (skip >= 100000 && hasMore) {
        console.log(`  ⚠️  Hit 100K limit for this range, some records may be skipped`);
      }

    } catch (error) {
      console.error(`❌ Failed to process property time range: ${error.message}`);
      throw error;
    }

    return rangeStats;
  }

  /**
   * Process a batch of media records with database batching
   * Only processes media records where ResourceRecordKey matches existing Property.ListingKey
   */
  async processMediaBatch(mediaRecords, batchNumber) {
    const results = {
      processed: mediaRecords.length,
      successful: 0,
      failed: 0,
      errors: []
    };

    console.log(`🔄 Processing ${mediaRecords.length.toLocaleString()} media records for batch ${batchNumber}...`);

    // Map and validate all media records first
    const mappedMedia = [];
    for (const rawMedia of mediaRecords) {
      try {
        const mappedMediaRecord = mapMedia(rawMedia);
        validateMedia(mappedMediaRecord);
        mappedMedia.push(mappedMediaRecord);
      } catch (mappingError) {
        logger.error('Media mapping failed', {
          MediaKey: rawMedia?.MediaKey,
          ResourceRecordKey: rawMedia?.ResourceRecordKey,
          error: mappingError.message
        });
        results.failed++;
        results.errors.push({
          MediaKey: rawMedia?.MediaKey,
          ResourceRecordKey: rawMedia?.ResourceRecordKey,
          error: mappingError.message,
          stage: 'mapping'
        });
      }
    }

    console.log(`✅ Mapped ${mappedMedia.length}/${mediaRecords.length} media records successfully`);

    if (mappedMedia.length === 0) {
      return results;
    }

    // CRITICAL: Filter media records to only include those with existing properties
    // This ensures we only store media for properties that exist in our database
    console.log(`🔍 Filtering media records to only include those with existing properties...`);
    const validMedia = [];
    const invalidMedia = [];
    
    // Get unique ResourceRecordKeys from the mapped media
    const resourceKeys = [...new Set(mappedMedia.map(m => m.ResourceRecordKey))];
    
    try {
      // Check which properties exist in the database
      const existingProperties = await this.database.client
        .from('Property')
        .select('ListingKey')
        .in('ListingKey', resourceKeys);
      
      if (existingProperties.error) {
        throw new Error(`Failed to check existing properties: ${existingProperties.error.message}`);
      }
      
      const existingKeys = new Set(existingProperties.data.map(p => p.ListingKey));
      
      // Filter media based on existing properties - ONLY process media for existing properties
      for (const media of mappedMedia) {
        if (existingKeys.has(media.ResourceRecordKey)) {
          validMedia.push(media);
        } else {
          invalidMedia.push(media);
          results.failed++;
          results.errors.push({
            MediaKey: media.MediaKey,
            ResourceRecordKey: media.ResourceRecordKey,
            error: 'Referenced property does not exist in database - media will not be stored',
            stage: 'validation'
          });
        }
      }
      
      console.log(`✅ Valid media records: ${validMedia.length}/${mappedMedia.length} (${invalidMedia.length} filtered out - only media for existing properties)`);
      
      if (invalidMedia.length > 0) {
        logger.info('Filtered out media records with non-existent properties', {
          batchNumber,
          validCount: validMedia.length,
          invalidCount: invalidMedia.length,
          sampleInvalidKeys: invalidMedia.slice(0, 3).map(m => m.ResourceRecordKey),
          note: 'Media is only stored for properties that exist in the Property table'
        });
      }
      
    } catch (filterError) {
      logger.error('Failed to filter media records', {
        batchNumber,
        error: filterError.message
      });
      // If filtering fails, we should NOT proceed with all mapped media
      // Instead, we should fail the batch to prevent orphaned media records
      results.failed += mappedMedia.length;
      results.errors.push({
        batch: batchNumber,
        error: `Property validation failed: ${filterError.message}`,
        stage: 'validation'
      });
      
      console.log(`❌ Batch ${batchNumber} failed due to property validation error - no media will be stored`);
      return results;
    }

    if (validMedia.length === 0) {
      console.log(`⚠️  No valid media records to insert for batch ${batchNumber} - all media references non-existent properties`);
      return results;
    }

    // Upsert to database in smaller batches - only valid media records
    try {
      console.log(`💾 Upserting ${validMedia.length} valid media records to database in batches of ${this.config.media.dbBatchSize}...`);
      
      const dbResult = await this.database.upsertMediaBatch(
        validMedia, 
        this.config.media.dbBatchSize
      );

      results.successful = dbResult.successful;
      results.failed += dbResult.failed;
      
      if (dbResult.errors && dbResult.errors.length > 0) {
        results.errors.push(...dbResult.errors);
      }

      console.log(`💾 Database upsert: ${dbResult.successful}/${validMedia.length} successful`);

    } catch (dbError) {
      logger.error('Database upsert failed for media batch', {
        batchNumber,
        error: dbError.message
      });
      results.failed += validMedia.length;
      results.errors.push({
        batch: batchNumber,
        error: dbError.message,
        stage: 'database'
      });
    }

    return results;
  }

  /**
   * Enhanced rooms sync with 5000-record batching
   * IMPORTANT: Rooms are only fetched for IDX records (available properties)
   */
  async syncRoomsInBatches(options = {}) {
    const {
      filter = this.config.rooms.filter,
      feedType = this.config.rooms.feedType || 'idx' // Use config feedType (IDX only)
    } = options;

    // Ensure we're only using IDX feed for rooms
    if (feedType !== 'idx') {
      console.warn(`⚠️  Rooms sync forced to use IDX feed type (was: ${feedType})`);
      feedType = 'idx';
    }

    const startTime = Date.now();
    console.log('\n🏠 ===== ENHANCED ROOMS SYNC STARTED =====');
    console.log(`📊 Batch Size: ${this.config.rooms.batchSize} records`);
    console.log(`💾 Database Batch Size: ${this.config.rooms.dbBatchSize} records`);
    console.log(`🔗 Feed Type: ${feedType.toUpperCase()} (IDX ONLY - Available Properties)`);
    console.log(`🔒 Security: Rooms will only be fetched for IDX properties`);
    console.log(`⏰ Started at: ${new Date().toISOString()}\n`);

    const stats = {
      totalFetched: 0,
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      errors: [],
      batches: 0
    };

    try {
      // Get total count first
      const totalCount = await this.ampreApi.getCount('PropertyRooms', filter, feedType);
      console.log(`📈 Total rooms available: ${totalCount.toLocaleString()}`);
      console.log(`🔄 Will process in batches of ${this.config.rooms.batchSize.toLocaleString()}\n`);

      let skip = 0;
      let hasMore = true;

      while (hasMore) {
        const batchNumber = Math.floor(skip / this.config.rooms.batchSize) + 1;
        const batchStartTime = Date.now();
        
        console.log(`\n📦 ===== ROOMS BATCH ${batchNumber} =====`);
        console.log(`📥 Fetching records ${skip.toLocaleString()} - ${(skip + this.config.rooms.batchSize - 1).toLocaleString()}`);

        try {
          // Fetch batch from API - IDX ONLY
          const rooms = await this.ampreApi.fetchBatch('PropertyRooms', {
            filter: filter,
            orderBy: this.config.rooms.timestampField,
            top: this.config.rooms.batchSize,
            skip,
            feedType: 'idx' // Explicitly force IDX feed type
          });

          stats.batches++;
          stats.totalFetched += rooms.length;

          console.log(`✅ Fetched ${rooms.length.toLocaleString()} rooms (IDX properties only)`);

          if (rooms.length === 0) {
            console.log('🏁 No more rooms to fetch');
            break;
          }

          // Process the batch
          const batchResult = await this.processRoomsBatch(rooms, batchNumber);
          
          stats.totalProcessed += batchResult.processed;
          stats.successful += batchResult.successful;
          stats.failed += batchResult.failed;
          stats.errors.push(...batchResult.errors);

          // Batch timing
          const batchDuration = Date.now() - batchStartTime;
          const recordsPerSecond = Math.round(rooms.length / (batchDuration / 1000));
          
          console.log(`⏱️  Batch ${batchNumber} completed in ${Math.round(batchDuration / 1000)}s (${recordsPerSecond} records/sec)`);
          console.log(`📊 Batch Stats: ${batchResult.successful}/${batchResult.processed} successful (${Math.round((batchResult.successful / batchResult.processed) * 100)}%)`);
          
          // Overall progress
          const overallProgress = Math.round((stats.totalFetched / totalCount) * 100);
          console.log(`🎯 Overall Progress: ${stats.totalFetched.toLocaleString()}/${totalCount.toLocaleString()} (${overallProgress}%)`);

          skip += this.config.rooms.batchSize;
          hasMore = rooms.length === this.config.rooms.batchSize && skip < totalCount;

        } catch (batchError) {
          console.error(`❌ Rooms batch ${batchNumber} failed: ${batchError.message}`);
          logger.error('Rooms batch failed', {
            batchNumber,
            skip,
            error: batchError.message
          });
          
          stats.failed += this.config.rooms.batchSize;
          stats.errors.push({
            batch: batchNumber,
            error: batchError.message,
            skip
          });

          // Continue with next batch
          skip += this.config.rooms.batchSize;
          hasMore = skip < totalCount;
        }
      }

      // Final summary
      const totalDuration = Date.now() - startTime;
      const avgRecordsPerSecond = Math.round(stats.totalProcessed / (totalDuration / 1000));
      
      console.log('\n🎉 ===== ROOMS SYNC COMPLETED =====');
      console.log(`⏰ Total Duration: ${Math.round(totalDuration / 1000)}s (${Math.round(totalDuration / 60000)}m)`);
      console.log(`📊 Total Batches: ${stats.batches}`);
      console.log(`📥 Total Fetched: ${stats.totalFetched.toLocaleString()}`);
      console.log(`✅ Successful: ${stats.successful.toLocaleString()}`);
      console.log(`❌ Failed: ${stats.failed.toLocaleString()}`);
      console.log(`📈 Success Rate: ${Math.round((stats.successful / stats.totalProcessed) * 100)}%`);
      console.log(`⚡ Average Speed: ${avgRecordsPerSecond} records/sec`);
      
      if (stats.errors.length > 0) {
        console.log(`\n⚠️  ${stats.errors.length} errors occurred (check logs for details)`);
      }

      return stats;

    } catch (error) {
      console.error(`❌ Rooms sync failed: ${error.message}`);
      logger.error('Enhanced rooms sync failed', { error: error.message, stats });
      throw error;
    }
  }

  /**
   * Process a batch of rooms with database batching
   */
  async processRoomsBatch(rooms, batchNumber) {
    const results = {
      processed: rooms.length,
      successful: 0,
      failed: 0,
      errors: []
    };

    console.log(`🔄 Processing ${rooms.length.toLocaleString()} rooms for batch ${batchNumber}...`);

    // Map and validate all rooms first
    const mappedRooms = [];
    for (const rawRoom of rooms) {
      try {
        const mappedRoom = mapRoom(rawRoom);
        validateRoom(mappedRoom);
        mappedRooms.push(mappedRoom);
      } catch (mappingError) {
        logger.error('Room mapping failed', {
          RoomKey: rawRoom?.RoomKey,
          ListingKey: rawRoom?.ListingKey,
          error: mappingError.message
        });
        results.failed++;
        results.errors.push({
          RoomKey: rawRoom?.RoomKey,
          ListingKey: rawRoom?.ListingKey,
          error: mappingError.message,
          stage: 'mapping'
        });
      }
    }

    console.log(`✅ Mapped ${mappedRooms.length}/${rooms.length} rooms successfully`);

    if (mappedRooms.length === 0) {
      return results;
    }

    // Filter rooms to only include those with existing IDX properties
    console.log(`🔍 Filtering rooms with existing IDX properties...`);
    const validRooms = [];
    const invalidRooms = [];
    
    // Get unique ListingKeys from the mapped rooms
    const listingKeys = [...new Set(mappedRooms.map(r => r.ListingKey))];
    
    try {
      // Check which IDX properties exist in the database
      const existingProperties = await this.database.client
        .from('Property')
        .select('ListingKey, ContractStatus')
        .in('ListingKey', listingKeys)
        .eq('ContractStatus', 'Available'); // Only IDX (Available) properties
      
      if (existingProperties.error) {
        throw new Error(`Failed to check existing IDX properties: ${existingProperties.error.message}`);
      }
      
      const existingKeys = new Set(existingProperties.data.map(p => p.ListingKey));
      
      // Filter rooms based on existing IDX properties only
      for (const room of mappedRooms) {
        if (existingKeys.has(room.ListingKey)) {
          validRooms.push(room);
        } else {
          invalidRooms.push(room);
          results.failed++;
          results.errors.push({
            RoomKey: room.RoomKey,
            ListingKey: room.ListingKey,
            error: 'Referenced property does not exist as IDX (Available) property in database',
            stage: 'validation'
          });
        }
      }
      
      console.log(`✅ Valid room records: ${validRooms.length}/${mappedRooms.length} (${invalidRooms.length} filtered out - IDX properties only)`);
      
      if (invalidRooms.length > 0) {
        logger.info('Filtered out room records with non-IDX properties', {
          batchNumber,
          validCount: validRooms.length,
          invalidCount: invalidRooms.length,
          sampleInvalidKeys: invalidRooms.slice(0, 3).map(r => r.ListingKey),
          note: 'Only rooms for IDX (Available) properties are processed'
        });
      }
      
    } catch (filterError) {
      logger.error('Failed to filter room records', {
        batchNumber,
        error: filterError.message
      });
      // If filtering fails, proceed with all mapped rooms (will likely fail at database level)
      validRooms.push(...mappedRooms);
    }

    if (validRooms.length === 0) {
      console.log(`⚠️  No valid room records to insert for batch ${batchNumber}`);
      return results;
    }

    // Upsert to database in smaller batches
    try {
      console.log(`💾 Upserting to database in batches of ${this.config.rooms.dbBatchSize}...`);
      
      const dbResult = await this.database.upsertRooms(
        validRooms, 
        this.config.rooms.dbBatchSize
      );

      results.successful = dbResult.successful;
      results.failed += dbResult.failed;
      
      if (dbResult.errors && dbResult.errors.length > 0) {
        results.errors.push(...dbResult.errors);
      }

      console.log(`💾 Database upsert: ${dbResult.successful}/${validRooms.length} successful`);

    } catch (dbError) {
      logger.error('Database upsert failed for rooms batch', {
        batchNumber,
        error: dbError.message
      });
      results.failed += validRooms.length;
      results.errors.push({
        batch: batchNumber,
        error: dbError.message,
        stage: 'database'
      });
    }

    return results;
  }

  /**
   * Enhanced open houses sync with 5000-record batching
   */
  async syncOpenHousesInBatches(options = {}) {
    const {
      filter = this.config.openHouse.filter,
      feedType = 'idx'
    } = options;

    const startTime = Date.now();
    console.log('\n🏠 ===== ENHANCED OPEN HOUSES SYNC STARTED =====');
    console.log(`📊 Batch Size: ${this.config.openHouse.batchSize} records`);
    console.log(`💾 Database Batch Size: ${this.config.openHouse.dbBatchSize} records`);
    console.log(`🔗 Feed Type: ${feedType.toUpperCase()}`);
    console.log(`⏰ Started at: ${new Date().toISOString()}\n`);

    const stats = {
      totalFetched: 0,
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      errors: [],
      batches: 0
    };

    try {
      // Get total count first
      const totalCount = await this.ampreApi.getCount('OpenHouse', filter, feedType);
      console.log(`📈 Total open houses available: ${totalCount.toLocaleString()}`);
      console.log(`🔄 Will process in batches of ${this.config.openHouse.batchSize.toLocaleString()}\n`);

      let skip = 0;
      let hasMore = true;

      while (hasMore) {
        const batchNumber = Math.floor(skip / this.config.openHouse.batchSize) + 1;
        const batchStartTime = Date.now();
        
        console.log(`\n📦 ===== OPEN HOUSES BATCH ${batchNumber} =====`);
        console.log(`📥 Fetching records ${skip.toLocaleString()} - ${(skip + this.config.openHouse.batchSize - 1).toLocaleString()}`);

        try {
          // Fetch batch from API
          const openHouses = await this.ampreApi.fetchBatch('OpenHouse', {
            filter: filter,
            orderBy: this.config.openHouse.timestampField,
            top: this.config.openHouse.batchSize,
            skip,
            feedType: feedType
          });

          stats.batches++;
          stats.totalFetched += openHouses.length;

          console.log(`✅ Fetched ${openHouses.length.toLocaleString()} open houses`);

          if (openHouses.length === 0) {
            console.log('🏁 No more open houses to fetch');
            break;
          }

          // Process the batch
          const batchResult = await this.processOpenHousesBatch(openHouses, batchNumber);
          
          stats.totalProcessed += batchResult.processed;
          stats.successful += batchResult.successful;
          stats.failed += batchResult.failed;
          stats.errors.push(...batchResult.errors);

          // Batch timing
          const batchDuration = Date.now() - batchStartTime;
          const recordsPerSecond = Math.round(openHouses.length / (batchDuration / 1000));
          
          console.log(`⏱️  Batch ${batchNumber} completed in ${Math.round(batchDuration / 1000)}s (${recordsPerSecond} records/sec)`);
          console.log(`📊 Batch Stats: ${batchResult.successful}/${batchResult.processed} successful (${Math.round((batchResult.successful / batchResult.processed) * 100)}%)`);
          
          // Overall progress
          const overallProgress = Math.round((stats.totalFetched / totalCount) * 100);
          console.log(`🎯 Overall Progress: ${stats.totalFetched.toLocaleString()}/${totalCount.toLocaleString()} (${overallProgress}%)`);

          skip += this.config.openHouse.batchSize;
          hasMore = openHouses.length === this.config.openHouse.batchSize && skip < totalCount;

        } catch (batchError) {
          console.error(`❌ Open houses batch ${batchNumber} failed: ${batchError.message}`);
          logger.error('Open houses batch failed', {
            batchNumber,
            skip,
            error: batchError.message
          });
          
          stats.failed += this.config.openHouse.batchSize;
          stats.errors.push({
            batch: batchNumber,
            error: batchError.message,
            skip
          });

          // Continue with next batch
          skip += this.config.openHouse.batchSize;
          hasMore = skip < totalCount;
        }
      }

      // Final summary
      const totalDuration = Date.now() - startTime;
      const avgRecordsPerSecond = Math.round(stats.totalProcessed / (totalDuration / 1000));
      
      console.log('\n🎉 ===== OPEN HOUSES SYNC COMPLETED =====');
      console.log(`⏰ Total Duration: ${Math.round(totalDuration / 1000)}s (${Math.round(totalDuration / 60000)}m)`);
      console.log(`📊 Total Batches: ${stats.batches}`);
      console.log(`📥 Total Fetched: ${stats.totalFetched.toLocaleString()}`);
      console.log(`✅ Successful: ${stats.successful.toLocaleString()}`);
      console.log(`❌ Failed: ${stats.failed.toLocaleString()}`);
      console.log(`📈 Success Rate: ${Math.round((stats.successful / stats.totalProcessed) * 100)}%`);
      console.log(`⚡ Average Speed: ${avgRecordsPerSecond} records/sec`);
      
      if (stats.errors.length > 0) {
        console.log(`\n⚠️  ${stats.errors.length} errors occurred (check logs for details)`);
      }

      return stats;

    } catch (error) {
      console.error(`❌ Open houses sync failed: ${error.message}`);
      logger.error('Enhanced open houses sync failed', { error: error.message, stats });
      throw error;
    }
  }

  /**
   * Process a batch of open houses with database batching
   */
  async processOpenHousesBatch(openHouses, batchNumber) {
    const results = {
      processed: openHouses.length,
      successful: 0,
      failed: 0,
      errors: []
    };

    console.log(`🔄 Processing ${openHouses.length.toLocaleString()} open houses for batch ${batchNumber}...`);

    // Map and validate all open houses first
    const mappedOpenHouses = [];
    for (const rawOpenHouse of openHouses) {
      try {
        const mappedOpenHouse = mapOpenHouse(rawOpenHouse);
        validateOpenHouse(mappedOpenHouse);
        mappedOpenHouses.push(mappedOpenHouse);
      } catch (mappingError) {
        logger.error('Open house mapping failed', {
          OpenHouseKey: rawOpenHouse?.OpenHouseKey,
          ListingKey: rawOpenHouse?.ListingKey,
          error: mappingError.message
        });
        results.failed++;
        results.errors.push({
          OpenHouseKey: rawOpenHouse?.OpenHouseKey,
          ListingKey: rawOpenHouse?.ListingKey,
          error: mappingError.message,
          stage: 'mapping'
        });
      }
    }

    console.log(`✅ Mapped ${mappedOpenHouses.length}/${openHouses.length} open houses successfully`);

    if (mappedOpenHouses.length === 0) {
      return results;
    }

    // Filter open houses to only include those with existing properties
    console.log(`🔍 Filtering open houses with existing properties...`);
    const validOpenHouses = [];
    const invalidOpenHouses = [];
    
    // Get unique ListingKeys from the mapped open houses
    const listingKeys = [...new Set(mappedOpenHouses.map(oh => oh.ListingKey))];
    
    try {
      // Check which properties exist in the database
      const existingProperties = await this.database.client
        .from('Property')
        .select('ListingKey')
        .in('ListingKey', listingKeys);
      
      if (existingProperties.error) {
        throw new Error(`Failed to check existing properties: ${existingProperties.error.message}`);
      }
      
      const existingKeys = new Set(existingProperties.data.map(p => p.ListingKey));
      
      // Filter open houses based on existing properties
      for (const openHouse of mappedOpenHouses) {
        if (existingKeys.has(openHouse.ListingKey)) {
          validOpenHouses.push(openHouse);
        } else {
          invalidOpenHouses.push(openHouse);
          results.failed++;
          results.errors.push({
            OpenHouseKey: openHouse.OpenHouseKey,
            ListingKey: openHouse.ListingKey,
            error: 'Referenced property does not exist in database',
            stage: 'validation'
          });
        }
      }
      
      console.log(`✅ Valid open house records: ${validOpenHouses.length}/${mappedOpenHouses.length} (${invalidOpenHouses.length} filtered out)`);
      
      if (invalidOpenHouses.length > 0) {
        logger.info('Filtered out open house records with non-existent properties', {
          batchNumber,
          validCount: validOpenHouses.length,
          invalidCount: invalidOpenHouses.length,
          sampleInvalidKeys: invalidOpenHouses.slice(0, 3).map(oh => oh.ListingKey)
        });
      }
      
    } catch (filterError) {
      logger.error('Failed to filter open house records', {
        batchNumber,
        error: filterError.message
      });
      // If filtering fails, proceed with all mapped open houses (will likely fail at database level)
      validOpenHouses.push(...mappedOpenHouses);
    }

    if (validOpenHouses.length === 0) {
      console.log(`⚠️  No valid open house records to insert for batch ${batchNumber}`);
      return results;
    }

    // Upsert to database in smaller batches
    try {
      console.log(`💾 Upserting to database in batches of ${this.config.openHouse.dbBatchSize}...`);
      
      const dbResult = await this.database.upsertOpenHouses(
        validOpenHouses, 
        this.config.openHouse.dbBatchSize
      );

      results.successful = dbResult.successful;
      results.failed += dbResult.failed;
      
      if (dbResult.errors && dbResult.errors.length > 0) {
        results.errors.push(...dbResult.errors);
      }

      console.log(`💾 Database upsert: ${dbResult.successful}/${validOpenHouses.length} successful`);

    } catch (dbError) {
      logger.error('Database upsert failed for open houses batch', {
        batchNumber,
        error: dbError.message
      });
      results.failed += validOpenHouses.length;
      results.errors.push({
        batch: batchNumber,
        error: dbError.message,
        stage: 'database'
      });
    }

    return results;
  }

  /**
   * Enhanced single property sync with better error handling
   */
  async syncSingleProperty(listingKey) {
    console.log(`\n🏠 Syncing single property: ${listingKey}`);
    
    try {
      // Fetch property from API with better error handling
      console.log(`📥 Fetching property ${listingKey} from API...`);
      const rawProperty = await this.ampreApi.fetchSingle('Property', listingKey, 'idx');
      
      if (!rawProperty) {
        console.log(`❌ Property ${listingKey} not found`);
        throw new Error(`Property ${listingKey} not found`);
      }

      console.log(`✅ Property ${listingKey} fetched successfully`);

      // Map and validate property
      console.log(`🔄 Mapping and validating property...`);
      const mappedProperty = mapProperty(rawProperty);
      validateProperty(mappedProperty);
      console.log(`✅ Property mapped and validated`);

      // Upsert property to database
      console.log(`💾 Upserting property to database...`);
      const propertyResult = await this.database.upsertProperty(mappedProperty);
      console.log(`✅ Property upserted to database`);

      // Fetch and sync associated media with enhanced error handling
      console.log(`📸 Fetching media for property ${listingKey}...`);
      
      let mediaRecords = [];
      try {
        // WORKAROUND: Due to OData filter issues with ResourceRecordKey, 
        // we'll fetch a small batch and filter locally
        console.log(`⚠️  Using workaround: fetching recent media and filtering locally...`);
        const allRecentMedia = await this.ampreApi.fetchBatch('Media', {
          top: 1000, // Get recent media records
          feedType: 'idx'
        });
        
        // Filter locally for the specific property
        mediaRecords = allRecentMedia.filter(media => media.ResourceRecordKey === listingKey);
        console.log(`✅ Found ${mediaRecords.length} media records for property ${listingKey} (filtered from ${allRecentMedia.length} recent records)`);
      } catch (mediaError) {
        console.log(`⚠️  Failed to fetch media: ${mediaError.message}`);
        logger.error('Failed to fetch media for property', {
          listingKey,
          error: mediaError.message
        });
        // Continue without media if fetch fails
      }

      const mediaResults = {
        attempted: mediaRecords.length,
        successful: 0,
        failed: 0,
        errors: []
      };

      // Process media records - only for the property we just synced
      if (mediaRecords.length > 0) {
        console.log(`🔄 Processing ${mediaRecords.length} media records for property ${listingKey}...`);
        
        for (const rawMedia of mediaRecords) {
          try {
            const mappedMedia = mapMedia(rawMedia);
            validateMedia(mappedMedia);
            
            // Additional validation: ensure the media belongs to the property we're syncing
            if (mappedMedia.ResourceRecordKey !== listingKey) {
              console.log(`⚠️  Skipping media ${rawMedia?.MediaKey} - belongs to different property (${mappedMedia.ResourceRecordKey})`);
              mediaResults.failed++;
              mediaResults.errors.push({
                MediaKey: rawMedia?.MediaKey,
                ResourceRecordKey: mappedMedia.ResourceRecordKey,
                error: 'Media belongs to different property than being synced'
              });
              continue;
            }
            
            // The upsertMedia method will validate that the property exists
            await this.database.upsertMedia(mappedMedia);
            mediaResults.successful++;
          } catch (error) {
            console.log(`❌ Media processing failed: ${rawMedia?.MediaKey} - ${error.message}`);
            logger.error('Error syncing media for property', {
              listingKey,
              MediaKey: rawMedia?.MediaKey,
              ResourceRecordKey: rawMedia?.ResourceRecordKey,
              error: error.message
            });
            mediaResults.failed++;
            mediaResults.errors.push({
              MediaKey: rawMedia?.MediaKey,
              ResourceRecordKey: rawMedia?.ResourceRecordKey,
              error: error.message
            });
          }
        }
        
        console.log(`📸 Media sync: ${mediaResults.successful}/${mediaResults.attempted} successful`);
      }

      const result = {
        property: propertyResult.success,
        media: mediaResults
      };

      console.log(`🎉 Single property sync completed: ${listingKey}`);
      logger.info('Single property sync completed', {
        listingKey,
        result
      });

      return result;

    } catch (error) {
      console.error(`❌ Single property sync failed: ${listingKey} - ${error.message}`);
      logger.error('Error in single property sync', {
        listingKey,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Execute full enhanced sync with properties, media, rooms, and open houses
   */
  async executeFullSync(options = {}) {
    const {
      syncProperties = true,
      syncMedia = true,
      syncRooms = true,
      syncOpenHouses = true
    } = options;

    console.log('\n🚀 ===== ENHANCED FULL SYNC STARTED =====');
    console.log(`⏰ Started at: ${new Date().toISOString()}`);
    console.log(`🏠 Sync Properties: ${syncProperties}`);
    console.log(`📸 Sync Media: ${syncMedia}`);
    console.log(`🏠 Sync Rooms: ${syncRooms}`);
    console.log(`🏠 Sync Open Houses: ${syncOpenHouses}\n`);

    const fullSyncResults = {
      startTime: new Date(),
      endTime: null,
      properties: null,
      media: null,
      rooms: null,
      openHouses: null
    };

    try {
      // Sync properties first (required for other data foreign keys)
      if (syncProperties) {
        fullSyncResults.properties = await this.syncPropertiesInBatches();
      }

      // Sync media
      if (syncMedia) {
        fullSyncResults.media = await this.syncMediaInBatches();
      }

      // Sync rooms (updates existing properties with room data)
      if (syncRooms) {
        fullSyncResults.rooms = await this.syncRoomsInBatches();
      }

      // Sync open houses (updates existing properties with open house data)
      if (syncOpenHouses) {
        fullSyncResults.openHouses = await this.syncOpenHousesInBatches();
      }

      fullSyncResults.endTime = new Date();
      const totalDuration = fullSyncResults.endTime - fullSyncResults.startTime;

      console.log('\n🎉 ===== ENHANCED FULL SYNC COMPLETED =====');
      console.log(`⏰ Total Duration: ${Math.round(totalDuration / 1000)}s (${Math.round(totalDuration / 60000)}m)`);
      
      if (fullSyncResults.properties) {
        console.log(`🏠 Properties: ${fullSyncResults.properties.successful.toLocaleString()}/${fullSyncResults.properties.totalProcessed.toLocaleString()} (${Math.round((fullSyncResults.properties.successful / fullSyncResults.properties.totalProcessed) * 100)}%)`);
      }
      
      if (fullSyncResults.media) {
        console.log(`📸 Media: ${fullSyncResults.media.successful.toLocaleString()}/${fullSyncResults.media.totalProcessed.toLocaleString()} (${Math.round((fullSyncResults.media.successful / fullSyncResults.media.totalProcessed) * 100)}%)`);
      }

      if (fullSyncResults.rooms) {
        console.log(`🏠 Rooms: ${fullSyncResults.rooms.successful.toLocaleString()}/${fullSyncResults.rooms.totalProcessed.toLocaleString()} (${Math.round((fullSyncResults.rooms.successful / fullSyncResults.rooms.totalProcessed) * 100)}%)`);
      }

      if (fullSyncResults.openHouses) {
        console.log(`🏠 Open Houses: ${fullSyncResults.openHouses.successful.toLocaleString()}/${fullSyncResults.openHouses.totalProcessed.toLocaleString()} (${Math.round((fullSyncResults.openHouses.successful / fullSyncResults.openHouses.totalProcessed) * 100)}%)`);
      }

      return fullSyncResults;

    } catch (error) {
      fullSyncResults.endTime = new Date();
      console.error(`❌ Enhanced full sync failed: ${error.message}`);
      logger.error('Enhanced full sync failed', { error: error.message, results: fullSyncResults });
      throw error;
    }
  }

  /**
   * Sync IDX feed (available properties) with timestamp-based pagination to bypass 100K limit
   */
  async syncIdxFeed(options = {}) {
    const startTime = Date.now();
    console.log('\n🏠 ===== IDX FEED SYNC STARTED (TIMESTAMP-BASED) =====');
    console.log(`📊 Batch Size: ${this.config.property.batchSize} records`);
    console.log(`💾 Database Batch Size: ${this.config.property.dbBatchSize} records`);
    console.log(`⏰ Started at: ${new Date().toISOString()}\n`);

    const stats = {
      totalFetched: 0,
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      errors: [],
      timeRanges: 0
    };

    try {
      // Get total count for IDX properties (available listings, excluding commercial)
      const totalCount = await this.ampreApi.getCount('Property', "ContractStatus eq 'Available' and PropertyType ne 'Commercial'", 'idx');
      console.log(`📈 Total IDX properties available: ${totalCount.toLocaleString()}`);
      console.log(`🔄 Will process using timestamp-based pagination to bypass 100K limit\n`);

      // Define time ranges to process (monthly chunks from 2020 to now)
      const timeRanges = this.generatePropertyTimeRanges();
      console.log(`📅 Processing ${timeRanges.length} time ranges`);

      for (let i = 0; i < timeRanges.length; i++) {
        const range = timeRanges[i];
        console.log(`\n📦 ===== TIME RANGE ${i + 1}/${timeRanges.length} =====`);
        console.log(`📅 ${range.start} to ${range.end}`);

        try {
          const rangeResult = await this.processPropertyTimeRange(range, i + 1);
          
          stats.totalFetched += rangeResult.totalFetched;
          stats.totalProcessed += rangeResult.totalProcessed;
          stats.successful += rangeResult.successful;
          stats.failed += rangeResult.failed;
          stats.errors.push(...rangeResult.errors);
          stats.timeRanges++;

          const progress = Math.round(((i + 1) / timeRanges.length) * 100);
          console.log(`🎯 Overall Progress: ${i + 1}/${timeRanges.length} time ranges (${progress}%)`);

        } catch (rangeError) {
          console.error(`❌ Time range ${i + 1} failed: ${rangeError.message}`);
          stats.errors.push({
            timeRange: i + 1,
            range: range,
            error: rangeError.message
          });
        }
      }

      // Final summary
      const totalDuration = Date.now() - startTime;
      const avgRecordsPerSecond = Math.round(stats.totalProcessed / (totalDuration / 1000));
      
      console.log('\n🎉 ===== IDX FEED SYNC COMPLETED =====');
      console.log(`⏰ Total Duration: ${Math.round(totalDuration / 1000)}s (${Math.round(totalDuration / 60000)}m)`);
      console.log(`📊 Total Time Ranges: ${stats.timeRanges}`);
      console.log(`📥 Total Fetched: ${stats.totalFetched.toLocaleString()}`);
      console.log(`✅ Successful: ${stats.successful.toLocaleString()}`);
      console.log(`❌ Failed: ${stats.failed.toLocaleString()}`);
      console.log(`📈 Success Rate: ${Math.round((stats.successful / stats.totalProcessed) * 100)}%`);
      console.log(`⚡ Average Speed: ${avgRecordsPerSecond} records/sec`);
      
      if (stats.errors.length > 0) {
        console.log(`\n⚠️  ${stats.errors.length} errors occurred (check logs for details)`);
      }

      return stats;

    } catch (error) {
      console.error(`❌ IDX feed sync failed: ${error.message}`);
      logger.error('IDX feed sync failed', { error: error.message, stats });
      throw error;
    }
  }

  /**
   * Sync VOW feed (sold/off-market properties) with proper pagination beyond 100K limit
   */
  async syncVowFeed(options = {}) {
    const startTime = Date.now();
    console.log('\n🏠 ===== VOW FEED SYNC STARTED =====');
    console.log(`📊 Batch Size: ${this.config.property.batchSize} records`);
    console.log(`💾 Database Batch Size: ${this.config.property.dbBatchSize} records`);
    console.log(`⏰ Started at: ${new Date().toISOString()}\n`);

    const stats = {
      totalFetched: 0,
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      errors: [],
      batches: 0
    };

    try {
      // Get total count for VOW properties (sold/off-market listings)
      const vowFilter = "ContractStatus ne 'Available' and PropertyType ne 'Commercial'";
      const totalCount = await this.ampreApi.getCount('Property', vowFilter, 'vow');
      console.log(`📈 Total VOW properties available: ${totalCount.toLocaleString()}`);
      console.log(`🔄 Will process in batches of ${this.config.property.batchSize.toLocaleString()}\n`);

      let skip = 0;
      let hasMore = true;

      while (hasMore) {
        const batchNumber = Math.floor(skip / this.config.property.batchSize) + 1;
        const batchStartTime = Date.now();
        
        console.log(`\n📦 ===== VOW BATCH ${batchNumber} =====`);
        console.log(`📥 Fetching records ${skip.toLocaleString()} - ${(skip + this.config.property.batchSize - 1).toLocaleString()}`);

        try {
          // Fetch batch from VOW API
          const properties = await this.ampreApi.fetchBatch('Property', {
            filter: vowFilter,
            orderBy: this.config.property.timestampField,
            top: this.config.property.batchSize,
            skip,
            feedType: 'vow'
          });

          stats.batches++;
          stats.totalFetched += properties.length;

          console.log(`✅ Fetched ${properties.length.toLocaleString()} VOW properties`);

          if (properties.length === 0) {
            console.log('🏁 No more VOW properties to fetch');
            break;
          }

          // Process the batch
          const batchResult = await this.processPropertyBatch(properties, batchNumber);
          
          stats.totalProcessed += batchResult.processed;
          stats.successful += batchResult.successful;
          stats.failed += batchResult.failed;
          stats.errors.push(...batchResult.errors);

          // Batch timing
          const batchDuration = Date.now() - batchStartTime;
          const recordsPerSecond = Math.round(properties.length / (batchDuration / 1000));
          
          console.log(`⏱️  Batch ${batchNumber} completed in ${Math.round(batchDuration / 1000)}s (${recordsPerSecond} records/sec)`);
          console.log(`📊 Batch Stats: ${batchResult.successful}/${batchResult.processed} successful (${Math.round((batchResult.successful / batchResult.processed) * 100)}%)`);
          
          // Overall progress
          const overallProgress = Math.round((stats.totalFetched / totalCount) * 100);
          console.log(`🎯 Overall Progress: ${stats.totalFetched.toLocaleString()}/${totalCount.toLocaleString()} (${overallProgress}%)`);

          skip += this.config.property.batchSize;
          hasMore = properties.length === this.config.property.batchSize && skip < totalCount;

        } catch (batchError) {
          console.error(`❌ VOW Batch ${batchNumber} failed: ${batchError.message}`);
          logger.error('VOW batch failed', {
            batchNumber,
            skip,
            error: batchError.message
          });
          
          stats.failed += this.config.property.batchSize;
          stats.errors.push({
            batch: batchNumber,
            error: batchError.message,
            skip
          });

          // Continue with next batch
          skip += this.config.property.batchSize;
          hasMore = skip < totalCount;
        }
      }

      // Final summary
      const totalDuration = Date.now() - startTime;
      const avgRecordsPerSecond = Math.round(stats.totalProcessed / (totalDuration / 1000));
      
      console.log('\n🎉 ===== VOW FEED SYNC COMPLETED =====');
      console.log(`⏰ Total Duration: ${Math.round(totalDuration / 1000)}s (${Math.round(totalDuration / 60000)}m)`);
      console.log(`📊 Total Batches: ${stats.batches}`);
      console.log(`📥 Total Fetched: ${stats.totalFetched.toLocaleString()}`);
      console.log(`✅ Successful: ${stats.successful.toLocaleString()}`);
      console.log(`❌ Failed: ${stats.failed.toLocaleString()}`);
      console.log(`📈 Success Rate: ${Math.round((stats.successful / stats.totalProcessed) * 100)}%`);
      console.log(`⚡ Average Speed: ${avgRecordsPerSecond} records/sec`);
      
      if (stats.errors.length > 0) {
        console.log(`\n⚠️  ${stats.errors.length} errors occurred (check logs for details)`);
      }

      return stats;

    } catch (error) {
      console.error(`❌ VOW feed sync failed: ${error.message}`);
      logger.error('VOW feed sync failed', { error: error.message, stats });
      throw error;
    }
  }

  /**
   * Execute incremental sync based on last sync timestamp
   */
  async executeIncrementalSync(options = {}) {
    const startTime = Date.now();
    console.log('\n🔄 ===== INCREMENTAL SYNC STARTED =====');
    console.log(`⏰ Started at: ${new Date().toISOString()}\n`);

    const results = {
      startTime: new Date(),
      endTime: null,
      properties: null,
      media: null
    };

    try {
      // Get last sync timestamp from database or use default
      const lastSyncTimestamp = await this.getLastSyncTimestamp();
      console.log(`📅 Last sync timestamp: ${lastSyncTimestamp}`);

      // Sync properties incrementally
      console.log('🏠 Starting incremental property sync...');
      const propertyFilter = `ModificationTimestamp gt ${lastSyncTimestamp}`;
      const propertyCount = await this.ampreApi.getCount('Property', propertyFilter, 'idx');
      console.log(`📊 Found ${propertyCount.toLocaleString()} updated properties`);

      if (propertyCount > 0) {
        results.properties = await this.syncPropertiesInBatches({
          filter: propertyFilter,
          feedType: 'idx'
        });
      }

      // Sync media incrementally
      console.log('📸 Starting incremental media sync...');
      const mediaFilter = `MediaModificationTimestamp gt ${lastSyncTimestamp}`;
      const mediaCount = await this.ampreApi.getCount('Media', mediaFilter, 'idx');
      console.log(`📊 Found ${mediaCount.toLocaleString()} updated media records`);

      if (mediaCount > 0) {
        results.media = await this.syncMediaInBatches({
          filter: mediaFilter,
          feedType: 'idx'
        });
      }

      // Update last sync timestamp
      await this.updateLastSyncTimestamp();

      results.endTime = new Date();
      const totalDuration = results.endTime - results.startTime;

      console.log('\n🎉 ===== INCREMENTAL SYNC COMPLETED =====');
      console.log(`⏰ Total Duration: ${Math.round(totalDuration / 1000)}s (${Math.round(totalDuration / 60000)}m)`);
      
      if (results.properties) {
        console.log(`🏠 Properties: ${results.properties.successful.toLocaleString()}/${results.properties.totalProcessed.toLocaleString()} (${Math.round((results.properties.successful / results.properties.totalProcessed) * 100)}%)`);
      }
      
      if (results.media) {
        console.log(`📸 Media: ${results.media.successful.toLocaleString()}/${results.media.totalProcessed.toLocaleString()} (${Math.round((results.media.successful / results.media.totalProcessed) * 100)}%)`);
      }

      return results;

    } catch (error) {
      results.endTime = new Date();
      console.error(`❌ Incremental sync failed: ${error.message}`);
      logger.error('Incremental sync failed', { error: error.message, results });
      throw error;
    }
  }

  /**
   * Execute scheduled sync (same as full sync but with scheduling context)
   */
  async executeScheduledSync(options = {}) {
    console.log('\n⏰ ===== SCHEDULED SYNC STARTED =====');
    console.log(`📅 Scheduled at: ${new Date().toISOString()}`);
    
    // For now, scheduled sync is the same as full sync
    // In the future, this could include additional logic like:
    // - Checking if sync is already running
    // - Sending notifications
    // - Logging to a separate scheduled sync log
    // - Different error handling for automated runs
    
    return await this.executeFullSync(options);
  }

  /**
   * Get last sync timestamp from database
   */
  async getLastSyncTimestamp() {
    try {
      // Try to get from a sync_log table or use a default
      const result = await this.database.client
        .from('sync_log')
        .select('last_sync_timestamp')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (result.data && result.data.last_sync_timestamp) {
        return result.data.last_sync_timestamp;
      }
    } catch (error) {
      logger.warn('Could not get last sync timestamp, using default', { error: error.message });
    }

    // Default to 24 hours ago if no previous sync found
    const defaultTimestamp = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    return defaultTimestamp;
  }

  /**
   * Update last sync timestamp in database
   */
  async updateLastSyncTimestamp() {
    try {
      const timestamp = new Date().toISOString();
      await this.database.client
        .from('sync_log')
        .insert({
          last_sync_timestamp: timestamp,
          sync_type: 'incremental',
          created_at: timestamp
        });
      
      logger.info('Last sync timestamp updated', { timestamp });
    } catch (error) {
      logger.error('Failed to update last sync timestamp', { error: error.message });
      // Don't throw error as this is not critical for the sync operation
    }
  }
}

export default EnhancedSyncService;
