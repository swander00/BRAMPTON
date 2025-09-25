import express from 'express';
import PropertyController from '../controllers/propertyController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { readLimiter, syncLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();
const propertyController = new PropertyController();

/**
 * GET /api/properties
 * Get properties with pagination and filtering
 */
router.get('/', 
  readLimiter,
  asyncHandler(propertyController.getProperties.bind(propertyController))
);

/**
 * GET /api/properties/search
 * Advanced property search
 */
router.get('/search', 
  readLimiter,
  asyncHandler(propertyController.searchProperties.bind(propertyController))
);

/**
 * GET /api/properties/stats
 * Get property statistics
 */
router.get('/stats', 
  readLimiter,
  asyncHandler(propertyController.getPropertyStats.bind(propertyController))
);

/**
 * GET /api/properties/:listingKey
 * Get a single property by ListingKey
 */
router.get('/:listingKey', 
  readLimiter,
  asyncHandler(propertyController.getProperty.bind(propertyController))
);

/**
 * GET /api/properties/:listingKey/media
 * Get media for a specific property
 */
router.get('/:listingKey/media', 
  readLimiter,
  asyncHandler(propertyController.getPropertyMedia.bind(propertyController))
);

/**
 * POST /api/properties/:listingKey/sync
 * Sync a specific property from the AMPRE API
 */
router.post('/:listingKey/sync', 
  syncLimiter,
  asyncHandler(propertyController.syncProperty.bind(propertyController))
);

export default router;
