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