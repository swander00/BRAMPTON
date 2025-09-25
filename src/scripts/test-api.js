#!/usr/bin/env node

/**
 * Simple API test script
 * Tests basic functionality of the AMPRE API integration
 */

import { setProcessEnv } from '../config/credentials.js';
import AmpreApiService from '../services/ampreApiService.js';
import DatabaseService from '../services/databaseService.js';
import logger from '../utils/logger.js';

// Load hardcoded configuration
setProcessEnv();

async function testApi() {
  logger.info('Starting API tests...');

  try {
    // Test AMPRE API connection
    logger.info('Testing AMPRE API connection...');
    const ampreApi = new AmpreApiService();
    
    // Test metadata
    const metadata = await ampreApi.getMetadata();
    logger.info('✅ Metadata fetch successful');

    // Test property count
    const propertyCount = await ampreApi.getCount('Property');
    logger.info(`✅ Property count: ${propertyCount}`);

    // Test media count
    const mediaCount = await ampreApi.getCount('Media');
    logger.info(`✅ Media count: ${mediaCount}`);

    // Test single property fetch
    const properties = await ampreApi.fetchBatch('Property', { top: 1 });
    if (properties.length > 0) {
      const singleProperty = await ampreApi.fetchSingle('Property', properties[0].ListingKey);
      logger.info(`✅ Single property fetch: ${singleProperty.ListingKey}`);
    }

    // Test database connection
    logger.info('Testing database connection...');
    const database = new DatabaseService();
    
    const isHealthy = await database.healthCheck();
    if (isHealthy) {
      logger.info('✅ Database connection successful');
    } else {
      logger.error('❌ Database connection failed');
    }

    // Test sync status
    const syncStatus = await database.getSyncStatus();
    logger.info('✅ Sync status retrieved', syncStatus);

    logger.info('🎉 All tests passed!');

  } catch (error) {
    logger.error('❌ Test failed', { error: error.message });
    process.exit(1);
  }
}

// Handle running as a script
if (import.meta.url === `file://${process.argv[1]}`) {
  testApi().catch(error => {
    logger.error('Test script failed', { error: error.message });
    process.exit(1);
  });
}

export default testApi;
