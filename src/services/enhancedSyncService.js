import AmpreApiService from './ampreApiService.js';
import DatabaseService from './databaseService.js';
import logger from '../utils/logger.js';
import { mapProperty, validateProperty } from '../../mappers/mapProperty.js';
import { mapMedia, validateMedia } from '../../mappers/mapMedia.js';

/**
 * Enhanced Sync Service with improved batching and error handling
 */
class EnhancedSyncService {
  constructor() {
    this.ampreApi = new AmpreApiService();
    this.database = new DatabaseService();
    
    // Enhanced sync configuration with 5000-record batching
    this.config = {
      property: {
        batchSize: 5000, // Increased to 5000 as requested
        endpoint: 'Property',
        keyField: 'ListingKey',
        timestampField: 'ModificationTimestamp',
        filter: null, // Removed problematic filter due to OData type issues
        dbBatchSize: 100 // Database operations in smaller chunks
      },
      media: {
        batchSize: 5000, // Increased to 5000 as requested
        endpoint: 'Media',
        keyField: 'MediaKey',
        timestampField: 'MediaModificationTimestamp', // Use correct timestamp field for media
        filter: 'MediaModificationTimestamp ge 2025-01-01T00:00:00Z', // Only get media from 2025
        dbBatchSize: 100 // Database operations in smaller chunks
      }
    };

    logger.info('Enhanced Sync Service initialized', { config: this.config });
  }

  /**
   * Enhanced property sync with 5000-record batching
   */
  async syncPropertiesInBatches(options = {}) {
    const startTime = Date.now();
    console.log('\n🏠 ===== ENHANCED PROPERTY SYNC STARTED =====');
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
      // Get total count first
      const totalCount = await this.ampreApi.getCount('Property', this.config.property.filter);
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
            filter: this.config.property.filter,
            orderBy: this.config.property.timestampField,
            top: this.config.property.batchSize,
            skip,
            feedType: 'idx'
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

          skip += this.config.property.batchSize;
          hasMore = properties.length === this.config.property.batchSize && skip < totalCount;

        } catch (batchError) {
          console.error(`❌ Batch ${batchNumber} failed: ${batchError.message}`);
          logger.error('Property batch failed', {
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
   * Enhanced media sync with 5000-record batching
   */
  async syncMediaInBatches(options = {}) {
    const startTime = Date.now();
    console.log('\n📸 ===== ENHANCED MEDIA SYNC STARTED =====');
    console.log(`📊 Batch Size: ${this.config.media.batchSize} records`);
    console.log(`💾 Database Batch Size: ${this.config.media.dbBatchSize} records`);
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
      const totalCount = await this.ampreApi.getCount('Media', this.config.media.filter || '');
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
            filter: this.config.media.filter,
            orderBy: this.config.media.timestampField,
            top: this.config.media.batchSize,
            skip,
            feedType: 'idx'
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
   * Process a batch of media records with database batching
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

    // Filter media records to only include those with existing properties
    console.log(`🔍 Filtering media records with existing properties...`);
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
      
      // Filter media based on existing properties
      for (const media of mappedMedia) {
        if (existingKeys.has(media.ResourceRecordKey)) {
          validMedia.push(media);
        } else {
          invalidMedia.push(media);
          results.failed++;
          results.errors.push({
            MediaKey: media.MediaKey,
            ResourceRecordKey: media.ResourceRecordKey,
            error: 'Referenced property does not exist in database',
            stage: 'validation'
          });
        }
      }
      
      console.log(`✅ Valid media records: ${validMedia.length}/${mappedMedia.length} (${invalidMedia.length} filtered out)`);
      
      if (invalidMedia.length > 0) {
        logger.info('Filtered out media records with non-existent properties', {
          batchNumber,
          validCount: validMedia.length,
          invalidCount: invalidMedia.length,
          sampleInvalidKeys: invalidMedia.slice(0, 3).map(m => m.ResourceRecordKey)
        });
      }
      
    } catch (filterError) {
      logger.error('Failed to filter media records', {
        batchNumber,
        error: filterError.message
      });
      // If filtering fails, proceed with all mapped media (will likely fail at database level)
      validMedia.push(...mappedMedia);
    }

    if (validMedia.length === 0) {
      console.log(`⚠️  No valid media records to insert for batch ${batchNumber}`);
      return results;
    }

    // Upsert to database in smaller batches
    try {
      console.log(`💾 Upserting to database in batches of ${this.config.media.dbBatchSize}...`);
      
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

      // Process media records
      if (mediaRecords.length > 0) {
        console.log(`🔄 Processing ${mediaRecords.length} media records...`);
        
        for (const rawMedia of mediaRecords) {
          try {
            const mappedMedia = mapMedia(rawMedia);
            validateMedia(mappedMedia);
            await this.database.upsertMedia(mappedMedia);
            mediaResults.successful++;
          } catch (error) {
            console.log(`❌ Media processing failed: ${rawMedia?.MediaKey} - ${error.message}`);
            logger.error('Error syncing media for property', {
              listingKey,
              MediaKey: rawMedia?.MediaKey,
              error: error.message
            });
            mediaResults.failed++;
            mediaResults.errors.push({
              MediaKey: rawMedia?.MediaKey,
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
   * Execute full enhanced sync with both properties and media
   */
  async executeFullSync(options = {}) {
    const {
      syncProperties = true,
      syncMedia = true
    } = options;

    console.log('\n🚀 ===== ENHANCED FULL SYNC STARTED =====');
    console.log(`⏰ Started at: ${new Date().toISOString()}`);
    console.log(`🏠 Sync Properties: ${syncProperties}`);
    console.log(`📸 Sync Media: ${syncMedia}\n`);

    const fullSyncResults = {
      startTime: new Date(),
      endTime: null,
      properties: null,
      media: null
    };

    try {
      // Sync properties first (required for media foreign keys)
      if (syncProperties) {
        fullSyncResults.properties = await this.syncPropertiesInBatches();
      }

      // Sync media
      if (syncMedia) {
        fullSyncResults.media = await this.syncMediaInBatches();
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

      return fullSyncResults;

    } catch (error) {
      fullSyncResults.endTime = new Date();
      console.error(`❌ Enhanced full sync failed: ${error.message}`);
      logger.error('Enhanced full sync failed', { error: error.message, results: fullSyncResults });
      throw error;
    }
  }
}

export default EnhancedSyncService;
