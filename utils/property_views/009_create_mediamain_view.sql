DROP VIEW IF EXISTS "MediaMain" CASCADE;
CREATE VIEW "MediaMain" AS
SELECT
  "ResourceRecordKey" AS "ListingKey",
  "MediaKey",
  "MediaURL",
  "MediaCategory",
  "MediaType",
  "PreferredPhotoYN",
  "Order",
  "MediaModificationTimestamp"
FROM "Media";