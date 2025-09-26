#!/usr/bin/env node

/**
 * Enhanced Batch-Orchestrated Sync Script
 * Usage: node src/scripts/sync.js [options]
 * Options:
 *   --idx          : Sync IDX feed with batch orchestration (1000 property batches)
 *   --vow          : Sync VOW feed with batch orchestration (1000 property batches)
 *   --media        : Sync only media
 *   --rooms        : Sync only rooms
 *   --openhouse    : Sync only open houses
 *   --incremental  : Perform incremental sync
 *   --scheduled    : Run scheduled sync
 *   --single <key> : Sync single property by ListingKey
 *   --10           : Test with 10 properties
 *   --100          : Test with 100 properties
 *   --500          : Test with 500 properties
 *   --1000         : Test with 1000 properties
 */

import SyncService from '../services/syncService.js';
import logger from '../utils/logger.js';
import { mapProperty } from '../../mappers/mapProperty.js';
import { 
  apiUrls, 
  tokens, 
  syncSettings, 
  BATCH_SIZE_PROPERTY, 
  BATCH_SIZE_MEDIA, 
  SYNC_START_DATE 
} from '../config/config.js';

class BatchOrchestratedSyncScript {
  constructor() {
    this.syncService = new SyncService();
    this.batchSize = BATCH_SIZE_PROPERTY;
    this.mediaBatchSize = BATCH_SIZE_MEDIA;
    this.syncStartDate = SYNC_START_DATE;
    this.testLimit = null; // Will be set based on CLI flags
    
    // Sync state tracking
    this.syncState = {
      lastTimestamp: null,
      lastListingKey: null,
      batchNumber: 0,
      totalProcessed: 0,
      totalSuccessful: 0,
      totalFailed: 0,
      startTime: null
    };
  }

  async run() {
    const args = process.argv.slice(2);
    
    console.log('🚀 Enhanced Batch-Orchestrated Sync Script Started');
    console.log('━'.repeat(60));
    console.log(`📅 ${new Date().toISOString()}`);
    console.log(`🔧 Arguments: ${args.join(' ') || 'none'}`);
    console.log(`📊 Batch size: ${this.batchSize} properties per batch`);
    console.log(`🎬 Media batch size: ${this.mediaBatchSize} records per batch`);
    console.log(`📅 Sync start date: ${this.syncStartDate}`);
    if (this.testLimit) {
      console.log(`🧪 TEST MODE: Limited to ${this.testLimit} properties`);
    }
    console.log('━'.repeat(60));
    
    this.syncState.startTime = new Date();
    
    try {
      // Parse CLI arguments
      const syncOptions = this.parseCliArgs(args);
      console.log('🔧 Initializing Enhanced Batch-Orchestrated Sync Service...');
      console.log(`📋 Sync options: ${Object.keys(syncOptions).filter(key => syncOptions[key]).join(', ')}`);
      
      // Load last sync state from SyncLog
      await this.loadLastSyncState();
      
      // Execute based on CLI switches
      if (syncOptions.idx || syncOptions.vow) {
        console.log('🎯 Executing Batch-Orchestrated Sync (Properties + Related Resources)');
        await this.executeBatchOrchestratedSync(syncOptions);
      } else if (syncOptions.media || syncOptions.rooms || syncOptions.openhouse) {
        console.log('🎯 Executing Standalone Resource Sync');
        await this.executeStandaloneSync(syncOptions);
      } else {
        // Default to full batch orchestrated sync
        console.log('🎯 Executing Default Full Batch-Orchestrated Sync (IDX + VOW)');
        await this.executeBatchOrchestratedSync({ idx: true, vow: true });
      }
      
      // Final sync log update
      await this.updateSyncLog();
      
      this.printFinalStats();
      
    } catch (error) {
      console.error('\n❌ Enhanced batch-orchestrated sync failed:');
      console.error(`   ${error.message}`);
      console.error(`   Stack: ${error.stack}`);
      logger.error('Enhanced batch-orchestrated sync script failed', { 
        error: error.message, 
        stack: error.stack,
        syncState: this.syncState 
      });
      
      // Update sync log with failure status
      try {
        await this.updateSyncLog();
      } catch (logError) {
        console.error('❌ Failed to update sync log with failure status:', logError.message);
      }
      
      process.exit(1);
    }
  }

  /**
   * Parse CLI arguments for selective syncing
   */
  parseCliArgs(args) {
    const options = {
      idx: args.includes('--idx'),
      vow: args.includes('--vow'),
      media: args.includes('--media'),
      rooms: args.includes('--rooms'),
      openhouse: args.includes('--openhouse'),
      force: args.includes('--force')
    };

    // Check for test flags and set test limit
    if (args.includes('--10')) {
      this.testLimit = 10;
    } else if (args.includes('--100')) {
      this.testLimit = 100;
    } else if (args.includes('--500')) {
      this.testLimit = 500;
    } else if (args.includes('--1000')) {
      this.testLimit = 1000;
    }

    return options;
  }

  /**
   * Execute batch-orchestrated sync for --idx and --vow flags
   */
  async executeBatchOrchestratedSync(options) {
    console.log('🎯 Executing Batch-Orchestrated Sync');
    
    if (options.idx) {
      console.log('\n📊 === IDX BATCH SYNC ===');
      await this.syncPropertiesWithBatchOrchestration('idx');
    }
    
    if (options.vow) {
      console.log('\n📊 === VOW BATCH SYNC ===');
      await this.syncPropertiesWithBatchOrchestration('vow');
    }
  }

  /**
   * Execute standalone sync for --media, --rooms, --openhouse flags
   * Maintains CLI structure for independent resource sync
   */
  async executeStandaloneSync(options) {
    console.log('🎯 Executing Standalone Sync');
    console.log('📋 Standalone sync options:', Object.keys(options).filter(key => options[key]));
    
    if (options.media) {
      console.log('\n🖼️  === MEDIA SYNC ===');
      console.log('🔄 Syncing media with parent integrity...');
      await this.syncService.syncMediaWithParentIntegrity();
    }
    
    if (options.rooms) {
      console.log('\n🏠 === PROPERTY ROOMS SYNC ===');
      console.log('🔄 Syncing property rooms with parent integrity...');
      await this.syncService.syncRoomsWithParentIntegrity();
    }
    
    if (options.openhouse) {
      console.log('\n🏡 === OPEN HOUSE SYNC ===');
      console.log('🔄 Syncing open houses with parent integrity...');
      await this.syncService.syncOpenHousesWithParentIntegrity();
    }
    
    console.log('✅ Standalone sync completed');
  }

  /**
   * Enhanced batch orchestration method for properties with coordinated child resource fetching
   * Processes properties in batches of 1000, fetches related resources in parallel, and upserts in correct order
   */
  async syncPropertiesWithBatchOrchestration(feedType) {
    console.log(`🔄 Starting ${feedType.toUpperCase()} batch orchestration`);
    console.log(`📊 Batch size: ${this.batchSize} properties per batch`);
    
    let currentTimestamp = this.syncState.lastTimestamp || this.syncStartDate;
    let hasMoreData = true;
    let consecutiveFailures = 0;
    const maxRetries = 3;
    let totalProcessedInTest = 0;
    
    while (hasMoreData) {
      this.syncState.batchNumber++;
      
      console.log(`\n📦 === BATCH ${this.syncState.batchNumber} ===`);
      console.log(`⏰ Processing from timestamp: ${currentTimestamp}`);
      console.log(`🔄 Feed type: ${feedType.toUpperCase()}`);
      
      try {
        // Step 1: Fetch properties in batch (1000 properties)
        let properties = await this.fetchPropertiesWithRetry(currentTimestamp, this.batchSize, feedType, maxRetries);
        
        if (properties.length === 0) {
          console.log('✨ No more properties to process - sync complete!');
          hasMoreData = false;
          break;
        }
        
        console.log(`📥 Fetched ${properties.length} properties`);
        
        // Check test limit
        if (this.testLimit) {
          const remainingLimit = this.testLimit - totalProcessedInTest;
          if (remainingLimit <= 0) {
            console.log(`🧪 Test limit reached (${this.testLimit} properties) - stopping sync`);
            hasMoreData = false;
            break;
          }
          
          if (properties.length > remainingLimit) {
            console.log(`🧪 Test mode: Limiting batch to ${remainingLimit} properties (${properties.length} available)`);
            properties = properties.slice(0, remainingLimit);
          }
        }
        
        // Step 2: Extract listing keys for child resource fetching
        const listingKeys = properties.map(p => p.ListingKey);
        console.log(`🔑 Extracted ${listingKeys.length} listing keys`);
        
        // Step 3: Fetch child resources in parallel with error handling
        const [mediaResults, roomsResults, openHouseResults] = await Promise.allSettled([
          this.fetchMediaForListings(listingKeys),
          this.fetchRoomsForListings(listingKeys),
          this.fetchOpenHousesForListings(listingKeys)
        ]);
        
        // Process results and handle any failures
        const mediaData = mediaResults.status === 'fulfilled' ? mediaResults.value : [];
        const roomsData = roomsResults.status === 'fulfilled' ? roomsResults.value : [];
        const openHouseData = openHouseResults.status === 'fulfilled' ? openHouseResults.value : [];
        
        // Log any fetch failures
        if (mediaResults.status === 'rejected') {
          console.warn(`⚠️  Media fetch failed: ${mediaResults.reason.message}`);
        }
        if (roomsResults.status === 'rejected') {
          console.warn(`⚠️  Rooms fetch failed: ${roomsResults.reason.message}`);
        }
        if (openHouseResults.status === 'rejected') {
          console.warn(`⚠️  OpenHouse fetch failed: ${openHouseResults.reason.message}`);
        }
        
        console.log(`📊 Parallel fetch results:`);
        console.log(`   🖼️  Media: ${mediaData.length} records`);
        console.log(`   🏠 Rooms: ${roomsData.length} records`);
        console.log(`   🏡 OpenHouses: ${openHouseData.length} records`);
        
        // Step 4: Log basic property info
        if (properties.length > 0) {
          console.log(`📋 Sample: ${properties[0].ListingKey} (${Object.keys(properties[0]).length} fields)`);
        }
        
        // Step 5: Upsert in correct order (Properties first, then children)
        console.log(`💾 Upserting batch ${this.syncState.batchNumber} data...`);
        
        // Properties first (parent records) - wait for completion
        let successfulListingKeys = [];
        try {
          successfulListingKeys = await this.upsertPropertiesWithRetry(properties, maxRetries);
          console.log('✅ Properties committed, proceeding with child records...');
        } catch (propertyError) {
          console.error(`❌ Property upsert failed for batch ${this.syncState.batchNumber}: ${propertyError.message}`);
          logger.error(`Property upsert failed for batch ${this.syncState.batchNumber}:`, propertyError);
          
          // Skip child upserts if Property upsert fails
          console.log('⚠️  Skipping child upserts due to Property upsert failure');
          throw propertyError; // Re-throw to trigger retry logic
        }
        
        // Add safeguard: Skip child upserts if no properties were successfully inserted
        if (successfulListingKeys.length === 0) {
          console.log("⚠️  No properties were successfully inserted - skipping child upserts");
          return;
        }
        
        // Filter all child data to only include records for successfully inserted properties
        const filteredMediaData = mediaData.filter(media => 
          successfulListingKeys.includes(media.ResourceRecordKey)
        );
        
        const filteredRoomsData = roomsData.filter(room => 
          successfulListingKeys.includes(room.ListingKey)
        );
        
        const filteredOpenHouseData = openHouseData.filter(openHouse => 
          successfulListingKeys.includes(openHouse.ListingKey)
        );
        
        console.log(`🔍 Filtered child records for ${successfulListingKeys.length} properties:`);
        console.log(`   🖼️  Media: ${filteredMediaData.length} records`);
        console.log(`   🏠 Rooms: ${filteredRoomsData.length} records`);
        console.log(`   🏡 OpenHouses: ${filteredOpenHouseData.length} records`);
        
        // Then children (in parallel for efficiency) - only after properties are committed
        // All child upserts can run in parallel since they're filtered to existing properties
        await Promise.allSettled([
          this.upsertMediaWithRetry(filteredMediaData, maxRetries),
          this.upsertRoomsWithRetry(filteredRoomsData, maxRetries),
          this.upsertOpenHousesWithRetry(filteredOpenHouseData, maxRetries)
        ]);
        
        // Step 5: Update sync state and log
        const lastProperty = properties[properties.length - 1];
        currentTimestamp = lastProperty.ModificationTimestamp;
        this.syncState.lastTimestamp = currentTimestamp;
        this.syncState.lastListingKey = lastProperty.ListingKey;
        
        // Update batch stats
        this.syncState.totalProcessed += properties.length;
        this.syncState.totalSuccessful += properties.length;
        totalProcessedInTest += properties.length;
        
        // Reset consecutive failures on success
        consecutiveFailures = 0;
        
        console.log(`✅ Batch ${this.syncState.batchNumber} completed successfully`);
        console.log(`📈 Total processed: ${this.syncState.totalProcessed.toLocaleString()}`);
        
        if (this.testLimit) {
          console.log(`🧪 Test progress: ${totalProcessedInTest}/${this.testLimit} properties`);
        }
        
        // Update SyncLog after each batch
        await this.updateSyncLog();
        
        // Check if we should continue
        if (properties.length < this.batchSize) {
          console.log('🏁 Reached end of data - sync complete!');
          hasMoreData = false;
        }
        
        // Check test limit
        if (this.testLimit && totalProcessedInTest >= this.testLimit) {
          console.log(`🧪 Test limit reached (${this.testLimit} properties) - sync complete!`);
          hasMoreData = false;
        }
        
        // Throttle between batches
        await this.sleep(1000);
        
      } catch (error) {
        consecutiveFailures++;
        this.syncState.totalFailed++;
        
        console.error(`❌ Batch ${this.syncState.batchNumber} failed (attempt ${consecutiveFailures}/${maxRetries}):`, error.message);
        logger.error(`Batch ${this.syncState.batchNumber} failed:`, error);
        
        // Retry with exponential backoff
        if (consecutiveFailures < maxRetries) {
          const retryDelay = Math.min(1000 * Math.pow(2, consecutiveFailures), 30000);
          console.log(`⏳ Retrying in ${retryDelay}ms...`);
          await this.sleep(retryDelay);
        } else {
          console.error('❌ Max retries exceeded - stopping sync');
          throw error;
        }
      }
    }
  }

  /**
   * Fetch properties with retry logic
   */
  async fetchPropertiesWithRetry(lastTimestamp, batchSize, feedType, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.fetchProperties(lastTimestamp, batchSize, feedType);
      } catch (error) {
        lastError = error;
        console.warn(`⚠️  Fetch attempt ${attempt}/${maxRetries} failed: ${error.message}`);
        
        if (attempt < maxRetries) {
          const retryDelay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          console.log(`⏳ Retrying in ${retryDelay}ms...`);
          await this.sleep(retryDelay);
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Fetch properties in batches using ModificationTimestamp with dynamic date filtering
   */
  async fetchProperties(lastTimestamp, batchSize, feedType) {
    try {
      const baseUrl = feedType === 'idx' ? apiUrls.idx : apiUrls.vow;
      const token = feedType === 'idx' ? tokens.idx : tokens.vow;
      
      // For now, use the original URL without timestamp filtering to get it working
      // TODO: Add timestamp filtering back once we understand the OData API requirements
      console.log(`🔍 Fetching ${feedType} properties using original URL`);
      
      const response = await fetch(baseUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log(`❌ API Error Response: ${errorText}`);
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
      }
      
      const data = await response.json();
      console.log(`✅ Successfully fetched ${(data.value || data || []).length} properties`);
      return data.value || data || [];
      
    } catch (error) {
      logger.error(`Failed to fetch ${feedType} properties:`, error);
      throw error;
    }
  }

  /**
   * Fetch media for a list of listing keys using $filter=ResourceRecordKey in (...)
   * FIXED: Now handles pagination to get ALL media records, not just first 5000
   */
  async fetchMediaForListings(listingKeys) {
    if (listingKeys.length === 0) return [];
    
    try {
      // Batch listing keys for API calls - use smaller batches to avoid URL length limits
      const batches = this.chunkArray(listingKeys, 50); // Reduced from mediaBatchSize to avoid URL length issues
      const allMedia = [];
      
      for (const batch of batches) {
        console.log(`🔄 Processing media batch: ${batch.length} properties`);
        
        // Use $filter=ResourceRecordKey in (...) for better performance
        const listingKeyList = batch.map(key => `'${key}'`).join(',');
        const resourceFilter = `ResourceRecordKey in (${listingKeyList})`;
        
        // Build the complete filter by combining with existing MEDIA_URL filter
        let baseUrl = apiUrls.media;
        let filterParam;
        
        // Check if the base URL already has a filter
        if (baseUrl.includes('$filter=')) {
          // Extract existing filter and combine with our ResourceRecordKey filter
          const existingFilter = baseUrl.split('$filter=')[1].split('&')[0];
          filterParam = `$filter=(${existingFilter}) and (${resourceFilter})`;
        } else {
          filterParam = `$filter=${resourceFilter}`;
        }
        
        // Fetch all pages of media for this batch
        let skip = 0;
        const pageSize = 1000; // Reasonable page size
        let hasMorePages = true;
        let batchMediaCount = 0;
        
        while (hasMorePages) {
          // Construct URL with pagination
          const paginatedUrl = `${baseUrl}&${filterParam}&$top=${pageSize}&$skip=${skip}`;
          
          console.log(`📡 Fetching media page: skip=${skip}, top=${pageSize}`);
          
          const response = await fetch(paginatedUrl, {
            headers: {
              'Authorization': `Bearer ${tokens.idx}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            const mediaRecords = data.value || data || [];
            
            if (mediaRecords.length === 0) {
              hasMorePages = false;
            } else {
              allMedia.push(...mediaRecords);
              batchMediaCount += mediaRecords.length;
              skip += pageSize;
              
              // If we got fewer records than pageSize, we've reached the end
              if (mediaRecords.length < pageSize) {
                hasMorePages = false;
              }
            }
          } else {
            console.warn(`⚠️  Media fetch failed for batch page: HTTP ${response.status}`);
            hasMorePages = false;
          }
          
          // Throttle between pages
          await this.sleep(250);
        }
        
        console.log(`📥 Fetched ${batchMediaCount} media records for ${batch.length} properties in this batch`);
        
        // Throttle between batches
        await this.sleep(750);
      }
      
      console.log(`📥 Total fetched ${allMedia.length} media records for ${listingKeys.length} properties`);
      return allMedia;
      
    } catch (error) {
      logger.error('Failed to fetch media for listings:', error);
      return [];
    }
  }

  /**
   * Fetch rooms for a list of listing keys in parallel
   */
  async fetchRoomsForListings(listingKeys) {
    if (listingKeys.length === 0) return [];
    
    try {
      const batches = this.chunkArray(listingKeys, this.batchSize);
      const allRooms = [];
      
      for (const batch of batches) {
        const listingKeyFilter = batch.map(key => `ListingKey eq '${key}'`).join(' or ');
        const response = await fetch(`${apiUrls.rooms}&$filter=${listingKeyFilter}&$top=5000`, {
          headers: {
            'Authorization': `Bearer ${tokens.idx}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          allRooms.push(...(data.value || data || []));
        }
        
        await this.sleep(500);
      }
      
      return allRooms;
      
    } catch (error) {
      logger.error('Failed to fetch rooms for listings:', error);
      return [];
    }
  }

  /**
   * Fetch open houses for a list of listing keys in parallel
   */
  async fetchOpenHousesForListings(listingKeys) {
    if (listingKeys.length === 0) return [];
    
    try {
      const batches = this.chunkArray(listingKeys, this.batchSize);
      const allOpenHouses = [];
      
      for (const batch of batches) {
        const listingKeyFilter = batch.map(key => `ListingKey eq '${key}'`).join(' or ');
        const response = await fetch(`${apiUrls.openHouse}&$filter=${listingKeyFilter}&$top=5000`, {
          headers: {
            'Authorization': `Bearer ${tokens.idx}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          allOpenHouses.push(...(data.value || data || []));
        }
        
        await this.sleep(500);
      }
      
      return allOpenHouses;
      
    } catch (error) {
      logger.error('Failed to fetch open houses for listings:', error);
      return [];
    }
  }

  /**
   * Upsert properties with retry logic
   */
  async upsertPropertiesWithRetry(properties, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.upsertProperties(properties);
      } catch (error) {
        lastError = error;
        console.warn(`⚠️  Property upsert attempt ${attempt}/${maxRetries} failed: ${error.message}`);
        
        if (attempt < maxRetries) {
          const retryDelay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          console.log(`⏳ Retrying property upsert in ${retryDelay}ms...`);
          await this.sleep(retryDelay);
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Upsert properties to database
   */
  async upsertProperties(properties) {
    try {
      // Map properties using the property mapper to filter out unknown fields
      const mappedProperties = [];
      const successfulListingKeys = [];
      
      for (const property of properties) {
        try {
          const mappedProperty = await mapProperty(property);
          mappedProperties.push(mappedProperty);
          successfulListingKeys.push(property.ListingKey);
        } catch (error) {
          logger.warn(`Failed to map property ${property.ListingKey}:`, error.message);
          // Continue with other properties even if one fails
        }
      }
      
      if (mappedProperties.length === 0) {
        console.log('⚠️  No properties to upsert after mapping');
        return [];
      }
      
      const { error } = await this.syncService.database.client
        .from('Property')
        .upsert(mappedProperties, { onConflict: 'ListingKey' });
      
      if (error) {
        throw new Error(`Property upsert failed: ${error.message}`);
      }
      
      console.log(`✅ Upserted ${mappedProperties.length} properties (${properties.length - mappedProperties.length} failed mapping)`);
      
      // Return the listing keys of successfully mapped properties (these are the ones that were upserted)
      return successfulListingKeys;
      
    } catch (error) {
      logger.error('Failed to upsert properties:', error);
      throw error;
    }
  }

  /**
   * Upsert media with retry logic
   */
  async upsertMediaWithRetry(mediaRecords, maxRetries = 3) {
    if (mediaRecords.length === 0) return;
    
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.upsertMedia(mediaRecords);
      } catch (error) {
        lastError = error;
        console.warn(`⚠️  Media upsert attempt ${attempt}/${maxRetries} failed: ${error.message}`);
        
        if (attempt < maxRetries) {
          const retryDelay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          console.log(`⏳ Retrying media upsert in ${retryDelay}ms...`);
          await this.sleep(retryDelay);
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Upsert media to database with DB-side filtering
   */
  async upsertMedia(mediaRecords) {
    if (mediaRecords.length === 0) return;
    
    try {
      // Extract ResourceRecordKeys for DB-side filtering
      const resourceRecordKeys = [...new Set(mediaRecords.map(media => media.ResourceRecordKey))];
      
      // First, verify that all parent properties exist
      const { data: existingProperties, error: checkError } = await this.syncService.database.client
        .from('Property')
        .select('ListingKey')
        .in('ListingKey', resourceRecordKeys);
      
      if (checkError) {
        throw new Error(`Failed to verify parent properties: ${checkError.message}`);
      }
      
      const existingListingKeys = new Set(existingProperties.map(p => p.ListingKey));
      
      // Filter media records to only include those with existing parent properties
      const validMediaRecords = mediaRecords.filter(media => 
        existingListingKeys.has(media.ResourceRecordKey)
      );
      
      if (validMediaRecords.length === 0) {
        console.log('⚠️  No valid media records to upsert (no matching parent properties)');
        return;
      }
      
      if (validMediaRecords.length < mediaRecords.length) {
        const filteredCount = mediaRecords.length - validMediaRecords.length;
        console.log(`🔍 Filtered out ${filteredCount} media records with non-existent parent properties`);
      }
      
      const { error } = await this.syncService.database.client
        .from('Media')
        .upsert(validMediaRecords, { onConflict: 'MediaKey' });
      
      if (error) {
        throw new Error(`Media upsert failed: ${error.message}`);
      }
      
      console.log(`✅ Upserted ${validMediaRecords.length} media records`);
      
    } catch (error) {
      logger.error('Failed to upsert media:', error);
      throw error;
    }
  }

  /**
   * Upsert rooms with retry logic
   */
  async upsertRoomsWithRetry(rooms, maxRetries = 3) {
    if (rooms.length === 0) return;
    
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.upsertRooms(rooms);
      } catch (error) {
        lastError = error;
        console.warn(`⚠️  Rooms upsert attempt ${attempt}/${maxRetries} failed: ${error.message}`);
        
        if (attempt < maxRetries) {
          const retryDelay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          console.log(`⏳ Retrying rooms upsert in ${retryDelay}ms...`);
          await this.sleep(retryDelay);
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Upsert rooms to database with parent verification
   */
  async upsertRooms(rooms) {
    if (rooms.length === 0) return;
    
    try {
      // Extract ListingKeys for parent verification
      const listingKeys = [...new Set(rooms.map(room => room.ListingKey))];
      
      // Verify that all parent properties exist
      const { data: existingProperties, error: checkError } = await this.syncService.database.client
        .from('Property')
        .select('ListingKey')
        .in('ListingKey', listingKeys);
      
      if (checkError) {
        throw new Error(`Failed to verify parent properties for rooms: ${checkError.message}`);
      }
      
      const existingListingKeys = new Set(existingProperties.map(p => p.ListingKey));
      
      // Filter room records to only include those with existing parent properties
      const validRooms = rooms.filter(room => 
        existingListingKeys.has(room.ListingKey)
      );
      
      if (validRooms.length === 0) {
        console.log('⚠️  No valid room records to upsert (no matching parent properties)');
        return;
      }
      
      if (validRooms.length < rooms.length) {
        const filteredCount = rooms.length - validRooms.length;
        console.log(`🔍 Filtered out ${filteredCount} room records with non-existent parent properties`);
      }
      
      const { error } = await this.syncService.database.client
        .from('PropertyRooms')
        .upsert(validRooms, { onConflict: 'RoomKey' });
      
      if (error) {
        throw new Error(`Rooms upsert failed: ${error.message}`);
      }
      
      console.log(`✅ Upserted ${validRooms.length} room records`);
      
    } catch (error) {
      logger.error('Failed to upsert rooms:', error);
      throw error;
    }
  }

  /**
   * Upsert open houses with retry logic
   */
  async upsertOpenHousesWithRetry(openHouses, maxRetries = 3) {
    if (openHouses.length === 0) return;
    
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.upsertOpenHouses(openHouses);
      } catch (error) {
        lastError = error;
        console.warn(`⚠️  OpenHouses upsert attempt ${attempt}/${maxRetries} failed: ${error.message}`);
        
        if (attempt < maxRetries) {
          const retryDelay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          console.log(`⏳ Retrying open houses upsert in ${retryDelay}ms...`);
          await this.sleep(retryDelay);
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Upsert open houses to database with parent verification
   */
  async upsertOpenHouses(openHouses) {
    if (openHouses.length === 0) return;
    
    try {
      // Extract ListingKeys for parent verification
      const listingKeys = [...new Set(openHouses.map(openHouse => openHouse.ListingKey))];
      
      // Verify that all parent properties exist
      const { data: existingProperties, error: checkError } = await this.syncService.database.client
        .from('Property')
        .select('ListingKey')
        .in('ListingKey', listingKeys);
      
      if (checkError) {
        throw new Error(`Failed to verify parent properties for open houses: ${checkError.message}`);
      }
      
      const existingListingKeys = new Set(existingProperties.map(p => p.ListingKey));
      
      // Filter open house records to only include those with existing parent properties
      const validOpenHouses = openHouses.filter(openHouse => 
        existingListingKeys.has(openHouse.ListingKey)
      );
      
      if (validOpenHouses.length === 0) {
        console.log('⚠️  No valid open house records to upsert (no matching parent properties)');
        return;
      }
      
      if (validOpenHouses.length < openHouses.length) {
        const filteredCount = openHouses.length - validOpenHouses.length;
        console.log(`🔍 Filtered out ${filteredCount} open house records with non-existent parent properties`);
      }
      
      const { error } = await this.syncService.database.client
        .from('OpenHouse')
        .upsert(validOpenHouses, { onConflict: 'OpenHouseKey' });
      
      if (error) {
        throw new Error(`OpenHouses upsert failed: ${error.message}`);
      }
      
      console.log(`✅ Upserted ${validOpenHouses.length} open house records`);
      
    } catch (error) {
      logger.error('Failed to upsert open houses:', error);
      throw error;
    }
  }

  /**
   * Load last sync state from SyncLog
   */
  async loadLastSyncState() {
    try {
      const { data, error } = await this.syncService.database.client
        .from('SyncLog')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(1);
      
      if (error) {
        logger.warn('Failed to load sync state:', error);
        return;
      }
      
      if (data && data.length > 0) {
        const lastSync = data[0];
        this.syncState.lastTimestamp = lastSync.last_timestamp;
        this.syncState.lastListingKey = lastSync.last_listing_key;
        
        console.log(`📅 Resuming from: ${this.syncState.lastTimestamp}`);
        console.log(`🔑 Last listing key: ${this.syncState.lastListingKey}`);
      } else {
        console.log(`🆕 Starting fresh sync from: ${this.syncStartDate}`);
        this.syncState.lastTimestamp = this.syncStartDate;
      }
      
    } catch (error) {
      logger.warn('Failed to load sync state:', error);
      this.syncState.lastTimestamp = this.syncStartDate;
    }
  }

  /**
   * Dynamically apply date filters based on current timestamp
   * This ensures we don't hardcode timestamps in environment variables
   */
  getDateFilter(currentTimestamp) {
    // Use the current timestamp or fall back to sync start date
    const effectiveTimestamp = currentTimestamp || this.syncStartDate;
    return `ModificationTimestamp gt ${effectiveTimestamp}`;
  }

  /**
   * Update sync log with current state
   */
  async updateSyncLog() {
    try {
      const { error } = await this.syncService.database.client
        .from('SyncLog')
        .insert({
          timestamp: new Date().toISOString(),
          total_processed: this.syncState.totalProcessed,
          total_successful: this.syncState.totalSuccessful,
          total_failed: this.syncState.totalFailed
        });
      
      if (error) {
        logger.error('Failed to update sync log:', error);
        console.warn('⚠️  Failed to update sync log - continuing...');
      } else {
        console.log(`📝 Updated sync log - Batch ${this.syncState.batchNumber}, Processed: ${this.syncState.totalProcessed}`);
      }
      
    } catch (error) {
      logger.error('Failed to update sync log:', error);
      console.warn('⚠️  Failed to update sync log - continuing...');
    }
  }

  /**
   * Print final statistics
   */
  printFinalStats() {
    const endTime = new Date();
    const duration = endTime - this.syncState.startTime;
    const durationMinutes = Math.round(duration / 60000);
    const durationSeconds = Math.round((duration % 60000) / 1000);
    
    console.log('\n🎉 === BATCH-ORCHESTRATED SYNC COMPLETED ===');
    console.log(`⏱️  Duration: ${durationMinutes}m ${durationSeconds}s`);
    console.log(`📦 Batches processed: ${this.syncState.batchNumber}`);
    console.log(`📊 Total processed: ${this.syncState.totalProcessed.toLocaleString()}`);
    console.log(`✅ Successful: ${this.syncState.totalSuccessful.toLocaleString()}`);
    console.log(`❌ Failed: ${this.syncState.totalFailed.toLocaleString()}`);
    console.log(`📏 Batch size: ${this.batchSize} properties per batch`);
    
    if (this.testLimit) {
      console.log(`🧪 TEST MODE: Limited to ${this.testLimit} properties`);
    }
    
    if (this.syncState.totalProcessed > 0) {
      const successRate = ((this.syncState.totalSuccessful / this.syncState.totalProcessed) * 100).toFixed(1);
      console.log(`📈 Success Rate: ${successRate}%`);
      
      const avgBatchTime = duration / this.syncState.batchNumber;
      console.log(`⚡ Average batch time: ${Math.round(avgBatchTime / 1000)}s`);
    }
    
    console.log(`🏁 Last timestamp: ${this.syncState.lastTimestamp}`);
    console.log(`🔑 Last listing key: ${this.syncState.lastListingKey}`);
    
    if (this.syncState.totalFailed > 0) {
      console.log(`\n⚠️  Sync completed with ${this.syncState.totalFailed} failures`);
      console.log(`   Consider reviewing logs for error details`);
    } else {
      console.log(`\n✨ Sync completed successfully with no failures!`);
    }
  }

  /**
   * Utility function to chunk array into smaller arrays
   */
  chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Sleep utility function
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Handle graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Run if called directly
const normalizedArgv = process.argv[1].replace(/\\/g, '/');
if (import.meta.url === `file:///${normalizedArgv}`) {
  const script = new BatchOrchestratedSyncScript();
  script.run()
    .then(() => {
      console.log('\n✅ Batch-orchestrated sync completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Batch-orchestrated sync failed:', error.message);
      process.exit(1);
    });
}

export default BatchOrchestratedSyncScript;