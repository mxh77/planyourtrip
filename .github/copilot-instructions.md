REGLE FONDAMENTALE : 
- PARLE TOUJOURS  EN FRANCAIS
- Le répertoire `Cavalcade/` est présent dans le workspace **uniquement comme référence d'inspiration**. Il est **STRICTEMENT INTERDIT** de modifier, créer ou supprimer le moindre fichier dans ce répertoire. Toutes les modifications sont réservées au projet `PlanYourTrip/`.

# Mon Petit Roadtrip — Instructions Copilot

## Stack technique
- **Frontend** : React Native + Expo SDK 54, New Architecture, React 19
- **Backend** : Node.js + Express + Prisma ORM
- **Base de données** : PostgreSQL via Supabase (région Frankfurt)
- **Sync offline** : PowerSync Cloud
- **Auth** : JWT maison (jsonwebtoken) côté backend

## Structure du projet
```
PlanYourTrip/
├── frontend/          # Expo React Native
│   ├── src/
│   │   ├── screens/
│   │   ├── store/       # Zustand stores
│   │   ├── hooks/       # usePowerSync.js — hooks réactifs PowerSync
│   │   ├── powersync/   # schema.js, connector.js, db.js, PowerSyncProvider.js
│   │   └── api/         # client axios + config URL
│   └── android/         # Généré par expo prebuild
├── backend/           # Express API
│   ├── src/
│   │   ├── routes/
│   │   ├── middleware/  # auth.js
│   │   └── lib/         # prisma.js
│   └── prisma/
└── build-android.sh   # Build Android local
```

## Build Android
- Utiliser `./build-android.sh` depuis la racine pour compiler et déployer sur téléphone
- `JAVA_HOME` doit utiliser le chemin court Windows sans espaces : `C:\PROGRA~1\Java\jdk-20`
- Après `npx expo prebuild --clean`, vérifier que `gradle.properties` contient encore `org.gradle.java.home`
- `npx expo start -c` seul = JS uniquement, ne compile pas les modules natifs
- Modules natifs (ex: `@journeyapps/react-native-quick-sqlite`) requièrent un rebuild complet

## PowerSync — règles importantes

### JWT
- Le backend génère le token PowerSync via `GET /api/auth/powersync-token`
- Le secret est en base64url dans `.env` → le passer en `Buffer.from(secret, 'base64url')` à `jwt.sign()` car PowerSync décode le secret depuis base64url côté vérification
- **`token_parameters.sub` ne fonctionne PAS dans les sync rules** — il faut ajouter un claim custom explicite :
  ```js
  jwt.sign({ sub: userId, user_id: userId, ... }, secret, { ... })
  ```
- Dans les sync rules, utiliser `token_parameters.user_id` (pas `.sub`)

### Sync Rules
```yaml
bucket_definitions:
  user_roadtrips:
    parameters:
      - SELECT token_parameters.user_id as user_id
    data:
      - SELECT ... FROM roadtrips WHERE "userId" = bucket.user_id
```
- Les colonnes camelCase Prisma/PostgreSQL doivent être entre guillemets doubles : `"startDate"`, `"userId"`, etc.
- Pas de sous-requêtes dans les WHERE des sync rules — utiliser `userId` directement sur chaque table
- Toutes les tables syncées (`roadtrips`, `steps`, `accommodations`, `activities`) doivent avoir un champ `userId`

### Données existantes
- Les enregistrements créés avant l'ajout de `userId` ont `userId = null` → ils ne seront jamais syncés
- Corriger via SQL dans Supabase : `UPDATE roadtrips SET "userId" = '...' WHERE "userId" IS NULL`

### Architecture lecture/écriture
- **Lecture** : via PowerSync (SQLite local, réactif, offline-first)
- **Écriture** : via `localWrite.js` → SQLite local (immédiat, fonctionne offline)
- `uploadData` dans le connecteur : traite la queue CRUD PowerSync → appelle `PUT/PATCH/DELETE /api/{table}/{id}` quand le réseau revient
- Le backend expose des routes `PUT /:id` (upsert) car l'ID est généré côté client
- `roadtripStore.js` délègue toutes les mutations à `localWrite.js` (plus d'appels API directs)

## Prisma / Supabase
- `DATABASE_URL` = pooler Supabase port 6543 avec `?pgbouncer=true` (obligatoire pour éviter `prepared statement "s0" already exists`)
- `DIRECT_URL` = connexion directe port 5432 pour les migrations et PowerSync
- Publication nécessaire pour PowerSync : `CREATE PUBLICATION powersync FOR TABLE roadtrips, steps, accommodations, activities, photos`

## Patterns de code

### Hooks PowerSync (lecture réactive)
```js
import { useQuery } from '@powersync/react-native';
export function useRoadtrips() {
  const userId = useAuthStore((s) => s.user?.id);
  const { data, isLoading } = useQuery(
    userId ? 'SELECT * FROM roadtrips WHERE userId = ? ORDER BY createdAt DESC' : 'SELECT * FROM roadtrips WHERE 1=0',
    userId ? [userId] : []
  );
  return { roadtrips: data ?? [], isLoading };
}
```

### Navigation après création
Passer les données créées en params pour éviter le spinner en attendant la sync :
```js
navigation.replace('RoadtripDetail', { id: roadtrip.id, title: roadtrip.title, roadtripData: roadtrip });
// Dans l'écran :
const currentRoadtrip = syncedRoadtrip ?? (roadtripData ? { ...roadtripData, steps: [] } : null);
```

### Backend — route PowerSync token
```js
router.get('/powersync-token', auth, async (req, res) => {
  const psSecret = Buffer.from(process.env.POWERSYNC_JWT_SECRET, 'base64url');
  const psToken = jwt.sign(
    { sub: req.user.userId, user_id: req.user.userId, iat: Math.floor(Date.now() / 1000) },
    psSecret,
    { expiresIn: '1h', audience: process.env.POWERSYNC_URL, keyid: process.env.POWERSYNC_JWT_KID }
  );
  res.json({ token: psToken, powersyncUrl: process.env.POWERSYNC_URL });
});
```

## Variables d'environnement backend (.env)
```
DATABASE_URL=postgresql://...?pgbouncer=true
DIRECT_URL=postgresql://...           # sans pgbouncer, port 5432
JWT_SECRET=...
POWERSYNC_URL=https://xxx.powersync.journeyapps.com
POWERSYNC_JWT_SECRET=...              # base64url, 32 bytes
POWERSYNC_JWT_KID=...                 # UUID
PORT=3111
```

## Lancer le projet en dev
```bash
# Terminal 1 — Backend
cd backend && node src/index.js

# Terminal 2 — Frontend (après build natif déjà fait)
cd frontend && npx expo start -c
```

## ⚠️ RÈGLE CRITIQUE — Gestion des dates (LOCAL TIME ONLY)

**Les dates dans cette app représentent des jours calendaires, pas des instants UTC.**
Un départ le 16 mars saisi en France doit s'afficher le 16 mars au Canada. Il n'y a pas de sémantique "instant universel".

### Principe : toujours travailler en heure locale, ne JAMAIS utiliser UTC

**Interdit :**
- `date.toISOString()` → produit une string UTC, décale la date si heure locale ≠ UTC
- `new Date(isoString)` quand la string contient `T00:00:00Z` → interprète en UTC, décale en local
- Toute conversion implicite JavaScript Date → UTC

**Obligatoire :**
- **Sérialisation avant envoi au backend** : extraire les composantes locales
  ```js
  const toLocalDateString = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`; // ex: "2026-03-16" — pas de timezone
  };
  ```
- **Désérialisation à la réception du backend / PowerSync** : construire en local
  ```js
  const fromLocalDateString = (str) => {
    if (!str) return new Date();
    const [y, m, d] = str.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0); // midi local = jamais de décalage jour
  };
  ```
- **Stockage en base** : colonne `DATE` PostgreSQL (pas `TIMESTAMP`) ou string `YYYY-MM-DD` si on veut vraiment un string.
- **Affichage** : `date.toLocaleDateString('fr-FR', ...)` — jamais de `.toUTCString()`

### Application à tout le codebase
- `DateRangePicker` : `fromYMD` doit créer `new Date(y, m-1, d, 12, 0, 0)`
- `EditRoadtripScreen.parseDate` : reconstruire en local depuis la string reçue
- `CreateRoadtripScreen` et tout autre écran de saisie : envoyer `toLocalDateString(date)` au lieu de `date.toISOString()`
- Backend : pas de transformation de timezone, stocker et renvoyer tel quel
- PowerSync / SQLite : stocker comme string `YYYY-MM-DD`

## Contexte du dernier déploiement

> Cette section est mise à jour automatiquement par `./save-context.sh` après chaque déploiement.
> **Au début de chaque nouvelle conversation**, lis cette section pour connaître l'état actuel du projet, la feature en cours et les prochaines étapes.
> Chaque conversation a son propre fichier de contexte dans `docs/contexts/` (max 1000 lignes). L'index complet est dans `docs/contexts/INDEX.md`.

<!-- CONTEXT-AUTO:START -->
# Contexte — main

**Date :** 2026-07-14 18:14 | **Branche :** `main` | **Commit :** `dcad150 — fix: PowerSync auth et optimisation polyline loading`

## 🎯 Objectif de la session
main

## ✅ Commits réalisés
- `dcad150` fix: PowerSync auth et optimisation polyline loading
- `f40fa6d` fix: améliorer l'UX du volet des étapes - augmenter zone de swipe et hauteur fermée
- `35c3fe2` feat: ajouter affichage des itinéraires entre étapes avec Routes API
- `576bd98` feat: recherche Google Places custom avec dropdown positionne
- `953a52c` feat: swipe sur la poignée pour ouvrir/fermer le volet des étapes
- `fdd2f35` fix: titre et menu hamburger dans la barre de navigation native (RoadtripDetailScreen)
- `d2d9520` feat: marker-modal inspiré du modal desktop roadtrip-planner
- `e2f7de2` feat: marker-modal - menu contextuel pour marqueurs
- `576fa06` feat: nouveau marker-modal.svg - popup détail au clic sur un marqueur
- `249e57c` feat: ajout trajet dans les fiches étapes

## 🔧 Fichiers modifiés
**Frontend**
  - frontend/src/components/SuggestionModal.js
  - frontend/src/hooks/usePowerSyncDebug.js
  - frontend/src/powersync/PowerSyncProvider.js
  - frontend/src/powersync/connector.js
  - frontend/src/powersync/db.js
  - frontend/src/screens/HomeScreen.js
  - frontend/src/screens/RoadtripDetailScreen.js
**Backend**
  - backend/src/lib/devhubOrchestrator.js
  - backend/src/lib/githubApi.js
  - backend/src/lib/mailer.js
  - backend/src/routes-rp/documents.js
  - backend/src/routes/auth.js
  - backend/src/routes/devhub.js
**Autres**
  - .ai/codebase_context.md
  - .github/copilot-instructions.md
  - .github/prompts/analyze-run.prompt.md
  - .github/prompts/deployment.prompt.md
  - .github/prompts/suggestions.prompt.md
  - .github/workflows/delivery-agent.yml
  - .github/workflows/deploy-production.yml
  - .github/workflows/fix-pr-reviews.yml
  - .github/workflows/fix-reviews-agent.yml
  - .github/workflows/init-context.yml
  - .github/workflows/product-spec-agent.yml
  - .github/workflows/qa-report.yml
  - Europe.json
  - PlanYourRide.code-workspace
  - TODO.md
  - backend/scripts/backfill-runs.js
  - backend/scripts/cleanup-duplicate-steps.js
  - backend/scripts/import-europe.js
  - backend/scripts/keepalive.js
  - backend/scripts/test-powersync.js
  - deploy-backend.sh
  - deploy.sh
  - dev-build.sh
  - dev-install.sh
  - dev-run.sh
  - docs/contexts/2026-03-17_etat-initial.md
  - docs/contexts/2026-03-19_132439_test-enrichissement-contexte.md
  - docs/contexts/2026-03-20_085630_feat-int-gration-datetimepicker-suggestions-proxim.md
  - docs/contexts/2026-03-21_175730_feat-ajout-lat-lng-sur-activit-s-et-h-bergements-t.md
  - docs/contexts/2026-05-09_094526_chore-corriger-le-d-ploiement-backend-remote-ssh-e.md
  - docs/figma/marker-modal.svg
  - docs/figma/roadtrip-detail-screen.svg
  - frontend/.env.example
  - frontend/PlanYourRide.code-workspace
  - frontend/app.config.js
  - frontend/app.json
  - frontend/package-lock.json
  - frontend/package.json
  - frontend/web/_backups/verify.sh
  - frontend/web/index.html
  - frontend/web/package-lock.json
  - frontend/web/package.json
  - frontend/web/patch_mapview.cjs
  - frontend/web/patch_overlay_mapview.cjs
  - frontend/web/patch_roadtrippage_overlay.cjs
  - frontend/web/patch_rtp_zoomkey.cjs
  - frontend/web/patch_scroll.cjs
  - frontend/web/patch_zoomkey.cjs
  - frontend/web/src/pages/AdminDevHub.jsx
  - frontend/web/src/pages/AdminFeedbackPage.jsx
  - frontend/web/src/pages/AdminSuggestionsPage.jsx
  - frontend/web/src/pages/AdminUsersPage.jsx
  - frontend/web/src/pages/DownloadPage.jsx
  - frontend/web/src/pages/HomePage.jsx
  - frontend/web/src/pages/LoginPage.jsx
  - release-build.sh
  - release-install.sh
  - reset-data.sh
  - run-backend.sh
  - unlock-android.ps1
  - web-deploy.sh
  - web-run.sh

## 🌐 Routes API ajoutées / modifiées
**documents**:
  - POST /upload
  - GET /file/:filename
  - DELETE /:filename
**auth**:
  - POST /register
  - POST /verify-email
  - POST /resend-verification
  - POST /login
  - POST /forgot-password
  - POST /reset-password
  - POST /refresh
  - POST /logout
  - GET /powersync-token
  - POST /push-token
**devhub**:
  - GET /issues
  - GET /issues/:number/prs
  - GET /issues/:number/runs
  - GET /issues/:number/agent-comments
  - GET /prs/:number/files
  - GET /prs/:number/commits
  - GET /prs/:number/runs
  - GET /prs/:number/review-status
  - GET /prs/:number/all-comments
  - GET /prs/:number/review-comments

## 📊 Résumé des changements (lignes)
```
 Europe.json                                        | 1272 ++++++++++
 backend/scripts/backfill-runs.js                   |    4 +-
 backend/scripts/cleanup-duplicate-steps.js         |   41 +
 backend/scripts/import-europe.js                   |  150 ++
 backend/scripts/keepalive.js                       |    4 +-
 backend/scripts/test-powersync.js                  |   80 +
 backend/src/lib/devhubOrchestrator.js              |    4 +-
 backend/src/lib/githubApi.js                       |    4 +-
 backend/src/lib/mailer.js                          |    2 +-
 backend/src/routes-rp/documents.js                 |    4 +-
 backend/src/routes/auth.js                         |   45 +-
 backend/src/routes/devhub.js                       |    4 +-
 deploy-backend.sh                                  |    8 +-
 deploy.sh                                          |    8 +-
 dev-build.sh                                       |   19 +-
 dev-install.sh                                     |    2 +-
 dev-run.sh                                         |    2 +-
 frontend/app.config.js                             |   30 +-
 frontend/app.json                                  |    2 +-
 frontend/package-lock.json                         | 2417 +++++++++-----------
```

## 📌 État actuel du projet
- **Branche :** `main`
- **Dernier commit :** `dcad150` — fix: PowerSync auth et optimisation polyline loading
- **Backend :** Node.js/Express + Prisma, déployé sur CT 111 (port 3111)
- **Frontend mobile :** Expo React Native, build Android via `./build-android.sh`
- **Frontend web :** React/Vite, déployé sur CT 111 (nginx)

## 🚀 Prochaines étapes
À définir lors de la prochaine session.

## ⚠️ Points d'attention pour la prochaine session
- Relire les fichiers modifiés listés ci-dessus avant de commencer
- Vérifier que le backend est bien redémarré si des routes ont changé
- Si des colonnes Prisma ont été ajoutées, s'assurer que les sync rules PowerSync sont à jour

---

**Contextes des conversations précédentes** (dans `docs/contexts/`) :
- `2026-05-09_094526_chore-corriger-le-d-ploiement-backend-remote-ssh-e.md` — Contexte — chore: corriger le déploiement backend — remote SSH et migration Prisma
- `2026-03-22_083130_feat-timeline-web-redesign-e-validation-de-dates-p.md` — Contexte — feat: timeline web redesignée, validation de dates partagée et pré-remplissage automatique
- `2026-03-21_175730_feat-ajout-lat-lng-sur-activit-s-et-h-bergements-t.md` — Contexte — feat: ajout lat/lng sur activités et hébergements, types SUPERMARKET/HIKING/PARKING, onglets Proximité/Chercher sur web
- `2026-03-21_071938_master.md` — Contexte — master
- `2026-03-20_085630_feat-int-gration-datetimepicker-suggestions-proxim.md` — Contexte — feat: intégration DateTimePicker, suggestions à proximité et multi-hébergements
- `2026-03-19_132553_chore-enrichir-le-script-save-context-sh-et-corrig.md` — Contexte — chore: enrichir le script save-context.sh et corriger la détection des fichiers modifiés
- `2026-03-19_132439_test-enrichissement-contexte.md` — Contexte — test enrichissement contexte
- `2026-03-19_132052_feat-v-rification-email-r-initialisation-mot-de-pa.md` — Contexte — feat: vérification email, réinitialisation mot de passe et gestion admin des utilisateurs
- `2026-03-18_125458_master.md` — Contexte — master
- `2026-03-17_etat-initial.md` — Contexte — État initial du projet
- `2026-03-17_180852_chore-corriger-save-context-sh-et-ajouter-horodata.md` — Contexte — chore: corriger save-context.sh et ajouter horodatage dans les noms de fichiers de contexte
<!-- CONTEXT-AUTO:END -->

