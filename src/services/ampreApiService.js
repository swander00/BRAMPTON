import logger from '../utils/logger.js';
import { 
  apiUrls, 
  tokens 
} from '../config/config.js';

class AmpreApiService {
  constructor() {
    // Load configuration from config.js
    this.baseUrl = 'https://query.ampre.ca';
    this.idxToken = tokens.idx;
    this.vowToken = tokens.vow;
    this.accessToken = tokens.access;
    
    if (!this.idxToken && !this.vowToken && !this.accessToken) {
      logger.error('IDX_TOKEN, VOW_TOKEN, or ACCESS_TOKEN environment variable is required');
      throw new Error('At least one access token (IDX_TOKEN, VOW_TOKEN, or ACCESS_TOKEN) is required');
    }

    // Default to IDX token or fallback
    this.defaultToken = this.idxToken || this.accessToken;

    // Use complete URLs from config.js
    this.endpoints = {
      idxProperties: apiUrls.idx,
      vowProperties: apiUrls.vow,
      propertyRooms: apiUrls.rooms,
      openHouse: apiUrls.openHouse,
      media: apiUrls.media
    };

    // Enhanced retry and rate limiting configuration
    this.retryConfig = {
      maxRetries: 5,
      baseDelay: 1000, // 1 second
      maxDelay: 30000, // 30 seconds
      backoffMultiplier: 2
    };

    // Rate limiting configuration from config.js
    this.rateLimitConfig = {
      requestsPerMinute: 120, // Default rate limit
      requestsPerHour: 5000, // Default hourly rate limit
      // Dynamic rate limiting configuration
      adaptiveThrottling: true,
      baseDelay: 500, // Base delay between requests (ms)
      maxDelay: 5000, // Maximum delay (ms)
      minDelay: 100, // Minimum delay (ms)
      backoffMultiplier: 1.5, // Multiplier for delay increase
      recoveryMultiplier: 0.9 // Multiplier for delay decrease on success
    };

    // Track request timing for rate limiting
    this.requestTimestamps = [];
    
    // Dynamic rate limiting state
    this.dynamicRateLimit = {
      currentDelay: this.rateLimitConfig.baseDelay,
      consecutiveErrors: 0,
      consecutiveSuccesses: 0,
      lastRateLimitHeaders: null,
      detectedLimits: {
        requestsPerMinute: null,
        requestsPerHour: null,
        retryAfter: null
      }
    };

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
   * Rate limiting check and enforcement with dynamic adaptation
   * @returns {Promise<void>} Resolves when it's safe to make a request
   */
  async enforceRateLimit() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneHourAgo = now - 3600000;

    // Clean up old timestamps
    this.requestTimestamps = this.requestTimestamps.filter(timestamp => timestamp > oneHourAgo);

    // Use detected limits if available, otherwise fall back to configured limits
    const effectiveMinuteLimit = this.dynamicRateLimit.detectedLimits.requestsPerMinute || this.rateLimitConfig.requestsPerMinute;
    const effectiveHourLimit = this.dynamicRateLimit.detectedLimits.requestsPerHour || this.rateLimitConfig.requestsPerHour;

    // Check minute limit
    const requestsInLastMinute = this.requestTimestamps.filter(timestamp => timestamp > oneMinuteAgo).length;
    if (requestsInLastMinute >= effectiveMinuteLimit) {
      const waitTime = 60000 - (now - this.requestTimestamps[this.requestTimestamps.length - effectiveMinuteLimit]);
      logger.info(`Rate limit reached (${requestsInLastMinute}/${effectiveMinuteLimit} requests/min), waiting ${Math.ceil(waitTime / 1000)} seconds`);
      await this.sleep(waitTime);
    }

    // Check hour limit
    const requestsInLastHour = this.requestTimestamps.length;
    if (requestsInLastHour >= effectiveHourLimit) {
      const oldestRequest = Math.min(...this.requestTimestamps);
      const waitTime = 3600000 - (now - oldestRequest);
      logger.info(`Hourly rate limit reached (${requestsInLastHour}/${effectiveHourLimit} requests/hour), waiting ${Math.ceil(waitTime / 1000)} seconds`);
      await this.sleep(waitTime);
    }

    // Apply adaptive throttling delay
    if (this.rateLimitConfig.adaptiveThrottling && this.dynamicRateLimit.currentDelay > 0) {
      await this.sleep(this.dynamicRateLimit.currentDelay);
    }

    // Record this request
    this.requestTimestamps.push(now);
  }

  /**
   * Parse rate limit headers from API response
   * @param {Response} response - HTTP response object
   */
  parseRateLimitHeaders(response) {
    const headers = response.headers;
    const rateLimitInfo = {
      limit: headers.get('X-RateLimit-Limit'),
      remaining: headers.get('X-RateLimit-Remaining'),
      reset: headers.get('X-RateLimit-Reset'),
      retryAfter: headers.get('Retry-After'),
      resetTime: headers.get('X-RateLimit-Reset-Time')
    };

    // Update detected limits if available
    if (rateLimitInfo.limit) {
      this.dynamicRateLimit.detectedLimits.requestsPerMinute = parseInt(rateLimitInfo.limit);
    }
    if (rateLimitInfo.retryAfter) {
      this.dynamicRateLimit.detectedLimits.retryAfter = parseInt(rateLimitInfo.retryAfter);
    }

    this.dynamicRateLimit.lastRateLimitHeaders = rateLimitInfo;
    
    logger.debug('Rate limit headers parsed', rateLimitInfo);
    return rateLimitInfo;
  }

  /**
   * Update dynamic rate limiting based on request success/failure
   * @param {boolean} success - Whether the request was successful
   * @param {number} responseTime - Response time in milliseconds
   */
  updateDynamicRateLimit(success, responseTime) {
    if (!this.rateLimitConfig.adaptiveThrottling) return;

    if (success) {
      this.dynamicRateLimit.consecutiveSuccesses++;
      this.dynamicRateLimit.consecutiveErrors = 0;
      
      // Gradually reduce delay on consecutive successes
      if (this.dynamicRateLimit.consecutiveSuccesses >= 3) {
        this.dynamicRateLimit.currentDelay = Math.max(
          this.rateLimitConfig.minDelay,
          this.dynamicRateLimit.currentDelay * this.rateLimitConfig.recoveryMultiplier
        );
        this.dynamicRateLimit.consecutiveSuccesses = 0;
        logger.debug(`Reduced dynamic delay to ${this.dynamicRateLimit.currentDelay}ms due to consecutive successes`);
      }
      
      // Increase delay if response time is high
      if (responseTime > 2000) { // 2 seconds
        this.dynamicRateLimit.currentDelay = Math.min(
          this.rateLimitConfig.maxDelay,
          this.dynamicRateLimit.currentDelay * this.rateLimitConfig.backoffMultiplier
        );
        logger.debug(`Increased dynamic delay to ${this.dynamicRateLimit.currentDelay}ms due to slow response (${responseTime}ms)`);
      }
    } else {
      this.dynamicRateLimit.consecutiveErrors++;
      this.dynamicRateLimit.consecutiveSuccesses = 0;
      
      // Increase delay on consecutive errors
      if (this.dynamicRateLimit.consecutiveErrors >= 2) {
        this.dynamicRateLimit.currentDelay = Math.min(
          this.rateLimitConfig.maxDelay,
          this.dynamicRateLimit.currentDelay * this.rateLimitConfig.backoffMultiplier
        );
        logger.warn(`Increased dynamic delay to ${this.dynamicRateLimit.currentDelay}ms due to consecutive errors (${this.dynamicRateLimit.consecutiveErrors})`);
      }
    }
  }

  /**
   * Get current dynamic rate limiting status
   * @returns {Object} Current rate limiting status
   */
  getDynamicRateLimitStatus() {
    return {
      currentDelay: this.dynamicRateLimit.currentDelay,
      consecutiveErrors: this.dynamicRateLimit.consecutiveErrors,
      consecutiveSuccesses: this.dynamicRateLimit.consecutiveSuccesses,
      detectedLimits: { ...this.dynamicRateLimit.detectedLimits },
      lastHeaders: this.dynamicRateLimit.lastRateLimitHeaders,
      config: {
        adaptiveThrottling: this.rateLimitConfig.adaptiveThrottling,
        baseDelay: this.rateLimitConfig.baseDelay,
        maxDelay: this.rateLimitConfig.maxDelay,
        minDelay: this.rateLimitConfig.minDelay
      }
    };
  }

  /**
   * Reset dynamic rate limiting state
   */
  resetDynamicRateLimit() {
    this.dynamicRateLimit.currentDelay = this.rateLimitConfig.baseDelay;
    this.dynamicRateLimit.consecutiveErrors = 0;
    this.dynamicRateLimit.consecutiveSuccesses = 0;
    this.dynamicRateLimit.detectedLimits = {
      requestsPerMinute: null,
      requestsPerHour: null,
      retryAfter: null
    };
    logger.info('Dynamic rate limiting state reset');
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
   * Execute a request with retry logic and dynamic rate limiting
   * @param {string} url - Request URL
   * @param {Object} options - Fetch options
   * @param {string} operation - Operation description for logging
   * @returns {Promise<Response>} Fetch response
   */
  async executeWithRetry(url, options, operation = 'API request') {
    await this.enforceRateLimit();

    let lastError;
    for (let attempt = 1; attempt <= this.retryConfig.maxRetries; attempt++) {
      const requestStartTime = Date.now();
      
      try {
        logger.debug(`${operation} - Attempt ${attempt}/${this.retryConfig.maxRetries}`, { url });
        
        const response = await fetch(url, options);
        const responseTime = Date.now() - requestStartTime;
        
        // Parse rate limit headers from response
        this.parseRateLimitHeaders(response);
        
        if (response.ok) {
          // Update dynamic rate limiting on success
          this.updateDynamicRateLimit(true, responseTime);
          
          if (attempt > 1) {
            logger.info(`${operation} succeeded on attempt ${attempt} (${responseTime}ms)`);
          }
          return response;
        }

        // Update dynamic rate limiting on failure
        this.updateDynamicRateLimit(false, responseTime);

        // Check for Cloudflare blocking or rate limiting
        if (response.status === 429 || response.status === 403) {
          const errorText = await response.text().catch(() => 'Unknown error');
          
          if (errorText.includes('Cloudflare') || errorText.includes('blocked')) {
            logger.warn(`${operation} - Cloudflare blocking detected (attempt ${attempt})`);
            lastError = new Error(`Cloudflare blocking: ${response.status} ${response.statusText}`);
          } else {
            logger.warn(`${operation} - Rate limited (attempt ${attempt})`);
            lastError = new Error(`Rate limited: ${response.status} ${response.statusText}`);
            
            // Check for Retry-After header and adjust delay
            const retryAfter = response.headers.get('Retry-After');
            if (retryAfter) {
              const retryDelay = parseInt(retryAfter) * 1000; // Convert to milliseconds
              logger.info(`${operation} - Server requested ${retryDelay}ms delay before retry`);
              this.dynamicRateLimit.currentDelay = Math.max(this.dynamicRateLimit.currentDelay, retryDelay);
            }
          }
        } else if (response.status === 400) {
          // Special handling for HTTP 400 errors
          const errorText = await response.text().catch(() => 'Unknown error');
          logger.warn(`${operation} - HTTP 400 Bad Request (attempt ${attempt})`);
          logger.warn(`${operation} - Error details: ${errorText}`);
          
          // Check if this might be due to skip parameter limits
          if (url.includes('$skip=') && parseInt(url.match(/\$skip=(\d+)/)?.[1]) > 50000) {
            logger.warn(`${operation} - Large skip parameter detected - API may have skip limits`);
            lastError = new Error(`HTTP 400: Large skip parameter not supported (skip > 50,000)`);
          } else {
            lastError = new Error(`HTTP 400: ${errorText || response.statusText}`);
          }
        } else {
          logger.warn(`${operation} - HTTP ${response.status} (attempt ${attempt})`);
          lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

      } catch (error) {
        const responseTime = Date.now() - requestStartTime;
        this.updateDynamicRateLimit(false, responseTime);
        
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
        // Use filter as-is without encoding
        urlString += `&$filter=${filter}`;
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
        // Use filter as-is without encoding
        urlString += `&$filter=${filter}`;
      }
      
      if (orderBy) {
        // Use orderBy as-is without encoding
        urlString += `&$orderby=${orderBy}`;
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
      
      // Use the complete URL from environment.env which includes all filters
      return await this.fetchFromCompleteUrl('idxProperties', {
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
      
      // Use the complete URL from environment.env which includes all filters
      return await this.fetchFromCompleteUrl('vowProperties', {
        feedType: 'vow',
        ...options
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
      
      // Use the complete URL from environment.env which includes all filters
      return await this.fetchFromCompleteUrl('propertyRooms', {
        feedType: 'idx', // Always use IDX token for property rooms
        ...options
      });
      
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
      
      // Use the complete URL from environment.env which includes all filters
      return await this.fetchFromCompleteUrl('openHouse', {
        feedType: 'idx', // Use IDX token for open houses
        ...options
      });
      
    } catch (error) {
      logger.error('Error fetching open houses', { error: error.message });
      throw error;
    }
  }

  /**
   * Fetch media data
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of media records
   */
  async fetchMedia(options = {}) {
    try {
      logger.info('Fetching media data');
      
      // Use the complete URL from environment.env which includes all filters
      return await this.fetchFromCompleteUrl('media', {
        feedType: 'idx', // Use IDX token for media
        ...options
      });
      
    } catch (error) {
      logger.error('Error fetching media', { error: error.message });
      throw error;
    }
  }

  /**
   * Fetch media data with custom filter - OPTIMIZED VERSION with PAGINATION SUPPORT
   * @param {Object} options - Query options with custom filter
   * @param {string} options.filter - OData filter string
   * @param {number} options.top - Number of records to fetch
   * @param {number} options.skip - Number of records to skip (for pagination)
   * @param {string} options.orderBy - Order by clause
   * @returns {Promise<Array>} Array of media records
   */
  async fetchMediaWithFilter(options = {}) {
    const {
      filter = '',
      top = 1000,
      skip = 0,
      orderBy = 'MediaModificationTimestamp asc',
      feedType = 'idx'
    } = options;

    try {
      logger.info('Fetching media data with custom filter', { filter: filter.substring(0, 100) + '...' });
      
      // Build URL with custom filter
      let baseUrl = this.endpoints.media;
      if (!baseUrl) {
        throw new Error('Media endpoint URL not configured');
      }

      // Append filter parameters to the existing URL
      let fetchUrl = baseUrl;
      
      if (filter) {
        // Check if the base URL already has a filter and combine them properly
        if (fetchUrl.includes('$filter=')) {
          // Extract the existing filter value
          const filterMatch = fetchUrl.match(/\$filter=([^&]*)/);
          if (filterMatch) {
            const existingFilter = decodeURIComponent(filterMatch[1]);
            const combinedFilter = `${existingFilter} and (${filter})`;
            
            // Replace the existing filter with the combined filter
            fetchUrl = fetchUrl.replace(/\$filter=[^&]*/, `$filter=${encodeURIComponent(combinedFilter)}`);
          } else {
            // Fallback: append as new filter parameter
            fetchUrl += `&$filter=${encodeURIComponent(filter)}`;
          }
        } else {
          fetchUrl += `&$filter=${encodeURIComponent(filter)}`;
        }
      }
      
      if (top) {
        fetchUrl += `&$top=${top}`;
      }
      
      if (skip > 0) {
        fetchUrl += `&$skip=${skip}`;
      }
      
      // Don't add orderBy if the base URL already has one
      if (orderBy && !fetchUrl.includes('$orderby=')) {
        fetchUrl += `&$orderby=${encodeURIComponent(orderBy)}`;
      }

      logger.debug('Fetching media with custom filter', { 
        url: fetchUrl.substring(0, 200) + '...',
        urlLength: fetchUrl.length,
        feedType
      });
      
      // Log the full URL for debugging (truncated)
      console.log(`🔗 Media Filter URL (${fetchUrl.length} chars): ${fetchUrl.substring(0, 300)}...`);
      
      const headers = this.getHeaders(feedType);
      const response = await this.executeWithRetry(fetchUrl, { headers }, `Fetch media with filter`);
      
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
      
      logger.info(`Media records fetched with filter`, { 
        recordCount: records.length,
        filter: filter.substring(0, 50) + '...',
        feedType
      });
      
      return records;
      
    } catch (error) {
      logger.error('Error fetching media with filter', { 
        filter: filter.substring(0, 100) + '...',
        error: error.message 
      });
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

      // Build incremental filter - Use proper OData DateTimeOffset format
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
