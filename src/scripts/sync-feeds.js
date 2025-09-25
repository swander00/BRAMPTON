#!/usr/bin/env node

/**
 * Scheduled sync script for AMPRE IDX/VOW feeds
 * Based on the existing Replication-Source-Code.txt but integrated with Supabase
 */

import { setProcessEnv } from '../config/credentials.js';
import cron from 'node-cron';
import SyncService from '../services/syncService.js';
import logger from '../utils/logger.js';

// Load hardcoded configuration
setProcessEnv();

class ScheduledSync {
  constructor() {
    this.syncService = new SyncService();
    this.isRunning = false;
    this.lastRun = null;
    this.syncInterval = process.env.SYNC_INTERVAL_MINUTES || 30;
    
    logger.info('Scheduled Sync initialized', {
      syncInterval: `${this.syncInterval} minutes`
    });
  }

  /**
   * Start the scheduled sync process
   */
  start() {
    // Convert minutes to cron expression
    const cronExpression = `*/${this.syncInterval} * * * *`;
    
    logger.info('Starting scheduled sync', { 
      cronExpression,
      nextRun: this.getNextRunTime(cronExpression)
    });

    // Schedule incremental sync
    cron.schedule(cronExpression, async () => {
      await this.runIncrementalSync();
    }, {
      scheduled: true,
      timezone: process.env.TZ || 'America/Toronto'
    });

    // Schedule daily full sync at 2 AM
    cron.schedule('0 2 * * *', async () => {
      await this.runFullSync();
    }, {
      scheduled: true,
      timezone: process.env.TZ || 'America/Toronto'
    });

    // Schedule health checks every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      await this.performHealthCheck();
    }, {
      scheduled: true,
      timezone: process.env.TZ || 'America/Toronto'
    });

    logger.info('Scheduled sync tasks started successfully');
  }

  /**
   * Run incremental sync
   */
  async runIncrementalSync() {
    if (this.isRunning) {
      logger.warn('Sync already running, skipping incremental sync');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      logger.info('Starting scheduled incremental sync');
      
      const result = await this.syncService.performIncrementalSync();
      
      this.lastRun = {
        type: 'incremental',
        startTime: new Date(startTime).toISOString(),
        endTime: new Date().toISOString(),
        duration: Date.now() - startTime,
        result,
        success: true
      };

      logger.info('Scheduled incremental sync completed successfully', {
        duration: `${this.lastRun.duration}ms`,
        properties: result.properties,
        media: result.media
      });

    } catch (error) {
      this.lastRun = {
        type: 'incremental',
        startTime: new Date(startTime).toISOString(),
        endTime: new Date().toISOString(),
        duration: Date.now() - startTime,
        success: false,
        error: error.message
      };

      logger.error('Scheduled incremental sync failed', {
        error: error.message,
        duration: `${this.lastRun.duration}ms`
      });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Run full sync
   */
  async runFullSync() {
    if (this.isRunning) {
      logger.warn('Sync already running, skipping full sync');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      logger.info('Starting scheduled full sync');
      
      const result = await this.syncService.performFullSync();
      
      this.lastRun = {
        type: 'full',
        startTime: new Date(startTime).toISOString(),
        endTime: new Date().toISOString(),
        duration: Date.now() - startTime,
        result,
        success: true
      };

      logger.info('Scheduled full sync completed successfully', {
        duration: `${this.lastRun.duration}ms`,
        properties: result.properties,
        media: result.media
      });

    } catch (error) {
      this.lastRun = {
        type: 'full',
        startTime: new Date(startTime).toISOString(),
        endTime: new Date().toISOString(),
        duration: Date.now() - startTime,
        success: false,
        error: error.message
      };

      logger.error('Scheduled full sync failed', {
        error: error.message,
        duration: `${this.lastRun.duration}ms`
      });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Perform health check
   */
  async performHealthCheck() {
    try {
      const status = await this.syncService.getSyncStatus();
      
      if (!status.health.overall) {
        logger.error('Health check failed', { status: status.health });
        
        // Could implement alerting here (email, Slack, etc.)
        // await this.sendHealthAlert(status);
      } else {
        logger.debug('Health check passed', { status: status.health });
      }
    } catch (error) {
      logger.error('Health check error', { error: error.message });
    }
  }

  /**
   * Get next run time for cron expression
   * @private
   */
  getNextRunTime(cronExpression) {
    try {
      const task = cron.schedule(cronExpression, () => {}, { scheduled: false });
      return task.nextDates().toString();
    } catch (error) {
      return 'Unable to calculate';
    }
  }

  /**
   * Get sync status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      syncInterval: this.syncInterval,
      uptime: process.uptime()
    };
  }
}

// Handle running as a script vs being imported
if (import.meta.url === `file://${process.argv[1]}`) {
  // Running as a script
  const scheduler = new ScheduledSync();
  
  // Handle process signals for graceful shutdown
  const gracefulShutdown = (signal) => {
    logger.info(`Received ${signal}. Stopping scheduled sync...`);
    
    if (scheduler.isRunning) {
      logger.info('Waiting for current sync to complete...');
      setTimeout(() => {
        logger.info('Sync scheduler stopped');
        process.exit(0);
      }, 5000);
    } else {
      logger.info('Sync scheduler stopped');
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Start the scheduler
  scheduler.start();

  // Keep the process alive
  logger.info('Sync scheduler is running. Press Ctrl+C to stop.');
}

export default ScheduledSync;
