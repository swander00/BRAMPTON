-- =================================
-- DROP AND RECREATE ALL TABLES
-- Based on Mapper Field Mappings
-- PascalCase Naming Convention
-- =================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =================================
-- DROP EXISTING TABLES (in dependency order)
-- =================================
DROP TABLE IF EXISTS "OpenHouse" CASCADE;
DROP TABLE IF EXISTS "PropertyRooms" CASCADE;
DROP TABLE IF EXISTS "Media" CASCADE;
DROP TABLE IF EXISTS "Property" CASCADE;

-- =================================
-- PROPERTY TABLE
-- Based on mapProperty.js fields
-- =================================
CREATE TABLE "Property" (
    -- Primary Key
    "ListingKey" TEXT PRIMARY KEY,
    
    -- Financial Fields
    "ListPrice" DECIMAL,
    "ClosePrice" DECIMAL,
    
    -- Status Fields
    "MlsStatus" TEXT,
    "ContractStatus" TEXT,
    "StandardStatus" TEXT,
    "TransactionType" TEXT,
    
    -- Property Type Fields
    "PropertyType" TEXT,
    "PropertySubType" TEXT,
    "ArchitecturalStyle" TEXT[],
    
    -- Address Fields
    "UnparsedAddress" TEXT,
    "StreetNumber" TEXT,
    "StreetName" TEXT,
    "StreetSuffix" TEXT,
    "City" TEXT,
    "StateOrProvince" TEXT,
    "PostalCode" TEXT,
    "CountyOrParish" TEXT,
    "CityRegion" TEXT,
    "UnitNumber" TEXT,
    
    -- Room/Kitchen Fields (Decimals - converted to integers in mapper)
    "KitchensAboveGrade" DECIMAL,
    "BedroomsAboveGrade" DECIMAL,
    "BedroomsBelowGrade" DECIMAL,
    "BathroomsTotalInteger" DECIMAL,
    "KitchensBelowGrade" DECIMAL,
    "KitchensTotal" DECIMAL,
    "DenFamilyRoomYN" BOOLEAN,
    
    -- Description Fields
    "PublicRemarks" TEXT,
    "PossessionDetails" TEXT,
    
    -- Timestamp Fields
    "PhotosChangeTimestamp" TIMESTAMPTZ,
    "MediaChangeTimestamp" TIMESTAMPTZ,
    "ModificationTimestamp" TIMESTAMPTZ,
    "SystemModificationTimestamp" TIMESTAMPTZ,
    "OriginalEntryTimestamp" TIMESTAMPTZ,
    "SoldConditionalEntryTimestamp" TIMESTAMPTZ,
    "SoldEntryTimestamp" TIMESTAMPTZ,
    "SuspendedEntryTimestamp" TIMESTAMPTZ,
    "TerminatedEntryTimestamp" TIMESTAMPTZ,
    "CreatedAt" TIMESTAMPTZ DEFAULT NOW(),
    "UpdatedAt" TIMESTAMPTZ DEFAULT NOW(),
    
    -- Date Fields
    "CloseDate" DATE,
    "ConditionalExpiryDate" DATE,
    "PurchaseContractDate" DATE,
    "SuspendedDate" DATE,
    "TerminatedDate" DATE,
    "UnavailableDate" DATE,
    
    -- Feature Arrays
    "Cooling" TEXT[],
    "Sewer" TEXT[],
    "Basement" TEXT[],
    "BasementEntrance" TEXT,
    "ExteriorFeatures" TEXT[],
    "InteriorFeatures" TEXT[],
    "PoolFeatures" TEXT[],
    "PropertyFeatures" TEXT[],
    
    -- Additional Property Features
    "HeatType" TEXT,
    "FireplaceYN" BOOLEAN,
    "LivingAreaRange" TEXT,
    "WaterfrontYN" BOOLEAN,
    "PossessionType" TEXT,
    
    -- Parking/Spaces (Decimals - converted to integers in mapper)
    "CoveredSpaces" DECIMAL,
    "ParkingSpaces" DECIMAL,
    "ParkingTotal" DECIMAL,
    
    -- Association Fields
    "AssociationAmenities" TEXT[],
    "Locker" TEXT,
    "BalconyType" TEXT,
    "PetsAllowed" TEXT[],
    "AssociationFee" DECIMAL,
    "AssociationFeeIncludes" TEXT[],
    
    -- Property Details
    "ApproximateAge" TEXT,
    "AdditionalMonthlyFee" DECIMAL,
    "TaxAnnualAmount" DECIMAL,
    "TaxYear" INTEGER,
    
    -- Lot Details
    "LotDepth" DECIMAL,
    "LotWidth" DECIMAL,
    "LotSizeUnits" TEXT,
    
    -- Rental Fields
    "Furnished" TEXT,
    "RentIncludes" TEXT[]
);

-- =================================
-- MEDIA TABLE
-- Based on mapMedia.js fields
-- =================================
CREATE TABLE "Media" (
    -- Primary Key
    "MediaKey" TEXT PRIMARY KEY,
    
    -- Foreign Key to Property Table
    "ResourceRecordKey" TEXT NOT NULL,
    
    -- Media Identification
    "MediaObjectID" TEXT,
    "MediaURL" TEXT,
    "MediaCategory" TEXT,
    "MediaType" TEXT,
    "MediaStatus" TEXT,
    
    -- Media Details
    "ImageOf" TEXT,
    "ClassName" TEXT,
    "ImageSizeDescription" TEXT,
    "Order" INTEGER,
    "PreferredPhotoYN" BOOLEAN,
    "ShortDescription" TEXT,
    "ResourceName" TEXT,
    "OriginatingSystemID" TEXT,
    
    -- Timestamp Fields
    "MediaModificationTimestamp" TIMESTAMPTZ,
    "ModificationTimestamp" TIMESTAMPTZ,
    "CreatedAt" TIMESTAMPTZ DEFAULT NOW(),
    "UpdatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- =================================
-- PROPERTY ROOMS TABLE
-- Based on mapRoom.js fields
-- =================================
CREATE TABLE "PropertyRooms" (
    -- Primary Key
    "RoomKey" TEXT PRIMARY KEY,
    
    -- Foreign Key to Property Table
    "ListingKey" TEXT NOT NULL,
    
    -- Room Details
    "RoomDescription" TEXT,
    "RoomLength" DECIMAL,
    "RoomWidth" DECIMAL,
    "RoomLengthWidthUnits" TEXT,
    "RoomLevel" TEXT,
    "RoomType" TEXT,
    "RoomFeature1" TEXT,
    "RoomFeature2" TEXT,
    "RoomFeature3" TEXT,
    "RoomFeatures" TEXT[],
    
    -- Order/Sequence Information
    "Order" INTEGER,
    
    -- Timestamp Fields
    "ModificationTimestamp" TIMESTAMPTZ,
    "CreatedAt" TIMESTAMPTZ DEFAULT NOW(),
    "UpdatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- =================================
-- OPEN HOUSE TABLE
-- Based on mapOpenHouse.js fields
-- =================================
CREATE TABLE "OpenHouse" (
    -- Primary Key
    "OpenHouseKey" TEXT PRIMARY KEY,
    
    -- Foreign Key to Property Table
    "ListingKey" TEXT NOT NULL,
    
    -- Open House Details
    "OpenHouseDate" DATE,
    "OpenHouseStartTime" TIME,
    "OpenHouseEndTime" TIME,
    "OpenHouseStatus" TEXT,
    "OpenHouseDateTime" TIMESTAMPTZ,
    "OpenHouseRemarks" TEXT,
    "OpenHouseType" TEXT,
    
    -- Timestamp Fields
    "ModificationTimestamp" TIMESTAMPTZ,
    "CreatedAt" TIMESTAMPTZ DEFAULT NOW(),
    "UpdatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- =================================
-- FOREIGN KEY CONSTRAINTS
-- =================================

-- Link Media to Property
ALTER TABLE "Media" 
ADD CONSTRAINT "FkMediaProperty" 
FOREIGN KEY ("ResourceRecordKey") 
REFERENCES "Property" ("ListingKey") 
ON DELETE CASCADE;

-- Link PropertyRooms to Property
ALTER TABLE "PropertyRooms" 
ADD CONSTRAINT "FkPropertyRoomsProperty" 
FOREIGN KEY ("ListingKey") 
REFERENCES "Property" ("ListingKey") 
ON DELETE CASCADE;

-- Link OpenHouse to Property
ALTER TABLE "OpenHouse" 
ADD CONSTRAINT "FkOpenHouseProperty" 
FOREIGN KEY ("ListingKey") 
REFERENCES "Property" ("ListingKey") 
ON DELETE CASCADE;

-- =================================
-- INDEXES FOR PERFORMANCE
-- =================================

-- Property Indexes
CREATE INDEX "IdxPropertyModification" ON "Property" ("ModificationTimestamp");
CREATE INDEX "IdxPropertyCity" ON "Property" ("City");
CREATE INDEX "IdxPropertyStatus" ON "Property" ("MlsStatus");
CREATE INDEX "IdxPropertyContractStatus" ON "Property" ("ContractStatus");
CREATE INDEX "IdxPropertyType" ON "Property" ("PropertyType");
CREATE INDEX "IdxPropertyPrice" ON "Property" ("ListPrice");
CREATE INDEX "IdxPropertyBedrooms" ON "Property" ("BedroomsAboveGrade");
CREATE INDEX "IdxPropertyBathrooms" ON "Property" ("BathroomsTotalInteger");
CREATE INDEX "IdxPropertyPostalCode" ON "Property" ("PostalCode");

-- Media Indexes
CREATE INDEX "IdxMediaResourceKey" ON "Media" ("ResourceRecordKey");
CREATE INDEX "IdxMediaModification" ON "Media" ("MediaModificationTimestamp");
CREATE INDEX "IdxMediaType" ON "Media" ("MediaType");
CREATE INDEX "IdxMediaPreferred" ON "Media" ("PreferredPhotoYN");
CREATE INDEX "IdxMediaOrder" ON "Media" ("Order");

-- PropertyRooms Indexes
CREATE INDEX "IdxPropertyRoomsListingKey" ON "PropertyRooms" ("ListingKey");
CREATE INDEX "IdxPropertyRoomsModification" ON "PropertyRooms" ("ModificationTimestamp");
CREATE INDEX "IdxPropertyRoomsType" ON "PropertyRooms" ("RoomType");
CREATE INDEX "IdxPropertyRoomsLevel" ON "PropertyRooms" ("RoomLevel");
CREATE INDEX "IdxPropertyRoomsOrder" ON "PropertyRooms" ("Order");

-- OpenHouse Indexes
CREATE INDEX "IdxOpenHouseListingKey" ON "OpenHouse" ("ListingKey");
CREATE INDEX "IdxOpenHouseModification" ON "OpenHouse" ("ModificationTimestamp");
CREATE INDEX "IdxOpenHouseDate" ON "OpenHouse" ("OpenHouseDate");
CREATE INDEX "IdxOpenHouseStatus" ON "OpenHouse" ("OpenHouseStatus");

-- =================================
-- TRIGGERS FOR UPDATED_AT
-- =================================

-- Function to Update UpdatedAt Timestamp
CREATE OR REPLACE FUNCTION UpdateUpdatedAtColumn()
RETURNS TRIGGER AS $$
BEGIN
    NEW."UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for All Tables
CREATE TRIGGER UpdatePropertyUpdatedAt 
    BEFORE UPDATE ON "Property" 
    FOR EACH ROW 
    EXECUTE FUNCTION UpdateUpdatedAtColumn();

CREATE TRIGGER UpdateMediaUpdatedAt 
    BEFORE UPDATE ON "Media" 
    FOR EACH ROW 
    EXECUTE FUNCTION UpdateUpdatedAtColumn();

CREATE TRIGGER UpdatePropertyRoomsUpdatedAt 
    BEFORE UPDATE ON "PropertyRooms" 
    FOR EACH ROW 
    EXECUTE FUNCTION UpdateUpdatedAtColumn();

CREATE TRIGGER UpdateOpenHouseUpdatedAt 
    BEFORE UPDATE ON "OpenHouse" 
    FOR EACH ROW 
    EXECUTE FUNCTION UpdateUpdatedAtColumn();

-- =================================
-- COMMENTS FOR DOCUMENTATION
-- =================================

COMMENT ON TABLE "Property" IS 'RESO-compliant property data from AMPRE IDX/VOW feeds - mapped from mapProperty.js';
COMMENT ON TABLE "Media" IS 'Property media (photos, virtual tours) linked to properties - mapped from mapMedia.js';
COMMENT ON TABLE "PropertyRooms" IS 'Property room details from PropertyRooms endpoint - mapped from mapRoom.js';
COMMENT ON TABLE "OpenHouse" IS 'Open house information from OpenHouse endpoint - mapped from mapOpenHouse.js';

COMMENT ON COLUMN "Property"."ListingKey" IS 'Unique MLS listing identifier';
COMMENT ON COLUMN "Property"."ModificationTimestamp" IS 'Used for incremental sync';
COMMENT ON COLUMN "Media"."ResourceRecordKey" IS 'Links to Property.ListingKey';
COMMENT ON COLUMN "Media"."MediaModificationTimestamp" IS 'Used for incremental media sync';
COMMENT ON COLUMN "PropertyRooms"."RoomKey" IS 'Unique room identifier';
COMMENT ON COLUMN "PropertyRooms"."ListingKey" IS 'Links to Property.ListingKey';
COMMENT ON COLUMN "OpenHouse"."OpenHouseKey" IS 'Unique open house identifier';
COMMENT ON COLUMN "OpenHouse"."ListingKey" IS 'Links to Property.ListingKey';
