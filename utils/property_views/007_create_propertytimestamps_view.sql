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