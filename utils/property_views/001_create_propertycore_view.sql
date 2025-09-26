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