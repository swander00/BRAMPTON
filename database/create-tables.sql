-- =================================
-- SUPABASE DATABASE SCHEMA
-- Real Estate IDX/VOW Tables
-- =================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =================================
-- PROPERTY TABLE
-- =================================
CREATE TABLE IF NOT EXISTS "Property" (
    -- Primary Key
    "ListingKey" TEXT PRIMARY KEY,
    
    -- Financial fields
    "ListPrice" DECIMAL,
    "ClosePrice" DECIMAL,
    
    -- Status fields
    "MlsStatus" TEXT,
    "ContractStatus" TEXT,
    "StandardStatus" TEXT,
    "TransactionType" TEXT,
    
    -- Property type fields
    "PropertyType" TEXT,
    "PropertySubType" TEXT,
    "ArchitecturalStyle" TEXT[], -- Array field
    
    -- Address fields
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
    
    -- Room/Kitchen fields (integers)
    "KitchensAboveGrade" INTEGER,
    "BedroomsAboveGrade" INTEGER,
    "BedroomsBelowGrade" INTEGER,
    "BathroomsTotalInteger" INTEGER,
    "KitchensBelowGrade" INTEGER,
    "KitchensTotal" INTEGER,
    "DenFamilyRoomYN" BOOLEAN,
    
    -- Description fields
    "PublicRemarks" TEXT,
    "PossessionDetails" TEXT,
    
    -- Timestamp fields
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
    
    -- Date fields
    "CloseDate" DATE,
    "ConditionalExpiryDate" DATE,
    "PurchaseContractDate" DATE,
    "SuspendedDate" DATE,
    "TerminatedDate" DATE,
    "UnavailableDate" DATE,
    
    -- Feature arrays
    "Cooling" TEXT[],
    "Sewer" TEXT[],
    "Basement" TEXT[],
    "BasementEntrance" TEXT,
    "ExteriorFeatures" TEXT[],
    "InteriorFeatures" TEXT[],
    "PoolFeatures" TEXT[],
    "PropertyFeatures" TEXT[],
    
    -- Additional property features
    "HeatType" TEXT,
    "FireplaceYN" BOOLEAN,
    "LivingAreaRange" TEXT,
    "WaterfrontYN" BOOLEAN,
    "PossessionType" TEXT,
    
    -- Parking/Spaces (integers)
    "CoveredSpaces" INTEGER,
    "ParkingSpaces" INTEGER,
    "ParkingTotal" INTEGER,
    
    -- Note: OpenHouse and Room data are now stored in separate tables
    -- (OpenHouse and PropertyRooms) for proper normalization
    
    -- Association fields
    "AssociationAmenities" TEXT[],
    "Locker" TEXT,
    "BalconyType" TEXT,
    "PetsAllowed" TEXT[],
    "AssociationFee" DECIMAL,
    "AssociationFeeIncludes" TEXT[],
    
    -- Property details
    "ApproximateAge" TEXT,
    "AdditionalMonthlyFee" DECIMAL,
    "TaxAnnualAmount" DECIMAL,
    "TaxYear" INTEGER,
    
    -- Lot details
    "LotDepth" DECIMAL,
    "LotWidth" DECIMAL,
    "LotSizeUnits" TEXT,
    
    -- Rental fields
    "Furnished" TEXT,
    "RentIncludes" TEXT[]
);

-- =================================
-- MEDIA TABLE
-- =================================
CREATE TABLE IF NOT EXISTS "Media" (
    -- Primary key components
    "MediaKey" TEXT PRIMARY KEY,
    "ResourceRecordKey" TEXT NOT NULL, -- Links to Property.ListingKey
    
    -- Media identification
    "MediaObjectID" TEXT,
    "MediaURL" TEXT,
    "MediaCategory" TEXT,
    "MediaType" TEXT,
    "MediaStatus" TEXT,
    
    -- Media details
    "ImageOf" TEXT,
    "ClassName" TEXT,
    "ImageSizeDescription" TEXT,
    "Order" INTEGER,
    "PreferredPhotoYN" BOOLEAN,
    "ShortDescription" TEXT,
    "ResourceName" TEXT,
    "OriginatingSystemID" TEXT,
    
    -- Timestamp fields
    "MediaModificationTimestamp" TIMESTAMPTZ,
    "ModificationTimestamp" TIMESTAMPTZ,
    "CreatedAt" TIMESTAMPTZ DEFAULT NOW(),
    "UpdatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- =================================
-- PROPERTY ROOMS TABLE
-- =================================
CREATE TABLE IF NOT EXISTS "PropertyRooms" (
    -- Primary key
    "RoomKey" TEXT PRIMARY KEY,
    
    -- Foreign key to Property table
    "ListingKey" TEXT NOT NULL, -- Links to Property.ListingKey
    
    -- Room details
    "RoomDescription" TEXT,
    "RoomLength" DECIMAL,
    "RoomWidth" DECIMAL,
    "RoomLengthWidthUnits" TEXT,
    "RoomLevel" TEXT,
    "RoomType" TEXT,
    "RoomFeature1" TEXT,
    "RoomFeature2" TEXT,
    "RoomFeature3" TEXT,
    "RoomFeatures" TEXT[], -- Array field
    
    -- Order/sequence information
    "Order" INTEGER,
    
    -- Timestamp fields
    "ModificationTimestamp" TIMESTAMPTZ,
    "CreatedAt" TIMESTAMPTZ DEFAULT NOW(),
    "UpdatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- =================================
-- OPEN HOUSE TABLE
-- =================================
CREATE TABLE IF NOT EXISTS "OpenHouse" (
    -- Primary key
    "OpenHouseKey" TEXT PRIMARY KEY,
    
    -- Foreign key to Property table
    "ListingKey" TEXT NOT NULL, -- Links to Property.ListingKey
    
    -- Open house details
    "OpenHouseDate" DATE,
    "OpenHouseStartTime" TIME,
    "OpenHouseEndTime" TIME,
    "OpenHouseStatus" TEXT,
    "OpenHouseDateTime" TIMESTAMPTZ,
    "OpenHouseRemarks" TEXT,
    "OpenHouseType" TEXT,
    
    -- Timestamp fields
    "ModificationTimestamp" TIMESTAMPTZ,
    "CreatedAt" TIMESTAMPTZ DEFAULT NOW(),
    "UpdatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- =================================
-- INDEXES FOR PERFORMANCE
-- =================================

-- Property indexes
CREATE INDEX IF NOT EXISTS "idx_property_modification" ON "Property" ("ModificationTimestamp");
CREATE INDEX IF NOT EXISTS "idx_property_city" ON "Property" ("City");
CREATE INDEX IF NOT EXISTS "idx_property_status" ON "Property" ("MlsStatus");
CREATE INDEX IF NOT EXISTS "idx_property_contract_status" ON "Property" ("ContractStatus");
CREATE INDEX IF NOT EXISTS "idx_property_type" ON "Property" ("PropertyType");
CREATE INDEX IF NOT EXISTS "idx_property_price" ON "Property" ("ListPrice");
CREATE INDEX IF NOT EXISTS "idx_property_bedrooms" ON "Property" ("BedroomsAboveGrade");
CREATE INDEX IF NOT EXISTS "idx_property_bathrooms" ON "Property" ("BathroomsTotalInteger");
CREATE INDEX IF NOT EXISTS "idx_property_postal_code" ON "Property" ("PostalCode");

-- Media indexes
CREATE INDEX IF NOT EXISTS "idx_media_resource_key" ON "Media" ("ResourceRecordKey");
CREATE INDEX IF NOT EXISTS "idx_media_modification" ON "Media" ("MediaModificationTimestamp");
CREATE INDEX IF NOT EXISTS "idx_media_type" ON "Media" ("MediaType");
CREATE INDEX IF NOT EXISTS "idx_media_preferred" ON "Media" ("PreferredPhotoYN");
CREATE INDEX IF NOT EXISTS "idx_media_order" ON "Media" ("Order");

-- PropertyRooms indexes
CREATE INDEX IF NOT EXISTS "idx_property_rooms_listing_key" ON "PropertyRooms" ("ListingKey");
CREATE INDEX IF NOT EXISTS "idx_property_rooms_modification" ON "PropertyRooms" ("ModificationTimestamp");
CREATE INDEX IF NOT EXISTS "idx_property_rooms_type" ON "PropertyRooms" ("RoomType");
CREATE INDEX IF NOT EXISTS "idx_property_rooms_level" ON "PropertyRooms" ("RoomLevel");
CREATE INDEX IF NOT EXISTS "idx_property_rooms_order" ON "PropertyRooms" ("Order");

-- OpenHouse indexes
CREATE INDEX IF NOT EXISTS "idx_open_house_listing_key" ON "OpenHouse" ("ListingKey");
CREATE INDEX IF NOT EXISTS "idx_open_house_modification" ON "OpenHouse" ("ModificationTimestamp");
CREATE INDEX IF NOT EXISTS "idx_open_house_date" ON "OpenHouse" ("OpenHouseDate");
CREATE INDEX IF NOT EXISTS "idx_open_house_status" ON "OpenHouse" ("OpenHouseStatus");

-- =================================
-- FOREIGN KEY RELATIONSHIP
-- =================================

-- Link Media to Property
ALTER TABLE "Media" 
ADD CONSTRAINT "fk_media_property" 
FOREIGN KEY ("ResourceRecordKey") 
REFERENCES "Property" ("ListingKey") 
ON DELETE CASCADE;

-- Link PropertyRooms to Property
ALTER TABLE "PropertyRooms" 
ADD CONSTRAINT "fk_property_rooms_property" 
FOREIGN KEY ("ListingKey") 
REFERENCES "Property" ("ListingKey") 
ON DELETE CASCADE;

-- Link OpenHouse to Property
ALTER TABLE "OpenHouse" 
ADD CONSTRAINT "fk_open_house_property" 
FOREIGN KEY ("ListingKey") 
REFERENCES "Property" ("ListingKey") 
ON DELETE CASCADE;

-- =================================
-- TRIGGERS FOR UPDATED_AT
-- =================================

-- Function to update UpdatedAt timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for Property table
CREATE TRIGGER update_property_updated_at 
    BEFORE UPDATE ON "Property" 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for Media table
CREATE TRIGGER update_media_updated_at 
    BEFORE UPDATE ON "Media" 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for PropertyRooms table
CREATE TRIGGER update_property_rooms_updated_at 
    BEFORE UPDATE ON "PropertyRooms" 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for OpenHouse table
CREATE TRIGGER update_open_house_updated_at 
    BEFORE UPDATE ON "OpenHouse" 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- =================================
-- ROW LEVEL SECURITY (OPTIONAL)
-- =================================

-- Enable RLS if you want to add authentication later
-- ALTER TABLE "Property" ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE "Media" ENABLE ROW LEVEL SECURITY;

-- Example policy for public read access
-- CREATE POLICY "Allow public read access" ON "Property" FOR SELECT USING (true);
-- CREATE POLICY "Allow public read access" ON "Media" FOR SELECT USING (true);

-- =================================
-- COMMENTS FOR DOCUMENTATION
-- =================================

COMMENT ON TABLE "Property" IS 'RESO-compliant property data from AMPRE IDX/VOW feeds';
COMMENT ON TABLE "Media" IS 'Property media (photos, virtual tours) linked to properties';
COMMENT ON TABLE "PropertyRooms" IS 'Property room details from PropertyRooms endpoint';
COMMENT ON TABLE "OpenHouse" IS 'Open house information from OpenHouse endpoint';

COMMENT ON COLUMN "Property"."ListingKey" IS 'Unique MLS listing identifier';
COMMENT ON COLUMN "Property"."ModificationTimestamp" IS 'Used for incremental sync';
COMMENT ON COLUMN "Media"."ResourceRecordKey" IS 'Links to Property.ListingKey';
COMMENT ON COLUMN "Media"."MediaModificationTimestamp" IS 'Used for incremental media sync';
COMMENT ON COLUMN "PropertyRooms"."RoomKey" IS 'Unique room identifier';
COMMENT ON COLUMN "PropertyRooms"."ListingKey" IS 'Links to Property.ListingKey';
COMMENT ON COLUMN "OpenHouse"."OpenHouseKey" IS 'Unique open house identifier';
COMMENT ON COLUMN "OpenHouse"."ListingKey" IS 'Links to Property.ListingKey';
