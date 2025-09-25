// Load hardcoded configuration FIRST before any other imports
import { setProcessEnv } from './config/credentials.js';
setProcessEnv();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';

// Import utilities first (logger doesn't depend on other services)
import logger from './utils/logger.js';

// Import middleware
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimiter.js';

// Validate required environment variables
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const optionalTokens = ['IDX_TOKEN', 'VOW_TOKEN', 'ACCESS_TOKEN'];

// Check if at least one token is provided
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

// Import routes after environment validation
const { default: propertyRoutes } = await import('./routes/propertyRoutes.js');
const { default: syncRoutes } = await import('./routes/syncRoutes.js');

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

// Rate limiting
app.use('/api', apiLimiter);

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

// Health check endpoint (before rate limiting)
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// API routes
app.use('/api/properties', propertyRoutes);
app.use('/api/sync', syncRoutes);

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'Real Estate IDX/VOW Backend API',
    version: '1.0.0',
    endpoints: {
      properties: {
        'GET /api/properties': 'Get properties with pagination and filtering',
        'GET /api/properties/search': 'Advanced property search',
        'GET /api/properties/stats': 'Get property statistics',
        'GET /api/properties/:listingKey': 'Get a single property',
        'GET /api/properties/:listingKey/media': 'Get media for a property',
        'POST /api/properties/:listingKey/sync': 'Sync a specific property'
      },
      sync: {
        'GET /api/sync/status': 'Get sync status and health',
        'GET /api/sync/config': 'Get sync configuration',
        'GET /api/sync/health': 'Health check with detailed info',
        'POST /api/sync/full': 'Trigger full sync',
        'POST /api/sync/incremental': 'Trigger incremental sync',
        'POST /api/sync/properties': 'Sync properties only',
        'POST /api/sync/media': 'Sync media only'
      }
    },
    documentation: {
      properties: 'Properties are automatically synced from AMPRE RESO Web API',
      media: 'Media records are linked to properties via ResourceRecordKey',
      sync: 'Sync operations run in background and are rate limited',
      filtering: 'Properties can be filtered by price, location, type, bedrooms, bathrooms',
      pagination: 'All list endpoints support page and limit parameters'
    }
  });
});

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Graceful shutdown
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 10000);
};

// Start server
const server = app.listen(PORT, () => {
  logger.info(`Server started successfully`, {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version
  });
});

// Handle process signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
  process.exit(1);
});

export default app;
