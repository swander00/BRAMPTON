/**
 * Hardcoded credentials configuration
 * Contains all API keys, tokens, and service URLs
 */

export const config = {
  // AMPRE API Configuration
  ampre: {
    baseUrl: 'https://query.ampre.ca',
    tokens: {
      idx: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ2ZW5kb3IvdHJyZWIvNjI4OSIsImF1ZCI6IkFtcFVzZXJzUHJkIiwicm9sZXMiOlsiQW1wVmVuZG9yIl0sImlzcyI6InByb2QuYW1wcmUuY2EiLCJleHAiOjI1MzQwMjMwMDc5OSwiaWF0IjoxNzU4NzMzOTQ2LCJzdWJqZWN0VHlwZSI6InZlbmRvciIsInN1YmplY3RLZXkiOiI2Mjg5IiwianRpIjoiNGM0NmIyOTgxNjhhODQ5YiIsImN1c3RvbWVyTmFtZSI6InRycmViIn0.AXTWrd_GMd19uiisBbW8IoFxqKzcEZrTSErSnT0qzkY',
      vow: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ2ZW5kb3IvdHJyZWIvNjI4OSIsImF1ZCI6IkFtcFVzZXJzUHJkIiwicm9sZXMiOlsiQW1wVmVuZG9yIl0sImlzcyI6InByb2QuYW1wcmUuY2EiLCJleHAiOjI1MzQwMjMwMDc5OSwiaWF0IjoxNzU4NzMzOTE3LCJzdWJqZWN0VHlwZSI6InZlbmRvciIsInN1YmplY3RLZXkiOiI2Mjg5IiwianRpIjoiNzA5NDdjMDlhZmJhM2VjMiIsImN1c3RvbWVyTmFtZSI6InRycmViIn0.xbZpVm251NtG1XyZSCswXGO4eN14oCo71Lg_iAakRsQ',
      // Use IDX token as the primary ACCESS_TOKEN for backwards compatibility
      access: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ2ZW5kb3IvdHJyZWIvNjI4OSIsImF1ZCI6IkFtcFVzZXJzUHJkIiwicm9sZXMiOlsiQW1wVmVuZG9yIl0sImlzcyI6InByb2QuYW1wcmUuY2EiLCJleHAiOjI1MzQwMjMwMDc5OSwiaWF0IjoxNzU4NzMzOTQ2LCJzdWJqZWN0VHlwZSI6InZlbmRvciIsInN1YmplY3RLZXkiOiI2Mjg5IiwianRpIjoiNGM0NmIyOTgxNjhhODQ5YiIsImN1c3RvbWVyTmFtZSI6InRycmViIn0.AXTWrd_GMd19uiisBbW8IoFxqKzcEZrTSErSnT0qzkY'
    },
    endpoints: {
      idxProperties: "https://query.ampre.ca/odata/Property?$filter=ContractStatus%20eq%20'Available'&$orderby=ModificationTimestamp%20desc",
      vowProperties: "https://query.ampre.ca/odata/Property?$filter=ContractStatus%20ne%20'Available'%20and%20ModificationTimestamp%20ge%202025-01-01T00:00:00Z&$orderby=ModificationTimestamp%20desc",
      propertyRooms: 'https://query.ampre.ca/odata/PropertyRooms?$orderby=ModificationTimestamp desc',
      openHouse: 'https://query.ampre.ca/odata/OpenHouse?$orderby=OpenHouseDate desc',
      media: 'https://query.ampre.ca/odata/Media?$filter=MediaModificationTimestamp%20ge%202025-01-01T00:00:00Z&$orderby=MediaModificationTimestamp%20desc'
    }
  },

  // Supabase Configuration
  supabase: {
    url: 'https://gyeviskmqtkskcoyyprp.supabase.co',
    serviceRoleKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5ZXZpc2ttcXRrc2tjb3l5cHJwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODMyMzkzOCwiZXhwIjoyMDczODk5OTM4fQ.KryixRJ8n-wy1n_WySex5qkHVST_awSudkM53SaSDj0',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5ZXZpc2ttcXRrc2tjb3l5cHJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgzMjM5MzgsImV4cCI6MjA3Mzg5OTkzOH0.qDOpA1nSwWdnQhIJQiQx-rjgl800EjTU3M90iKQQDiI'
  },

  // Application Configuration
  app: {
    port: 3000,
    nodeEnv: 'development',
    syncIntervalMinutes: 30,
    batchSizeProperty: 1000,
    batchSizeMedia: 500,
    logLevel: 'info',
    logFile: 'logs/app.log',
    rateLimitWindowMs: 900000,
    rateLimitMaxRequests: 100
  }
};

// Legacy environment variable compatibility
// This allows existing code to use process.env.VARIABLE_NAME syntax
export const setProcessEnv = () => {
  process.env.SUPABASE_URL = config.supabase.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = config.supabase.serviceRoleKey;
  process.env.SUPABASE_ANON_KEY = config.supabase.anonKey;
  
  process.env.AMPRE_BASE_URL = config.ampre.baseUrl;
  process.env.IDX_TOKEN = config.ampre.tokens.idx;
  process.env.VOW_TOKEN = config.ampre.tokens.vow;
  process.env.ACCESS_TOKEN = config.ampre.tokens.access;
  
  process.env.IDX_PROPERTIES_URL = config.ampre.endpoints.idxProperties;
  process.env.VOW_PROPERTIES_URL = config.ampre.endpoints.vowProperties;
  process.env.PROPERTY_ROOMS_URL = config.ampre.endpoints.propertyRooms;
  process.env.OPEN_HOUSE_URL = config.ampre.endpoints.openHouse;
  process.env.MEDIA_URL = config.ampre.endpoints.media;
  
  process.env.PORT = config.app.port.toString();
  process.env.NODE_ENV = config.app.nodeEnv;
  process.env.SYNC_INTERVAL_MINUTES = config.app.syncIntervalMinutes.toString();
  process.env.BATCH_SIZE_PROPERTY = config.app.batchSizeProperty.toString();
  process.env.BATCH_SIZE_MEDIA = config.app.batchSizeMedia.toString();
  process.env.LOG_LEVEL = config.app.logLevel;
  process.env.LOG_FILE = config.app.logFile;
  process.env.RATE_LIMIT_WINDOW_MS = config.app.rateLimitWindowMs.toString();
  process.env.RATE_LIMIT_MAX_REQUESTS = config.app.rateLimitMaxRequests.toString();
};

export default config;
