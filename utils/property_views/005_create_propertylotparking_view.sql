DROP VIEW IF EXISTS "PropertyLotParking" CASCADE;
CREATE VIEW "PropertyLotParking" AS
SELECT
  "ListingKey",
  "LotSize",
  "ApproximateAge",
  "CoveredSpaces",
  "ParkingSpaces",
  "ParkingTotal"
FROM "Property";