-- Migration: Ajouter les flags isDeparture/isArrival sur accommodations et activities
-- pour remplacer departureLatitude/arrivalLatitude sur steps

-- Ajout des colonnes sur accommodations
ALTER TABLE "accommodations" ADD COLUMN "isDeparture" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "accommodations" ADD COLUMN "isArrival" BOOLEAN NOT NULL DEFAULT false;

-- Ajout des colonnes sur activities
ALTER TABLE "activities" ADD COLUMN "isDeparture" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "activities" ADD COLUMN "isArrival" BOOLEAN NOT NULL DEFAULT false;

-- Backfill : pour chaque step qui a departureLatitude, tenter de trouver l'item correspondant
-- On ne peut pas savoir exactement quel item a été cliqué, donc on cherche par correspondance
-- de coordonnées parmi les items de cette étape
UPDATE accommodations a
SET "isDeparture" = true
FROM steps s
WHERE s.id = a."stepId"
  AND s."departureLatitude" IS NOT NULL
  AND s."departureLongitude" IS NOT NULL
  AND a.latitude = s."departureLatitude"
  AND a.longitude = s."departureLongitude";

UPDATE activities a
SET "isDeparture" = true
FROM steps s
WHERE s.id = a."stepId"
  AND s."departureLatitude" IS NOT NULL
  AND s."departureLongitude" IS NOT NULL
  AND a.latitude = s."departureLatitude"
  AND a.longitude = s."departureLongitude";

UPDATE accommodations a
SET "isArrival" = true
FROM steps s
WHERE s.id = a."stepId"
  AND s."arrivalLatitude" IS NOT NULL
  AND s."arrivalLongitude" IS NOT NULL
  AND a.latitude = s."arrivalLatitude"
  AND a.longitude = s."arrivalLongitude";

UPDATE activities a
SET "isArrival" = true
FROM steps s
WHERE s.id = a."stepId"
  AND s."arrivalLatitude" IS NOT NULL
  AND s."arrivalLongitude" IS NOT NULL
  AND a.latitude = s."arrivalLatitude"
  AND a.longitude = s."arrivalLongitude";
