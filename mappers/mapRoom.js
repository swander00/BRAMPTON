import logger from '../src/utils/logger.js';

/**
 * Convert a value to an array format for database storage
 * @param {*} value - The value to convert
 * @returns {Array|null} Array or null
 */
function toArray(value) {
  if (!value) return null;
  
  // If it's already an array, return it
  if (Array.isArray(value)) {
    return value.filter(item => item && item.trim() !== '');
  }
  
  // If it's a string, try to parse it as JSON array first
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter(item => item && item.trim() !== '');
      }
    } catch (e) {
      // Not JSON, treat as single string
    }
    
    // Single string - wrap in array if not empty
    const trimmed = value.trim();
    return trimmed ? [trimmed] : null;
  }
  
  // Convert other types to string and wrap in array
  const stringValue = String(value).trim();
  return stringValue ? [stringValue] : null;
}

/**
 * Map PropertyRooms data to database schema
 * @param {Object} rawRoom - Raw room data from PropertyRooms endpoint
 * @returns {Object} Mapped room data
 */
function mapRoom(rawRoom) {
  try {
    return {
      // Primary key
      RoomKey: rawRoom.RoomKey,
      
      // Foreign key to Property table
      ListingKey: rawRoom.ListingKey,
      
      // Room details
      RoomDescription: rawRoom.RoomDescription,
      RoomLength: rawRoom.RoomLength,
      RoomWidth: rawRoom.RoomWidth,
      RoomLengthWidthUnits: rawRoom.RoomLengthWidthUnits,
      RoomLevel: rawRoom.RoomLevel,
      RoomType: rawRoom.RoomType,
      RoomFeature1: rawRoom.RoomFeature1,
      RoomFeature2: rawRoom.RoomFeature2,
      RoomFeature3: rawRoom.RoomFeature3,
      RoomFeatures: toArray(rawRoom.RoomFeatures), // TEXT[]
      
      // Order/sequence information
      Order: rawRoom.Order,
      
      // Timestamps
      ModificationTimestamp: rawRoom.ModificationTimestamp,
      CreatedAt: new Date().toISOString(), // DEFAULT now()
      UpdatedAt: new Date().toISOString() // DEFAULT now()
    };
  } catch (error) {
    logger.error('Error mapping room:', {
      RoomKey: rawRoom?.RoomKey,
      ListingKey: rawRoom?.ListingKey,
      error: error.message
    });
    throw error;
  }
}

/**
 * Validate mapped room data
 * @param {Object} room - Mapped room data
 * @returns {boolean} True if valid
 */
function validateRoom(room) {
  const requiredFields = ['RoomKey', 'ListingKey'];
  const missingFields = requiredFields.filter(field => !room[field]);
  
  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
  }
  
  return true;
}

export { mapRoom, validateRoom };
