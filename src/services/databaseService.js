import { supabase, supabaseAdmin } from '../config/supabase.js';
import logger from '../utils/logger.js';
import columnValidator from '../utils/columnValidator.js';

class DatabaseService {
  constructor() {
    // Use admin client for backend operations if available, otherwise use regular client
    this.client = supabaseAdmin || supabase;
    this.supabase = this.client; // Expose supabase client for compatibility
    
    if (!supabaseAdmin) {
      logger.warn('Using regular Supabase client instead of admin client - some operations may be restricted');
    }

    // Circuit breaker configuration for database operations
    this.circuitBreaker = {
      failureThreshold: 5, // Number of failures before opening circuit
      recoveryTimeout: 60000, // 1 minute recovery time
      halfOpenMaxCalls: 3, // Max calls in half-open state
      state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
      failureCount: 0,
      lastFailureTime: null,
      nextAttemptTime: null
    };

    // Retry configuration for database operations
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 2000, // 2 seconds
      maxDelay: 30000, // 30 seconds
      backoffMultiplier: 2
    };
  }

  /**
   * Check circuit breaker state and handle state transitions
   * @returns {boolean} True if operation should proceed
   */
  checkCircuitBreaker() {
    const now = Date.now();
    
    switch (this.circuitBreaker.state) {
      case 'CLOSED':
        return true;
        
      case 'OPEN':
        if (now >= this.circuitBreaker.nextAttemptTime) {
          this.circuitBreaker.state = 'HALF_OPEN';
          this.circuitBreaker.halfOpenCalls = 0;
          logger.info('Circuit breaker transitioning to HALF_OPEN state');
          return true;
        }
        return false;
        
      case 'HALF_OPEN':
        if (this.circuitBreaker.halfOpenCalls >= this.circuitBreaker.halfOpenMaxCalls) {
          return false;
        }
        this.circuitBreaker.halfOpenCalls = (this.circuitBreaker.halfOpenCalls || 0) + 1;
        return true;
        
      default:
        return true;
    }
  }

  /**
   * Record a successful operation for circuit breaker
   */
  recordSuccess() {
    this.circuitBreaker.failureCount = 0;
    this.circuitBreaker.state = 'CLOSED';
    this.circuitBreaker.halfOpenCalls = 0;
  }

  /**
   * Record a failed operation for circuit breaker
   */
  recordFailure() {
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = Date.now();
    
    if (this.circuitBreaker.failureCount >= this.circuitBreaker.failureThreshold) {
      this.circuitBreaker.state = 'OPEN';
      this.circuitBreaker.nextAttemptTime = Date.now() + this.circuitBreaker.recoveryTimeout;
      logger.warn(`Circuit breaker opened due to ${this.circuitBreaker.failureCount} failures`);
    }
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
   * Execute a database operation with circuit breaker and retry logic
   * @param {Function} operation - Database operation to execute
   * @param {string} operationName - Name of operation for logging
   * @returns {Promise<any>} Operation result
   */
  async executeWithRetry(operation, operationName = 'database operation') {
    // Check circuit breaker
    if (!this.checkCircuitBreaker()) {
      const waitTime = this.circuitBreaker.nextAttemptTime - Date.now();
      throw new Error(`Circuit breaker is OPEN. Next attempt in ${Math.ceil(waitTime / 1000)} seconds`);
    }

    let lastError;
    for (let attempt = 1; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        logger.debug(`${operationName} - Attempt ${attempt}/${this.retryConfig.maxRetries}`);
        
        const result = await operation();
        
        if (attempt > 1) {
          logger.info(`${operationName} succeeded on attempt ${attempt}`);
        }
        
        this.recordSuccess();
        return result;

      } catch (error) {
        logger.warn(`${operationName} - Attempt ${attempt} failed`, { error: error.message });
        lastError = error;

        // Check if it's a Cloudflare blocking error
        if (error.message && (error.message.includes('Cloudflare') || error.message.includes('blocked'))) {
          logger.warn(`${operationName} - Cloudflare blocking detected`);
          this.recordFailure();
        }

        // Calculate delay for next attempt
        if (attempt < this.retryConfig.maxRetries) {
          const delay = Math.min(
            this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1),
            this.retryConfig.maxDelay
          );
          
          logger.info(`${operationName} - Waiting ${delay}ms before retry`);
          await this.sleep(delay);
        }
      }
    }

    this.recordFailure();
    logger.error(`${operationName} failed after ${this.retryConfig.maxRetries} attempts`);
    throw lastError;
  }

  /**
   * Upsert a single property record
   * @param {Object} propertyData - Mapped property data
   * @returns {Promise<Object>} Result of upsert operation
   */
  async upsertProperty(propertyData) {
    return await this.executeWithRetry(async () => {
      // Filter out non-existent columns
      const filteredData = await columnValidator.filterDataForTable(propertyData, 'Property');
      
      if (Object.keys(filteredData).length === 0) {
        logger.warn('No valid columns found for Property table, skipping upsert');
        return { success: false, data: null, reason: 'No valid columns' };
      }

      const { data, error } = await this.client
        .from('Property')
        .upsert(filteredData, {
          onConflict: 'ListingKey',
          ignoreDuplicates: false
        })
        .select();

      if (error) {
        // Check if it's a missing column error
        if (error.message && error.message.includes('Could not find') && error.message.includes('column')) {
          logger.warn('Missing column error ignored for property upsert:', {
            ListingKey: propertyData.ListingKey,
            error: error.message
          });
          // Return success to continue processing
          return { success: true, data: null, reason: 'Missing column ignored' };
        }
        
        logger.error('Error upserting property', {
          ListingKey: propertyData.ListingKey,
          error: error.message
        });
        throw error;
      }

      logger.debug('Property upserted successfully', {
        ListingKey: propertyData.ListingKey
      });

      return { success: true, data };
    }, `Upsert property ${propertyData.ListingKey}`);
  }

  /**
   * Upsert multiple property records
   * @param {Array} propertiesData - Array of mapped property data
   * @param {number} batchSize - Size of batches for processing
   * @returns {Promise<Object>} Result summary
   */
  async upsertProperties(propertiesData, batchSize = 100) {
    try {
      logger.info(`Starting bulk upsert of ${propertiesData.length} properties`);
      
      // Filter out non-existent columns for all properties
      const filteredProperties = await columnValidator.filterDataArrayForTable(propertiesData, 'Property');
      
      if (filteredProperties.length === 0) {
        logger.warn('No valid properties after column filtering, skipping bulk upsert');
        return {
          total: propertiesData.length,
          successful: 0,
          failed: 0,
          errors: [{ batch: 'all', error: 'No valid columns found' }]
        };
      }
      
      const results = {
        total: propertiesData.length,
        successful: 0,
        failed: 0,
        errors: []
      };

      // Process in batches to avoid overwhelming the database
      for (let i = 0; i < filteredProperties.length; i += batchSize) {
        const batch = filteredProperties.slice(i, i + batchSize);
        
        try {
          const result = await this.executeWithRetry(async () => {
            const { data, error } = await this.client
              .from('Property')
              .upsert(batch, {
                onConflict: 'ListingKey',
                ignoreDuplicates: false
              })
              .select('ListingKey');

            if (error) {
              throw error;
            }

            return data;
          }, `Upsert property batch ${i}-${i + batch.length}`);

          results.successful += result.length;
          logger.info(`Batch ${i}-${i + batch.length} upserted successfully`);

        } catch (batchError) {
          logger.error(`Database error in property batch ${i}-${i + batch.length}`, {
            error: batchError.message
          });
          results.failed += batch.length;
          results.errors.push({
            batch: `${i}-${i + batch.length}`,
            error: batchError.message
          });
        }
      }

      logger.info('Bulk property upsert completed', results);
      return results;

    } catch (error) {
      logger.error('Error in bulk property upsert', { error: error.message });
      throw error;
    }
  }

  /**
   * Validate that a property exists before upserting media
   * @param {string} resourceRecordKey - Property ListingKey to validate
   * @returns {Promise<boolean>} True if property exists
   */
  async validatePropertyExists(resourceRecordKey) {
    try {
      const { data, error } = await this.client
        .from('Property')
        .select('ListingKey')
        .eq('ListingKey', resourceRecordKey)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
        logger.error('Error validating property existence', {
          ResourceRecordKey: resourceRecordKey,
          error: error.message
        });
        throw error;
      }

      return !!data;
    } catch (error) {
      logger.error('Database error validating property existence', {
        ResourceRecordKey: resourceRecordKey,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Upsert a single media record with property validation
   * @param {Object} mediaData - Mapped media data
   * @returns {Promise<Object>} Result of upsert operation
   */
  async upsertMedia(mediaData) {
    try {
      // Filter out non-existent columns
      const filteredData = await columnValidator.filterDataForTable(mediaData, 'Media');
      
      if (Object.keys(filteredData).length === 0) {
        logger.warn('No valid columns found for Media table, skipping upsert');
        return { success: false, data: null, reason: 'No valid columns' };
      }

      // Validate that the referenced property exists
      const propertyExists = await this.validatePropertyExists(filteredData.ResourceRecordKey);
      
      if (!propertyExists) {
        const error = new Error(`Property with ListingKey '${filteredData.ResourceRecordKey}' does not exist`);
        logger.error('Cannot upsert media - referenced property does not exist', {
          MediaKey: filteredData.MediaKey,
          ResourceRecordKey: filteredData.ResourceRecordKey
        });
        throw error;
      }

      const { data, error } = await this.client
        .from('Media')
        .upsert(filteredData, {
          onConflict: 'MediaKey',
          ignoreDuplicates: false
        })
        .select();

      if (error) {
        // Check if it's a missing column error
        if (error.message && error.message.includes('Could not find') && error.message.includes('column')) {
          logger.warn('Missing column error ignored for media upsert:', {
            MediaKey: filteredData.MediaKey,
            ResourceRecordKey: filteredData.ResourceRecordKey,
            error: error.message
          });
          // Return success to continue processing
          return { success: true, data: null, reason: 'Missing column ignored' };
        }
        
        logger.error('Error upserting media', {
          MediaKey: filteredData.MediaKey,
          ResourceRecordKey: filteredData.ResourceRecordKey,
          error: error.message
        });
        throw error;
      }

      logger.debug('Media upserted successfully', {
        MediaKey: filteredData.MediaKey,
        ResourceRecordKey: filteredData.ResourceRecordKey
      });

      return { success: true, data };

    } catch (error) {
      logger.error('Database error upserting media', {
        MediaKey: mediaData?.MediaKey,
        ResourceRecordKey: mediaData?.ResourceRecordKey,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Upsert multiple media records with property validation
   * @param {Array} mediaData - Array of mapped media data
   * @param {number} batchSize - Size of batches for processing
   * @returns {Promise<Object>} Result summary
   */
  async upsertMediaBulk(mediaData, batchSize = 100) {
    try {
      logger.info(`Starting bulk upsert of ${mediaData.length} media records`);
      
      // Filter out non-existent columns for all media records
      const filteredMedia = await columnValidator.filterDataArrayForTable(mediaData, 'Media');
      
      if (filteredMedia.length === 0) {
        logger.warn('No valid media records after column filtering, skipping bulk upsert');
        return {
          total: mediaData.length,
          successful: 0,
          failed: 0,
          errors: [{ batch: 'all', error: 'No valid columns found' }]
        };
      }
      
      const results = {
        total: mediaData.length,
        successful: 0,
        failed: 0,
        errors: []
      };

      // Process in batches
      for (let i = 0; i < filteredMedia.length; i += batchSize) {
        const batch = filteredMedia.slice(i, i + batchSize);
        
        try {
          // Note: The batch validation is already done at the SyncService level
          // This method assumes all media records in the batch have been pre-validated
          // to ensure their ResourceRecordKey exists in the Property table
          
          const { data, error } = await this.client
            .from('Media')
            .upsert(batch, {
              onConflict: 'MediaKey',
              ignoreDuplicates: false
            })
            .select('MediaKey');

          if (error) {
            logger.error(`Error upserting media batch ${i}-${i + batch.length}`, {
              error: error.message
            });
            results.failed += batch.length;
            results.errors.push({
              batch: `${i}-${i + batch.length}`,
              error: error.message
            });
          } else {
            results.successful += data.length;
            logger.info(`Media batch ${i}-${i + batch.length} upserted successfully`);
          }

        } catch (batchError) {
          logger.error(`Database error in media batch ${i}-${i + batch.length}`, {
            error: batchError.message
          });
          results.failed += batch.length;
          results.errors.push({
            batch: `${i}-${i + batch.length}`,
            error: batchError.message
          });
        }
      }

      logger.info('Bulk media upsert completed', results);
      return results;

    } catch (error) {
      logger.error('Error in bulk media upsert', { error: error.message });
      throw error;
    }
  }

  /**
   * Alias for upsertMediaBulk for consistency with SyncService
   */
  async upsertMediaBatch(mediaData, batchSize = 100) {
    return this.upsertMediaBulk(mediaData, batchSize);
  }

  /**
   * Upsert a single room record
   * @param {Object} roomData - Mapped room data
   * @returns {Promise<Object>} Result of upsert operation
   */
  async upsertRoom(roomData) {
    try {
      // Filter out non-existent columns
      const filteredData = await columnValidator.filterDataForTable(roomData, 'PropertyRooms');
      
      if (Object.keys(filteredData).length === 0) {
        logger.warn('No valid columns found for PropertyRooms table, skipping upsert');
        return { success: false, data: null, reason: 'No valid columns' };
      }

      const { data, error } = await this.client
        .from('PropertyRooms')
        .upsert(filteredData, {
          onConflict: 'RoomKey',
          ignoreDuplicates: false
        })
        .select();

      if (error) {
        // Check if it's a missing column error
        if (error.message && error.message.includes('Could not find') && error.message.includes('column')) {
          logger.warn('Missing column error ignored for room upsert:', {
            RoomKey: filteredData.RoomKey,
            ListingKey: filteredData.ListingKey,
            error: error.message
          });
          // Return success to continue processing
          return { success: true, data: null, reason: 'Missing column ignored' };
        }
        
        logger.error('Error upserting room', {
          RoomKey: filteredData.RoomKey,
          ListingKey: filteredData.ListingKey,
          error: error.message
        });
        throw error;
      }

      logger.debug('Room upserted successfully', {
        RoomKey: filteredData.RoomKey,
        ListingKey: filteredData.ListingKey
      });

      return { success: true, data };

    } catch (error) {
      logger.error('Database error upserting room', {
        RoomKey: roomData?.RoomKey,
        ListingKey: roomData?.ListingKey,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Upsert multiple room records
   * @param {Array} roomsData - Array of mapped room data
   * @param {number} batchSize - Size of batches for processing
   * @returns {Promise<Object>} Result summary
   */
  async upsertRooms(roomsData, batchSize = 100) {
    try {
      logger.info(`Starting bulk upsert of ${roomsData.length} rooms`);
      
      // Filter out non-existent columns for all room records
      const filteredRooms = await columnValidator.filterDataArrayForTable(roomsData, 'PropertyRooms');
      
      if (filteredRooms.length === 0) {
        logger.warn('No valid room records after column filtering, skipping bulk upsert');
        return {
          total: roomsData.length,
          successful: 0,
          failed: 0,
          errors: [{ batch: 'all', error: 'No valid columns found' }]
        };
      }
      
      // FINAL SAFETY CHECK: Ensure all rooms have valid ListingKeys that exist in Property table
      const listingKeys = [...new Set(filteredRooms.map(r => r.ListingKey))];
      logger.info(`FINAL CHECK: Verifying ${listingKeys.length} unique ListingKeys exist in Property table`);
      
      const existingProperties = await this.client
        .from('Property')
        .select('ListingKey')
        .in('ListingKey', listingKeys)
        .eq('ContractStatus', 'Available');
      
      if (existingProperties.error) {
        throw new Error(`FINAL CHECK FAILED: Could not verify property existence: ${existingProperties.error.message}`);
      }
      
      const existingKeys = new Set(existingProperties.data.map(p => p.ListingKey));
      const invalidRooms = filteredRooms.filter(r => !existingKeys.has(r.ListingKey));
      
      if (invalidRooms.length > 0) {
        logger.error(`FINAL CHECK FAILED: ${invalidRooms.length} rooms reference non-existent properties`, {
          sampleInvalidKeys: invalidRooms.slice(0, 5).map(r => r.ListingKey)
        });
        throw new Error(`SECURITY VIOLATION: ${invalidRooms.length} rooms reference properties that don't exist in Property table`);
      }
      
      logger.info(`FINAL CHECK PASSED: All ${filteredRooms.length} rooms reference existing IDX properties`);
      
      const results = {
        total: roomsData.length,
        successful: 0,
        failed: 0,
        errors: []
      };

      // Process in batches
      for (let i = 0; i < filteredRooms.length; i += batchSize) {
        const batch = filteredRooms.slice(i, i + batchSize);
        
        try {
          const { data, error } = await this.client
            .from('PropertyRooms')
            .upsert(batch, {
              onConflict: 'RoomKey',
              ignoreDuplicates: false
            })
            .select('RoomKey');

          if (error) {
            logger.error(`Error upserting rooms batch ${i}-${i + batch.length}`, {
              error: error.message
            });
            results.failed += batch.length;
            results.errors.push({
              batch: `${i}-${i + batch.length}`,
              error: error.message
            });
          } else {
            results.successful += data.length;
            logger.info(`Rooms batch ${i}-${i + batch.length} upserted successfully`);
          }

        } catch (batchError) {
          logger.error(`Database error in rooms batch ${i}-${i + batch.length}`, {
            error: batchError.message
          });
          results.failed += batch.length;
          results.errors.push({
            batch: `${i}-${i + batch.length}`,
            error: batchError.message
          });
        }
      }

      logger.info('Bulk rooms upsert completed', results);
      return results;

    } catch (error) {
      logger.error('Error in bulk rooms upsert', { error: error.message });
      throw error;
    }
  }

  /**
   * Upsert a single open house record
   * @param {Object} openHouseData - Mapped open house data
   * @returns {Promise<Object>} Result of upsert operation
   */
  async upsertOpenHouse(openHouseData) {
    try {
      // Filter out non-existent columns
      const filteredData = await columnValidator.filterDataForTable(openHouseData, 'OpenHouse');
      
      if (Object.keys(filteredData).length === 0) {
        logger.warn('No valid columns found for OpenHouse table, skipping upsert');
        return { success: false, data: null, reason: 'No valid columns' };
      }

      const { data, error } = await this.client
        .from('OpenHouse')
        .upsert(filteredData, {
          onConflict: 'OpenHouseKey',
          ignoreDuplicates: false
        })
        .select();

      if (error) {
        // Check if it's a missing column error
        if (error.message && error.message.includes('Could not find') && error.message.includes('column')) {
          logger.warn('Missing column error ignored for open house upsert:', {
            OpenHouseKey: filteredData.OpenHouseKey,
            ListingKey: filteredData.ListingKey,
            error: error.message
          });
          // Return success to continue processing
          return { success: true, data: null, reason: 'Missing column ignored' };
        }
        
        logger.error('Error upserting open house', {
          OpenHouseKey: filteredData.OpenHouseKey,
          ListingKey: filteredData.ListingKey,
          error: error.message
        });
        throw error;
      }

      logger.debug('Open house upserted successfully', {
        OpenHouseKey: filteredData.OpenHouseKey,
        ListingKey: filteredData.ListingKey
      });

      return { success: true, data };

    } catch (error) {
      logger.error('Database error upserting open house', {
        OpenHouseKey: openHouseData?.OpenHouseKey,
        ListingKey: openHouseData?.ListingKey,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Upsert multiple open house records
   * @param {Array} openHousesData - Array of mapped open house data
   * @param {number} batchSize - Size of batches for processing
   * @returns {Promise<Object>} Result summary
   */
  async upsertOpenHouses(openHousesData, batchSize = 100) {
    try {
      logger.info(`Starting bulk upsert of ${openHousesData.length} open houses`);
      
      // Filter out non-existent columns for all open house records
      const filteredOpenHouses = await columnValidator.filterDataArrayForTable(openHousesData, 'OpenHouse');
      
      if (filteredOpenHouses.length === 0) {
        logger.warn('No valid open house records after column filtering, skipping bulk upsert');
        return {
          total: openHousesData.length,
          successful: 0,
          failed: 0,
          errors: [{ batch: 'all', error: 'No valid columns found' }]
        };
      }
      
      const results = {
        total: openHousesData.length,
        successful: 0,
        failed: 0,
        errors: []
      };

      // Process in batches
      for (let i = 0; i < filteredOpenHouses.length; i += batchSize) {
        const batch = filteredOpenHouses.slice(i, i + batchSize);
        
        try {
          const { data, error } = await this.client
            .from('OpenHouse')
            .upsert(batch, {
              onConflict: 'OpenHouseKey',
              ignoreDuplicates: false
            })
            .select('OpenHouseKey');

          if (error) {
            logger.error(`Error upserting open houses batch ${i}-${i + batch.length}`, {
              error: error.message
            });
            results.failed += batch.length;
            results.errors.push({
              batch: `${i}-${i + batch.length}`,
              error: error.message
            });
          } else {
            results.successful += data.length;
            logger.info(`Open houses batch ${i}-${i + batch.length} upserted successfully`);
          }

        } catch (batchError) {
          logger.error(`Database error in open houses batch ${i}-${i + batch.length}`, {
            error: batchError.message
          });
          results.failed += batch.length;
          results.errors.push({
            batch: `${i}-${i + batch.length}`,
            error: batchError.message
          });
        }
      }

      logger.info('Bulk open houses upsert completed', results);
      return results;

    } catch (error) {
      logger.error('Error in bulk open houses upsert', { error: error.message });
      throw error;
    }
  }

  /**
   * Get properties with pagination and filtering
   * @param {Object} options - Query options
   * @param {number} options.page - Page number (1-based)
   * @param {number} options.limit - Records per page
   * @param {Object} options.filters - Filter conditions
   * @param {string} options.sortBy - Sort field
   * @param {string} options.sortOrder - Sort order (asc/desc)
   * @returns {Promise<Object>} Properties with pagination info
   */
  async getProperties(options = {}) {
    try {
      const {
        page = 1,
        limit = 50,
        filters = {},
        sortBy = 'ModificationTimestamp',
        sortOrder = 'desc'
      } = options;

      let query = this.client.from('Property').select('*', { count: 'exact' });

      // Apply filters
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          if (typeof value === 'string' && value.includes('%')) {
            query = query.ilike(key, value);
          } else if (Array.isArray(value)) {
            query = query.in(key, value);
          } else {
            query = query.eq(key, value);
          }
        }
      });

      // Apply sorting
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });

      // Apply pagination
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) {
        logger.error('Error fetching properties', { error: error.message });
        throw error;
      }

      return {
        data,
        pagination: {
          page,
          limit,
          total: count,
          totalPages: Math.ceil(count / limit)
        }
      };

    } catch (error) {
      logger.error('Database error fetching properties', { error: error.message });
      throw error;
    }
  }

  /**
   * Get media for a specific property
   * @param {string} resourceRecordKey - Property ListingKey
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Media records
   */
  async getMediaForProperty(resourceRecordKey, options = {}) {
    try {
      const {
        mediaType = null,
        preferredOnly = false,
        sortBy = 'Order',
        sortOrder = 'asc'
      } = options;

      let query = this.client
        .from('Media')
        .select('*')
        .eq('ResourceRecordKey', resourceRecordKey);

      if (mediaType) {
        query = query.eq('MediaType', mediaType);
      }

      if (preferredOnly) {
        query = query.eq('PreferredPhotoYN', true);
      }

      query = query.order(sortBy, { ascending: sortOrder === 'asc' });

      const { data, error } = await query;

      if (error) {
        logger.error('Error fetching media for property', {
          resourceRecordKey,
          error: error.message
        });
        throw error;
      }

      return data;

    } catch (error) {
      logger.error('Database error fetching media for property', {
        resourceRecordKey,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get sync status information
   * @returns {Promise<Object>} Sync status data
   */
  async getSyncStatus() {
    try {
      // Get latest timestamps from both tables
      const [propertyResult, mediaResult] = await Promise.all([
        this.client
          .from('Property')
          .select('ModificationTimestamp')
          .order('ModificationTimestamp', { ascending: false })
          .limit(1),
        this.client
          .from('Media')
          .select('ModificationTimestamp')
          .order('ModificationTimestamp', { ascending: false })
          .limit(1)
      ]);

      const [propertyCounts, mediaCounts] = await Promise.all([
        this.client
          .from('Property')
          .select('*', { count: 'exact', head: true }),
        this.client
          .from('Media')
          .select('*', { count: 'exact', head: true })
      ]);

      return {
        properties: {
          count: propertyCounts.count || 0,
          lastModified: propertyResult.data?.[0]?.ModificationTimestamp || null
        },
        media: {
          count: mediaCounts.count || 0,
          lastModified: mediaResult.data?.[0]?.ModificationTimestamp || null
        },
        lastUpdated: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Error getting sync status', { error: error.message });
      throw error;
    }
  }

  /**
   * Health check for database connection
   * @returns {Promise<boolean>} True if database is accessible
   */
  async healthCheck() {
    try {
      const { data, error } = await this.client
        .from('Property')
        .select('ListingKey')
        .limit(1);

      if (error) {
        logger.error('Database health check failed', { error: error.message });
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Database health check error', { error: error.message });
      return false;
    }
  }
}

export default DatabaseService;
