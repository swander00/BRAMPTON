-- Database Index Optimization for Media Sync Efficiency
-- These indexes will significantly improve query performance for media sync operations

-- Index for Property table ListingKey lookups (used in property validation)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_property_listing_key 
ON "Property" ("ListingKey");

-- Index for Media table ResourceRecordKey lookups (foreign key to Property)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_resource_key 
ON "Media" ("ResourceRecordKey");

-- Index for Media table timestamp-based pagination
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_modification_timestamp 
ON "Media" ("MediaModificationTimestamp");

-- Composite index for Media table (ResourceRecordKey + timestamp for efficient filtering)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_resource_timestamp 
ON "Media" ("ResourceRecordKey", "MediaModificationTimestamp");

-- Index for Property table timestamp-based pagination
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_property_modification_timestamp 
ON "Property" ("ModificationTimestamp");

-- Index for PropertyRooms table ListingKey lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_property_rooms_listing_key 
ON "PropertyRooms" ("ListingKey");

-- Index for OpenHouse table ListingKey lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_openhouse_listing_key 
ON "OpenHouse" ("ListingKey");

-- Index for Property table ContractStatus filtering (for IDX/VOW separation)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_property_contract_status 
ON "Property" ("ContractStatus");

-- Composite index for Property table (ContractStatus + PropertyType for efficient filtering)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_property_status_type 
ON "Property" ("ContractStatus", "PropertyType");

-- Analyze tables to update statistics after index creation
ANALYZE "Property";
ANALYZE "Media";
ANALYZE "PropertyRooms";
ANALYZE "OpenHouse";

-- Display index information
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename IN ('Property', 'Media', 'PropertyRooms', 'OpenHouse')
ORDER BY tablename, indexname;
