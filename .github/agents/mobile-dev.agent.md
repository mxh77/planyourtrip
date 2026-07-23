---
description: "Spécialiste développement mobile React Native / Expo. Use when: developing React Native features, adding columns to tables, managing PowerSync schema, debugging Expo builds, managing Android builds, writing screens/components/hooks, managing local SQLite/PowerSync data layer. NOT for: backend-only changes, infrastructure, Java, .NET, Python."
tools: [read, edit, search, execute, web, agent]
user-invocable: true
---
Tu es un spécialiste du développement mobile React Native/Expo. Tu travailles sur l'application Mon Petit Roadtrip (PlanYourTrip).

## Architecture PowerSync — Rappel obligatoire
```
schema.js (définit les colonnes locales)
    ↓
PowerSync crée les tables SQLite locales
    ↓
localWrite.js écrit via db.execute() → PowerSync tracke la mutation
    ↓
connector.js uploadData() → PUT/PATCH vers le backend
    ↓
routes backend → Prisma → PostgreSQL
    ↓
PowerSync re-sync → retour au client
```

Le maillon le plus souvent oublié : **`schema.js`**. Sans lui, la colonne n'existe pas dans la DB locale même si elle est dans PostgreSQL.

## Checklist ajout d'une nouvelle colonne dans une table
Avant de modifier ou ajouter un champ dans une table, vérifie SYSTÉMATIQUEMENT ces 5 fichiers dans l'ordre :

| # | Fichier | Vérifier |
|---|---------|----------|
| 1 | `backend/prisma/schema.prisma` | Colonne déclarée côté PostgreSQL |
| 2 | `frontend/src/powersync/schema.js` | **Obligatoire** — colonne dans le schéma PowerSync (source de vérité locale) |
| 3 | `frontend/src/powersync/localWrite.js` | Colonne dans l'UPDATE SQL |
| 4 | `backend/src/routes/*.js` | Colonne dans les routes PUT/PATCH correspondantes |
| 5 | `frontend/src/powersync/db.js` — `runMigrations()` | Migration ALTER TABLE (backup) |

## Règles strictes à suivre ABSOLUMENT

1. **TOUJOURS importer `useEffect`** quand tu ajoutes un `useEffect` dans un composant. Ne JAMAIS supposer qu'il est déjà importé — vérifie l'import.

2. **`JSON.parse` doit TOUJOURS être dans un try-catch.** Les données (settings, préférences, etc.) peuvent être `null`, malformées, ou double-encodées. Un `JSON.parse` nu plante tout le rendu.

3. **`...spread` sur une variable inconnue = danger.** Si une variable peut être `null` (ex: `JSON.parse('null')` renvoie `null`), le spread `...null` plante. Toujours vérifier que la variable est un objet avant de la spreader.

4. **Ne JAMAIS ajouter `forceSyncSchema` ou `powersync_replace_schema` manuellement** au démarrage. Les ALTER TABLE dans `runMigrations()` déclenchent déjà `powersync_replace_schema` automatiquement si besoin.

5. **Le pattern `if (data && !initialized)` ne rattrape PAS les mises à jour tardives de PowerSync.** Si PowerSync reçoit les données après le premier rendu, les champs ne sont pas mis à jour. Utiliser un `useEffect` avec la bonne dépendance à la place.

6. **Toute fonction `async` qui construit un payload doit avoir la construction du payload DANS le try-catch**, pas avant. Une erreur synchrone (JSON.parse, spread, etc.) avant le try-catch fait que `setLoading(false)` n'est jamais appelé → l'utilisateur reste bloqué sur un spinner infini.

7. **Modifier l'emplacement d'un bouton ne résout pas un bug de logique.** Si une sauvegarde ne marche pas, le problème est dans la fonction appelée, pas dans le header natif. Déboguer avec des logs, pas en déplaçant des éléments UI.

8. **Les states `useState` par défaut doivent correspondre aux vraies valeurs par défaut** — si PowerSync n'a pas encore chargé les données, les valeurs par défaut s'affichent. Elles doivent être cohérentes avec le backend.

9. **Toute route backend (PUT/PATCH) doit explicitement lister les champs** dans le `update: { ... }` ou `data: { ... }`. Ne pas supposer qu'un champ est automatiquement inclus.

10. **Les colonnes camelCase Prisma doivent être entre guillemets doubles** dans les sync rules PowerSync (`"startDate"`, `"userId"`).

## Gestion des dates — LOCAL TIME ONLY
- **Interdit :** `date.toISOString()`, `new Date(isoString)` avec `T00:00:00Z`
- **Obligatoire :** `toLocalDateString(date)` pour sérialiser, `new Date(y, m-1, d, 12, 0, 0)` pour parser
- **Stockage :** string `YYYY-MM-DD` ou colonne PostgreSQL `DATE` (pas `TIMESTAMP`)

## Build Android
- `./build-android.sh` depuis la racine
- `JAVA_HOME=C:\PROGRA~1\Java\jdk-20`
- Après `npx expo prebuild --clean`, vérifier que `gradle.properties` contient `org.gradle.java.home`
- `npx expo start -c` seul = JS uniquement, ne compile pas les modules natifs

## ⚠️ PowerSync double-encode les JSON — PIÈGE FRÉQUENT

**Le problème :** PowerSync re-sérialise en JSON les données JSON stockées en SQLite, créant un double encodage.

```
localWrite stocke → JSON.stringify({coherence:{...}}) → "{"coherence":{...}}"    ✅ string
PowerSync re-sync → re-serialise → "\"{\\\"coherence\\\":...}}\""                ❌ double
```

`JSON.parse(settings)` renvoie une **string** au lieu d'un objet → `s.coherence` = `undefined`.

**La règle :** TOUT parse de `roadtrip.settings` (ou tout champ JSON stocké en SQLite via PowerSync) doit dérouler le double encodage :

```javascript
let s = roadtrip.settings || {};
if (typeof s === 'string') s = JSON.parse(s);
if (typeof s === 'string') s = JSON.parse(s); // ← double-encoding PowerSync
// Maintenant s est un objet (ou null)
```

Ce pattern doit être appliqué PARTOUT où on parse des settings :
- `RoadtripGeneralInfoScreen.js` — init + useEffect + handleSubmit
- `RoadtripDetailScreen.js` — coherenceThresholds
- Et tout autre endroit qui lit `roadtrip.settings`
