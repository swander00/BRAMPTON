import logger from '../utils/logger.js';

class AmpreApiService {
  constructor() {
    this.baseUrl = process.env.AMPRE_BASE_URL || 'https://query.ampre.ca';
    this.idxToken = process.env.IDX_TOKEN;
    this.vowToken = process.env.VOW_TOKEN;
    
    // Fallback to old ACCESS_TOKEN for backward compatibility
    const fallbackToken = process.env.ACCESS_TOKEN;
    
    if (!this.idxToken && !this.vowToken && !fallbackToken) {
      logger.error('IDX_TOKEN, VOW_TOKEN, or ACCESS_TOKEN environment variable is required');
      throw new Error('At least one access token (IDX_TOKEN, VOW_TOKEN, or ACCESS_TOKEN) is required');
    }

    // Default to IDX token or fallback
    this.defaultToken = this.idxToken || fallbackToken;

    this.endpoints = {
      idxProperties: process.env.IDX_PROPERTIES_URL,
      vowProperties: process.env.VOW_PROPERTIES_URL,
      propertyRooms: process.env.PROPERTY_ROOMS_URL,
      openHouse: process.env.OPEN_HOUSE_URL,
      media: process.env.MEDIA_URL
    };

    // Enhanced retry and rate limiting configuration
    this.retryConfig = {
      maxRetries: 5,
      baseDelay: 1000, // 1 second
      maxDelay: 30000, // 30 seconds
      backoffMultiplier: 2
    };

    // Rate limiting configuration
    this.rateLimitConfig = {
      requestsPerMinute: 30, // Conservative rate limit
      requestsPerHour: 1000
    };

    // Track request timing for rate limiting
    this.requestTimestamps = [];

    logger.info('AMPRE API Service initialized', { 
      baseUrl: this.baseUrl,
      hasIdxToken: !!this.idxToken,
      hasVowToken: !!this.vowToken,
      endpoints: Object.keys(this.endpoints).filter(key => this.endpoints[key]),
      retryConfig: this.retryConfig,
      rateLimitConfig: this.rateLimitConfig
    });
  }

  /**
   * Get headers for API requests with appropriate token
   * @param {string} feedType - 'idx', 'vow', or 'default'
   * @returns {Object} Headers object
   */
  getHeaders(feedType = 'idx') {
    let token;
    
    switch (feedType.toLowerCase()) {
      case 'idx':
        token = this.idxToken || this.defaultToken;
        break;
      case 'vow':
        token = this.vowToken || this.defaultToken;
        break;
      case 'default':
        token = this.defaultToken;
        break;
      default:
        token = this.idxToken || this.defaultToken;
    }

    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Brampton-RealEstate-Sync/1.0',
      'Accept': 'application/json'
    };
  }

  /**
   * Rate limiting check and enforcement
   * @returns {Promise<void>} Resolves when it's safe to make a request
   */
  async enforceRateLimit() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneHourAgo = now - 3600000;

    // Clean up old timestamps
    this.requestTimestamps = this.requestTimestamps.filter(timestamp => timestamp > oneHourAgo);

    // Check minute limit
    const requestsInLastMinute = this.requestTimestamps.filter(timestamp => timestamp > oneMinuteAgo).length;
    if (requestsInLastMinute >= this.rateLimitConfig.requestsPerMinute) {
      const waitTime = 60000 - (now - this.requestTimestamps[this.requestTimestamps.length - this.rateLimitConfig.requestsPerMinute]);
      logger.info(`Rate limit reached, waiting ${Math.ceil(waitTime / 1000)} seconds`);
      await this.sleep(waitTime);
    }

    // Check hour limit
    const requestsInLastHour = this.requestTimestamps.length;
    if (requestsInLastHour >= this.rateLimitConfig.requestsPerHour) {
      const oldestRequest = Math.min(...this.requestTimestamps);
      const waitTime = 3600000 - (now - oldestRequest);
      logger.info(`Hourly rate limit reached, waiting ${Math.ceil(waitTime / 1000)} seconds`);
      await this.sleep(waitTime);
    }

    // Record this request
    this.requestTimestamps.push(now);
  }

  /**
   * Sleep utility function
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Execute a request with retry logic and rate limiting
   * @param {string} url - Request URL
   * @param {Object} options - Fetch options
   * @param {string} operation - Operation description for logging
   * @returns {Promise<Response>} Fetch response
   */
  async executeWithRetry(url, options, operation = 'API request') {
    await this.enforceRateLimit();

    let lastError;
    for (let attempt = 1; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        logger.debug(`${operation} - Attempt ${attempt}/${this.retryConfig.maxRetries}`, { url });
        
        const response = await fetch(url, options);
        
        if (response.ok) {
          if (attempt > 1) {
            logger.info(`${operation} succeeded on attempt ${attempt}`);
          }
          return response;
        }

        // Check for Cloudflare blocking or rate limiting
        if (response.status === 429 || response.status === 403) {
          const errorText = await response.text().catch(() => 'Unknown error');
          
          if (errorText.includes('Cloudflare') || errorText.includes('blocked')) {
            logger.warn(`${operation} - Cloudflare blocking detected (attempt ${attempt})`);
            lastError = new Error(`Cloudflare blocking: ${response.status} ${response.statusText}`);
          } else {
            logger.warn(`${operation} - Rate limited (attempt ${attempt})`);
            lastError = new Error(`Rate limited: ${response.status} ${response.statusText}`);
          }
        } else {
          logger.warn(`${operation} - HTTP ${response.status} (attempt ${attempt})`);
          lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

      } catch (error) {
        logger.warn(`${operation} - Network error (attempt ${attempt})`, { error: error.message });
        lastError = error;
      }

      // Calculate delay for next attempt
      if (attempt < this.retryConfig.maxRetries) {
        const delay = Math.min(
          this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1),
          this.retryConfig.maxDelay
        );
        
        logger.info(`${operation} - Waiting ${delay}ms before retry`);
        await this.sleep(delay);
      }
    }

    logger.error(`${operation} failed after ${this.retryConfig.maxRetries} attempts`);
    throw lastError;
  }

  /**
   * Get count of records matching filter criteria
   * @param {string} endpoint - API endpoint (Property, Media, etc.)
   * @param {string} filter - OData filter string
   * @param {string} feedType - 'idx', 'vow', or 'default'
   * @returns {Promise<number>} Count of matching records
   */
  async getCount(endpoint, filter = '', feedType = 'default') {
    try {
      // Security: PropertyRooms should always use IDX feed type
      if (endpoint === 'PropertyRooms' && feedType !== 'idx') {
        logger.warn(`PropertyRooms count forced to use IDX feed type (was: ${feedType})`);
        feedType = 'idx';
      }

      // Manually construct URL to avoid URLSearchParams encoding issues
      let urlString = `${this.baseUrl}/odata/${endpoint}?$top=0&$count=true`;
      
      if (filter) {
        // Encode spaces as %20 (not +) for OData compatibility
        const encodedFilter = filter.replace(/ /g, '%20');
        urlString += `&$filter=${encodedFilter}`;
      }
      
      logger.debug('Fetching count', { url: urlString, feedType });
      
      const headers = this.getHeaders(feedType);
      const response = await this.executeWithRetry(urlString, { headers }, `Get count for ${endpoint}`);
      
      if (!response.ok) {
        let errorBody = '';
        try {
          errorBody = await response.text();
        } catch (e) {
          errorBody = response.statusText;
        }
        throw new Error(`HTTP ${response.status}: ${errorBody}`);
      }
      
      const data = await response.json();
      const count = data['@odata.count'] || 0;
      
      logger.info(`Count fetched for ${endpoint}`, { count, filter, feedType });
      return count;
      
    } catch (error) {
      logger.error('Error fetching count', { 
        endpoint, 
        filter, 
        feedType,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Fetch a batch of records
   * @param {string} endpoint - API endpoint (Property, Media, etc.)
   * @param {Object} options - Query options
   * @param {string} options.filter - OData filter string
   * @param {string} options.orderBy - OData orderby string
   * @param {number} options.top - Number of records to fetch
   * @param {number} options.skip - Number of records to skip
   * @param {string} options.select - OData select string
   * @param {string} options.feedType - 'idx', 'vow', or 'default'
   * @returns {Promise<Array>} Array of records
   */
  async fetchBatch(endpoint, options = {}) {
    const {
      filter = '',
      orderBy = '',
      top = 1000,
      skip = 0,
      select = '',
      feedType = 'idx'
    } = options;

    // Security: PropertyRooms should always use IDX feed type
    if (endpoint === 'PropertyRooms' && feedType !== 'idx') {
      logger.warn(`PropertyRooms endpoint forced to use IDX feed type (was: ${feedType})`);
      feedType = 'idx';
    }
    
    try {
      // Manually construct URL to avoid URLSearchParams encoding issues
      let urlString = `${this.baseUrl}/odata/${endpoint}?$top=${top}`;
      
      if (skip > 0) {
        urlString += `&$skip=${skip}`;
      }
      
      if (filter) {
        // Encode spaces as %20 (not +) for OData compatibility
        const encodedFilter = filter.replace(/ /g, '%20');
        urlString += `&$filter=${encodedFilter}`;
      }
      
      if (orderBy) {
        // Encode spaces as %20 for orderBy as well
        const encodedOrderBy = orderBy.replace(/ /g, '%20');
        urlString += `&$orderby=${encodedOrderBy}`;
      }
      
      if (select) {
        urlString += `&$select=${select}`;
      }
      
      logger.debug('Fetching batch', { 
        endpoint, 
        url: urlString,
        options,
        feedType
      });
      
      const headers = this.getHeaders(feedType);
      const response = await this.executeWithRetry(urlString, { headers }, `Fetch batch for ${endpoint}`);
      
      if (!response.ok) {
        let errorBody = '';
        try {
          errorBody = await response.text();
        } catch (e) {
          errorBody = response.statusText;
        }
        throw new Error(`HTTP ${response.status}: ${errorBody}`);
      }
      
      const data = await response.json();
      const records = data.value || [];
      
      logger.info(`Batch fetched for ${endpoint}`, { 
        recordCount: records.length,
        top,
        skip,
        feedType
      });
      
      return records;
      
    } catch (error) {
      logger.error('Error fetching batch', { 
        endpoint, 
        options, 
        feedType,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Fetch records using complete pre-built URLs
   * @param {string} urlType - Type of URL ('idxProperties', 'vowProperties', 'media', etc.)
   * @param {Object} options - Additional query options
   * @returns {Promise<Array>} Array of records
   */
  async fetchFromCompleteUrl(urlType, options = {}) {
    const {
      top = 1000,
      skip = 0,
      feedType = 'idx'
    } = options;

    try {
      let baseUrl = this.endpoints[urlType];
      if (!baseUrl) {
        throw new Error(`Unknown URL type: ${urlType}`);
      }

      // Append pagination parameters to the existing URL
      let fetchUrl = baseUrl;
      
      if (top) {
        fetchUrl += `&$top=${top}`;
      }
      
      if (skip > 0) {
        fetchUrl += `&$skip=${skip}`;
      }

      logger.debug('Fetching from complete URL', { 
        urlType,
        url: fetchUrl,
        feedType
      });
      
      const headers = this.getHeaders(feedType);
      const response = await fetch(fetchUrl, { headers });
      
      if (!response.ok) {
        let errorBody = '';
        try {
          errorBody = await response.text();
        } catch (e) {
          errorBody = response.statusText;
        }
        throw new Error(`HTTP ${response.status}: ${errorBody}`);
      }
      
      const data = await response.json();
      const records = data.value || [];
      
      logger.info(`Records fetched from ${urlType}`, { 
        recordCount: records.length,
        top,
        skip,
        feedType
      });
      
      return records;
      
    } catch (error) {
      logger.error('Error fetching from complete URL', { 
        urlType, 
        options, 
        feedType,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get count from complete URL
   * @param {string} urlType - Type of URL ('idxProperties', 'vowProperties', 'media', etc.)
   * @param {string} feedType - 'idx', 'vow', or 'default'
   * @returns {Promise<number>} Count of matching records
   */
  async getCountFromCompleteUrl(urlType, feedType = 'idx') {
    try {
      let baseUrl = this.endpoints[urlType];
      if (!baseUrl) {
        throw new Error(`Unknown URL type: ${urlType}`);
      }

      // Append count parameters to the existing URL
      const countUrl = baseUrl + '&$top=0&$count=true';
      
      logger.debug('Fetching count from complete URL', { urlType, url: countUrl, feedType });
      
      const headers = this.getHeaders(feedType);
      const response = await fetch(countUrl, { headers });
      
      if (!response.ok) {
        let errorBody = '';
        try {
          errorBody = await response.text();
        } catch (e) {
          errorBody = response.statusText;
        }
        throw new Error(`HTTP ${response.status}: ${errorBody}`);
      }
      
      const data = await response.json();
      const count = data['@odata.count'] || 0;
      
      logger.info(`Count fetched from ${urlType}`, { count, feedType });
      return count;
      
    } catch (error) {
      logger.error('Error fetching count from complete URL', { 
        urlType, 
        feedType,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Fetch IDX properties (available properties)
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of IDX property records
   */
  async fetchIdxProperties(options = {}) {
    try {
      logger.info('Fetching IDX properties (available listings)');
      
      return await this.fetchBatch('Property', {
        filter: "ContractStatus eq 'Available'",
        feedType: 'idx',
        ...options
      });
      
    } catch (error) {
      logger.error('Error fetching IDX properties', { error: error.message });
      throw error;
    }
  }

  /**
   * Fetch VOW properties (sold/off-market properties)
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of VOW property records
   */
  async fetchVowProperties(options = {}) {
    try {
      logger.info('Fetching VOW properties (sold/off-market listings)');
      
      const defaultFilter = "ContractStatus ne 'Available' and PropertyType ne 'Commercial'";
      
      return await this.fetchBatch('Property', {
        ...options,
        filter: options.filter || defaultFilter,
        feedType: 'vow'
      });
      
    } catch (error) {
      logger.error('Error fetching VOW properties', { error: error.message });
      throw error;
    }
  }

  /**
   * Fetch property rooms data (IDX ONLY - Available Properties)
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of property room records for IDX properties only
   */
  async fetchPropertyRooms(options = {}) {
    try {
      logger.info('Fetching property rooms data (IDX properties only)');
      
      // Force IDX feed type for rooms - rooms should only be fetched for available properties
      const roomOptions = {
        ...options,
        orderBy: options.orderBy || 'ModificationTimestamp desc',
        feedType: 'idx' // Always use IDX token for property rooms
      };
      
      // Override any feedType that might have been passed in options
      if (options.feedType && options.feedType !== 'idx') {
        logger.warn(`Property rooms fetch forced to IDX feed type (was: ${options.feedType})`);
        roomOptions.feedType = 'idx';
      }
      
      return await this.fetchBatch('PropertyRooms', roomOptions);
      
    } catch (error) {
      logger.error('Error fetching property rooms', { error: error.message });
      throw error;
    }
  }

  /**
   * Fetch open house data
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of open house records
   */
  async fetchOpenHouses(options = {}) {
    try {
      logger.info('Fetching open house data');
      
      return await this.fetchBatch('OpenHouse', {
        ...options,
        orderBy: options.orderBy || 'OpenHouseDate desc',
        feedType: 'idx' // Use IDX token for open houses
      });
      
    } catch (error) {
      logger.error('Error fetching open houses', { error: error.message });
      throw error;
    }
  }

  /**
   * Fetch all records with incremental sync support
   * @param {string} endpoint - API endpoint (Property, Media, etc.)
   * @param {Object} syncOptions - Sync configuration
   * @param {string} syncOptions.timestampField - Field name for timestamp comparison
   * @param {string} syncOptions.keyField - Primary key field name
   * @param {string} syncOptions.lastTimestamp - Last sync timestamp
   * @param {string} syncOptions.lastKey - Last sync key value
   * @param {number} syncOptions.batchSize - Batch size for requests
   * @param {string} syncOptions.additionalFilter - Additional filter conditions
   * @param {string} syncOptions.feedType - 'idx', 'vow', or 'default'
   * @returns {Promise<Array>} Array of all fetched records
   */
  async fetchIncremental(endpoint, syncOptions = {}) {
    try {
      const {
        timestampField = 'ModificationTimestamp',
        keyField,
        lastTimestamp = '1970-01-01T00:00:00Z',
        lastKey = '0',
        batchSize = 1000,
        additionalFilter = '',
        feedType = 'default'
      } = syncOptions;

      logger.info(`Starting incremental sync for ${endpoint}`, {
        timestampField,
        keyField,
        lastTimestamp,
        lastKey,
        batchSize,
        feedType
      });

      // Build incremental filter
      let filter = `${timestampField} gt ${lastTimestamp} or (${timestampField} eq ${lastTimestamp} and ${keyField} gt '${lastKey}')`;
      
      if (additionalFilter) {
        filter = `(${filter}) and (${additionalFilter})`;
      }

      const orderBy = `${timestampField},${keyField}`;
      
      // Get total count
      const totalCount = await this.getCount(endpoint, filter, feedType);
      
      if (totalCount === 0) {
        logger.info(`No new records found for ${endpoint}`);
        return [];
      }

      // Fetch all records in batches
      const allRecords = [];
      let skip = 0;
      let hasMore = true;

      while (hasMore) {
        const batch = await this.fetchBatch(endpoint, {
          filter,
          orderBy,
          top: batchSize,
          skip,
          feedType
        });

        allRecords.push(...batch);
        skip += batchSize;
        hasMore = batch.length === batchSize;

        logger.info(`Progress: ${allRecords.length}/${totalCount} records fetched for ${endpoint}`);
      }

      logger.info(`Incremental sync completed for ${endpoint}`, {
        totalFetched: allRecords.length,
        expectedCount: totalCount,
        feedType
      });

      return allRecords;

    } catch (error) {
      logger.error('Error in incremental fetch', { 
        endpoint, 
        syncOptions, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Fetch a single record by key
   * @param {string} endpoint - API endpoint (Property, Media, etc.)
   * @param {string} key - Record key
   * @param {string} feedType - 'idx', 'vow', or 'default'
   * @returns {Promise<Object|null>} Single record or null if not found
   */
  async fetchSingle(endpoint, key, feedType = 'idx') {
    try {
      const url = new URL(`/odata/${endpoint}('${key}')`, this.baseUrl);
      
      logger.debug('Fetching single record', { endpoint, key, url: url.toString(), feedType });
      
      const headers = this.getHeaders(feedType);
      const response = await fetch(url.toString(), { headers });
      
      if (response.status === 404) {
        return null;
      }
      
      if (!response.ok) {
        let errorBody = '';
        try {
          errorBody = await response.text();
        } catch (e) {
          errorBody = response.statusText;
        }
        throw new Error(`HTTP ${response.status}: ${errorBody}`);
      }
      
      const record = await response.json();
      
      logger.debug(`Single record fetched for ${endpoint}`, { key, feedType });
      return record;
      
    } catch (error) {
      logger.error('Error fetching single record', { 
        endpoint, 
        key, 
        feedType,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get metadata for an endpoint
   * @param {string} feedType - 'idx', 'vow', or 'default'
   * @returns {Promise<Object>} Metadata object
   */
  async getMetadata(feedType = 'idx') {
    try {
      const url = new URL('/odata/$metadata', this.baseUrl);
      url.searchParams.append('$format', 'json');
      
      const headers = this.getHeaders(feedType);
      const response = await fetch(url.toString(), { headers });
      
      if (!response.ok) {
        let errorBody = '';
        try {
          errorBody = await response.text();
        } catch (e) {
          errorBody = response.statusText;
        }
        throw new Error(`HTTP ${response.status}: ${errorBody}`);
      }
      
      const metadata = await response.json();
      logger.info('Metadata fetched successfully', { feedType });
      
      return metadata;
      
    } catch (error) {
      logger.error('Error fetching metadata', { error: error.message, feedType });
      throw error;
    }
  }
}

export default AmpreApiService;
