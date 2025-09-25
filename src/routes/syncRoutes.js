import express from 'express';
import SyncController from '../controllers/syncController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { readLimiter, syncLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();
const syncController = new SyncController();

/**
 * GET /api/sync/status
 * Get sync status and health information
 */
router.get('/status', 
  readLimiter,
  asyncHandler(syncController.getSyncStatus.bind(syncController))
);

/**
 * GET /api/sync/config
 * Get sync configuration
 */
router.get('/config', 
  readLimiter,
  asyncHandler(syncController.getSyncConfig.bind(syncController))
);

/**
 * GET /api/sync/health
 * Health check endpoint
 */
router.get('/health', 
  readLimiter,
  asyncHandler(syncController.healthCheck.bind(syncController))
);

/**
 * POST /api/sync/full
 * Trigger a full sync of all data
 */
router.post('/full', 
  syncLimiter,
  asyncHandler(syncController.triggerFullSync.bind(syncController))
);

/**
 * POST /api/sync/incremental
 * Trigger an incremental sync
 */
router.post('/incremental', 
  syncLimiter,
  asyncHandler(syncController.triggerIncrementalSync.bind(syncController))
);

/**
 * POST /api/sync/properties
 * Sync properties only
 */
router.post('/properties', 
  syncLimiter,
  asyncHandler(syncController.syncProperties.bind(syncController))
);

/**
 * POST /api/sync/media
 * Sync media only
 */
router.post('/media', 
  syncLimiter,
  asyncHandler(syncController.syncMedia.bind(syncController))
);

export default router;
