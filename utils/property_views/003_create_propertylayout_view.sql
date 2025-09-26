DROP VIEW IF EXISTS "PropertyLayout" CASCADE;
CREATE VIEW "PropertyLayout" AS
SELECT
  "ListingKey",
  "BedroomsAboveGrade",
  "BedroomsBelowGrade",
  "BathroomsTotalInteger",
  "KitchensAboveGrade",
  "KitchensBelowGrade",
  "KitchensTotal",
  "DenFamilyRoomYN",
  "LivingAreaRange"
FROM "Property";