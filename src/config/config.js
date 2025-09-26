import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables from environment.env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../../environment.env');

dotenvConfig({ path: envPath });

/**
 * Centralized Configuration Module
 * 
 * This module loads all environment variables from environment.env and provides
 * clean, validated exports for use throughout the application.
 * 
 * Usage Examples:
 * ```javascript
 * import { IDX_URL, IDX_TOKEN, SUPABASE_URL } from './config.js';
 * import { server, supabase, tokens, apiUrls, syncSettings } from './config.js';
 * ```
 */

// ===========================================
// VALIDATION FUNCTIONS
// ===========================================

/**
 * Validates that a required environment variable exists
 * @param {string} value - The environment variable value
 * @param {string} name - The name of the environment variable
 * @throws {Error} If the variable is missing or empty
 */
const validateRequired = (value, name) => {
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

/**
 * Validates that a URL is properly formatted
 * @param {string} url - The URL to validate
 * @param {string} name - The name of the environment variable
 * @throws {Error} If the URL is invalid
 */
const validateUrl = (url, name) => {
  try {
    new URL(url);
    return url;
  } catch (error) {
    throw new Error(`Invalid URL for ${name}: ${url}`);
  }
};

/**
 * Validates and parses an integer from environment variable
 * @param {string} value - The environment variable value
 * @param {string} name - The name of the environment variable
 * @param {number} defaultValue - Default value if not provided
 * @returns {number} Parsed integer value
 */
const validateInt = (value, name, defaultValue = null) => {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid integer for ${name}: ${value}`);
  }
  return parsed;
};

/**
 * Validates and parses a boolean from environment variable
 * @param {string} value - The environment variable value
 * @param {string} name - The name of the environment variable
 * @param {boolean} defaultValue - Default value if not provided
 * @returns {boolean} Parsed boolean value
 */
const validateBoolean = (value, name, defaultValue = false) => {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
};

// ===========================================
// ENVIRONMENT VARIABLE VALIDATION
// ===========================================

// Validate critical variables that must be present
const SUPABASE_URL = validateUrl(validateRequired(process.env.SUPABASE_URL, 'SUPABASE_URL'), 'SUPABASE_URL');
const SUPABASE_ANON_KEY = validateRequired(process.env.SUPABASE_ANON_KEY, 'SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = validateRequired(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY');

const IDX_TOKEN = validateRequired(process.env.IDX_TOKEN, 'IDX_TOKEN');
const VOW_TOKEN = validateRequired(process.env.VOW_TOKEN, 'VOW_TOKEN');
const ACCESS_TOKEN = validateRequired(process.env.ACCESS_TOKEN, 'ACCESS_TOKEN');

const IDX_URL = validateUrl(validateRequired(process.env.IDX_URL, 'IDX_URL'), 'IDX_URL');
const VOW_URL = validateUrl(validateRequired(process.env.VOW_URL, 'VOW_URL'), 'VOW_URL');
const ROOMS_URL = validateUrl(validateRequired(process.env.ROOMS_URL, 'ROOMS_URL'), 'ROOMS_URL');
const OPEN_URL = validateUrl(validateRequired(process.env.OPEN_URL, 'OPEN_URL'), 'OPEN_URL');
const MEDIA_URL = validateUrl(validateRequired(process.env.MEDIA_URL, 'MEDIA_URL'), 'MEDIA_URL');

// ===========================================
// CONFIGURATION OBJECTS
// ===========================================

/**
 * Server Configuration
 */
export const server = {
  port: validateInt(process.env.PORT, 'PORT', 3001),
  nodeEnv: process.env.NODE_ENV || 'development',
  timezone: process.env.TZ || 'America/Toronto',
  debug: validateBoolean(process.env.DEBUG, 'DEBUG', false),
  verboseLogging: validateBoolean(process.env.VERBOSE_LOGGING, 'VERBOSE_LOGGING', false)
};

/**
 * Supabase Configuration
 */
export const supabase = {
  url: SUPABASE_URL,
  anonKey: SUPABASE_ANON_KEY,
  serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY
};

/**
 * API Tokens
 */
export const tokens = {
  idx: IDX_TOKEN,
  vow: VOW_TOKEN,
  access: ACCESS_TOKEN
};

/**
 * API Endpoint URLs
 * Note: These are complete URLs, not base URLs to be concatenated
 */
export const apiUrls = {
  idx: IDX_URL,
  vow: VOW_URL,
  rooms: ROOMS_URL,
  openHouse: OPEN_URL,
  media: MEDIA_URL
};

/**
 * Sync Configuration
 */
export const syncSettings = {
  intervalMinutes: validateInt(process.env.SYNC_INTERVAL_MINUTES, 'SYNC_INTERVAL_MINUTES', 30),
  batchSizeProperty: validateInt(process.env.BATCH_SIZE_PROPERTY, 'BATCH_SIZE_PROPERTY', 1000),
  batchSizeMedia: validateInt(process.env.BATCH_SIZE_MEDIA, 'BATCH_SIZE_MEDIA', 500),
  startDate: process.env.SYNC_START_DATE || '2024-01-01T00:00:00Z'
};

/**
 * Enhanced Media Sync Configuration
 */
export const mediaSyncSettings = {
  batchSize: validateInt(process.env.MEDIA_BATCH_SIZE, 'MEDIA_BATCH_SIZE', 5000),
  dbBatchSize: validateInt(process.env.MEDIA_DB_BATCH_SIZE, 'MEDIA_DB_BATCH_SIZE', 100),
  throttleDelay: validateInt(process.env.MEDIA_THROTTLE_DELAY, 'MEDIA_THROTTLE_DELAY', 750),
  propertyBatchSize: validateInt(process.env.MEDIA_PROPERTY_BATCH_SIZE, 'MEDIA_PROPERTY_BATCH_SIZE', 500),
  filter: process.env.MEDIA_FILTER || "ClassName ne 'Commercial'",
  enforceMatchingOnly: validateBoolean(process.env.MEDIA_ENFORCE_MATCHING_ONLY, 'MEDIA_ENFORCE_MATCHING_ONLY', true)
};

/**
 * Rate Limiting Configuration
 */
export const rateLimiting = {
  windowMs: validateInt(process.env.RATE_LIMIT_WINDOW_MS, 'RATE_LIMIT_WINDOW_MS', 900000),
  maxRequests: validateInt(process.env.RATE_LIMIT_MAX_REQUESTS, 'RATE_LIMIT_MAX_REQUESTS', 100),
  amprePerMinute: validateInt(process.env.AMPRE_RATE_LIMIT_PER_MINUTE, 'AMPRE_RATE_LIMIT_PER_MINUTE', 120),
  amprePerHour: validateInt(process.env.AMPRE_RATE_LIMIT_PER_HOUR, 'AMPRE_RATE_LIMIT_PER_HOUR', 5000)
};

/**
 * Logging Configuration
 */
export const logging = {
  level: process.env.LOG_LEVEL || 'info',
  file: process.env.LOG_FILE || 'logs/app.log'
};

/**
 * Frontend Configuration
 */
export const frontend = {
  backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'
};

/**
 * Security Configuration
 */
export const security = {
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:3001'
};

// ===========================================
// INDIVIDUAL EXPORTS (for direct import)
// ===========================================

// Server & App Settings
export const PORT = server.port;
export const NODE_ENV = server.nodeEnv;
export const TZ = server.timezone;
export const DEBUG = server.debug;
export const VERBOSE_LOGGING = server.verboseLogging;

// Supabase
export { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY };

// Tokens
export { IDX_TOKEN, VOW_TOKEN, ACCESS_TOKEN };

// API URLs
export { IDX_URL, VOW_URL, ROOMS_URL, OPEN_URL, MEDIA_URL };

// Sync Configuration
export const SYNC_INTERVAL_MINUTES = syncSettings.intervalMinutes;
export const BATCH_SIZE_PROPERTY = syncSettings.batchSizeProperty;
export const BATCH_SIZE_MEDIA = syncSettings.batchSizeMedia;
export const SYNC_START_DATE = syncSettings.startDate;

// Enhanced Media Sync
export const MEDIA_BATCH_SIZE = mediaSyncSettings.batchSize;
export const MEDIA_DB_BATCH_SIZE = mediaSyncSettings.dbBatchSize;
export const MEDIA_THROTTLE_DELAY = mediaSyncSettings.throttleDelay;
export const MEDIA_PROPERTY_BATCH_SIZE = mediaSyncSettings.propertyBatchSize;
export const MEDIA_FILTER = mediaSyncSettings.filter;
export const MEDIA_ENFORCE_MATCHING_ONLY = mediaSyncSettings.enforceMatchingOnly;

// Rate Limiting
export const RATE_LIMIT_WINDOW_MS = rateLimiting.windowMs;
export const RATE_LIMIT_MAX_REQUESTS = rateLimiting.maxRequests;
export const AMPRE_RATE_LIMIT_PER_MINUTE = rateLimiting.amprePerMinute;
export const AMPRE_RATE_LIMIT_PER_HOUR = rateLimiting.amprePerHour;

// Logging
export const LOG_LEVEL = logging.level;
export const LOG_FILE = logging.file;

// Frontend
export const NEXT_PUBLIC_BACKEND_URL = frontend.backendUrl;

// Security
export const CORS_ORIGIN = security.corsOrigin;

// ===========================================
// DEFAULT EXPORT (Complete Configuration)
// ===========================================

/**
 * Complete configuration object with all settings grouped logically
 */
export default {
  server,
  supabase,
  tokens,
  apiUrls,
  syncSettings,
  mediaSyncSettings,
  rateLimiting,
  logging,
  frontend,
  security
};

// ===========================================
// CONFIGURATION VALIDATION ON LOAD
// ===========================================

// Validate configuration on module load
console.log('✅ Configuration loaded successfully');
console.log(`📡 Server: ${server.nodeEnv} mode on port ${server.port}`);
console.log(`🔗 Supabase: ${supabase.url}`);
console.log(`🔄 Sync interval: ${syncSettings.intervalMinutes} minutes`);
console.log(`📊 Property batch size: ${syncSettings.batchSizeProperty}`);
console.log(`🎬 Media batch size: ${mediaSyncSettings.batchSize}`);
console.log(`⚡ Rate limit: ${rateLimiting.amprePerMinute} requests/minute`);

// ===========================================
// USAGE EXAMPLES
// ===========================================

/*
// Example 1: Import individual variables
import { IDX_URL, IDX_TOKEN, SUPABASE_URL } from './config.js';

// Example 2: Import grouped configurations
import { server, supabase, tokens, apiUrls } from './config.js';

// Example 3: Import complete configuration
import config from './config.js';
const { server, supabase, tokens } = config;

// Example 4: Use in API service
import { IDX_URL, IDX_TOKEN } from './config.js';
const response = await fetch(IDX_URL, {
  headers: { 'Authorization': `Bearer ${IDX_TOKEN}` }
});

// Example 5: Use in sync service
import { syncSettings, mediaSyncSettings } from './config.js';
const batchSize = syncSettings.batchSizeProperty;
const mediaBatchSize = mediaSyncSettings.batchSize;
*/
