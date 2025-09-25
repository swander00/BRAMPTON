-- =================================
-- REMOVE FOREIGN KEY CONSTRAINT
-- =================================
-- This script removes the foreign key constraint between Media and Property tables
-- to allow media records to be inserted even if the referenced property doesn't exist yet.

-- Remove the foreign key constraint
ALTER TABLE "Media" 
DROP CONSTRAINT IF EXISTS "fk_media_property";

-- Verify the constraint has been removed
-- You can run this query to check:
-- SELECT constraint_name, table_name 
-- FROM information_schema.table_constraints 
-- WHERE constraint_type = 'FOREIGN KEY' 
-- AND table_name = 'Media';

-- Optional: Add a comment explaining why the constraint was removed
COMMENT ON TABLE "Media" IS 'Property media (photos, virtual tours) linked to properties. Foreign key constraint removed to allow flexible data loading.';

-- =================================
-- ALTERNATIVE: DISABLE CONSTRAINT TEMPORARILY
-- =================================
-- If you want to temporarily disable instead of remove, uncomment these lines:
-- ALTER TABLE "Media" DISABLE TRIGGER ALL;
-- Note: This disables ALL triggers, not just foreign key constraints

-- To re-enable later:
-- ALTER TABLE "Media" ENABLE TRIGGER ALL;

-- =================================
-- CLEAN UP ORPHANED RECORDS (OPTIONAL)
-- =================================
-- If you want to clean up any existing orphaned media records after removing the constraint:
-- DELETE FROM "Media" 
-- WHERE "ResourceRecordKey" NOT IN (SELECT "ListingKey" FROM "Property");

GRANT ALL ON TABLE "Media" TO postgres;
GRANT ALL ON TABLE "Property" TO postgres;

-- Success message
SELECT 'Foreign key constraint fk_media_property has been removed successfully' as status;
