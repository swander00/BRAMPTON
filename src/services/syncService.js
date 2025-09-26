import AmpreApiService from './ampreApiService.js';
import DatabaseService from './databaseService.js';
import logger from '../utils/logger.js';
import { 
  BATCH_SIZE_PROPERTY, 
  BATCH_SIZE_MEDIA, 
  SYNC_START_DATE 
} from '../config/config.js';
import { mapProperty, validateProperty } from '../../mappers/mapProperty.js';
import { mapMedia, validateMedia } from '../../mappers/mapMedia.js';
import { mapRoom, validateRoom } from '../../mappers/mapRoom.js';
import { mapOpenHouse, validateOpenHouse } from '../../mappers/mapOpenHouse.js';

/**
 * Sync Service with time-based pagination and parent-child integrity
 * Handles IDX, VOW, Media, PropertyRooms, and OpenHouse with efficient backfill
 */
class SyncService {
  constructor() {
    this.ampreApi = new AmpreApiService();
    this.database = new DatabaseService();
    
    // Get sync start date from environment
    this.syncStartDate = SYNC_START_DATE;
    
    // Configuration for each endpoint with time-based pagination
    this.config = {
      property: {
        batchSize: BATCH_SIZE_PROPERTY,
        endpoint: 'Property',
        keyField: 'ListingKey',
        timestampField: 'ModificationTimestamp',
        dbBatchSize: 100, // Default database batch size
        throttleDelay: 1000 // Default throttle delay
      },
      media: {
        batchSize: BATCH_SIZE_MEDIA,
        endpoint: 'Media',
        keyField: 'MediaKey',
        timestampField: 'MediaModificationTimestamp', // Different timestamp field for media
        dbBatchSize: 100, // Default database batch size
        throttleDelay: 750, // Media throttle delay
        propertyBatchSize: 500 // Property batch size for media
      },
      rooms: {
        batchSize: BATCH_SIZE_PROPERTY,
        endpoint: 'PropertyRooms',
        keyField: 'RoomKey',
        timestampField: 'ModificationTimestamp',
        dbBatchSize: 100, // Default database batch size
        throttleDelay: 1000 // Default throttle delay
      },
      openHouse: {
        batchSize: BATCH_SIZE_PROPERTY,
        endpoint: 'OpenHouse',
        keyField: 'OpenHouseKey',
        timestampField: 'ModificationTimestamp',
        dbBatchSize: 100, // Default database batch size
        throttleDelay: 1000 // Default throttle delay
      }
    };

    // Sync state management
    this.syncState = {
      lastSyncTimestamps: {},
      propertyKeys: new Set(), // Cache for parent-child integrity
      isPropertyKeysLoaded: false
    };

    // Performance tracking
    this.stats = {
      totalProcessed: 0,
      totalSuccessful: 0,
      totalFailed: 0,
      startTime: null,
      errors: []
    };
  }

  /**
   * Main entry point for sync operations with CLI support
   */
  async executeSync(options = {}) {
    const args = process.argv.slice(2);
    const syncOptions = this.parseCliArgs(args, options);
    
    this.stats.startTime = new Date();
    console.log(`🚀 Starting Enhanced Sync - ${this.stats.startTime.toISOString()}`);
    console.log(`📋 Sync Options:`, syncOptions);
    
    try {
      // Load last sync timestamps
      await this.loadLastSyncTimestamps();
      
      // Execute based on CLI switches or options
      if (syncOptions.idx || syncOptions.vow || syncOptions.media || syncOptions.rooms || syncOptions.openhouse) {
        // Selective sync
        await this.executeSelectiveSync(syncOptions);
      } else {
        // Full sync with sequential parent-child execution
        await this.executeFullSync(syncOptions);
      }
      
      await this.updateLastSyncTimestamps();
      this.printFinalStats();
      
    } catch (error) {
      logger.error('Sync execution failed:', error);
      console.error('❌ Sync failed:', error.message);
      throw error;
    }
  }

  /**
   * Parse CLI arguments for selective syncing
   */
  parseCliArgs(args, options = {}) {
    const syncOptions = {
      idx: args.includes('--idx'),
      vow: args.includes('--vow'),
      media: args.includes('--media'),
      rooms: args.includes('--rooms'),
      openhouse: args.includes('--openhouse'),
      force: args.includes('--force'),
      ...options
    };
    
    // If no specific switches, enable all
    if (!syncOptions.idx && !syncOptions.vow && !syncOptions.media && !syncOptions.rooms && !syncOptions.openhouse) {
      syncOptions.idx = true;
      syncOptions.vow = true;
      syncOptions.media = true;
      syncOptions.rooms = true;
      syncOptions.openhouse = true;
    }
    
    return syncOptions;
  }

  /**
   * Execute selective sync based on CLI switches
   */
  async executeSelectiveSync(options) {
    console.log('🎯 Executing Selective Sync');
    
    if (options.idx) {
      console.log('\n📊 === IDX SYNC ===');
      console.log('🔄 Syncing available properties (IDX feed)...');
      await this.syncWithTimePagination('idx', 'Property');
    }
    
    if (options.vow) {
      console.log('\n📊 === VOW SYNC ===');
      console.log('🔄 Syncing sold/off-market properties (VOW feed)...');
      await this.syncWithTimePagination('vow', 'Property');
    }
    
    if (options.media) {
      console.log('\n🖼️  === MEDIA SYNC ===');
      console.log('🔄 Syncing property media (photos, videos)...');
      await this.syncMediaWithParentIntegrity();
    }
    
    if (options.rooms) {
      console.log('\n🏠 === PROPERTY ROOMS SYNC ===');
      console.log('🔄 Syncing property room details...');
      await this.syncRoomsWithParentIntegrity();
    }
    
    if (options.openhouse) {
      console.log('\n🏡 === OPEN HOUSE SYNC ===');
      console.log('🔄 Syncing open house events...');
      await this.syncOpenHousesWithParentIntegrity();
    }
  }

  /**
   * Execute full sync with sequential parent-child execution
   */
  async executeFullSync(options) {
    console.log('🔄 Executing Full Sync with Parent-Child Integrity');
    
    // Step 1: Sync Properties (Parent)
    console.log('\n📊 === PROPERTY SYNC (PARENT) ===');
    await this.syncWithTimePagination('idx', 'Property');
    await this.syncWithTimePagination('vow', 'Property');
    
    // Load property keys for parent-child integrity
    await this.loadPropertyKeys();
    
    // Step 2: Sync Children (Media, Rooms, OpenHouses)
    console.log('\n🖼️  === MEDIA SYNC (CHILD) ===');
    await this.syncMediaWithParentIntegrity();
    
    console.log('\n🏠 === PROPERTY ROOMS SYNC (CHILD) ===');
    await this.syncRoomsWithParentIntegrity();
    
    console.log('\n🏡 === OPEN HOUSE SYNC (CHILD) ===');
    await this.syncOpenHousesWithParentIntegrity();
  }

  /**
   * Generic time-based pagination sync for Properties (IDX/VOW)
   */
  async syncWithTimePagination(feedType, endpoint, options = {}) {
    const config = this.config.property;
    const lastTimestamp = this.syncState.lastSyncTimestamps[`${feedType}_property`];
    
    console.log(`⏰ Starting ${feedType.toUpperCase()} ${endpoint} sync`);
    console.log(`📅 Last sync: ${lastTimestamp || 'Never'}`);
    
    const stats = {
      totalFetched: 0,
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      batches: 0,
      errors: []
    };

    try {
      // Get total count for progress tracking
      const totalCount = await this.getTotalCount(feedType, endpoint, lastTimestamp);
      console.log(`📊 Total records to process: ${totalCount.toLocaleString()}`);
      
      if (totalCount === 0) {
        console.log(`✨ No new ${feedType.toUpperCase()} records to sync - database is up to date!`);
        return stats;
      }
      
      // Process in time-based chunks
      // Always use syncStartDate to ensure we only sync data from the specified start date
      let currentTimestamp = this.syncStartDate;
      let processedCount = 0;
      
      while (processedCount < totalCount) {
        const batchStats = await this.processTimeBatch(
          feedType, 
          endpoint, 
          currentTimestamp, 
          config.batchSize,
          stats.batches + 1
        );
        
        // Update stats
        stats.totalFetched += batchStats.fetched;
        stats.totalProcessed += batchStats.processed;
        stats.successful += batchStats.successful;
        stats.failed += batchStats.failed;
        stats.batches++;
        stats.errors.push(...batchStats.errors);
        
        processedCount += batchStats.fetched;
        currentTimestamp = batchStats.lastTimestamp;
        
        // Progress update
        const progress = ((processedCount / totalCount) * 100).toFixed(1);
        console.log(`📈 Progress: ${progress}% (${processedCount.toLocaleString()}/${totalCount.toLocaleString()})`);
        
        // Break if no more records
        if (batchStats.fetched === 0) {
          console.log(`🏁 No more ${feedType.toUpperCase()} records available - sync complete!`);
          break;
        }
        
        // Throttle
        await this.sleep(config.throttleDelay);
      }
      
      // Update last sync timestamp
      this.syncState.lastSyncTimestamps[`${feedType}_property`] = new Date().toISOString();
      
      console.log(`✅ ${feedType.toUpperCase()} ${endpoint} sync completed`);
      console.log(`📊 Final stats: ${stats.successful.toLocaleString()} successful, ${stats.failed.toLocaleString()} failed, ${stats.batches} batches`);

    } catch (error) {
      logger.error(`${feedType} ${endpoint} sync failed:`, error);
      stats.errors.push(error.message);
      throw error;
    }
    
    return stats;
  }

  /**
   * Media sync with parent-child integrity - OPTIMIZED VERSION
   * Fetches media only for properties we have, instead of all media
   */
  async syncMediaWithParentIntegrity() {
    const config = this.config.media;
    const lastTimestamp = this.syncState.lastSyncTimestamps.media;
    
    console.log('⏰ Starting OPTIMIZED Media sync with parent integrity');
    console.log(`📅 Last sync: ${lastTimestamp || 'Never'}`);
    
    // Ensure property keys are loaded
    if (!this.syncState.isPropertyKeysLoaded) {
      await this.loadPropertyKeys();
    }
    
    const stats = {
      totalFetched: 0,
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      batches: 0,
      errors: []
    };

    try {
      console.log(`🏠 Property keys loaded: ${this.syncState.propertyKeys.size.toLocaleString()}`);
      
      if (this.syncState.propertyKeys.size === 0) {
        console.log('⚠️  No property keys found - skipping media sync');
        return stats;
      }
      
      // Convert property keys to array for API filtering
      const propertyKeysArray = Array.from(this.syncState.propertyKeys);
      console.log(`🔍 Fetching media for ${propertyKeysArray.length} specific properties`);
      
      // Process properties in batches to avoid URL length limits
      const propertyBatchSize = 10; // Process only 10 properties at a time to avoid URL length limits
      let processedProperties = 0;
      
      for (let i = 0; i < propertyKeysArray.length; i += propertyBatchSize) {
        const propertyBatch = propertyKeysArray.slice(i, i + propertyBatchSize);
        const batchNumber = Math.floor(i / propertyBatchSize) + 1;
        
        console.log(`🔄 Processing property batch ${batchNumber}: ${propertyBatch.length} properties`);
        
        const batchStats = await this.processMediaBatchForProperties(
          propertyBatch,
          config.batchSize,
          batchNumber
        );
        
        // Update stats
        stats.totalFetched += batchStats.fetched;
        stats.totalProcessed += batchStats.processed;
        stats.successful += batchStats.successful;
        stats.failed += batchStats.failed;
        stats.skipped += batchStats.skipped;
        stats.batches++;
        stats.errors.push(...batchStats.errors);
        
        processedProperties += propertyBatch.length;
        
        // Progress update
        const progress = ((processedProperties / propertyKeysArray.length) * 100).toFixed(1);
        console.log(`📈 Progress: ${progress}% (${processedProperties}/${propertyKeysArray.length} properties) - Media: ${stats.successful.toLocaleString()} successful`);
        
        await this.sleep(config.throttleDelay);
      }
      
      this.syncState.lastSyncTimestamps.media = new Date().toISOString();
      
      console.log(`✅ OPTIMIZED Media sync completed`);
      console.log(`📊 Final stats: ${stats.successful.toLocaleString()} successful, ${stats.failed.toLocaleString()} failed, ${stats.skipped.toLocaleString()} skipped`);
      
    } catch (error) {
      logger.error('Optimized Media sync failed:', error);
      stats.errors.push(error.message);
      throw error;
    }
    
    return stats;
  }

  /**
   * PropertyRooms sync with parent-child integrity
   */
  async syncRoomsWithParentIntegrity() {
    const config = this.config.rooms;
    const lastTimestamp = this.syncState.lastSyncTimestamps.rooms;
    
    console.log('⏰ Starting PropertyRooms sync with parent integrity');
    console.log(`📅 Last sync: ${lastTimestamp || 'Never'}`);
    
    // Ensure property keys are loaded
    if (!this.syncState.isPropertyKeysLoaded) {
      await this.loadPropertyKeys();
    }
    
    const stats = {
      totalFetched: 0,
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      batches: 0,
      errors: []
    };
    
    try {
      const totalCount = await this.getTotalCount('idx', 'PropertyRooms', lastTimestamp);
      console.log(`📊 Total room records: ${totalCount.toLocaleString()}`);
      console.log(`🏠 Property keys loaded: ${this.syncState.propertyKeys.size.toLocaleString()}`);
      
      if (totalCount === 0) {
        console.log('✨ No new room records to sync - database is up to date!');
        return stats;
      }
      
      let currentTimestamp = lastTimestamp || this.syncStartDate;
      let processedCount = 0;
      
      while (processedCount < totalCount) {
        const batchStats = await this.processRoomsTimeBatch(
          currentTimestamp,
          config.batchSize,
          stats.batches + 1
        );
        
        stats.totalFetched += batchStats.fetched;
        stats.totalProcessed += batchStats.processed;
        stats.successful += batchStats.successful;
        stats.failed += batchStats.failed;
        stats.skipped += batchStats.skipped;
        stats.batches++;
        stats.errors.push(...batchStats.errors);
        
        processedCount += batchStats.fetched;
        currentTimestamp = batchStats.lastTimestamp;
        
        const progress = ((processedCount / totalCount) * 100).toFixed(1);
        console.log(`📈 Progress: ${progress}% (${processedCount.toLocaleString()}/${totalCount.toLocaleString()}) - Skipped: ${stats.skipped.toLocaleString()}`);
        
        if (batchStats.fetched === 0) {
          console.log('🏁 No more room records available - sync complete!');
          break;
        }
        
        await this.sleep(config.throttleDelay);
      }
      
      this.syncState.lastSyncTimestamps.rooms = new Date().toISOString();
      
      console.log(`✅ PropertyRooms sync completed`);
      console.log(`📊 Final stats: ${stats.successful.toLocaleString()} successful, ${stats.failed.toLocaleString()} failed, ${stats.skipped.toLocaleString()} skipped`);

    } catch (error) {
      logger.error('PropertyRooms sync failed:', error);
      stats.errors.push(error.message);
      throw error;
    }
    
    return stats;
  }

  /**
   * OpenHouse sync with parent-child integrity
   */
  async syncOpenHousesWithParentIntegrity() {
    const config = this.config.openHouse;
    const lastTimestamp = this.syncState.lastSyncTimestamps.openhouse;
    
    console.log('⏰ Starting OpenHouse sync with parent integrity');
    console.log(`📅 Last sync: ${lastTimestamp || 'Never'}`);
    
    // Ensure property keys are loaded
    if (!this.syncState.isPropertyKeysLoaded) {
      await this.loadPropertyKeys();
    }
    
    const stats = {
      totalFetched: 0,
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      batches: 0,
      errors: []
    };
    
    try {
      const totalCount = await this.getTotalCount('idx', 'OpenHouse', lastTimestamp);
      console.log(`📊 Total open house records: ${totalCount.toLocaleString()}`);
      console.log(`🏠 Property keys loaded: ${this.syncState.propertyKeys.size.toLocaleString()}`);
      
      if (totalCount === 0) {
        console.log('✨ No new open house records to sync - database is up to date!');
        return stats;
      }
      
      let currentTimestamp = lastTimestamp || this.syncStartDate;
      let processedCount = 0;
      
      while (processedCount < totalCount) {
        const batchStats = await this.processOpenHousesTimeBatch(
          currentTimestamp,
          config.batchSize,
          stats.batches + 1
        );
        
        stats.totalFetched += batchStats.fetched;
        stats.totalProcessed += batchStats.processed;
        stats.successful += batchStats.successful;
        stats.failed += batchStats.failed;
        stats.skipped += batchStats.skipped;
        stats.batches++;
        stats.errors.push(...batchStats.errors);
        
        processedCount += batchStats.fetched;
        currentTimestamp = batchStats.lastTimestamp;
        
        const progress = ((processedCount / totalCount) * 100).toFixed(1);
        console.log(`📈 Progress: ${progress}% (${processedCount.toLocaleString()}/${totalCount.toLocaleString()}) - Skipped: ${stats.skipped.toLocaleString()}`);
        
        if (batchStats.fetched === 0) {
          console.log('🏁 No more open house records available - sync complete!');
          break;
        }
        
        await this.sleep(config.throttleDelay);
      }
      
      this.syncState.lastSyncTimestamps.openhouse = new Date().toISOString();
      
      console.log(`✅ OpenHouse sync completed`);
      console.log(`📊 Final stats: ${stats.successful.toLocaleString()} successful, ${stats.failed.toLocaleString()} failed, ${stats.skipped.toLocaleString()} skipped`);
      
    } catch (error) {
      logger.error('OpenHouse sync failed:', error);
      stats.errors.push(error.message);
      throw error;
    }
    
    return stats;
  }

  /**
   * Process a time-based batch for Properties
   */
  async processTimeBatch(feedType, endpoint, fromTimestamp, batchSize, batchNumber) {
    const config = this.config.property;
    const stats = {
      fetched: 0,
      processed: 0,
      successful: 0,
      failed: 0,
      lastTimestamp: fromTimestamp,
      errors: []
    };

    try {
      // Build filter for time-based pagination
      const filter = {
        $filter: `${config.timestampField} gt ${fromTimestamp}`,
        $orderby: `${config.timestampField} asc`,
        $top: batchSize
      };
      
      console.log(`🔄 Batch ${batchNumber}: Fetching ${feedType} ${endpoint} from ${fromTimestamp}`);
      
      // Fetch data using specific methods that use predefined URLs with filters
      let response;
      if (feedType === 'idx') {
        response = await this.ampreApi.fetchIdxProperties({
          top: filter.$top,
          skip: filter.$skip
        });
      } else if (feedType === 'vow') {
        response = await this.ampreApi.fetchVowProperties({
          top: filter.$top,
          skip: filter.$skip
        });
      } else {
        // Fallback to generic method for other endpoints
        response = await this.ampreApi.fetchBatch(endpoint, {
          filter: filter.$filter,
          orderBy: filter.$orderby,
          top: filter.$top,
          feedType: feedType
        });
      }
      
      const records = response || [];
      
      stats.fetched = records.length;
      stats.lastTimestamp = fromTimestamp;
      
      if (records.length === 0) {
        console.log(`📭 Batch ${batchNumber}: No records found`);
        return stats;
      }
      
      console.log(`📥 Batch ${batchNumber}: Fetched ${records.length} records`);
      
      // Process records
      const processedRecords = await this.processPropertyBatch(records, batchNumber);
      
      stats.processed = processedRecords.length;
      stats.successful = processedRecords.filter(r => r.success).length;
      stats.failed = processedRecords.filter(r => !r.success).length;
      stats.errors = processedRecords.filter(r => !r.success).map(r => r.error);
      
      // Update last timestamp from the last record
      if (records.length > 0) {
        const lastRecord = records[records.length - 1];
        stats.lastTimestamp = lastRecord[config.timestampField];
      }
      
      console.log(`✅ Batch ${batchNumber}: Processed ${stats.processed}, Success: ${stats.successful}, Failed: ${stats.failed}`);
      
    } catch (error) {
      logger.error(`Batch ${batchNumber} failed:`, error);
      stats.errors.push(error.message);
      throw error;
    }
    
    return stats;
  }

  /**
   * Process media for a specific batch of properties - OPTIMIZED VERSION
   * Fetches media only for the provided property keys
   */
  async processMediaBatchForProperties(propertyKeys, batchSize, batchNumber) {
    const config = this.config.media;
    const stats = {
      fetched: 0,
      processed: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      errors: []
    };
    
    try {
      // Create OData filter for specific property keys
      // Format: ResourceRecordKey eq 'key1' or ResourceRecordKey eq 'key2' or ...
      const propertyFilter = propertyKeys
        .map(key => `ResourceRecordKey eq '${key}'`)
        .join(' or ');
      
      console.log(`🔄 Batch ${batchNumber}: Fetching Media for ${propertyKeys.length} properties`);
      
      // Fetch media with property-specific filter
      const response = await this.ampreApi.fetchMediaWithFilter({
        filter: propertyFilter,
        top: batchSize,
        orderBy: 'MediaModificationTimestamp asc'
      });
      
      const records = response || [];
      stats.fetched = records.length;
      
      if (records.length === 0) {
        console.log(`📭 Batch ${batchNumber}: No media records found for these properties`);
        return stats;
      }
      
      console.log(`📥 Batch ${batchNumber}: Fetched ${records.length} media records for ${propertyKeys.length} properties`);
      
      // All records should be valid since we filtered at API level
      const validRecords = records;
      stats.skipped = 0; // No skipping needed since we pre-filtered
      
      if (validRecords.length === 0) {
        console.log(`⏭️  Batch ${batchNumber}: No valid media records`);
        return stats;
      }
      
      console.log(`🔍 Batch ${batchNumber}: ${validRecords.length} valid records (0 skipped - pre-filtered)`);
      
      // Process valid records
      const processedRecords = await this.processMediaBatch(validRecords, batchNumber);
      
      stats.processed = processedRecords.length;
      stats.successful = processedRecords.filter(r => r.success).length;
      stats.failed = processedRecords.filter(r => !r.success).length;
      stats.errors = processedRecords.filter(r => !r.success).map(r => r.error);
      
      console.log(`✅ Batch ${batchNumber}: Processed ${stats.processed}, Success: ${stats.successful}, Failed: ${stats.failed}, Skipped: ${stats.skipped}`);

    } catch (error) {
      logger.error(`Media batch ${batchNumber} failed:`, error);
      stats.errors.push(error.message);
      throw error;
    }
    
    return stats;
  }

  /**
   * Process a time-based batch for Media with parent integrity (LEGACY - kept for fallback)
   */
  async processMediaTimeBatch(fromTimestamp, batchSize, batchNumber) {
    const config = this.config.media;
    const stats = {
      fetched: 0,
      processed: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      lastTimestamp: fromTimestamp,
      errors: []
    };
    
    try {
      const filter = {
        $filter: `${config.timestampField} gt ${fromTimestamp}`,
        $orderby: `${config.timestampField} asc`,
        $top: batchSize
      };
      
      console.log(`🔄 Batch ${batchNumber}: Fetching Media from ${fromTimestamp}`);
      
      const response = await this.ampreApi.fetchMedia({
        top: filter.$top,
        skip: filter.$skip
      });
      const records = response || [];
      
      stats.fetched = records.length;
      
      if (records.length === 0) {
        console.log(`📭 Batch ${batchNumber}: No media records found`);
        return stats;
      }
      
      console.log(`📥 Batch ${batchNumber}: Fetched ${records.length} media records`);
      
      // Filter records by parent integrity
      const validRecords = records.filter(record => 
        this.syncState.propertyKeys.has(record.ResourceRecordKey)
      );
      
      stats.skipped = records.length - validRecords.length;
      
      if (validRecords.length === 0) {
        console.log(`⏭️  Batch ${batchNumber}: All ${records.length} records skipped (no parent property)`);
        stats.lastTimestamp = records[records.length - 1][config.timestampField];
        return stats;
      }
      
      console.log(`🔍 Batch ${batchNumber}: ${validRecords.length} valid records (${stats.skipped} skipped)`);
      
      // Process valid records
      const processedRecords = await this.processMediaBatch(validRecords, batchNumber);
      
      stats.processed = processedRecords.length;
      stats.successful = processedRecords.filter(r => r.success).length;
      stats.failed = processedRecords.filter(r => !r.success).length;
      stats.errors = processedRecords.filter(r => !r.success).map(r => r.error);
      
      if (records.length > 0) {
        stats.lastTimestamp = records[records.length - 1][config.timestampField];
      }
      
      console.log(`✅ Batch ${batchNumber}: Processed ${stats.processed}, Success: ${stats.successful}, Failed: ${stats.failed}, Skipped: ${stats.skipped}`);

    } catch (error) {
      logger.error(`Media batch ${batchNumber} failed:`, error);
      stats.errors.push(error.message);
      throw error;
    }
    
    return stats;
  }

  /**
   * Process a time-based batch for PropertyRooms with parent integrity
   */
  async processRoomsTimeBatch(fromTimestamp, batchSize, batchNumber) {
    const config = this.config.rooms;
    const stats = {
      fetched: 0,
      processed: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      lastTimestamp: fromTimestamp,
      errors: []
    };
    
    try {
      const filter = {
        $filter: `${config.timestampField} gt ${fromTimestamp}`,
        $orderby: `${config.timestampField} asc`,
        $top: batchSize
      };
      
      console.log(`🔄 Batch ${batchNumber}: Fetching PropertyRooms from ${fromTimestamp}`);
      
      const response = await this.ampreApi.fetchPropertyRooms({
        top: filter.$top,
        skip: filter.$skip
      });
      const records = response || [];
      
      stats.fetched = records.length;
      
      if (records.length === 0) {
        console.log(`📭 Batch ${batchNumber}: No room records found`);
        return stats;
      }
      
      console.log(`📥 Batch ${batchNumber}: Fetched ${records.length} room records`);
      
      // Filter records by parent integrity
      const validRecords = records.filter(record => 
        this.syncState.propertyKeys.has(record.ListingKey)
      );
      
      stats.skipped = records.length - validRecords.length;
      
      if (validRecords.length === 0) {
        console.log(`⏭️  Batch ${batchNumber}: All ${records.length} records skipped (no parent property)`);
        stats.lastTimestamp = records[records.length - 1][config.timestampField];
        return stats;
      }
      
      console.log(`🔍 Batch ${batchNumber}: ${validRecords.length} valid records (${stats.skipped} skipped)`);
      
      // Process valid records
      const processedRecords = await this.processRoomsBatch(validRecords, batchNumber);
      
      stats.processed = processedRecords.length;
      stats.successful = processedRecords.filter(r => r.success).length;
      stats.failed = processedRecords.filter(r => !r.success).length;
      stats.errors = processedRecords.filter(r => !r.success).map(r => r.error);
      
      if (records.length > 0) {
        stats.lastTimestamp = records[records.length - 1][config.timestampField];
      }
      
      console.log(`✅ Batch ${batchNumber}: Processed ${stats.processed}, Success: ${stats.successful}, Failed: ${stats.failed}, Skipped: ${stats.skipped}`);
      
    } catch (error) {
      logger.error(`Rooms batch ${batchNumber} failed:`, error);
      stats.errors.push(error.message);
      throw error;
    }
    
    return stats;
  }

  /**
   * Process a time-based batch for OpenHouses with parent integrity
   */
  async processOpenHousesTimeBatch(fromTimestamp, batchSize, batchNumber) {
    const config = this.config.openHouse;
    const stats = {
      fetched: 0,
      processed: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      lastTimestamp: fromTimestamp,
      errors: []
    };

    try {
      const filter = {
        $filter: `${config.timestampField} gt ${fromTimestamp}`,
        $orderby: `${config.timestampField} asc`,
        $top: batchSize
      };
      
      console.log(`🔄 Batch ${batchNumber}: Fetching OpenHouses from ${fromTimestamp}`);
      
      const response = await this.ampreApi.fetchOpenHouses({
        top: filter.$top,
        skip: filter.$skip
      });
      const records = response || [];
      
      stats.fetched = records.length;
      
      if (records.length === 0) {
        console.log(`📭 Batch ${batchNumber}: No open house records found`);
        return stats;
      }
      
      console.log(`📥 Batch ${batchNumber}: Fetched ${records.length} open house records`);
      
      // Filter records by parent integrity
      const validRecords = records.filter(record => 
        this.syncState.propertyKeys.has(record.ListingKey)
      );
      
      stats.skipped = records.length - validRecords.length;
      
      if (validRecords.length === 0) {
        console.log(`⏭️  Batch ${batchNumber}: All ${records.length} records skipped (no parent property)`);
        stats.lastTimestamp = records[records.length - 1][config.timestampField];
        return stats;
      }
      
      console.log(`🔍 Batch ${batchNumber}: ${validRecords.length} valid records (${stats.skipped} skipped)`);
      
      // Process valid records
      const processedRecords = await this.processOpenHousesBatch(validRecords, batchNumber);
      
      stats.processed = processedRecords.length;
      stats.successful = processedRecords.filter(r => r.success).length;
      stats.failed = processedRecords.filter(r => !r.success).length;
      stats.errors = processedRecords.filter(r => !r.success).map(r => r.error);
      
      if (records.length > 0) {
        stats.lastTimestamp = records[records.length - 1][config.timestampField];
      }
      
      console.log(`✅ Batch ${batchNumber}: Processed ${stats.processed}, Success: ${stats.successful}, Failed: ${stats.failed}, Skipped: ${stats.skipped}`);
      
    } catch (error) {
      logger.error(`OpenHouses batch ${batchNumber} failed:`, error);
      stats.errors.push(error.message);
      throw error;
    }
    
    return stats;
  }

  /**
   * Get total count for an endpoint with timestamp filter
   */
  async getTotalCount(feedType, endpoint, fromTimestamp) {
    try {
      const config = this.getConfigForEndpoint(endpoint);
      // Always use syncStartDate to ensure we only sync data from the specified start date
      const effectiveTimestamp = this.syncStartDate;
      const filter = `${config.timestampField} gt ${effectiveTimestamp}`;
      
      if (endpoint === 'Property') {
        if (feedType === 'idx') {
          return await this.ampreApi.getCountFromCompleteUrl('idxProperties', 'idx');
        } else if (feedType === 'vow') {
          return await this.ampreApi.getCountFromCompleteUrl('vowProperties', 'vow');
        }
      } else if (endpoint === 'Media') {
        return await this.ampreApi.getCountFromCompleteUrl('media', 'idx');
      } else if (endpoint === 'PropertyRooms') {
        return await this.ampreApi.getCountFromCompleteUrl('propertyRooms', 'idx');
      } else if (endpoint === 'OpenHouse') {
        return await this.ampreApi.getCountFromCompleteUrl('openHouse', 'idx');
      }
      
      return 0;
    } catch (error) {
      logger.error(`Failed to get count for ${feedType} ${endpoint}:`, error);
      return 0;
    }
  }

  /**
   * Get configuration for a specific endpoint
   */
  getConfigForEndpoint(endpoint) {
    switch (endpoint) {
      case 'Property': return this.config.property;
      case 'Media': return this.config.media;
      case 'PropertyRooms': return this.config.rooms;
      case 'OpenHouse': return this.config.openHouse;
      default: return this.config.property;
    }
  }

  /**
   * Load property keys for parent-child integrity
   */
  async loadPropertyKeys() {
    try {
      console.log('🏠 Loading property keys for parent-child integrity...');
      
      // Load ALL property keys in batches to avoid Supabase's 1000 record limit
      this.syncState.propertyKeys.clear();
      let offset = 0;
      const batchSize = 1000;
      let totalLoaded = 0;
      
      while (true) {
        const { data, error } = await this.database.client
          .from('Property')
          .select('ListingKey')
          .range(offset, offset + batchSize - 1);
        
        if (error) {
          throw new Error(`Failed to load property keys: ${error.message}`);
        }
        
        if (!data || data.length === 0) {
          break; // No more records
        }
        
        // Add keys to set
        data.forEach(property => {
          this.syncState.propertyKeys.add(property.ListingKey);
        });
        
        totalLoaded += data.length;
        offset += batchSize;
        
        // If we got fewer records than batch size, we've reached the end
        if (data.length < batchSize) {
          break;
        }
      }
      
      this.syncState.isPropertyKeysLoaded = true;
      console.log(`✅ Loaded ${this.syncState.propertyKeys.size.toLocaleString()} property keys`);

    } catch (error) {
      logger.error('Failed to load property keys:', error);
      throw error;
    }
  }

  /**
   * Load last sync timestamps from database
   */
  async loadLastSyncTimestamps() {
    try {
      const { data, error } = await this.database.client
        .from('SyncLog')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(1);
      
      if (error) {
        logger.warn('Failed to load sync timestamps:', error);
        return;
      }
      
      if (data && data.length > 0) {
        const lastSync = data[0];
        this.syncState.lastSyncTimestamps = {
          idx_property: lastSync.idx_property_timestamp,
          vow_property: lastSync.vow_property_timestamp,
          media: lastSync.media_timestamp,
          rooms: lastSync.rooms_timestamp,
          openhouse: lastSync.openhouse_timestamp
        };
        
        console.log('📅 Loaded last sync timestamps:', this.syncState.lastSyncTimestamps);
      }
      
    } catch (error) {
      logger.warn('Failed to load last sync timestamps:', error);
    }
  }

  /**
   * Update last sync timestamps in database
   */
  async updateLastSyncTimestamps() {
    try {
      const timestamp = new Date().toISOString();
      
      const { error } = await this.database.client
        .from('SyncLog')
        .insert({
          timestamp,
          idx_property_timestamp: this.syncState.lastSyncTimestamps.idx_property,
          vow_property_timestamp: this.syncState.lastSyncTimestamps.vow_property,
          media_timestamp: this.syncState.lastSyncTimestamps.media,
          rooms_timestamp: this.syncState.lastSyncTimestamps.rooms,
          openhouse_timestamp: this.syncState.lastSyncTimestamps.openhouse,
          total_processed: this.stats.totalProcessed,
          total_successful: this.stats.totalSuccessful,
          total_failed: this.stats.totalFailed
        });
      
      if (error) {
        logger.error('Failed to update sync timestamps:', error);
      } else {
        console.log('✅ Updated sync timestamps in database');
      }
      
    } catch (error) {
      logger.error('Failed to update sync timestamps:', error);
    }
  }

  /**
   * Process property batch with validation and mapping
   */
  async processPropertyBatch(properties, batchNumber) {
    const results = [];
    
    try {
      // Map and validate properties
      const mappedProperties = await Promise.all(properties.map(async property => {
        try {
          const mapped = await mapProperty(property);
          const validation = validateProperty(mapped);
          
          if (!validation.isValid) {
            return { success: false, error: `Validation failed: ${validation.errors.join(', ')}` };
          }
          
          return { success: true, data: mapped };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }));
      
      // Filter successful mappings
      const validProperties = mappedProperties
        .filter(result => result.success)
        .map(result => result.data);
      
      if (validProperties.length === 0) {
        console.log(`⚠️  Batch ${batchNumber}: No valid properties to upsert`);
        return mappedProperties;
      }
      
      // Upsert to database in chunks
      const dbBatchSize = this.config.property.dbBatchSize;
      for (let i = 0; i < validProperties.length; i += dbBatchSize) {
        const chunk = validProperties.slice(i, i + dbBatchSize);
        
        const { error } = await this.database.client
          .from('Property')
          .upsert(chunk, { onConflict: 'ListingKey' });
        
        if (error) {
          logger.error(`Database upsert failed for batch ${batchNumber}, chunk ${i / dbBatchSize + 1}:`, error);
          // Mark all records in this chunk as failed
          chunk.forEach(() => {
            results.push({ success: false, error: error.message });
          });
        } else {
          // Mark all records in this chunk as successful
          chunk.forEach(() => {
            results.push({ success: true });
          });
        }
      }

      // Add failed mappings to results
      const failedMappings = mappedProperties.filter(result => !result.success);
      results.push(...failedMappings);
      
    } catch (error) {
      logger.error(`Property batch ${batchNumber} processing failed:`, error);
      properties.forEach(() => {
        results.push({ success: false, error: error.message });
      });
    }
    
    return results;
  }

  /**
   * Process media batch with validation and mapping
   */
  async processMediaBatch(mediaRecords, batchNumber) {
    const results = [];
    
    try {
      // Map and validate media
      const mappedMedia = await Promise.all(mediaRecords.map(async media => {
        try {
          const mapped = await mapMedia(media);
          const validation = validateMedia(mapped);
          
          if (!validation.isValid) {
            return { success: false, error: `Validation failed: ${validation.errors.join(', ')}` };
          }
          
          return { success: true, data: mapped };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }));
      
      // Filter successful mappings
      const validMedia = mappedMedia
        .filter(result => result.success)
        .map(result => result.data);
      
      if (validMedia.length === 0) {
        console.log(`⚠️  Batch ${batchNumber}: No valid media to upsert`);
        return mappedMedia;
      }
      
      // Upsert to database in chunks
      const dbBatchSize = this.config.media.dbBatchSize;
      for (let i = 0; i < validMedia.length; i += dbBatchSize) {
        const chunk = validMedia.slice(i, i + dbBatchSize);
        
        const { error } = await this.database.client
          .from('Media')
          .upsert(chunk, { onConflict: 'MediaKey' });
        
        if (error) {
          logger.error(`Database upsert failed for media batch ${batchNumber}, chunk ${i / dbBatchSize + 1}:`, error);
          chunk.forEach(() => {
            results.push({ success: false, error: error.message });
          });
        } else {
          chunk.forEach(() => {
            results.push({ success: true });
          });
        }
      }
      
      // Add failed mappings to results
      const failedMappings = mappedMedia.filter(result => !result.success);
      results.push(...failedMappings);

    } catch (error) {
      logger.error(`Media batch ${batchNumber} processing failed:`, error);
      mediaRecords.forEach(() => {
        results.push({ success: false, error: error.message });
      });
    }
    
    return results;
  }

  /**
   * Process rooms batch with validation and mapping
   */
  async processRoomsBatch(rooms, batchNumber) {
    const results = [];
    
    try {
      // Map and validate rooms
      const mappedRooms = await Promise.all(rooms.map(async room => {
        try {
          const mapped = await mapRoom(room);
          const validation = validateRoom(mapped);
          
          if (!validation.isValid) {
            return { success: false, error: `Validation failed: ${validation.errors.join(', ')}` };
          }
          
          return { success: true, data: mapped };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }));
      
      // Filter successful mappings
      const validRooms = mappedRooms
        .filter(result => result.success)
        .map(result => result.data);
      
      if (validRooms.length === 0) {
        console.log(`⚠️  Batch ${batchNumber}: No valid rooms to upsert`);
        return mappedRooms;
      }
      
      // Upsert to database in chunks
      const dbBatchSize = this.config.rooms.dbBatchSize;
      for (let i = 0; i < validRooms.length; i += dbBatchSize) {
        const chunk = validRooms.slice(i, i + dbBatchSize);
        
        const { error } = await this.database.client
          .from('PropertyRooms')
          .upsert(chunk, { onConflict: 'RoomKey' });
        
        if (error) {
          logger.error(`Database upsert failed for rooms batch ${batchNumber}, chunk ${i / dbBatchSize + 1}:`, error);
          chunk.forEach(() => {
            results.push({ success: false, error: error.message });
          });
        } else {
          chunk.forEach(() => {
            results.push({ success: true });
          });
        }
      }
      
      // Add failed mappings to results
      const failedMappings = mappedRooms.filter(result => !result.success);
      results.push(...failedMappings);
      
    } catch (error) {
      logger.error(`Rooms batch ${batchNumber} processing failed:`, error);
      rooms.forEach(() => {
        results.push({ success: false, error: error.message });
      });
    }
    
    return results;
  }

  /**
   * Process open houses batch with validation and mapping
   */
  async processOpenHousesBatch(openHouses, batchNumber) {
    const results = [];
    
    try {
      // Map and validate open houses
      const mappedOpenHouses = await Promise.all(openHouses.map(async openHouse => {
        try {
          const mapped = await mapOpenHouse(openHouse);
          const validation = validateOpenHouse(mapped);
          
          if (!validation.isValid) {
            return { success: false, error: `Validation failed: ${validation.errors.join(', ')}` };
          }
          
          return { success: true, data: mapped };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }));
      
      // Filter successful mappings
      const validOpenHouses = mappedOpenHouses
        .filter(result => result.success)
        .map(result => result.data);
      
      if (validOpenHouses.length === 0) {
        console.log(`⚠️  Batch ${batchNumber}: No valid open houses to upsert`);
        return mappedOpenHouses;
      }
      
      // Upsert to database in chunks
      const dbBatchSize = this.config.openHouse.dbBatchSize;
      for (let i = 0; i < validOpenHouses.length; i += dbBatchSize) {
        const chunk = validOpenHouses.slice(i, i + dbBatchSize);
        
        const { error } = await this.database.client
          .from('OpenHouse')
          .upsert(chunk, { onConflict: 'OpenHouseKey' });
        
        if (error) {
          logger.error(`Database upsert failed for open houses batch ${batchNumber}, chunk ${i / dbBatchSize + 1}:`, error);
          chunk.forEach(() => {
            results.push({ success: false, error: error.message });
          });
        } else {
          chunk.forEach(() => {
            results.push({ success: true });
          });
        }
      }
      
      // Add failed mappings to results
      const failedMappings = mappedOpenHouses.filter(result => !result.success);
      results.push(...failedMappings);
      
    } catch (error) {
      logger.error(`Open houses batch ${batchNumber} processing failed:`, error);
      openHouses.forEach(() => {
        results.push({ success: false, error: error.message });
      });
    }
    
    return results;
  }

  /**
   * Print final statistics
   */
  printFinalStats() {
    const endTime = new Date();
    const duration = endTime - this.stats.startTime;
    const durationMinutes = Math.round(duration / 60000);
    const durationSeconds = Math.round((duration % 60000) / 1000);
    
    console.log('\n🎉 === SYNC COMPLETED ===');
    console.log(`⏱️  Duration: ${durationMinutes}m ${durationSeconds}s`);
    console.log(`📊 Total Processed: ${this.stats.totalProcessed.toLocaleString()}`);
    console.log(`✅ Successful: ${this.stats.totalSuccessful.toLocaleString()}`);
    console.log(`❌ Failed: ${this.stats.totalFailed.toLocaleString()}`);
    
    if (this.stats.totalProcessed > 0) {
      const successRate = ((this.stats.totalSuccessful / this.stats.totalProcessed) * 100).toFixed(1);
      console.log(`📈 Success Rate: ${successRate}%`);
    } else {
      console.log(`📈 Success Rate: N/A (no records processed)`);
    }
    
    if (this.stats.errors.length > 0) {
      console.log(`\n⚠️  Errors encountered: ${this.stats.errors.length}`);
      this.stats.errors.slice(0, 5).forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`);
      });
      if (this.stats.errors.length > 5) {
        console.log(`   ... and ${this.stats.errors.length - 5} more errors`);
      }
    } else {
      console.log(`\n✨ No errors encountered - sync completed successfully!`);
    }
  }

  /**
   * Sleep utility function
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default SyncService;
