DROP VIEW IF EXISTS "PropertyOpenHouse" CASCADE;
CREATE VIEW "PropertyOpenHouse" AS
SELECT
  "ListingKey",
  "OpenHouseDate",
  "OpenHouseStartTime",
  "OpenHouseEndTime",
  "OpenHouseStatus",
  "OpenHouseDateTime"
FROM "Property";