#!/usr/bin/env node

/**
 * Backfill Sync Script for AMPRE IDX/VOW Data
 * Uses centralized config (src/config/credentials.js)
 * Hardcoded filters and URLs for consistent reproducibility
 */

import config, { setProcessEnv } from '../config/credentials.js';
import { mkdir, writeFile } from 'node:fs/promises';
import SyncService from '../services/syncService.js';
import AmpreApiService from '../services/ampreApiService.js';
import DatabaseService from '../services/databaseService.js';
import logger from '../utils/logger.js';

// Load config into process.env for any legacy code that still expects it
setProcessEnv();

class BackfillSync {
  constructor() {
    this.syncService = new SyncService();
    this.ampreApi = new AmpreApiService(config.ampre.tokens);
    this.database = new DatabaseService();

    this.config = {
      urls: {
        idxProperties: config.ampre.endpoints.idxProperties,
        vowProperties: config.ampre.endpoints.vowProperties,
        propertyRooms: config.ampre.endpoints.propertyRooms,
        openHouse: config.ampre.endpoints.openHouse,
        media: config.ampre.endpoints.media
      },
      batchSize: {
        property: config.app.batchSizeProperty,
        media: config.app.batchSizeMedia
      },
      outputPath: {
        property: './data/backfill/property',
        media: './data/backfill/media'
      }
    };

    this.stats = {
      properties: { total: 0, processed: 0, successful: 0, failed: 0, errors: [] },
      media: { total: 0, processed: 0, successful: 0, failed: 0, errors: [] },
      startTime: null,
      endTime: null
    };

    logger.info('Backfill Sync initialized', { urls: this.config.urls });
  }

  async execute({ saveToFiles = false, syncProperties = true, syncMedia = true, resetDatabase = false } = {}) {
    this.stats.startTime = new Date();
    logger.info('Starting backfill sync', { startTime: this.stats.startTime.toISOString() });

    try {
      await this.performHealthChecks();

      if (resetDatabase) await this.resetDatabase();

      if (syncProperties) await this.syncProperties(saveToFiles);

      if (syncMedia) await this.syncMedia(saveToFiles);

      this.stats.endTime = new Date();
      const duration = (this.stats.endTime - this.stats.startTime) / 1000;

      logger.info('Backfill completed successfully', {
        duration: `${duration}s`,
        properties: this.stats.properties,
        media: this.stats.media
      });

      return this.generateSummaryReport();
    } catch (error) {
      this.stats.endTime = new Date();
      logger.error('Backfill failed', { error: error.message });
      throw error;
    }
  }

  async performHealthChecks() {
    logger.info('Performing health checks...');
    await this.ampreApi.testConnection(this.config.urls.idxProperties);
    await this.database.healthCheck();
    logger.info('Health checks passed');
  }

  async resetDatabase() {
    logger.warn('Resetting database tables...');
    await this.database.truncateTable('Media');
    await this.database.truncateTable('Property');
    logger.info('Database reset completed');
  }

  async syncProperties(saveToFiles) {
    logger.info('Fetching property count from IDX URL...');
    const totalCount = await this.ampreApi.getCountFromUrl(this.config.urls.idxProperties);
    this.stats.properties.total = totalCount;

    if (totalCount === 0) {
      logger.warn('No properties found to sync');
      return;
    }

    if (saveToFiles) await mkdir(this.config.outputPath.property, { recursive: true });

    let skip = 0;
    const batchSize = this.config.batchSize.property;

    while (skip < totalCount) {
      const batch = await this.ampreApi.fetchFromUrl(this.config.urls.idxProperties, {
        top: batchSize,
        skip
      });

      await this.processPropertyBatch(batch, saveToFiles);

      skip += batchSize;
      logger.info(`Property sync progress: ${this.stats.properties.processed}/${totalCount}`);
    }
  }

  async processPropertyBatch(batch, saveToFiles) {
    for (const rawProperty of batch) {
      try {
        if (saveToFiles) {
          const filename = `${this.config.outputPath.property}/${rawProperty.ListingKey}.json`;
          await writeFile(filename, JSON.stringify(rawProperty, null, 2));
        }
        await this.syncService.syncSingleProperty(rawProperty.ListingKey);
        this.stats.properties.successful++;
      } catch (error) {
        this.stats.properties.failed++;
        this.stats.properties.errors.push({
          ListingKey: rawProperty.ListingKey,
          error: error.message
        });
      } finally {
        this.stats.properties.processed++;
      }
    }
  }

  async syncMedia(saveToFiles) {
    logger.info('Fetching media count from URL...');
    const totalCount = await this.ampreApi.getCountFromUrl(this.config.urls.media);
    this.stats.media.total = totalCount;

    if (totalCount === 0) {
      logger.warn('No media found to sync');
      return;
    }

    if (saveToFiles) await mkdir(this.config.outputPath.media, { recursive: true });

    let skip = 0;
    const batchSize = this.config.batchSize.media;

    while (skip < totalCount) {
      const batch = await this.ampreApi.fetchFromUrl(this.config.urls.media, {
        top: batchSize,
        skip
      });

      await this.processMediaBatch(batch, saveToFiles);

      skip += batchSize;
      logger.info(`Media sync progress: ${this.stats.media.processed}/${totalCount}`);
    }
  }

  async processMediaBatch(batch, saveToFiles) {
    const { mapMedia, validateMedia } = await import('../../mappers/mapMedia.js');
    for (const rawMedia of batch) {
      try {
        if (saveToFiles) {
          const filename = `${this.config.outputPath.media}/${rawMedia.MediaKey}.json`;
          await writeFile(filename, JSON.stringify(rawMedia, null, 2));
        }
        const mappedMedia = mapMedia(rawMedia);
        validateMedia(mappedMedia);
        await this.database.upsertMedia(mappedMedia);
        this.stats.media.successful++;
      } catch (error) {
        this.stats.media.failed++;
        this.stats.media.errors.push({
          MediaKey: rawMedia.MediaKey,
          error: error.message
        });
      } finally {
        this.stats.media.processed++;
      }
    }
  }

  generateSummaryReport() {
    const duration = (this.stats.endTime - this.stats.startTime) / 1000;
    const report = {
      summary: {
        startTime: this.stats.startTime.toISOString(),
        endTime: this.stats.endTime.toISOString(),
        durationSeconds: duration,
        overallSuccessRate: this.calculateSuccessRate()
      },
      properties: this.stats.properties,
      media: this.stats.media
    };
    const reportPath = `./logs/backfill-report-${Date.now()}.json`;
    writeFile(reportPath, JSON.stringify(report, null, 2)).catch(err =>
      logger.error('Failed to save backfill report', { error: err.message })
    );
    logger.info('Backfill report saved', { reportPath });
    return report;
  }

  calculateSuccessRate() {
    const total = this.stats.properties.total + this.stats.media.total;
    const successful = this.stats.properties.successful + this.stats.media.successful;
    return total > 0 ? Math.round((successful / total) * 100) : 0;
  }
}

// CLI execution guard
if (import.meta.url === `file://${process.argv[1]}`) {
  const backfill = new BackfillSync();
  const options = {
    saveToFiles: process.argv.includes('--save-files'),
    resetDatabase: process.argv.includes('--reset-db'),
    syncProperties: !process.argv.includes('--no-properties'),
    syncMedia: !process.argv.includes('--no-media')
  };

  backfill.execute(options)
    .then(report => {
      console.log('\n=== BACKFILL SUMMARY ===');
      console.log(`Properties: ${report.properties.successful}/${report.properties.total}`);
      console.log(`Media: ${report.media.successful}/${report.media.total}`);
      console.log(`Overall Success Rate: ${report.summary.overallSuccessRate}%`);
    })
    .catch(error => {
      console.error('Backfill failed:', error.message);
      process.exit(1);
    });
}

export default BackfillSync;
