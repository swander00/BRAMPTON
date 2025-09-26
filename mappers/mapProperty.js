import logger from '../src/utils/logger.js';
import columnValidator from '../src/utils/columnValidator.js';

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

async function mapProperty(rawProperty) {
  try {
    // Map RESO fields to our database schema
    // Using exact field names from provided schema
    const mappedProperty = {
      // Primary key
      ListingKey: rawProperty.ListingKey,
      
      // Financial fields
      ListPrice: rawProperty.ListPrice,
      ClosePrice: rawProperty.ClosePrice,
      
      // Status fields
      MlsStatus: rawProperty.MlsStatus,
      ContractStatus: rawProperty.ContractStatus,
      StandardStatus: rawProperty.StandardStatus,
      TransactionType: rawProperty.TransactionType,
      
      // Property type fields
      PropertyType: rawProperty.PropertyType,
      PropertySubType: rawProperty.PropertySubType,
      ArchitecturalStyle: toArray(rawProperty.ArchitecturalStyle), // TEXT[]
      
      // Address fields
      UnparsedAddress: rawProperty.UnparsedAddress,
      StreetNumber: rawProperty.StreetNumber,
      StreetName: rawProperty.StreetName,
      StreetSuffix: rawProperty.StreetSuffix,
      City: rawProperty.City,
      StateOrProvince: rawProperty.StateOrProvince,
      PostalCode: rawProperty.PostalCode,
      CountyOrParish: rawProperty.CountyOrParish,
      CityRegion: rawProperty.CityRegion,
      UnitNumber: rawProperty.UnitNumber,
      
      // Room/Kitchen fields - handle decimal values by converting to integers
      KitchensAboveGrade: rawProperty.KitchensAboveGrade ? Math.floor(parseFloat(rawProperty.KitchensAboveGrade)) : null,
      BedroomsAboveGrade: rawProperty.BedroomsAboveGrade ? Math.floor(parseFloat(rawProperty.BedroomsAboveGrade)) : null,
      BedroomsBelowGrade: rawProperty.BedroomsBelowGrade ? Math.floor(parseFloat(rawProperty.BedroomsBelowGrade)) : null,
      BathroomsTotalInteger: rawProperty.BathroomsTotalInteger ? Math.floor(parseFloat(rawProperty.BathroomsTotalInteger)) : null,
      KitchensBelowGrade: rawProperty.KitchensBelowGrade ? Math.floor(parseFloat(rawProperty.KitchensBelowGrade)) : null,
      KitchensTotal: rawProperty.KitchensTotal ? Math.floor(parseFloat(rawProperty.KitchensTotal)) : null,
      DenFamilyRoomYN: rawProperty.DenFamilyRoomYN,
      
      // Description fields
      PublicRemarks: rawProperty.PublicRemarks,
      PossessionDetails: rawProperty.PossessionDetails,
      
      // Timestamp fields
      PhotosChangeTimestamp: rawProperty.PhotosChangeTimestamp,
      MediaChangeTimestamp: rawProperty.MediaChangeTimestamp,
      ModificationTimestamp: rawProperty.ModificationTimestamp,
      SystemModificationTimestamp: rawProperty.SystemModificationTimestamp,
      OriginalEntryTimestamp: rawProperty.OriginalEntryTimestamp,
      SoldConditionalEntryTimestamp: rawProperty.SoldConditionalEntryTimestamp,
      SoldEntryTimestamp: rawProperty.SoldEntryTimestamp,
      SuspendedEntryTimestamp: rawProperty.SuspendedEntryTimestamp,
      TerminatedEntryTimestamp: rawProperty.TerminatedEntryTimestamp,
      CreatedAt: new Date().toISOString(), // DEFAULT now()
      UpdatedAt: new Date().toISOString(), // DEFAULT now()
      
      // Date fields
      CloseDate: rawProperty.CloseDate,
      ConditionalExpiryDate: rawProperty.ConditionalExpiryDate,
      PurchaseContractDate: rawProperty.PurchaseContractDate,
      SuspendedDate: rawProperty.SuspendedDate,
      TerminatedDate: rawProperty.TerminatedDate,
      UnavailableDate: rawProperty.UnavailableDate,
      
      // Feature arrays
      Cooling: toArray(rawProperty.Cooling), // TEXT[]
      Sewer: toArray(rawProperty.Sewer), // TEXT[]
      Basement: toArray(rawProperty.Basement), // TEXT[]
      BasementEntrance: rawProperty.BasementEntrance,
      ExteriorFeatures: toArray(rawProperty.ExteriorFeatures), // TEXT[]
      InteriorFeatures: toArray(rawProperty.InteriorFeatures), // TEXT[]
      PoolFeatures: toArray(rawProperty.PoolFeatures), // TEXT[]
      PropertyFeatures: toArray(rawProperty.PropertyFeatures), // TEXT[]
      
      // Additional property features
      HeatType: rawProperty.HeatType,
      FireplaceYN: rawProperty.FireplaceYN,
      LivingAreaRange: rawProperty.LivingAreaRange,
      WaterfrontYN: rawProperty.WaterfrontYN,
      PossessionType: rawProperty.PossessionType,
      
      // Parking/Spaces - handle decimal values by converting to integers
      CoveredSpaces: rawProperty.CoveredSpaces ? Math.floor(parseFloat(rawProperty.CoveredSpaces)) : null,
      ParkingSpaces: rawProperty.ParkingSpaces ? Math.floor(parseFloat(rawProperty.ParkingSpaces)) : null,
      ParkingTotal: rawProperty.ParkingTotal ? Math.floor(parseFloat(rawProperty.ParkingTotal)) : null,
      
      // Note: OpenHouse and Room data are now handled by separate mappers
      // and stored in dedicated tables (OpenHouse and PropertyRooms)
      
      
      // Association fields
      AssociationAmenities: toArray(rawProperty.AssociationAmenities), // TEXT[]
      Locker: rawProperty.Locker,
      BalconyType: rawProperty.BalconyType,
      PetsAllowed: toArray(rawProperty.PetsAllowed), // TEXT[]
      AssociationFee: rawProperty.AssociationFee,
      AssociationFeeIncludes: toArray(rawProperty.AssociationFeeIncludes), // TEXT[]
      
      // Property details
      ApproximateAge: rawProperty.ApproximateAge,
      AdditionalMonthlyFee: rawProperty.AdditionalMonthlyFee,
      TaxAnnualAmount: rawProperty.TaxAnnualAmount,
      TaxYear: rawProperty.TaxYear ? Math.floor(parseFloat(rawProperty.TaxYear)) : null,
      
      // Lot details
      LotDepth: rawProperty.LotDepth,
      LotWidth: rawProperty.LotWidth,
      LotSizeUnits: rawProperty.LotSizeUnits,
      
      // Rental fields
      Furnished: rawProperty.Furnished,
      RentIncludes: toArray(rawProperty.RentIncludes) // TEXT[]
    };

    // Filter out non-existent columns gracefully
    try {
      const filteredProperty = await columnValidator.filterDataForTable(mappedProperty, 'Property');
      return filteredProperty;
    } catch (filterError) {
      logger.warn('Error filtering property columns, returning original data:', {
        ListingKey: rawProperty?.ListingKey,
        error: filterError.message
      });
      // Return the original mapped property if column filtering fails
      return mappedProperty;
    }
    
  } catch (error) {
    logger.error('Error mapping property:', {
      ListingKey: rawProperty?.ListingKey,
      error: error.message
    });
    throw error;
  }
}


function validateProperty(property) {
  const requiredFields = ['ListingKey'];
  const missingFields = requiredFields.filter(field => !property[field]);
  
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

export { mapProperty, validateProperty };