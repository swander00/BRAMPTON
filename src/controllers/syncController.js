import SyncService from '../services/syncService.js';
import logger from '../utils/logger.js';

class SyncController {
  constructor() {
    this.syncService = new SyncService();
  }

  /**
   * Get sync status and health information
   */
  async getSyncStatus(req, res) {
    try {
      const status = await this.syncService.getSyncStatus();

      res.json({
        success: true,
        data: status
      });

    } catch (error) {
      logger.error('Error in getSyncStatus controller', { 
        error: error.message 
      });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * Trigger a full sync of all data
   */
  async triggerFullSync(req, res) {
    try {
      const { syncProperties = true, syncMedia = true } = req.body;

      logger.info('Full sync triggered via API', { 
        syncProperties, 
        syncMedia,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });

      // Start sync in background and return immediately
      const syncPromise = this.syncService.performFullSync({
        syncProperties,
        syncMedia
      });

      // Don't await the sync, return immediately
      res.json({
        success: true,
        message: 'Full sync started',
        syncId: `full-${Date.now()}`,
        timestamp: new Date().toISOString()
      });

      // Log sync completion (but don't block response)
      syncPromise
        .then(result => {
          logger.info('Full sync completed', { result });
        })
        .catch(error => {
          logger.error('Full sync failed', { error: error.message });
        });

    } catch (error) {
      logger.error('Error triggering full sync', { 
        error: error.message 
      });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * Trigger an incremental sync
   */
  async triggerIncrementalSync(req, res) {
    try {
      const { syncProperties = true, syncMedia = true } = req.body;

      logger.info('Incremental sync triggered via API', { 
        syncProperties, 
        syncMedia,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });

      // Start sync in background and return immediately
      const syncPromise = this.syncService.performIncrementalSync({
        syncProperties,
        syncMedia
      });

      res.json({
        success: true,
        message: 'Incremental sync started',
        syncId: `incremental-${Date.now()}`,
        timestamp: new Date().toISOString()
      });

      // Log sync completion (but don't block response)
      syncPromise
        .then(result => {
          logger.info('Incremental sync completed', { result });
        })
        .catch(error => {
          logger.error('Incremental sync failed', { error: error.message });
        });

    } catch (error) {
      logger.error('Error triggering incremental sync', { 
        error: error.message 
      });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * Sync properties only
   */
  async syncProperties(req, res) {
    try {
      const { incremental = true } = req.body;

      logger.info('Property sync triggered via API', { 
        incremental,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });

      let syncPromise;
      if (incremental) {
        syncPromise = this.syncService.performIncrementalSync({
          syncProperties: true,
          syncMedia: false
        });
      } else {
        syncPromise = this.syncService.performFullSync({
          syncProperties: true,
          syncMedia: false
        });
      }

      res.json({
        success: true,
        message: `${incremental ? 'Incremental' : 'Full'} property sync started`,
        syncId: `properties-${incremental ? 'inc' : 'full'}-${Date.now()}`,
        timestamp: new Date().toISOString()
      });

      // Log sync completion
      syncPromise
        .then(result => {
          logger.info('Property sync completed', { result });
        })
        .catch(error => {
          logger.error('Property sync failed', { error: error.message });
        });

    } catch (error) {
      logger.error('Error triggering property sync', { 
        error: error.message 
      });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * Sync media only
   */
  async syncMedia(req, res) {
    try {
      const { incremental = true } = req.body;

      logger.info('Media sync triggered via API', { 
        incremental,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });

      let syncPromise;
      if (incremental) {
        syncPromise = this.syncService.performIncrementalSync({
          syncProperties: false,
          syncMedia: true
        });
      } else {
        syncPromise = this.syncService.performFullSync({
          syncProperties: false,
          syncMedia: true
        });
      }

      res.json({
        success: true,
        message: `${incremental ? 'Incremental' : 'Full'} media sync started`,
        syncId: `media-${incremental ? 'inc' : 'full'}-${Date.now()}`,
        timestamp: new Date().toISOString()
      });

      // Log sync completion
      syncPromise
        .then(result => {
          logger.info('Media sync completed', { result });
        })
        .catch(error => {
          logger.error('Media sync failed', { error: error.message });
        });

    } catch (error) {
      logger.error('Error triggering media sync', { 
        error: error.message 
      });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * Get sync configuration
   */
  async getSyncConfig(req, res) {
    try {
      const config = {
        endpoints: {
          ampre: process.env.AMPRE_BASE_URL,
          supabase: process.env.SUPABASE_URL
        },
        batchSizes: {
          property: parseInt(process.env.BATCH_SIZE_PROPERTY) || 1000,
          media: parseInt(process.env.BATCH_SIZE_MEDIA) || 500
        },
        syncInterval: parseInt(process.env.SYNC_INTERVAL_MINUTES) || 30,
        lastSync: {
          // This would typically come from a database or cache
          properties: null,
          media: null
        }
      };

      res.json({
        success: true,
        data: config
      });

    } catch (error) {
      logger.error('Error getting sync config', { 
        error: error.message 
      });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * Health check endpoint
   */
  async healthCheck(req, res) {
    try {
      const status = await this.syncService.getSyncStatus();
      
      const isHealthy = status.health.overall;
      const statusCode = isHealthy ? 200 : 503;

      res.status(statusCode).json({
        success: isHealthy,
        data: {
          status: isHealthy ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          services: status.health,
          version: process.env.npm_package_version || '1.0.0'
        }
      });

    } catch (error) {
      logger.error('Error in health check', { 
        error: error.message 
      });
      res.status(503).json({
        success: false,
        data: {
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: error.message
        }
      });
    }
  }
}

export default SyncController;
