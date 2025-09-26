import logger from '../src/utils/logger.js';
import columnValidator from '../src/utils/columnValidator.js';

/**
 * Convert ISO datetime string to time format (HH:MM:SS)
 * @param {string} dateTimeString - ISO datetime string
 * @returns {string|null} Time in HH:MM:SS format or null if invalid
 */
function convertToTime(dateTimeString) {
  if (!dateTimeString) return null;
  
  try {
    const date = new Date(dateTimeString);
    if (isNaN(date.getTime())) return null;
    
    // Extract time portion in HH:MM:SS format
    return date.toTimeString().split(' ')[0];
  } catch (error) {
    logger.warn('Failed to convert datetime to time:', { dateTimeString, error: error.message });
    return null;
  }
}

/**
 * Map OpenHouse data to database schema
 * @param {Object} rawOpenHouse - Raw open house data from OpenHouse endpoint
 * @returns {Object} Mapped open house data
 */
async function mapOpenHouse(rawOpenHouse) {
  try {
    const mappedOpenHouse = {
      // Primary key
      OpenHouseKey: rawOpenHouse.OpenHouseKey,
      
      // Foreign key to Property table
      ListingKey: rawOpenHouse.ListingKey,
      
      // Open house details
      OpenHouseDate: rawOpenHouse.OpenHouseDate,
      OpenHouseStartTime: convertToTime(rawOpenHouse.OpenHouseStartTime),
      OpenHouseEndTime: convertToTime(rawOpenHouse.OpenHouseEndTime),
      OpenHouseStatus: rawOpenHouse.OpenHouseStatus,
      OpenHouseDateTime: rawOpenHouse.OpenHouseDateTime,
      OpenHouseRemarks: rawOpenHouse.OpenHouseRemarks,
      OpenHouseType: rawOpenHouse.OpenHouseType,
      
      // Timestamps
      ModificationTimestamp: rawOpenHouse.ModificationTimestamp,
      CreatedAt: new Date().toISOString(), // DEFAULT now()
      UpdatedAt: new Date().toISOString() // DEFAULT now()
    };

    // Filter out non-existent columns gracefully
    try {
      const filteredOpenHouse = await columnValidator.filterDataForTable(mappedOpenHouse, 'OpenHouse');
      return filteredOpenHouse;
    } catch (filterError) {
      logger.warn('Error filtering open house columns, returning original data:', {
        OpenHouseKey: rawOpenHouse?.OpenHouseKey,
        ListingKey: rawOpenHouse?.ListingKey,
        error: filterError.message
      });
      // Return the original mapped open house if column filtering fails
      return mappedOpenHouse;
    }
  } catch (error) {
    logger.error('Error mapping open house:', {
      OpenHouseKey: rawOpenHouse?.OpenHouseKey,
      ListingKey: rawOpenHouse?.ListingKey,
      error: error.message
    });
    throw error;
  }
}

/**
 * Validate mapped open house data
 * @param {Object} openHouse - Mapped open house data
 * @returns {boolean} True if valid
 */
function validateOpenHouse(openHouse) {
  const requiredFields = ['OpenHouseKey', 'ListingKey'];
  const missingFields = requiredFields.filter(field => !openHouse[field]);
  
  if (missingFields.length > 0) {
    return {
      isValid: false,
      errors: [`Missing required fields: ${missingFields.join(', ')}`]
    };
  }
  
  return {
    isValid: true,
    errors: []
  };
}

export { mapOpenHouse, validateOpenHouse };
