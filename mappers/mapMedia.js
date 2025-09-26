import logger from '../src/utils/logger.js';
import columnValidator from '../src/utils/columnValidator.js';

async function mapMedia(rawMedia) {
  try {
    // Map RESO Media fields to our database schema
    // Using exact field names from provided schema
    const mappedMedia = {
      // Primary key components
      ResourceRecordKey: rawMedia.ResourceRecordKey,
      MediaKey: rawMedia.MediaKey,
      
      // Media identification
      MediaObjectID: rawMedia.MediaObjectID,
      MediaURL: rawMedia.MediaURL,
      MediaCategory: rawMedia.MediaCategory,
      MediaType: rawMedia.MediaType,
      MediaStatus: rawMedia.MediaStatus,
      
      // Media details
      ImageOf: rawMedia.ImageOf,
      ClassName: rawMedia.ClassName,
      ImageSizeDescription: rawMedia.ImageSizeDescription,
      Order: rawMedia.Order ? Math.floor(parseFloat(rawMedia.Order)) : null,
      PreferredPhotoYN: rawMedia.PreferredPhotoYN,
      ShortDescription: rawMedia.ShortDescription,
      ResourceName: rawMedia.ResourceName,
      OriginatingSystemID: rawMedia.OriginatingSystemID,
      
      // Timestamp fields
      MediaModificationTimestamp: rawMedia.MediaModificationTimestamp,
      ModificationTimestamp: rawMedia.ModificationTimestamp,
      CreatedAt: new Date().toISOString(), // DEFAULT now()
      UpdatedAt: new Date().toISOString()  // DEFAULT now()
    };

    // Filter out non-existent columns gracefully
    try {
      const filteredMedia = await columnValidator.filterDataForTable(mappedMedia, 'Media');
      return filteredMedia;
    } catch (filterError) {
      logger.warn('Error filtering media columns, returning original data:', {
        MediaKey: rawMedia?.MediaKey,
        ResourceRecordKey: rawMedia?.ResourceRecordKey,
        error: filterError.message
      });
      // Return the original mapped media if column filtering fails
      return mappedMedia;
    }
  } catch (error) {
    logger.error('Error mapping media:', {
      MediaKey: rawMedia?.MediaKey,
      ResourceRecordKey: rawMedia?.ResourceRecordKey,
      error: error.message
    });
    throw error;
  }
}

function validateMedia(media) {
  const requiredFields = ['ResourceRecordKey', 'MediaKey'];
  const missingFields = requiredFields.filter(field => !media[field]);
  
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

export { mapMedia, validateMedia };