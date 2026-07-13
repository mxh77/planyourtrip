REGLE FONDAMENTALE : 
- PARLE TOUJOURS  EN FRANCAIS
- Le répertoire `Cavalcade/` est présent dans le workspace **uniquement comme référence d'inspiration**. Il est **STRICTEMENT INTERDIT** de modifier, créer ou supprimer le moindre fichier dans ce répertoire. Toutes les modifications sont réservées au projet `MonPetitRoadtrip/`.

# Mon Petit Roadtrip — Instructions Copilot

## Stack technique
- **Frontend** : React Native + Expo SDK 54, New Architecture, React 19
- **Backend** : Node.js + Express + Prisma ORM
- **Base de données** : PostgreSQL via Supabase (région Frankfurt)
- **Sync offline** : PowerSync Cloud
- **Auth** : JWT maison (jsonwebtoken) côté backend

## Structure du projet
```
MonPetitRoadtrip/
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
# Contexte — chore: corriger le déploiement backend — remote SSH et migration Prisma

**Date :** 2026-05-09 09:45 | **Branche :** `master` | **Commit :** `82e76bc — chore: corriger le déploiement backend — remote SSH et migration Prisma`

## 🎯 Objectif de la session
chore: corriger le déploiement backend — remote SSH et migration Prisma

## ✅ Commits réalisés
- `82e76bc` chore: corriger le déploiement backend — remote SSH et migration Prisma
- `d4c57c6` fix: corrections pipeline DevHub — SSE, reviewStatus, githubApi et schéma commits
- `7f52402` fix: ajouter githubApi.js manquant (requis par devhubWebhook)
- `8e81ac7` fix: reviewStatus de PipelineBoard inclut outerRefreshKey + auto-refetch quand run review terminé
- `0146ec5` fix: badges review dans StageCard aussi masqués si tous pending
- `2b0fbf4` fix: badges review masqués si tous pending (affichage uniquement si verdict réel)
- `ba5df99` fix: badges review visibles dans PRDetail (outerRefreshKey + isFeatureBranch élargi)
- `daa7c98` fix: auto-unlock dans les états DONE (verrou toujours obsolète après restart backend)
- `1fdf0f3` fix: tick() orchestre les transitions pures en boucle pour enchaîner immédiatement
- `d4a4626` fix: supprimer trigger issues:labeled sur product-spec et feature-dev agents
- `99124e8` feat: SSE temps réel DevHub + fix runs skipped + rattrapage STUCK orchestrateur
- `f6b8804` fix: le verrou ne bloque plus les transitions de fin d'agent (seulement les re-triggers)
- `a509c77` fix: lever le verrou dès qu'un run agent se termine (webhook) + PREVIEW_RUNNING failure → re-dispatch feature-dev-agent
- `7e1a01c` fix: /issues/:number/prs — détecter branche branch_issue_N (underscore)
- `b1b7806` fix: détection PR branch_issue_N, race condition 60s, prNumber propagé, retry REVIEW_RUNNING sans run, cron 10s, issues state=all
- `f88a077` fix: tolérance 60s dans getRunsByIssue pour race condition dispatch/transition, issues state=all
- `b36c797` fix: trigger-agent met l'état SPEC_RUNNING/DEV_RUNNING, webhook rattrape les runs déclenchés hors DevHub
- `999b0d4` fix: init-context déclenché uniquement sur merge de PR, plus sur push direct
- `b51b68d` chore(context): mise à jour automatique du contexte codebase
- `94d2a28` feat: orchestrateur déclenché automatiquement par webhook workflow_run, code-reviews en workflow_dispatch uniquement

## 🔧 Fichiers modifiés
**Frontend**
  - frontend/src/api/config.js
  - frontend/src/components/SuggestionFAB.js
  - frontend/src/components/SuggestionModal.js
  - frontend/src/components/TableauView.js
  - frontend/src/screens/HomeScreen.js
  - frontend/src/screens/RoadtripDetailScreen.js
  - frontend/src/screens/RoadtripSettingsScreen.js
  - frontend/src/utils/directions.js
**Backend**
  - backend/src/index.js
  - backend/src/lib/devhubOrchestrator.js
  - backend/src/lib/githubApi.js
  - backend/src/lib/sseBus.js
  - backend/src/routes/admin.js
  - backend/src/routes/devhub.js
  - backend/src/routes/devhubWebhook.js
  - backend/src/routes/members.js
  - backend/src/routes/roadtrips.js
  - backend/src/routes/routes.js
  - backend/src/routes/steps.js
  - backend/src/routes/suggestions.js
**Prisma/DB**
  - backend/prisma/migrations/20260502000000_add_suggestions/migration.sql
  - backend/prisma/migrations/20260505000000_add_devhub_workflow/migration.sql
  - backend/prisma/migrations/20260507000000_add_github_runs/migration.sql
  - backend/prisma/migrations/20260509000000_add_github_run_commits/migration.sql
  - backend/prisma/schema.prisma
**Autres**
  - .ai/branch_name.txt
  - .ai/codebase_context.md
  - .ai/fix_reviews_summary.md
  - .ai/issues/14-suggestion-ajouter-la-possibilit-de-coller-une-image-dans-le/spec.md
  - .ai/issues/18-suggestion-j-ai-besoin-d-une-interface-devhub-adapt-pour-web/acceptance_criteria.json
  - .ai/issues/18-suggestion-j-ai-besoin-d-une-interface-devhub-adapt-pour-web/spec.md
  - .ai/issues/20-suggestion-dans-la-page-d-accueil-web-afficher-les-roadtrips/acceptance_criteria.json
  - .ai/issues/20-suggestion-dans-la-page-d-accueil-web-afficher-les-roadtrips/spec.md
  - .ai/pr_body.md
  - .ai/qa_fix_summary_pr19.md
  - .github/agents/code_review_backend.py
  - .github/agents/code_review_frontend.py
  - .github/agents/fix_reviews_agent.py
  - .github/agents/functional_review.py
  - .github/agents/generate_ac.py
  - .github/agents/qa_fix_agent.py
  - .github/copilot-instructions.md
  - .github/prompts/analyze-run.prompt.md
  - .github/prompts/suggestions.prompt.md
  - .github/workflows/code-review-backend.yml
  - .github/workflows/code-review-frontend.yml
  - .github/workflows/code-reviews.yml
  - .github/workflows/delivery-agent.yml
  - .github/workflows/deploy-production.yml
  - .github/workflows/feature-dev-agent.yml
  - .github/workflows/fix-pr-reviews.yml
  - .github/workflows/fix-reviews-agent.yml
  - .github/workflows/functional-review.yml
  - .github/workflows/init-context.yml
  - .github/workflows/product-spec-agent.yml
  - .github/workflows/qa-report.yml
  - .gitignore
  - analyze_run.sh
  - backend/.env.example
  - backend/bash.exe.stackdump
  - backend/scripts/backfill-runs.js
  - backend/scripts/keepalive.js
  - backend/scripts/list-suggestions.js
  - backup.js
  - backups/backup_2026-04-12T12-33-23.json
  - backups/backup_2026-04-12T15-56-28.json
  - backups/backup_2026-04-12T16-21-01.json
  - backups/backup_2026-04-21T06-30-17.json
  - backups/backup_2026-04-21T13-02-59.json
  - backups/backup_2026-04-21T13-06-01.json
  - backups/backup_2026-04-21T13-07-53.json
  - backups/backup_2026-04-21T13-36-57.json
  - backups/backup_2026-04-21T16-44-04.json
  - backups/backup_2026-05-02T07-28-08.json
  - backups/backup_2026-05-02T10-17-44.json
  - backups/backup_2026-05-02T14-08-22.json
  - backups/backup_2026-05-03T16-45-32.json
  - backups/backup_2026-05-03T16-45-52.json
  - backups/backup_2026-05-04T06-15-58.json
  - backups/backup_2026-05-04T07-10-13.json
  - backups/backup_2026-05-04T07-51-26.json
  - backups/backup_2026-05-04T08-00-25.json
  - backups/backup_2026-05-05T10-22-53.json
  - backups/backup_2026-05-06T21-31-18.json
  - backups/backup_2026-05-06T21-49-57.json
  - backups/backup_2026-05-09T07-39-50.json
  - backups/backup_2026-05-09T07-44-51.json
  - delivery_logs.zip
  - delivery_logs/0_deploy-preview.txt
  - delivery_logs/deploy-preview/14_Post Checkout de la branche PR.txt
  - delivery_logs/deploy-preview/15_Complete job.txt
  - delivery_logs/deploy-preview/1_Set up job.txt
  - "delivery_logs/deploy-preview/2_R+\302\256cup+\302\256rer les infos de la PR.txt"
  - delivery_logs/deploy-preview/3_Checkout de la branche PR.txt
  - "delivery_logs/deploy-preview/4_Setup cl+\302\256 SSH CT111.txt"
  - "delivery_logs/deploy-preview/5_D+\302\256ployer la PR en preview sur CT111.txt"
  - "delivery_logs/deploy-preview/7_D+\302\256clencher les code reviews si le d+\302\256ploiement a +\302\256chou+\302\256.txt"
  - delivery_logs/deploy-preview/system.txt
  - deploy-backend.sh
  - deploy.sh
  - docs/contexts/2026-03-22_083130_feat-timeline-web-redesign-e-validation-de-dates-p.md
  - docs/contexts/INDEX.md
  - frontend/.env.example
  - frontend/.vscode/settings.json
  - frontend/MonPetitRoadtrip.code-workspace
  - frontend/web/package-lock.json
  - frontend/web/package.json
  - frontend/web/src/App.jsx
  - frontend/web/src/api.js
  - frontend/web/src/components/AccommodationModal.jsx
  - frontend/web/src/components/ActivityModal.jsx
  - frontend/web/src/components/BudgetSummary.jsx
  - frontend/web/src/components/MapView.jsx
  - frontend/web/src/components/MobileBottomNav.jsx
  - frontend/web/src/components/PhotosPanel.jsx
  - frontend/web/src/components/PlacesAutocompleteInput.jsx
  - frontend/web/src/components/PlanningTableView.jsx
  - frontend/web/src/components/PreviewQAReporter.jsx
  - frontend/web/src/components/RouteAlternativesPanel.jsx
  - frontend/web/src/components/StepModal.jsx
  - frontend/web/src/components/SuggestionModal.jsx
  - frontend/web/src/hooks/useMobile.js
  - frontend/web/src/hooks/useStepReorder.js
  - frontend/web/src/pages/AdminDevHub.jsx
  - frontend/web/src/pages/AdminFeedbackPage.jsx
  - frontend/web/src/pages/AdminSuggestionsPage.jsx
  - frontend/web/src/pages/AdminUsersPage.jsx
  - frontend/web/src/pages/HomePage.jsx
  - frontend/web/src/pages/RoadtripPage.jsx
  - frontend/web/src/utils/directions.js
  - frontend/web/vite.config.js
  - release-build.sh
  - run-backend.sh
  - save-context.sh
  - unlock-android.ps1
  - web-deploy.sh

## 🌐 Routes API ajoutées / modifiées
**admin**:
  - GET /users
  - PATCH /users/:id
  - DELETE /users/:id
  - GET /suggestions
  - PATCH /suggestions/:id/status
  - DELETE /suggestions/:id
  - POST /suggestions/:id/convert-to-issue
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
**devhubWebhook**:
router.post(
**members**:
  - GET /:roadtripId/members/my-role
  - GET /:roadtripId/members
  - POST /:roadtripId/members
  - PATCH /:roadtripId/members/:memberId
  - DELETE /:roadtripId/members/:memberId
**roadtrips**:
  - GET /
  - POST /
  - GET /:id
  - PUT /:id
  - PATCH /:id
  - POST /:id/clone
  - DELETE /:id
  - GET /:id/settings
  - PATCH /:id/settings
**routes**:
  - POST /compute
  - GET /geocode
**steps**:
  - GET /
  - POST /
  - PUT /:id
  - PATCH /:id
  - PATCH /reorder
  - DELETE /:id
**suggestions**:
  - POST /

## 🔑 Nouvelles variables d'environnement (backend/.env)
  PORT=3111
## 📊 Résumé des changements (lignes)
```
 .../acceptance_criteria.json                       |  134 +
 .../acceptance_criteria.json                       |  118 +
 analyze_run.sh                                     |  171 +
 backend/prisma/schema.prisma                       |  104 +
 backend/scripts/backfill-runs.js                   |  116 +
 backend/scripts/keepalive.js                       |   92 +
 backend/scripts/list-suggestions.js                |   59 +
 backend/src/index.js                               |   15 +-
 backend/src/lib/devhubOrchestrator.js              |  578 ++++
 backend/src/lib/githubApi.js                       |  118 +
 backend/src/lib/sseBus.js                          |   40 +
 backend/src/routes/admin.js                        |  132 +-
 backend/src/routes/devhub.js                       | 1315 ++++++++
 backend/src/routes/devhubWebhook.js                |  349 ++
 backend/src/routes/members.js                      |  103 +-
 backend/src/routes/roadtrips.js                    |   96 +
 backend/src/routes/routes.js                       |   79 +
 backend/src/routes/steps.js                        |   22 +
 backend/src/routes/suggestions.js                  |   91 +
 backup.js                                          |   92 +
```

## 📌 État actuel du projet
- **Branche :** `master`
- **Dernier commit :** `82e76bc` — chore: corriger le déploiement backend — remote SSH et migration Prisma
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

