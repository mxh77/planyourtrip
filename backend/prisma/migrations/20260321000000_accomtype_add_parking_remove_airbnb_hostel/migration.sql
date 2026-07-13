-- Migration: remplacer AIRBNB et HOSTEL par PARKING dans AccomType
-- Étape 1 : convertir les valeurs existantes vers OTHER avant de supprimer les anciens membres
UPDATE "accommodations" SET "type" = 'OTHER' WHERE "type" IN ('AIRBNB', 'HOSTEL');

-- Étape 2 : supprimer la valeur DEFAULT pour permettre le changement de type
ALTER TABLE "accommodations" ALTER COLUMN "type" DROP DEFAULT;

-- Étape 3 : recréer l'enum avec les nouvelles valeurs
ALTER TYPE "AccomType" RENAME TO "AccomType_old";
CREATE TYPE "AccomType" AS ENUM ('HOTEL', 'CAMPING', 'PARKING', 'OTHER');
ALTER TABLE "accommodations" ALTER COLUMN "type" TYPE "AccomType" USING "type"::text::"AccomType";
DROP TYPE "AccomType_old";

-- Étape 4 : remettre la valeur DEFAULT
ALTER TABLE "accommodations" ALTER COLUMN "type" SET DEFAULT 'HOTEL'::"AccomType";
