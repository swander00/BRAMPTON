DROP VIEW IF EXISTS "PropertyAddress" CASCADE;
CREATE VIEW "PropertyAddress" AS
SELECT
  "ListingKey",
  INITCAP("UnparsedAddress") AS "UnparsedAddress",
  "StreetNumber",
  INITCAP("StreetName") AS "StreetName",
  "StreetSuffix",
  CASE 
    WHEN "City" LIKE 'Toronto%' THEN 'Toronto'
    ELSE INITCAP("City")
  END AS "City",
  INITCAP("CountyOrParish") AS "CountyOrParish",
  INITCAP("CityRegion") AS "CityRegion",
  "StateOrProvince",
  "PostalCode",
  CASE 
    WHEN "UnitNumber" IS NOT NULL AND "UnitNumber" <> '' THEN '#' || "UnitNumber" || '-'
    ELSE "UnitNumber"
  END AS "UnitNumber"
FROM "Property";