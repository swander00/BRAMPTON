-- ============================================================
-- MASTER VIEW CREATION SCRIPT
-- Creates all property-related and media views in one run
-- ============================================================

-- =====================
-- 1. PropertyCore View
-- =====================
DROP VIEW IF EXISTS "PropertyCore" CASCADE;
CREATE VIEW "PropertyCore" AS
SELECT 
  "ListingKey",
  "ListPrice",
  "ClosePrice",
  "MlsStatus",
  "ContractStatus",
  "StandardStatus",
  "TransactionType",
  "PropertyType",
  "PropertySubType",
  "ModificationTimestamp",
  "OriginalEntryTimestamp",
  "CreatedAt",
  "UpdatedAt"
FROM "Property";

-- =====================
-- 2. PropertyAddress View
-- =====================
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

-- =====================
-- 3. PropertyLayout View
-- =====================
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

-- =====================
-- 4. PropertyFeatures View
-- =====================
DROP VIEW IF EXISTS "PropertyFeatures" CASCADE;
CREATE VIEW "PropertyFeatures" AS
SELECT
  "ListingKey",
  array_to_string("ArchitecturalStyle", ', ') AS "ArchitecturalStyle",
  array_to_string("Cooling", ', ') AS "Cooling",
  array_to_string("Sewer", ', ') AS "Sewer",
  (
    SELECT array_to_string(
      ARRAY(
        SELECT DISTINCT INITCAP(word)
        FROM unnest(
          string_to_array(
            REGEXP_REPLACE(
              REGEXP_REPLACE(
                LOWER(array_to_string(COALESCE("Basement", ARRAY[]::text[]), ' ')),
                '\bfull\b|\bwith\b', '', 'g'
              ),
              '[,\-]', ' ', 'g'
            ),
            ' '
          )
        ) AS word
        WHERE word IS NOT NULL AND word <> ''
        ORDER BY INITCAP(word)
      ),
      ', '
    )
  ) AS "Basement",
  "BasementEntrance",
  array_to_string("ExteriorFeatures", ', ') AS "ExteriorFeatures",
  array_to_string("InteriorFeatures", ', ') AS "InteriorFeatures",
  array_to_string("PropertyFeatures", ', ') AS "PropertyFeatures",
  array_to_string("PoolFeatures", ', ') AS "PoolFeatures",
  array_to_string("RentIncludes", ', ') AS "RentIncludes",
  "HeatType",
  "FireplaceYN",
  "WaterfrontYN"
FROM "Property";

-- =====================
-- 5. PropertyLotParking View
-- =====================
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

-- =====================
-- 6. PropertyFinancial View
-- =====================
DROP VIEW IF EXISTS "PropertyFinancial" CASCADE;
CREATE VIEW "PropertyFinancial" AS
SELECT
  "ListingKey",
  "ListPrice",
  "ClosePrice",
  "TaxAnnualAmount",
  "TaxYear",
  "AssociationFee",
  array_to_string("AssociationFeeIncludes", ', ') AS "AssociationFeeIncludes",
  "AdditionalMonthlyFee"
FROM "Property";

-- =====================
-- 7. PropertyTimestamps View
-- =====================
DROP VIEW IF EXISTS "PropertyTimestamps" CASCADE;
CREATE VIEW "PropertyTimestamps" AS
SELECT
  "ListingKey",
  "OriginalEntryTimestamp",
  "SoldConditionalEntryTimestamp",
  "SoldEntryTimestamp",
  "SuspendedEntryTimestamp",
  "SuspendedDate",
  "TerminatedEntryTimestamp",
  "TerminatedDate",
  "UnavailableDate"
FROM "Property";

-- =====================
-- 8. PropertyOpenHouse View
-- =====================
DROP VIEW IF EXISTS "PropertyOpenHouse" CASCADE;
CREATE VIEW "PropertyOpenHouse" AS
SELECT
  "ListingKey",
  "OpenHouseDate",
  "OpenHouseStartTime",
  "OpenHouseEndTime",
  "OpenHouseStatus",
  "OpenHouseDateTime"
FROM "OpenHouse";

-- =====================
-- 9. MediaMain View
-- =====================
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

-- =====================
-- 9. PropertyRoomsView View
-- =====================
DROP VIEW IF EXISTS "PropertyRoomsView" CASCADE;

CREATE VIEW "PropertyRoomsView" AS
SELECT
  "RoomKey",
  "ListingKey",
  "RoomType",
  "RoomDescription",
  "RoomLevel",
  -- Build dimensions as "12 x 10 ft"
  CASE
    WHEN "RoomLength" IS NOT NULL AND "RoomWidth" IS NOT NULL AND "RoomLengthWidthUnits" IS NOT NULL
      THEN CONCAT("RoomLength", ' x ', "RoomWidth", ' ', "RoomLengthWidthUnits")
    WHEN "RoomLength" IS NOT NULL AND "RoomWidth" IS NOT NULL
      THEN CONCAT("RoomLength", ' x ', "RoomWidth")
    ELSE NULL
  END AS "RoomDimensions",
  -- Combine up to 3 features into one comma-separated string
  CONCAT_WS(', ',
    NULLIF("RoomFeature1", ''),
    NULLIF("RoomFeature2", ''),
    NULLIF("RoomFeature3", '')
  ) AS "RoomFeatures",
  "Order",
  "ModificationTimestamp",
  "CreatedAt",
  "UpdatedAt"
FROM "PropertyRooms"
ORDER BY "ListingKey", "Order";
