#!/usr/bin/env node

/**
 * Setup script for initial configuration and testing
 */

import { setProcessEnv } from '../config/credentials.js';
import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load hardcoded configuration
setProcessEnv();

class SetupManager {
  constructor() {
    this.rootDir = join(__dirname, '../..');
  }

  async setup() {
    logger.info('🚀 Starting Real Estate Backend Setup...');

    try {
      // Check environment variables
      await this.checkEnvironmentVariables();
      
      // Create necessary directories
      await this.createDirectories();
      
      // Validate API connections
      await this.validateConnections();
      
      // Show setup summary
      await this.showSetupSummary();
      
      logger.info('✅ Setup completed successfully!');
      
    } catch (error) {
      logger.error('❌ Setup failed', { error: error.message });
      process.exit(1);
    }
  }

  async checkEnvironmentVariables() {
    logger.info('📋 Checking environment variables...');

    const requiredEnvVars = [
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY', 
      'ACCESS_TOKEN'
    ];

    const optionalEnvVars = [
      'SUPABASE_SERVICE_ROLE_KEY',
      'PORT',
      'NODE_ENV',
      'SYNC_INTERVAL_MINUTES',
      'BATCH_SIZE_PROPERTY',
      'BATCH_SIZE_MEDIA'
    ];

    const missing = [];
    const present = [];

    // Check required variables
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        missing.push(envVar);
      } else {
        present.push(envVar);
      }
    }

    // Check optional variables
    for (const envVar of optionalEnvVars) {
      if (process.env[envVar]) {
        present.push(envVar);
      }
    }

    if (missing.length > 0) {
      logger.error('Missing required environment variables:', { missing });
      logger.info('Please copy env.example to .env and fill in the required values');
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    logger.info('✅ Environment variables configured', { 
      required: requiredEnvVars.length,
      optional: present.filter(v => optionalEnvVars.includes(v)).length,
      total: present.length
    });
  }

  async createDirectories() {
    logger.info('📁 Creating necessary directories...');

    const directories = [
      'logs',
      'data',
      'temp'
    ];

    for (const dir of directories) {
      const dirPath = join(this.rootDir, dir);
      try {
        await fs.mkdir(dirPath, { recursive: true });
        logger.debug(`Created directory: ${dir}`);
      } catch (error) {
        if (error.code !== 'EEXIST') {
          throw error;
        }
      }
    }

    logger.info('✅ Directories created successfully');
  }

  async validateConnections() {
    logger.info('🔗 Validating connections...');

    try {
      // Import services dynamically to avoid module loading issues
      const { default: AmpreApiService } = await import('../services/ampreApiService.js');
      const { default: DatabaseService } = await import('../services/databaseService.js');

      // Test AMPRE API
      logger.info('Testing AMPRE API connection...');
      const ampreApi = new AmpreApiService();
      const propertyCount = await ampreApi.getCount('Property');
      logger.info(`✅ AMPRE API connected - ${propertyCount} properties available`);

      // Test Database
      logger.info('Testing Supabase connection...');
      const database = new DatabaseService();
      const isHealthy = await database.healthCheck();
      
      if (isHealthy) {
        const syncStatus = await database.getSyncStatus();
        logger.info('✅ Supabase connected', {
          properties: syncStatus.properties.count,
          media: syncStatus.media.count
        });
      } else {
        throw new Error('Database health check failed');
      }

    } catch (error) {
      logger.error('❌ Connection validation failed', { error: error.message });
      throw error;
    }
  }

  async showSetupSummary() {
    logger.info('📊 Setup Summary:');
    
    const summary = {
      server: {
        port: process.env.PORT || 3000,
        environment: process.env.NODE_ENV || 'development'
      },
      sync: {
        interval: `${process.env.SYNC_INTERVAL_MINUTES || 30} minutes`,
        propertyBatchSize: process.env.BATCH_SIZE_PROPERTY || 1000,
        mediaBatchSize: process.env.BATCH_SIZE_MEDIA || 500
      },
      endpoints: {
        ampre: process.env.AMPRE_BASE_URL || 'https://query.ampre.ca',
        supabase: process.env.SUPABASE_URL
      }
    };

    console.log('\n' + '='.repeat(50));
    console.log('🏠 REAL ESTATE BACKEND SETUP COMPLETE');
    console.log('='.repeat(50));
    console.log(`🌐 Server Port: ${summary.server.port}`);
    console.log(`🔄 Sync Interval: ${summary.sync.interval}`);
    console.log(`📦 Property Batch Size: ${summary.sync.propertyBatchSize}`);
    console.log(`🖼️  Media Batch Size: ${summary.sync.mediaBatchSize}`);
    console.log('='.repeat(50));
    console.log('\n🚀 Next Steps:');
    console.log('1. Start the server: npm run dev');
    console.log('2. Test the API: curl http://localhost:' + summary.server.port + '/health');
    console.log('3. View API docs: http://localhost:' + summary.server.port + '/api');
    console.log('4. Start sync scheduler: npm run sync');
    console.log('5. Test API functions: node src/scripts/test-api.js');
    console.log('\n📚 Documentation: README.md');
    console.log('🐛 Logs: logs/ directory');
    console.log('');
  }
}

// Handle running as a script
if (import.meta.url === `file://${process.argv[1]}`) {
  const setup = new SetupManager();
  setup.setup().catch(error => {
    logger.error('Setup script failed', { error: error.message });
    process.exit(1);
  });
}

export default SetupManager;
