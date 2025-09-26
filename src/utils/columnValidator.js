import { supabase } from '../config/supabase.js';
import logger from './logger.js';

/**
 * Database Column Validator
 * Validates which columns exist in database tables and filters data accordingly
 */
class ColumnValidator {
  constructor() {
    this.columnCache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    this.cacheTimestamps = new Map();
    
    // Circuit breaker for failed table queries
    this.failedTables = new Set();
    this.failureCounts = new Map();
    this.maxFailures = 3; // Stop trying after 3 failures
    this.failureResetTime = 30 * 60 * 1000; // Reset failures after 30 minutes
    
    // Pre-check for known empty tables
    this.emptyTables = new Set();
    this.emptyTableCheckTime = new Map();
    this.emptyTableCheckInterval = 10 * 60 * 1000; // Check every 10 minutes
  }

  /**
   * Get existing columns for a table from database schema
   * @param {string} tableName - Name of the table
   * @returns {Promise<Set<string>>} Set of existing column names
   */
  async getTableColumns(tableName) {
    const cacheKey = tableName;
    const now = Date.now();
    
    // Special handling for Property table - provide hardcoded schema
    if (tableName === 'Property') {
      const propertyColumns = new Set([
        'ListingKey', 'ListPrice', 'ClosePrice', 'MlsStatus', 'ContractStatus', 'StandardStatus', 'TransactionType',
        'PropertyType', 'PropertySubType', 'ArchitecturalStyle', 'UnparsedAddress', 'StreetNumber', 'StreetName',
        'StreetSuffix', 'City', 'StateOrProvince', 'PostalCode', 'CountyOrParish', 'CityRegion', 'UnitNumber',
        'KitchensAboveGrade', 'BedroomsAboveGrade', 'BedroomsBelowGrade', 'BathroomsTotalInteger', 'KitchensBelowGrade',
        'KitchensTotal', 'DenFamilyRoomYN', 'PublicRemarks', 'PossessionDetails', 'PhotosChangeTimestamp',
        'MediaChangeTimestamp', 'ModificationTimestamp', 'SystemModificationTimestamp', 'OriginalEntryTimestamp',
        'SoldConditionalEntryTimestamp', 'SoldEntryTimestamp', 'SuspendedEntryTimestamp', 'TerminatedEntryTimestamp',
        'CreatedAt', 'UpdatedAt', 'CloseDate', 'ConditionalExpiryDate', 'PurchaseContractDate', 'SuspendedDate',
        'TerminatedDate', 'UnavailableDate', 'Cooling', 'Sewer', 'Basement', 'BasementEntrance', 'ExteriorFeatures',
        'InteriorFeatures', 'PoolFeatures', 'PropertyFeatures', 'HeatType', 'FireplaceYN', 'LivingAreaRange',
        'WaterfrontYN', 'PossessionType', 'CoveredSpaces', 'ParkingSpaces', 'ParkingTotal', 'AssociationAmenities',
        'Locker', 'BalconyType', 'PetsAllowed', 'AssociationFee', 'AssociationFeeIncludes', 'ApproximateAge',
        'AdditionalMonthlyFee', 'TaxAnnualAmount', 'TaxYear', 'LotDepth', 'LotWidth', 'LotSizeUnits', 'Furnished', 'RentIncludes'
      ]);
      
      // Cache the result
      this.columnCache.set(cacheKey, propertyColumns);
      this.cacheTimestamps.set(cacheKey, now);
      
      logger.debug(`Using hardcoded schema for ${tableName} with ${propertyColumns.size} columns`);
      return propertyColumns;
    }
    
    // Special handling for PropertyRooms table - provide hardcoded schema
    if (tableName === 'PropertyRooms') {
      const propertyRoomsColumns = new Set([
        'RoomKey', 'ListingKey', 'RoomDescription', 'RoomLength', 'RoomWidth', 'RoomLengthWidthUnits',
        'RoomLevel', 'RoomType', 'RoomFeature1', 'RoomFeature2', 'RoomFeature3', 'RoomFeatures',
        'Order', 'ModificationTimestamp', 'CreatedAt', 'UpdatedAt'
      ]);
      
      // Cache the result
      this.columnCache.set(cacheKey, propertyRoomsColumns);
      this.cacheTimestamps.set(cacheKey, now);
      
      logger.debug(`Using hardcoded schema for ${tableName} with ${propertyRoomsColumns.size} columns`);
      return propertyRoomsColumns;
    }
    
    // Special handling for Media table - provide hardcoded schema
    if (tableName === 'Media') {
      const mediaColumns = new Set([
        'MediaKey', 'ResourceRecordKey', 'MediaObjectID', 'MediaURL', 'MediaCategory', 'MediaType',
        'MediaStatus', 'ImageOf', 'ClassName', 'ImageSizeDescription', 'Order', 'PreferredPhotoYN',
        'ShortDescription', 'ResourceName', 'OriginatingSystemID', 'MediaModificationTimestamp',
        'ModificationTimestamp', 'CreatedAt', 'UpdatedAt'
      ]);
      
      // Cache the result
      this.columnCache.set(cacheKey, mediaColumns);
      this.cacheTimestamps.set(cacheKey, now);
      
      logger.debug(`Using hardcoded schema for ${tableName} with ${mediaColumns.size} columns`);
      return mediaColumns;
    }
    
    // Special handling for OpenHouse table - provide hardcoded schema
    if (tableName === 'OpenHouse') {
      const openHouseColumns = new Set([
        'OpenHouseKey', 'ListingKey', 'OpenHouseDate', 'OpenHouseStartTime', 'OpenHouseEndTime',
        'OpenHouseStatus', 'OpenHouseDateTime', 'OpenHouseRemarks', 'OpenHouseType',
        'ModificationTimestamp', 'CreatedAt', 'UpdatedAt'
      ]);
      
      // Cache the result
      this.columnCache.set(cacheKey, openHouseColumns);
      this.cacheTimestamps.set(cacheKey, now);
      
      logger.debug(`Using hardcoded schema for ${tableName} with ${openHouseColumns.size} columns`);
      return openHouseColumns;
    }
    
    // Check if this table has failed too many times
    if (this.failedTables.has(tableName)) {
      const failureTime = this.failureCounts.get(tableName);
      if (failureTime && (now - failureTime) < this.failureResetTime) {
        logger.debug(`Skipping column detection for ${tableName} due to repeated failures`);
        return new Set();
      } else {
        // Reset failure status after timeout
        this.failedTables.delete(tableName);
        this.failureCounts.delete(tableName);
      }
    }
    
    // For Property table, if we know it's empty, skip immediately
    if (tableName === 'Property' && this.failedTables.has('Property')) {
      logger.debug(`Skipping column detection for ${tableName} - known empty table`);
      return new Set();
    }
    
    // Check if table is known to be empty
    if (this.emptyTables.has(tableName)) {
      const lastCheck = this.emptyTableCheckTime.get(tableName);
      if (lastCheck && (now - lastCheck) < this.emptyTableCheckInterval) {
        logger.debug(`Skipping column detection for ${tableName} - known empty table`);
        return new Set();
      }
    }
    
    // Check cache first
    if (this.columnCache.has(cacheKey)) {
      const cacheTime = this.cacheTimestamps.get(cacheKey);
      if (now - cacheTime < this.cacheExpiry) {
        return this.columnCache.get(cacheKey);
      }
    }

    try {
      // First try: Query the information_schema to get column names
      const { data, error } = await supabase
        .from('information_schema.columns')
        .select('column_name')
        .eq('table_name', tableName)
        .eq('table_schema', 'public');

      if (error) {
        logger.warn(`Failed to get columns for table ${tableName}:`, error.message);
        
        // Fallback: Try to get columns by querying the table directly with a limit
        return await this.getTableColumnsFallback(tableName);
      }

      if (!data || data.length === 0) {
        logger.warn(`No columns found in information_schema for table ${tableName}`);
        // Fallback: Try to get columns by querying the table directly
        return await this.getTableColumnsFallback(tableName);
      }

      const columns = new Set(data.map(row => row.column_name));
      
      // Cache the result
      this.columnCache.set(cacheKey, columns);
      this.cacheTimestamps.set(cacheKey, now);
      
      logger.debug(`Found ${columns.size} columns for table ${tableName}`);
      return columns;

    } catch (error) {
      logger.error(`Error getting columns for table ${tableName}:`, error);
      // Handle schema cache errors gracefully
      return this.handleSchemaCacheError(tableName, error);
    }
  }

  /**
   * Fallback method to get table columns by querying the table directly
   * @param {string} tableName - Name of the table
   * @returns {Promise<Set<string>>} Set of existing column names
   */
  async getTableColumnsFallback(tableName) {
    try {
      logger.info(`Attempting fallback column detection for table ${tableName}`);
      
      // Try to query the table with a very small limit to get column names
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .limit(1);

      if (error) {
        logger.warn(`Fallback method failed for table ${tableName}:`, error.message);
        return new Set();
      }

      if (data && data.length > 0) {
        const columns = new Set(Object.keys(data[0]));
        logger.info(`Fallback method found ${columns.size} columns for table ${tableName}`);
        
        // Cache the result
        this.columnCache.set(tableName, columns);
        this.cacheTimestamps.set(tableName, Date.now());
        
        return columns;
      } else {
        logger.warn(`No data found in table ${tableName} for column detection`);
        // Immediately add to failed tables and empty tables to prevent repeated attempts
        this.failedTables.add(tableName);
        this.emptyTables.add(tableName);
        this.emptyTableCheckTime.set(tableName, Date.now());
        logger.warn(`Table ${tableName} added to failed and empty tables list due to empty table (fallback)`);
        return new Set();
      }

    } catch (error) {
      logger.error(`Fallback column detection failed for table ${tableName}:`, error);
      return new Set();
    }
  }

  /**
   * Check if a column exists in the table schema
   * @param {string} columnName - Name of the column to check
   * @param {string} tableName - Name of the table
   * @returns {Promise<boolean>} True if column exists
   */
  async columnExists(columnName, tableName) {
    try {
      const existingColumns = await this.getTableColumns(tableName);
      return existingColumns.has(columnName);
    } catch (error) {
      logger.warn(`Error checking if column ${columnName} exists in ${tableName}:`, error);
      return false; // Assume column doesn't exist if we can't check
    }
  }

  /**
   * Filter object to only include columns that exist in the database table
   * @param {Object} data - Data object to filter
   * @param {string} tableName - Target table name
   * @returns {Promise<Object>} Filtered data object
   */
  async filterDataForTable(data, tableName) {
    try {
      const existingColumns = await this.getTableColumns(tableName);
      
      if (existingColumns.size === 0) {
        logger.warn(`No columns found for table ${tableName}, filtering all data`);
        return {};
      }

      const filteredData = {};
      const filteredOut = [];
      const missingColumns = [];
      
      for (const [key, value] of Object.entries(data)) {
        if (existingColumns.has(key)) {
          filteredData[key] = value;
        } else {
          filteredOut.push(key);
          missingColumns.push(key);
        }
      }

      if (filteredOut.length > 0) {
        logger.debug(`Filtered out ${filteredOut.length} non-existent columns for ${tableName}:`, filteredOut.slice(0, 10));
        
        // Log specific missing columns for debugging
        if (missingColumns.length > 0) {
          logger.info(`Missing columns in ${tableName} schema: ${missingColumns.slice(0, 5).join(', ')}${missingColumns.length > 5 ? '...' : ''}`);
        }
      }

      return filteredData;

    } catch (error) {
      logger.error(`Error filtering data for table ${tableName}:`, error);
      // Return empty object on error to prevent database issues
      return {};
    }
  }

  /**
   * Filter array of objects to only include columns that exist in the database table
   * @param {Array} dataArray - Array of data objects to filter
   * @param {string} tableName - Target table name
   * @returns {Promise<Array>} Array of filtered data objects
   */
  async filterDataArrayForTable(dataArray, tableName) {
    if (!Array.isArray(dataArray) || dataArray.length === 0) {
      return dataArray;
    }

    try {
      const existingColumns = await this.getTableColumns(tableName);
      
      if (existingColumns.size === 0) {
        logger.warn(`No columns found for table ${tableName}, filtering all data`);
        return [];
      }

      const filteredArray = [];
      let totalFilteredOut = 0;
      const filteredColumns = new Set();
      const missingColumns = new Set();

      for (const data of dataArray) {
        const filteredData = {};
        
        for (const [key, value] of Object.entries(data)) {
          if (existingColumns.has(key)) {
            filteredData[key] = value;
          } else {
            filteredColumns.add(key);
            missingColumns.add(key);
            totalFilteredOut++;
          }
        }
        
        filteredArray.push(filteredData);
      }

      if (totalFilteredOut > 0) {
        logger.debug(`Filtered out ${totalFilteredOut} non-existent column values for ${tableName} across ${dataArray.length} records`);
        logger.debug(`Filtered columns:`, Array.from(filteredColumns).slice(0, 10));
        
        // Log specific missing columns for debugging
        if (missingColumns.size > 0) {
          const missingColumnsArray = Array.from(missingColumns);
          logger.info(`Missing columns in ${tableName} schema: ${missingColumnsArray.slice(0, 5).join(', ')}${missingColumnsArray.length > 5 ? '...' : ''}`);
        }
      }

      return filteredArray;

    } catch (error) {
      logger.error(`Error filtering data array for table ${tableName}:`, error);
      // Return empty array on error to prevent database issues
      return [];
    }
  }

  /**
   * Clear the column cache (useful for testing or when schema changes)
   */
  clearCache() {
    this.columnCache.clear();
    this.cacheTimestamps.clear();
    this.failedTables.clear();
    this.failureCounts.clear();
    this.emptyTables.clear();
    this.emptyTableCheckTime.clear();
    logger.debug('Column cache and circuit breakers cleared');
  }

  /**
   * Handle schema cache errors gracefully
   * @param {string} tableName - Name of the table
   * @param {Error} error - The error that occurred
   * @returns {Set} Empty set to indicate no columns found
   */
  handleSchemaCacheError(tableName, error) {
    logger.warn(`Schema cache error for table ${tableName}:`, error.message);
    
    // Track failures for circuit breaker
    const failureCount = this.failureCounts.get(tableName) || 0;
    this.failureCounts.set(tableName, failureCount + 1);
    
    // For empty tables, immediately add to failed tables to prevent repeated attempts
    if (error.message && error.message.includes('No data found')) {
      this.failedTables.add(tableName);
      this.emptyTables.add(tableName);
      this.emptyTableCheckTime.set(tableName, Date.now());
      logger.warn(`Table ${tableName} added to failed and empty tables list due to empty table`);
    } else if (failureCount + 1 >= this.maxFailures) {
      this.failedTables.add(tableName);
      logger.warn(`Table ${tableName} added to failed tables list after ${failureCount + 1} failures`);
    }
    
    // Check if it's a specific "column not found" error
    if (error.message && error.message.includes('Could not find') && error.message.includes('column')) {
      logger.info(`Ignoring missing column error for ${tableName}: ${error.message}`);
    }
    
    // Return empty set to filter out all columns (safe fallback)
    return new Set();
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      cachedTables: this.columnCache.size,
      tables: Array.from(this.columnCache.keys()),
      cacheExpiry: this.cacheExpiry,
      failedTables: Array.from(this.failedTables),
      emptyTables: Array.from(this.emptyTables),
      failureCounts: Object.fromEntries(this.failureCounts)
    };
  }

  /**
   * Reset circuit breaker for a specific table
   * @param {string} tableName - Name of the table to reset
   */
  resetCircuitBreaker(tableName) {
    this.failedTables.delete(tableName);
    this.failureCounts.delete(tableName);
    this.emptyTables.delete(tableName);
    this.emptyTableCheckTime.delete(tableName);
    logger.info(`Circuit breaker reset for table ${tableName}`);
  }

  /**
   * Reset all circuit breakers
   */
  resetAllCircuitBreakers() {
    this.failedTables.clear();
    this.failureCounts.clear();
    this.emptyTables.clear();
    this.emptyTableCheckTime.clear();
    logger.info('All circuit breakers reset');
  }
}

// Create and export a singleton instance
const columnValidator = new ColumnValidator();
export default columnValidator;
