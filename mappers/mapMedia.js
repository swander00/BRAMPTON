import logger from '../src/utils/logger.js';

function mapMedia(rawMedia) {
  try {
    // Map RESO Media fields to our database schema
    // Using exact field names from provided schema
    return {
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
    throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
  }
  
  return true;
}

export { mapMedia, validateMedia };