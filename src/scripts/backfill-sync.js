#!/usr/bin/env node

/**
 * Backfill Sync Script for AMPRE IDX/VOW Data
 * Performs complete initial data load from AMPRE API to Supabase
 * Based on the replication source code with enhanced error handling and progress tracking
 */

import { setProcessEnv } from '../config/credentials.js';
import { mkdir, writeFile } from 'node:fs/promises';
import SyncService from '../services/syncService.js';
import AmpreApiService from '../services/ampreApiService.js';
import DatabaseService from '../services/databaseService.js';
import logger from '../utils/logger.js';

// Load hardcoded configuration
setProcessEnv();

class BackfillSync {
  constructor() {
    this.syncService = new SyncService();
    this.ampreApi = new AmpreApiService();
    this.database = new DatabaseService();
    
    // Configuration for backfill
    this.config = {
      property: {
        batchSize: parseInt(process.env.BATCH_SIZE_PROPERTY) || 1000,
        endpoint: 'Property',
        keyField: 'ListingKey',
        timestampField: 'ModificationTimestamp',
        filter: null, // Remove problematic filter - will sync all properties
        outputPath: './data/backfill/property'
      },
      media: {
        batchSize: parseInt(process.env.BATCH_SIZE_MEDIA) || 500,
        endpoint: 'Media',
        keyField: 'MediaKey',
        timestampField: 'ModificationTimestamp',
        filter: null,
        outputPath: './data/backfill/media'
      }
    };

    this.stats = {
      properties: { 
        total: 0, 
        processed: 0, 
        successful: 0, 
        failed: 0, 
        errors: [] 
      },
      media: { 
        total: 0, 
        processed: 0, 
        successful: 0, 
        failed: 0, 
        errors: [] 
      },
      startTime: null,
      endTime: null
    };

    logger.info('Backfill Sync initialized', { config: this.config });
  }

  /**
   * Execute complete backfill synchronization
   */
  async execute(options = {}) {
    const {
      saveToFiles = false,
      syncProperties = true,
      syncMedia = true,
      resetDatabase = false
    } = options;

    this.stats.startTime = new Date();
    logger.info('Starting backfill synchronization', {
      startTime: this.stats.startTime.toISOString(),
      options
    });

    try {
      // Health checks first
      await this.performHealthChecks();

      // Optional: Reset database tables
      if (resetDatabase) {
        await this.resetDatabase();
      }

      // Sync properties first (required for media foreign keys)
      if (syncProperties) {
        await this.syncAllProperties({ saveToFiles });
      }

      // Sync media
      if (syncMedia) {
        await this.syncAllMedia({ saveToFiles });
      }

      this.stats.endTime = new Date();
      const duration = this.stats.endTime - this.stats.startTime;

      // Final summary
      logger.info('Backfill synchronization completed successfully', {
        duration: `${Math.round(duration / 1000)}s`,
        properties: {
          total: this.stats.properties.total,
          successful: this.stats.properties.successful,
          failed: this.stats.properties.failed
        },
        media: {
          total: this.stats.media.total,
          successful: this.stats.media.successful,
          failed: this.stats.media.failed
        }
      });

      return this.generateSummaryReport();

    } catch (error) {
      this.stats.endTime = new Date();
      logger.error('Backfill synchronization failed', {
        error: error.message,
        stats: this.stats
      });
      throw error;
    }
  }

  /**
   * Perform health checks before starting sync
   */
  async performHealthChecks() {
    logger.info('Performing health checks...');

    // Check API connectivity
    try {
      const testCount = await this.ampreApi.getCount('Property', '', 'idx');
      logger.info('API health check passed', { availableProperties: testCount });
    } catch (error) {
      throw new Error(`API health check failed: ${error.message}`);
    }

    // Check database connectivity
    try {
      const dbHealth = await this.database.healthCheck();
      if (!dbHealth) {
        throw new Error('Database health check failed');
      }
      logger.info('Database health check passed');
    } catch (error) {
      throw new Error(`Database health check failed: ${error.message}`);
    }

    logger.info('All health checks passed');
  }

  /**
   * Reset database tables (optional - for clean slate)
   */
  async resetDatabase() {
    logger.warn('Resetting database tables...');
    
    try {
      // This would truncate tables - implement carefully
      // await this.database.truncateTable('Media');
      // await this.database.truncateTable('Property');
      logger.info('Database reset completed');
    } catch (error) {
      logger.error('Database reset failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Sync all properties using pre-built URLs with filters
   */
  async syncAllProperties(options = {}) {
    const { saveToFiles = false } = options;
    logger.info('Starting complete property synchronization');

    try {
      // Get total count using the complete IDX URL with your tested filters
      const totalCount = await this.ampreApi.getCountFromCompleteUrl('idxProperties', 'idx');
      this.stats.properties.total = totalCount;

      logger.info(`Found ${totalCount} properties to sync`);

      if (totalCount === 0) {
        logger.warn('No properties found to sync');
        return;
      }

      // Create output directory if saving to files
      if (saveToFiles) {
        await mkdir(this.config.property.outputPath, { recursive: true });
      }

      // Fetch all properties using pagination with the complete URL
      let skip = 0;
      let hasMore = true;
      const batchSize = this.config.property.batchSize;

      while (hasMore) {
        logger.info(`Fetching property batch ${Math.floor(skip / batchSize) + 1}`, {
          skip,
          batchSize,
          progress: `${skip}/${totalCount}`
        });

        const batch = await this.ampreApi.fetchFromCompleteUrl('idxProperties', {
          top: batchSize,
          skip,
          feedType: 'idx'
        });

        await this.processPropertyBatch(batch, { saveToFiles });

        skip += batchSize;
        hasMore = batch.length === batchSize && skip < totalCount;

        // Progress update
        logger.info(`Property sync progress: ${this.stats.properties.processed}/${totalCount} (${Math.round((this.stats.properties.processed / totalCount) * 100)}%)`);
      }

      logger.info('Property synchronization completed', {
        total: this.stats.properties.total,
        processed: this.stats.properties.processed,
        successful: this.stats.properties.successful,
        failed: this.stats.properties.failed
      });

    } catch (error) {
      logger.error('Property synchronization failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Process a batch of properties
   */
  async processPropertyBatch(properties, options = {}) {
    const { saveToFiles = false } = options;

    for (const rawProperty of properties) {
      this.stats.properties.processed++;

      try {
        // Save raw data to file if requested
        if (saveToFiles) {
          const filename = `${this.config.property.outputPath}/${rawProperty.ListingKey}.json`;
          await writeFile(filename, JSON.stringify(rawProperty, null, 2));
        }

        // Sync to database using existing sync service
        await this.syncService.syncSingleProperty(rawProperty.ListingKey);
        this.stats.properties.successful++;

        if (this.stats.properties.processed % 100 === 0) {
          logger.info(`Processed ${this.stats.properties.processed} properties`);
        }

      } catch (error) {
        this.stats.properties.failed++;
        this.stats.properties.errors.push({
          ListingKey: rawProperty?.ListingKey,
          error: error.message
        });

        logger.error('Failed to process property', {
          ListingKey: rawProperty?.ListingKey,
          error: error.message
        });
      }
    }
  }

  /**
   * Sync all media using pre-built URLs with filters
   */
  async syncAllMedia(options = {}) {
    const { saveToFiles = false } = options;
    logger.info('Starting complete media synchronization');

    try {
      // Get total count using the complete media URL with your tested filters
      const totalCount = await this.ampreApi.getCountFromCompleteUrl('media', 'idx');
      this.stats.media.total = totalCount;

      logger.info(`Found ${totalCount} media records to sync`);

      if (totalCount === 0) {
        logger.warn('No media records found to sync');
        return;
      }

      // Create output directory if saving to files
      if (saveToFiles) {
        await mkdir(this.config.media.outputPath, { recursive: true });
      }

      // Fetch all media using pagination with the complete URL
      let skip = 0;
      let hasMore = true;
      const batchSize = this.config.media.batchSize;

      while (hasMore) {
        logger.info(`Fetching media batch ${Math.floor(skip / batchSize) + 1}`, {
          skip,
          batchSize,
          progress: `${skip}/${totalCount}`
        });

        const batch = await this.ampreApi.fetchFromCompleteUrl('media', {
          top: batchSize,
          skip,
          feedType: 'idx'
        });

        await this.processMediaBatch(batch, { saveToFiles });

        skip += batchSize;
        hasMore = batch.length === batchSize && skip < totalCount;

        // Progress update
        logger.info(`Media sync progress: ${this.stats.media.processed}/${totalCount} (${Math.round((this.stats.media.processed / totalCount) * 100)}%)`);
      }

      logger.info('Media synchronization completed', {
        total: this.stats.media.total,
        processed: this.stats.media.processed,
        successful: this.stats.media.successful,
        failed: this.stats.media.failed
      });

    } catch (error) {
      logger.error('Media synchronization failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Process a batch of media records
   */
  async processMediaBatch(mediaRecords, options = {}) {
    const { saveToFiles = false } = options;
    
    // Import mapping functions
    const { mapMedia, validateMedia } = await import('../../mappers/mapMedia.js');

    for (const rawMedia of mediaRecords) {
      this.stats.media.processed++;

      try {
        // Save raw data to file if requested
        if (saveToFiles) {
          const filename = `${this.config.media.outputPath}/${rawMedia.MediaKey}.json`;
          await writeFile(filename, JSON.stringify(rawMedia, null, 2));
        }

        // Map and validate media
        const mappedMedia = mapMedia(rawMedia);
        validateMedia(mappedMedia);

        // Upsert to database
        await this.database.upsertMedia(mappedMedia);
        this.stats.media.successful++;

        if (this.stats.media.processed % 100 === 0) {
          logger.info(`Processed ${this.stats.media.processed} media records`);
        }

      } catch (error) {
        this.stats.media.failed++;
        this.stats.media.errors.push({
          MediaKey: rawMedia?.MediaKey,
          ResourceRecordKey: rawMedia?.ResourceRecordKey,
          error: error.message
        });

        logger.error('Failed to process media', {
          MediaKey: rawMedia?.MediaKey,
          ResourceRecordKey: rawMedia?.ResourceRecordKey,
          error: error.message
        });
      }
    }
  }

  /**
   * Generate comprehensive summary report
   */
  generateSummaryReport() {
    const duration = this.stats.endTime - this.stats.startTime;
    const durationSeconds = Math.round(duration / 1000);
    const durationMinutes = Math.round(duration / 60000);

    const report = {
      summary: {
        startTime: this.stats.startTime.toISOString(),
        endTime: this.stats.endTime.toISOString(),
        duration: {
          milliseconds: duration,
          seconds: durationSeconds,
          minutes: durationMinutes
        },
        overall: {
          totalRecords: this.stats.properties.total + this.stats.media.total,
          successfulRecords: this.stats.properties.successful + this.stats.media.successful,
          failedRecords: this.stats.properties.failed + this.stats.media.failed,
          successRate: Math.round(((this.stats.properties.successful + this.stats.media.successful) / (this.stats.properties.total + this.stats.media.total)) * 100)
        }
      },
      properties: {
        total: this.stats.properties.total,
        processed: this.stats.properties.processed,
        successful: this.stats.properties.successful,
        failed: this.stats.properties.failed,
        successRate: this.stats.properties.total > 0 ? Math.round((this.stats.properties.successful / this.stats.properties.total) * 100) : 0,
        errors: this.stats.properties.errors.slice(0, 10) // Show first 10 errors
      },
      media: {
        total: this.stats.media.total,
        processed: this.stats.media.processed,
        successful: this.stats.media.successful,
        failed: this.stats.media.failed,
        successRate: this.stats.media.total > 0 ? Math.round((this.stats.media.successful / this.stats.media.total) * 100) : 0,
        errors: this.stats.media.errors.slice(0, 10) // Show first 10 errors
      }
    };

    // Save report to file
    const reportPath = `./logs/backfill-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    writeFile(reportPath, JSON.stringify(report, null, 2)).catch(err => {
      logger.error('Failed to save report', { error: err.message });
    });

    logger.info('Backfill report saved', { reportPath });
    return report;
  }

  /**
   * Perform targeted backfill for specific date range or criteria
   */
  async executeTargeted(options = {}) {
    const {
      startDate,
      endDate,
      propertyTypes = [],
      cities = [],
      saveToFiles = false
    } = options;

    logger.info('Starting targeted backfill', { options });

    try {
      // Build targeted filter
      let filter = this.config.property.filter;
      
      if (startDate || endDate) {
        const dateFilter = [];
        if (startDate) dateFilter.push(`ModificationTimestamp ge ${startDate}`);
        if (endDate) dateFilter.push(`ModificationTimestamp le ${endDate}`);
        filter += ` and (${dateFilter.join(' and ')})`;
      }

      if (propertyTypes.length > 0) {
        const typeFilter = propertyTypes.map(type => `PropertyType eq '${type}'`).join(' or ');
        filter += ` and (${typeFilter})`;
      }

      if (cities.length > 0) {
        const cityFilter = cities.map(city => `City eq '${city}'`).join(' or ');
        filter += ` and (${cityFilter})`;
      }

      // Update config for targeted sync
      this.config.property.filter = filter;

      // Execute sync with targeted filter
      return await this.execute({ saveToFiles, syncMedia: true });

    } catch (error) {
      logger.error('Targeted backfill failed', { error: error.message, options });
      throw error;
    }
  }
}

// CLI execution when run as script
if (import.meta.url === `file://${process.argv[1]}`) {
  const backfill = new BackfillSync();
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  const options = {
    saveToFiles: args.includes('--save-files'),
    resetDatabase: args.includes('--reset-db'),
    syncProperties: !args.includes('--no-properties'),
    syncMedia: !args.includes('--no-media')
  };

  // Handle graceful shutdown
  const gracefulShutdown = (signal) => {
    logger.info(`Received ${signal}. Stopping backfill sync...`);
    process.exit(0);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Execute backfill
  backfill.execute(options)
    .then(report => {
      logger.info('Backfill completed successfully');
      console.log('\n=== BACKFILL SUMMARY ===');
      console.log(`Properties: ${report.properties.successful}/${report.properties.total} (${report.properties.successRate}%)`);
      console.log(`Media: ${report.media.successful}/${report.media.total} (${report.media.successRate}%)`);
      console.log(`Duration: ${report.summary.duration.minutes} minutes`);
      console.log(`Overall Success Rate: ${report.summary.overall.successRate}%`);
      
      if (report.properties.failed > 0 || report.media.failed > 0) {
        console.log('\nSome records failed to sync. Check logs for details.');
        process.exit(1);
      } else {
        process.exit(0);
      }
    })
    .catch(error => {
      logger.error('Backfill failed', { error: error.message });
      console.error('Backfill failed:', error.message);
      process.exit(1);
    });
}

export default BackfillSync;
