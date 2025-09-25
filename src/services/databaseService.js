import { supabase, supabaseAdmin } from '../config/supabase.js';
import logger from '../utils/logger.js';

class DatabaseService {
  constructor() {
    // Use admin client for backend operations if available, otherwise use regular client
    this.client = supabaseAdmin || supabase;
    
    if (!supabaseAdmin) {
      logger.warn('Using regular Supabase client instead of admin client - some operations may be restricted');
    }
  }

  /**
   * Upsert a single property record
   * @param {Object} propertyData - Mapped property data
   * @returns {Promise<Object>} Result of upsert operation
   */
  async upsertProperty(propertyData) {
    try {
      const { data, error } = await this.client
        .from('Property')
        .upsert(propertyData, {
          onConflict: 'ListingKey',
          ignoreDuplicates: false
        })
        .select();

      if (error) {
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

    } catch (error) {
      logger.error('Database error upserting property', {
        ListingKey: propertyData?.ListingKey,
        error: error.message
      });
      throw error;
    }
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
      
      const results = {
        total: propertiesData.length,
        successful: 0,
        failed: 0,
        errors: []
      };

      // Process in batches to avoid overwhelming the database
      for (let i = 0; i < propertiesData.length; i += batchSize) {
        const batch = propertiesData.slice(i, i + batchSize);
        
        try {
          const { data, error } = await this.client
            .from('Property')
            .upsert(batch, {
              onConflict: 'ListingKey',
              ignoreDuplicates: false
            })
            .select('ListingKey');

          if (error) {
            logger.error(`Error upserting property batch ${i}-${i + batch.length}`, {
              error: error.message
            });
            results.failed += batch.length;
            results.errors.push({
              batch: `${i}-${i + batch.length}`,
              error: error.message
            });
          } else {
            results.successful += data.length;
            logger.info(`Batch ${i}-${i + batch.length} upserted successfully`);
          }

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
   * Upsert a single media record
   * @param {Object} mediaData - Mapped media data
   * @returns {Promise<Object>} Result of upsert operation
   */
  async upsertMedia(mediaData) {
    try {
      const { data, error } = await this.client
        .from('Media')
        .upsert(mediaData, {
          onConflict: 'MediaKey',
          ignoreDuplicates: false
        })
        .select();

      if (error) {
        logger.error('Error upserting media', {
          MediaKey: mediaData.MediaKey,
          ResourceRecordKey: mediaData.ResourceRecordKey,
          error: error.message
        });
        throw error;
      }

      logger.debug('Media upserted successfully', {
        MediaKey: mediaData.MediaKey,
        ResourceRecordKey: mediaData.ResourceRecordKey
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
   * Upsert multiple media records
   * @param {Array} mediaData - Array of mapped media data
   * @param {number} batchSize - Size of batches for processing
   * @returns {Promise<Object>} Result summary
   */
  async upsertMediaBulk(mediaData, batchSize = 100) {
    try {
      logger.info(`Starting bulk upsert of ${mediaData.length} media records`);
      
      const results = {
        total: mediaData.length,
        successful: 0,
        failed: 0,
        errors: []
      };

      // Process in batches
      for (let i = 0; i < mediaData.length; i += batchSize) {
        const batch = mediaData.slice(i, i + batchSize);
        
        try {
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
   * Alias for upsertMediaBulk for consistency with EnhancedSyncService
   */
  async upsertMediaBatch(mediaData, batchSize = 100) {
    return this.upsertMediaBulk(mediaData, batchSize);
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
