import logger from '../src/utils/logger.js';

/**
 * Map OpenHouse data to database schema
 * @param {Object} rawOpenHouse - Raw open house data from OpenHouse endpoint
 * @returns {Object} Mapped open house data
 */
function mapOpenHouse(rawOpenHouse) {
  try {
    return {
      // Primary key
      OpenHouseKey: rawOpenHouse.OpenHouseKey,
      
      // Foreign key to Property table
      ListingKey: rawOpenHouse.ListingKey,
      
      // Open house details
      OpenHouseDate: rawOpenHouse.OpenHouseDate,
      OpenHouseStartTime: rawOpenHouse.OpenHouseStartTime,
      OpenHouseEndTime: rawOpenHouse.OpenHouseEndTime,
      OpenHouseStatus: rawOpenHouse.OpenHouseStatus,
      OpenHouseDateTime: rawOpenHouse.OpenHouseDateTime,
      OpenHouseRemarks: rawOpenHouse.OpenHouseRemarks,
      OpenHouseType: rawOpenHouse.OpenHouseType,
      
      // Timestamps
      ModificationTimestamp: rawOpenHouse.ModificationTimestamp,
      CreatedAt: new Date().toISOString(), // DEFAULT now()
      UpdatedAt: new Date().toISOString() // DEFAULT now()
    };
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
    throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
  }
  
  return true;
}

export { mapOpenHouse, validateOpenHouse };
