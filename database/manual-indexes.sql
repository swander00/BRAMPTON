-- Manual Database Indexes for Media Sync Optimization
-- Run these commands in your Supabase SQL Editor
-- Copy and paste each block into the SQL Editor and run them one by one

-- 1. Property ListingKey Index (for property validation)
CREATE INDEX IF NOT EXISTS idx_property_listing_key 
ON "Property" ("ListingKey");

-- 2. Media ResourceRecordKey Index (for foreign key lookups)
CREATE INDEX IF NOT EXISTS idx_media_resource_key 
ON "Media" ("ResourceRecordKey");

-- 3. Media Timestamp Index (for timestamp-based pagination)
CREATE INDEX IF NOT EXISTS idx_media_modification_timestamp 
ON "Media" ("MediaModificationTimestamp");

-- 4. Property Timestamp Index (for timestamp-based pagination)
CREATE INDEX IF NOT EXISTS idx_property_modification_timestamp 
ON "Property" ("ModificationTimestamp");

-- 5. Property ContractStatus Index (for IDX/VOW filtering)
CREATE INDEX IF NOT EXISTS idx_property_contract_status 
ON "Property" ("ContractStatus");

-- 6. Composite Index for Media (ResourceRecordKey + timestamp)
CREATE INDEX IF NOT EXISTS idx_media_resource_timestamp 
ON "Media" ("ResourceRecordKey", "MediaModificationTimestamp");

-- 7. Composite Index for Property (ContractStatus + PropertyType)
CREATE INDEX IF NOT EXISTS idx_property_status_type 
ON "Property" ("ContractStatus", "PropertyType");

-- 8. PropertyRooms ListingKey Index
CREATE INDEX IF NOT EXISTS idx_property_rooms_listing_key 
ON "PropertyRooms" ("ListingKey");

-- 9. OpenHouse ListingKey Index
CREATE INDEX IF NOT EXISTS idx_openhouse_listing_key 
ON "OpenHouse" ("ListingKey");

-- Update table statistics after creating indexes
ANALYZE "Property";
ANALYZE "Media";
ANALYZE "PropertyRooms";
ANALYZE "OpenHouse";

-- Check if indexes were created successfully
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename IN ('Property', 'Media', 'PropertyRooms', 'OpenHouse')
    AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
