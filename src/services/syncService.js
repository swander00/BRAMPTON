import AmpreApiService from './ampreApiService.js';
import DatabaseService from './databaseService.js';
import logger from '../utils/logger.js';

import { mapProperty, validateProperty } from '../../mappers/mapProperty.js';
import { mapMedia, validateMedia } from '../../mappers/mapMedia.js';

class SyncService {
  constructor() {
    this.ampreApi = new AmpreApiService();
    this.database = new DatabaseService();
    
    // Default sync configuration
    this.config = {
      property: {
        batchSize: parseInt(process.env.BATCH_SIZE_PROPERTY) || 1000,
        endpoint: 'Property',
        keyField: 'ListingKey',
        timestampField: 'ModificationTimestamp',
        filter: "ContractStatus eq 'Available'"
      },
      media: {
        batchSize: parseInt(process.env.BATCH_SIZE_MEDIA) || 500,
        endpoint: 'Media',
        keyField: 'MediaKey',
        timestampField: 'ModificationTimestamp',
        filter: null
      }
    };

    logger.info('Sync Service initialized', { config: this.config });
  }

  /**
   * Perform full sync of all data
   * @param {Object} options - Sync options
   * @returns {Promise<Object>} Sync results
   */
  async performFullSync(options = {}) {
    const startTime = Date.now();
    logger.info('Starting full sync operation');

    const results = {
      properties: { attempted: 0, successful: 0, failed: 0, errors: [] },
      media: { attempted: 0, successful: 0, failed: 0, errors: [] },
      duration: 0,
      startTime: new Date().toISOString()
    };

    try {
      // Sync properties first
      if (options.syncProperties !== false) {
        logger.info('Starting property sync');
        const propertyResult = await this.syncProperties();
        results.properties = propertyResult;
      }

      // Sync media
      if (options.syncMedia !== false) {
        logger.info('Starting media sync');
        const mediaResult = await this.syncMedia();
        results.media = mediaResult;
      }

      results.duration = Date.now() - startTime;
      results.endTime = new Date().toISOString();

      logger.info('Full sync completed', {
        duration: `${results.duration}ms`,
        properties: results.properties,
        media: results.media
      });

      return results;

    } catch (error) {
      results.duration = Date.now() - startTime;
      results.error = error.message;
      logger.error('Full sync failed', { error: error.message, results });
      throw error;
    }
  }

  /**
   * Perform incremental sync based on last modification timestamps
   * @param {Object} options - Sync options
   * @returns {Promise<Object>} Sync results
   */
  async performIncrementalSync(options = {}) {
    const startTime = Date.now();
    logger.info('Starting incremental sync operation');

    const results = {
      properties: { attempted: 0, successful: 0, failed: 0, errors: [] },
      media: { attempted: 0, successful: 0, failed: 0, errors: [] },
      duration: 0,
      startTime: new Date().toISOString()
    };

    try {
      // Get current sync status to determine last sync timestamps
      const syncStatus = await this.database.getSyncStatus();
      
      const lastPropertySync = syncStatus.properties.lastModified || '1970-01-01T00:00:00Z';
      const lastMediaSync = syncStatus.media.lastModified || '1970-01-01T00:00:00Z';

      logger.info('Last sync timestamps', {
        properties: lastPropertySync,
        media: lastMediaSync
      });

      // Sync properties incrementally
      if (options.syncProperties !== false) {
        const propertyResult = await this.syncProperties({
          lastTimestamp: lastPropertySync,
          incremental: true
        });
        results.properties = propertyResult;
      }

      // Sync media incrementally
      if (options.syncMedia !== false) {
        const mediaResult = await this.syncMedia({
          lastTimestamp: lastMediaSync,
          incremental: true
        });
        results.media = mediaResult;
      }

      results.duration = Date.now() - startTime;
      results.endTime = new Date().toISOString();

      logger.info('Incremental sync completed', {
        duration: `${results.duration}ms`,
        properties: results.properties,
        media: results.media
      });

      return results;

    } catch (error) {
      results.duration = Date.now() - startTime;
      results.error = error.message;
      logger.error('Incremental sync failed', { error: error.message, results });
      throw error;
    }
  }

  /**
   * Sync property data
   * @param {Object} options - Sync options
   * @returns {Promise<Object>} Property sync results
   */
  async syncProperties(options = {}) {
    const {
      lastTimestamp = '1970-01-01T00:00:00Z',
      lastKey = '0',
      incremental = false
    } = options;

    logger.info('Starting property sync', { lastTimestamp, lastKey, incremental });

    const results = {
      attempted: 0,
      successful: 0,
      failed: 0,
      errors: []
    };

    try {
      // Fetch properties from AMPRE API
      const properties = await this.ampreApi.fetchIncremental('Property', {
        timestampField: this.config.property.timestampField,
        keyField: this.config.property.keyField,
        lastTimestamp,
        lastKey,
        batchSize: this.config.property.batchSize,
        additionalFilter: this.config.property.filter
      });

      results.attempted = properties.length;

      if (properties.length === 0) {
        logger.info('No new properties to sync');
        return results;
      }

      // Map and validate properties
      const mappedProperties = [];
      for (const rawProperty of properties) {
        try {
          const mappedProperty = mapProperty(rawProperty);
          validateProperty(mappedProperty);
          mappedProperties.push(mappedProperty);
        } catch (mappingError) {
          logger.error('Error mapping property', {
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

      // Bulk upsert to database
      if (mappedProperties.length > 0) {
        const dbResult = await this.database.upsertProperties(mappedProperties);
        results.successful += dbResult.successful;
        results.failed += dbResult.failed;
        results.errors.push(...dbResult.errors.map(err => ({
          ...err,
          stage: 'database'
        })));
      }

      logger.info('Property sync completed', results);
      return results;

    } catch (error) {
      logger.error('Error in property sync', { error: error.message });
      throw error;
    }
  }

  /**
   * Sync media data
   * @param {Object} options - Sync options
   * @returns {Promise<Object>} Media sync results
   */
  async syncMedia(options = {}) {
    const {
      lastTimestamp = '1970-01-01T00:00:00Z',
      lastKey = '0',
      incremental = false
    } = options;

    logger.info('Starting media sync', { lastTimestamp, lastKey, incremental });

    const results = {
      attempted: 0,
      successful: 0,
      failed: 0,
      errors: []
    };

    try {
      // Fetch media from AMPRE API
      const mediaRecords = await this.ampreApi.fetchIncremental('Media', {
        timestampField: this.config.media.timestampField,
        keyField: this.config.media.keyField,
        lastTimestamp,
        lastKey,
        batchSize: this.config.media.batchSize,
        additionalFilter: this.config.media.filter
      });

      results.attempted = mediaRecords.length;

      if (mediaRecords.length === 0) {
        logger.info('No new media to sync');
        return results;
      }

      // Map and validate media
      const mappedMedia = [];
      for (const rawMedia of mediaRecords) {
        try {
          const mappedMediaRecord = mapMedia(rawMedia);
          validateMedia(mappedMediaRecord);
          mappedMedia.push(mappedMediaRecord);
        } catch (mappingError) {
          logger.error('Error mapping media', {
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

      // Bulk upsert to database
      if (mappedMedia.length > 0) {
        const dbResult = await this.database.upsertMediaBulk(mappedMedia);
        results.successful += dbResult.successful;
        results.failed += dbResult.failed;
        results.errors.push(...dbResult.errors.map(err => ({
          ...err,
          stage: 'database'
        })));
      }

      logger.info('Media sync completed', results);
      return results;

    } catch (error) {
      logger.error('Error in media sync', { error: error.message });
      throw error;
    }
  }

  /**
   * Sync a specific property and its media
   * @param {string} listingKey - Property ListingKey
   * @returns {Promise<Object>} Sync result
   */
  async syncSingleProperty(listingKey) {
    logger.info('Starting single property sync', { listingKey });

    try {
      // Fetch property from API
      const rawProperty = await this.ampreApi.fetchSingle('Property', listingKey);
      
      if (!rawProperty) {
        throw new Error(`Property ${listingKey} not found`);
      }

      // Map and validate property
      const mappedProperty = mapProperty(rawProperty);
      validateProperty(mappedProperty);

      // Upsert property to database
      const propertyResult = await this.database.upsertProperty(mappedProperty);

      // Fetch and sync associated media
      const mediaRecords = await this.ampreApi.fetchBatch('Media', {
        filter: `ResourceRecordKey in ('${listingKey}')`,
        orderBy: 'Order'
      });

      const mediaResults = {
        attempted: mediaRecords.length,
        successful: 0,
        failed: 0,
        errors: []
      };

      for (const rawMedia of mediaRecords) {
        try {
          const mappedMedia = mapMedia(rawMedia);
          validateMedia(mappedMedia);
          await this.database.upsertMedia(mappedMedia);
          mediaResults.successful++;
        } catch (error) {
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

      logger.info('Single property sync completed', {
        listingKey,
        property: propertyResult.success,
        media: mediaResults
      });

      return {
        property: propertyResult.success,
        media: mediaResults
      };

    } catch (error) {
      logger.error('Error in single property sync', {
        listingKey,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get sync status and statistics
   * @returns {Promise<Object>} Sync status information
   */
  async getSyncStatus() {
    try {
      const dbStatus = await this.database.getSyncStatus();
      const apiHealthy = await this.checkApiHealth();
      const dbHealthy = await this.database.healthCheck();

      return {
        ...dbStatus,
        health: {
          api: apiHealthy,
          database: dbHealthy,
          overall: apiHealthy && dbHealthy
        }
      };
    } catch (error) {
      logger.error('Error getting sync status', { error: error.message });
      throw error;
    }
  }

  /**
   * Check API health
   * @returns {Promise<boolean>} True if API is accessible
   */
  async checkApiHealth() {
    try {
      await this.ampreApi.getCount('Property', '', { timeout: 5000 });
      return true;
    } catch (error) {
      logger.error('API health check failed', { error: error.message });
      return false;
    }
  }
}

export default SyncService;
