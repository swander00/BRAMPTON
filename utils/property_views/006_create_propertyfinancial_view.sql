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