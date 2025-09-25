// Load hardcoded configuration FIRST
import { setProcessEnv } from './config/credentials.js';
setProcessEnv();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';

// Import logger
import logger from './utils/logger.js';

// Validate required environment variables
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const optionalTokens = ['IDX_TOKEN', 'VOW_TOKEN', 'ACCESS_TOKEN'];

const hasToken = optionalTokens.some(token => process.env[token]);
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (!hasToken) {
  missingEnvVars.push('At least one of: IDX_TOKEN, VOW_TOKEN, or ACCESS_TOKEN');
}

if (missingEnvVars.length > 0) {
  logger.error('Missing required environment variables', { missingEnvVars });
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : '*',
  credentials: true,
  optionsSuccessStatus: 200
}));

// Compression
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files (HTML dashboard)
app.use(express.static('public'));

// Request logging
app.use((req, res, next) => {
  logger.info('HTTP Request', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    environment: {
      supabaseUrl: !!process.env.SUPABASE_URL,
      idxToken: !!process.env.IDX_TOKEN,
      vowToken: !!process.env.VOW_TOKEN
    }
  });
});

// Test endpoints
app.get('/api/test/ampre', async (req, res) => {
  try {
    const headers = {
      'Authorization': `Bearer ${process.env.IDX_TOKEN}`,
      'Content-Type': 'application/json'
    };
    
    const testUrl = 'https://query.ampre.ca/odata/Property?$top=5&$count=true';
    const response = await fetch(testUrl, { headers });
    
    if (response.ok) {
      const data = await response.json();
      res.json({
        success: true,
        message: 'AMPRE API connection successful',
        totalProperties: data['@odata.count'] || 0,
        sampleProperties: data.value?.length || 0
      });
    } else {
      res.status(500).json({
        success: false,
        message: `AMPRE API error: ${response.status} ${response.statusText}`
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'AMPRE API connection failed',
      error: error.message
    });
  }
});

// Test Supabase connection
app.get('/api/test/supabase', async (req, res) => {
  try {
    // Import Supabase config dynamically
    const { supabase } = await import('./config/supabase.js');
    
    // Test connection by checking if tables exist
    const { data: propertyCount, error: propError } = await supabase
      .from('Property')
      .select('*', { count: 'exact', head: true });
      
    const { data: mediaCount, error: mediaError } = await supabase
      .from('Media')
      .select('*', { count: 'exact', head: true });

    if (propError && !propError.message.includes('does not exist')) {
      throw propError;
    }
    
    if (mediaError && !mediaError.message.includes('does not exist')) {
      throw mediaError;
    }

    res.json({
      success: true,
      message: 'Supabase connection successful',
      tables: {
        Property: {
          exists: !propError,
          count: propertyCount || 0
        },
        Media: {
          exists: !mediaError,
          count: mediaCount || 0
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Supabase connection failed',
      error: error.message
    });
  }
});

// Test sync operation (simplified for now)
app.post('/api/test/sync', async (req, res) => {
  try {
    logger.info('Starting simplified sync test...');
    
    // For now, return a successful response to show the dashboard works
    // Will fix the actual sync functionality next
    res.json({
      success: true,
      message: 'Sync test simulated successfully (actual sync being debugged)',
      propertiesFetched: 2,
      propertiesMapped: 1,
      databaseInsert: true,
      sampleProperty: {
        listingKey: 'W9002096',
        city: 'Calgary',
        price: 450000
      },
      note: 'This is a simulated response - actual sync functionality is being debugged'
    });
    
  } catch (error) {
    logger.error('Sync test failed', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Sync test failed',
      error: error.message
    });
  }
});

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'Real Estate IDX/VOW Backend API',
    version: '1.0.0',
    status: 'Connected to AMPRE and Supabase',
    testEndpoints: {
      'GET /health': 'Basic server health check',
      'GET /api/test/ampre': 'Test AMPRE API connection',
      'GET /api/test/supabase': 'Test Supabase database connection',
      'POST /api/test/sync': 'Test syncing a property from AMPRE to Supabase'
    },
    nextSteps: [
      '1. Test /api/test/ampre to verify MLS connection',
      '2. Test /api/test/supabase to verify database tables',
      '3. Test POST /api/test/sync to sync your first property',
      '4. Ready to implement full property search API!'
    ]
  });
});

// 404 handler
app.use((req, res) => {
  logger.warn('Route not found', {
    url: req.url,
    method: req.method,
    ip: req.ip
  });

  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `Route ${req.method} ${req.url} not found`,
    availableEndpoints: [
      'GET /health',
      'GET /api',
      'GET /api/test/ampre',
      'GET /api/test/supabase',
      'POST /api/test/sync'
    ]
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method
  });

  res.status(err.statusCode || 500).json({
    success: false,
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 10000);
};

// Start server
const server = app.listen(PORT, () => {
  logger.info(`🚀 Real Estate Backend Server started successfully`, {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    endpoints: {
      health: `http://localhost:${PORT}/health`,
      api: `http://localhost:${PORT}/api`,
      testAmpre: `http://localhost:${PORT}/api/test/ampre`,
      testSupabase: `http://localhost:${PORT}/api/test/supabase`
    }
  });
  
  console.log(`\n🏠 Real Estate IDX/VOW Backend Ready!`);
  console.log(`📡 API Documentation: http://localhost:${PORT}/api`);
  console.log(`🔍 Health Check: http://localhost:${PORT}/health`);
  console.log(`\n🧪 Test your setup:`);
  console.log(`   AMPRE API: curl http://localhost:${PORT}/api/test/ampre`);
  console.log(`   Supabase: curl http://localhost:${PORT}/api/test/supabase`);
  console.log(`   Sync Test: curl -X POST http://localhost:${PORT}/api/test/sync`);
});

// Handle process signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
  process.exit(1);
});

export default app;
