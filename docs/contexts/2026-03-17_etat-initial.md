# Contexte — État initial du projet

**Date :** 2026-03-17 | **Branche :** `main` | **Commit :** `5b10280 — feat: amélioration des logs backend et correction du debounce notifications`

## 🎯 Objectif de cette session
Mise en place du système de sauvegarde de contexte de conversation Copilot (`./save-context.sh`).
Le projet Mon Petit Roadtrip est fonctionnel en production avec toutes les features core implémentées.

---

## 🗂️ Structure du projet

```
PlanYourTrip/          ← workspace principal (backend + frontend mono-repo)
├── backend/               ← Node.js + Express + Prisma
│   ├── src/
│   │   ├── index.js
│   │   ├── routes/        ← auth, roadtrips, steps, accommodations, activities, photos, members, invitations, beta
│   │   ├── middleware/    ← auth.js, checkMemberRole.js
│   │   └── lib/           ← prisma.js
│   └── prisma/
│       ├── schema.prisma
│       └── migrations/
├── frontend/              ← Expo SDK 54, React Native, New Architecture, React 19
│   ├── App.js
│   ├── src/
│   │   ├── navigation/    ← AppNavigator.js (Stack unique)
│   │   ├── screens/       ← voir liste complète ci-dessous
│   │   ├── store/         ← authStore.js, roadtripStore.js (Zustand)
│   │   ├── hooks/         ← usePowerSync.js, usePushNotifications.js, useRoadtripRole.js
│   │   ├── powersync/     ← schema.js, connector.js, db.js, localWrite.js, PowerSyncProvider.js
│   │   ├── components/    ← DateRangePicker, DateTimePickerModal, LocationPicker, NearbySearchPanel, PlaceDetailModal, TimePicker, BetaFeedbackModal
│   │   ├── api/           ← client.js (axios), config.js (API_URL)
│   │   └── theme.js       ← design tokens
│   └── web/               ← dashboard Vite + Tailwind (déployé sur CT 111)
├── scripts/               ← inject-context.js
├── docs/contexts/         ← 1 fichier de contexte par conversation Copilot
├── save-context.sh        ← sauvegarde interactive du contexte
├── deploy.sh              ← git push + deploy backend + web + prompt save-context
├── deploy-backend.sh      ← deploy backend seul
├── web-deploy.sh          ← build Vite + déploiement Nginx
├── dev-build.sh           ← build APK debug + adb install
├── release-build.sh       ← build APK release signé
└── sync_rules.yaml        ← règles de sync PowerSync

planyourtrip_mobile/   ← workspace expérimental (branche de tests perf/UI)
```

---

## 🖥️ Backend — Routes Express

Toutes les routes sont protégées par `auth` (middleware JWT sauf `/register`, `/login`, `/refresh`).

| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/auth/register` | POST | Inscription email/password |
| `/api/auth/login` | POST | Connexion → access token (1h) + refresh token (90j) |
| `/api/auth/refresh` | POST | Renouvelle l'access token via refresh token |
| `/api/auth/logout` | POST | Révoque le refresh token |
| `/api/auth/me` | GET | Profil utilisateur connecté |
| `/api/auth/powersync-token` | GET | Génère le JWT PowerSync avec claim `user_id` |
| `/api/roadtrips` | GET | Roadtrips owned + partagés (via memberships ACCEPTED) |
| `/api/roadtrips` | POST | Créer un roadtrip |
| `/api/roadtrips/:id` | GET / PUT / DELETE | CRUD roadtrip (PUT = upsert car ID généré client) |
| `/api/steps` | POST | Créer une étape |
| `/api/steps/:id` | PUT / DELETE | Modifier/supprimer une étape |
| `/api/accommodations/:id` | PUT / DELETE | Hébergement |
| `/api/activities/:id` | PUT / DELETE | Activité |
| `/api/photos` | POST | Upload photo (Cloudinary) |
| `/api/photos/:id` | DELETE | Supprimer photo |
| `/api/members/:roadtripId` | GET / POST / PUT / DELETE | Gestion des membres du roadtrip |
| `/api/invitations` | POST / GET | Invitations à rejoindre un roadtrip |
| `/api/beta` | POST | Feedback bêta |

**Tokens :**
- Access token : `jwt.sign({ userId, email, isAdmin }, JWT_SECRET, { expiresIn: '1h' })`
- PowerSync token : `jwt.sign({ sub: userId, user_id: userId }, Buffer.from(POWERSYNC_JWT_SECRET, 'base64url'), { expiresIn: '1h', audience: POWERSYNC_URL, keyid: POWERSYNC_JWT_KID })`

---

## 📱 Frontend — Écrans & Navigation

Navigation : Stack unique (pas de Tabs), conditionnel auth/app dans `AppNavigator.js`.
Police titre : `CormorantGaramond_700Bold`.
Thème : fond noir `#090909`, accent or `#E8A435`.

| Screen | Route | Description |
|--------|-------|-------------|
| `LoginScreen` | `Login` | Connexion / inscription |
| `HomeScreen` | `Home` | Liste des roadtrips (`useRoadtrips`) |
| `CreateRoadtripScreen` | `CreateRoadtrip` | Formulaire création |
| `RoadtripDetailScreen` | `RoadtripDetail` | Détail roadtrip + liste des étapes |
| `EditRoadtripScreen` | `EditRoadtrip` | Modifier roadtrip |
| `CreateStepScreen` | `CreateStep` | Formulaire nouvelle étape |
| `StepDetailScreen` | `StepDetail` | Détail étape + hébergement + activités |
| `EditStepScreen` | `EditStep` | Modifier étape |
| `CollaboratorsScreen` | `Collaborators` | Gestion membres du roadtrip |

**Pattern navigation post-création** (évite le spinner pendant la sync) :
```js
navigation.replace('RoadtripDetail', { id, title, roadtripData: roadtrip });
// Dans l'écran : syncedRoadtrip ?? roadtripData (fallback immédiat)
```

---

## 🏗️ Modèle de données (Prisma / PostgreSQL)

### Tables principales
| Table | Champs clés | Notes |
|-------|-------------|-------|
| `users` | id (cuid), email, name, avatarUrl, password, provider, isAdmin, pushToken | provider = "email" par défaut |
| `refresh_tokens` | id, token, userId, expiresAt, revokedAt | Stockage serveur |
| `roadtrips` | id, title, startDate, endDate, coverPhotoUrl, status, userId | status: DRAFT/PLANNED/ONGOING/COMPLETED |
| `steps` | id, roadtripId, userId, type, name, location, lat/lng, startDate, endDate, arrivalTime, departureTime, notes, photoUrl, order | type: DEPARTURE/STAGE/STOP/RETURN |
| `accommodations` | id, stepId (unique), roadtripId, userId, type, name, address, checkIn, checkOut, bookingRef, bookingUrl, pricePerNight, currency, status | type: HOTEL/AIRBNB/CAMPING/HOSTEL/OTHER |
| `activities` | id, stepId, roadtripId, userId, type, name, location, startTime, endTime, bookingRef, bookingUrl, cost, currency, notes, status, order | |
| `photos` | id, url, cloudinaryId, caption, isCover, isPending, stepId, roadtripId, accommodationId, userId | isPending = upload en attente |
| `roadtrip_members` | id, roadtripId, userId, role, status | role: OWNER/EDITOR/VIEWER, status: PENDING/ACCEPTED/DECLINED |
| `beta_feedbacks` | id, userId, message, rating, createdAt | |

### Enums
- `RoadtripStatus` : DRAFT, PLANNED, ONGOING, COMPLETED
- `StepType` : DEPARTURE, STAGE, STOP, RETURN
- `AccomType` : HOTEL, AIRBNB, CAMPING, HOSTEL, OTHER
- `BookingStatus` : PLANNED, CONFIRMED, CANCELLED

---

## ⚡ PowerSync — Architecture sync offline

### Schéma SQLite local (`schema.js`)
Tables : `roadtrips`, `steps`, `accommodations`, `activities`, `photos` (colonnes sont des `column.text` / `.real` / `.integer`).

### Sync Rules (`sync_rules.yaml`)
```yaml
bucket_definitions:
  user_roadtrips:            # roadtrips dont l'user est OWNER
    parameters:
      - SELECT id as roadtrip_id FROM roadtrips WHERE "userId" = token_parameters.user_id
    data:
      - SELECT * FROM roadtrips / steps / accommodations / activities / photos WHERE "roadtripId" = bucket.roadtrip_id

  shared_roadtrips:          # roadtrips partagés via membership ACCEPTED
    parameters:
      - SELECT "roadtripId" as roadtrip_id FROM roadtrip_members WHERE "userId" = token_parameters.user_id AND status = 'ACCEPTED'
    data:
      - SELECT * FROM roadtrips / steps / accommodations / activities / photos / roadtrip_members WHERE "roadtripId" = bucket.roadtrip_id
```

**Règles critiques :**
- Colonnes camelCase entre guillemets doubles : `"userId"`, `"roadtripId"`, `"startDate"`
- `token_parameters.user_id` (pas `.sub`) — claim explicite dans le JWT
- Pas de sous-requêtes dans les WHERE des sync rules

### Architecture lecture/écriture
- **Lecture** : `useQuery()` de `@powersync/react-native` → SQLite local, réactif, offline
- **Écriture** : `localWrite.js` → `db.execute()` direct en SQLite local, immédiat
- **Sync montante** : `connector.js::uploadData()` → traite la queue CRUD → `PUT/PATCH/DELETE /api/{table}/{id}` quand réseau disponible
- **Cascade manuelle** : SQLite local n'a pas de FK cascade → `localDeleteRoadtrip` supprime steps, activities, accommodations manuellement

### Connecteur (`connector.js`)
- `fetchCredentials()` : récupère le token PowerSync via `GET /api/auth/powersync-token`, gère le silent refresh si 401
- `uploadData()` : dépile `getCrudBatch(200)` → mappe chaque op (INSERT/UPDATE/DELETE) sur les routes REST

### Refresh token silencieux
- `authStore.silentRefresh()` : POST `/api/auth/refresh` → met à jour token + refreshToken dans le store Zustand persisté (AsyncStorage)
- Déclenché automatiquement dans `connector.js` si l'access token expire sous 60s

---

## 🗃️ Stores Zustand

### `authStore.js`
Persisté avec `zustand/persist` → AsyncStorage.
Contient : `user`, `token`, `refreshToken`, `login()`, `register()`, `logout()`, `silentRefresh()`, `updateUser()`.

### `roadtripStore.js`
Non persisté (source de vérité = SQLite PowerSync).
Expose : `createRoadtrip`, `updateRoadtrip`, `deleteRoadtrip`, `createStep`, `updateStep`, `deleteStep`, `createActivity`, `deleteActivity`, `createAccommodation`.
Chaque méthode délègue à `localWrite.js` — **aucun appel API direct**.

### Génération d'ID côté client
```js
// localWrite.js
export const generateId = () =>
  'c' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
```
→ Le backend expose `PUT /:id` (upsert) car l'ID est connu avant l'envoi.

---

## 🪝 Hooks (`usePowerSync.js`)

| Hook | Description |
|------|-------------|
| `useRoadtrips()` | Roadtrips owned (PowerSync réactif) + shared (fetch REST) |
| `useRoadtrip(id)` | 1 roadtrip + steps + accommodations + activities (réactif) |
| `useSteps(roadtripId)` | Étapes d'un roadtrip |
| `useStep(id)` | 1 étape + accommodation + activities |

---

## 🎨 Design System (`theme.js`)

```js
COLORS.bg = '#090909'          // fond principal
COLORS.surface = '#111111'     // cartes
COLORS.accent = '#E8A435'      // or — couleur principale
COLORS.text = '#F2EFE8'        // texte principal
COLORS.error = '#E85435'
COLORS.success = '#35C46A'

FONTS.title = 'CormorantGaramond_700Bold'
FONTS.body = undefined  // police système
```

---

## 🌐 Infrastructure

### Serveur CT 111 (LXC Proxmox, 192.168.1.111)
- Backend : Node.js via PM2 (`planyourtrip-api`), port 3000
- Frontend web : Nginx, sert `frontend/web/dist/`, proxy `/api/` → localhost:3000
- SSH alias : `ssh ct111`

### Base de données (Supabase, région Frankfurt)
- `DATABASE_URL` : pooler port 6543, `?pgbouncer=true` (obligatoire — évite `prepared statement "s0" already exists`)
- `DIRECT_URL` : connexion directe port 5432 (migrations Prisma + connexion PowerSync)
- Publication PostgreSQL : `CREATE PUBLICATION powersync FOR TABLE roadtrips, steps, accommodations, activities, photos`

### Scripts de déploiement
| Script | Action |
|--------|--------|
| `./deploy.sh "msg"` | git add + commit + push + deploy backend + build+deploy web + prompt save-context |
| `./deploy-backend.sh` | git pull CT111 + npm install + prisma migrate deploy + pm2 restart + health check |
| `./web-deploy.sh` | npm run build (Vite) + scp dist/ → CT111 + reload Nginx |
| `./dev-build.sh` | expo prebuild + gradle assembleDebug + adb install |
| `./release-build.sh` | gradle assembleRelease + adb install |
| `./save-context.sh` | collecte interactive du contexte → fichier `docs/contexts/` + inject dans copilot-instructions.md |

### Build Android
- `JAVA_HOME=C:\PROGRA~1\Java\jdk-20` (chemin court, pas d'espaces)
- Après `expo prebuild --clean` : vérifier que `gradle.properties` contient `org.gradle.java.home`
- `npx expo start -c` = Metro JS uniquement, pas de recompilation native

---

## 🔧 Décisions techniques importantes

| Décision | Raison |
|----------|--------|
| Dates en heure locale uniquement | Les dates sont des jours calendaires, pas des instants UTC (`toLocalDateString` / `fromLocalDateString`, jamais `.toISOString()`) |
| ID générés côté client | Permet l'écriture offline immédiate sans attendre le serveur |
| `PUT /:id` (upsert) sur le backend | Cohérent avec ID client-side |
| PowerSync token avec claim `user_id` explicite | `token_parameters.sub` ne fonctionne pas dans les sync rules PowerSync |
| `DATABASE_URL` avec pgbouncer | Évite l'erreur `prepared statement "s0" already exists` avec Prisma |
| `DIRECT_URL` sans pgbouncer | Nécessaire pour les migrations Prisma et la réplication PostgreSQL PowerSync |
| Lecture via PowerSync, écriture via `localWrite.js` | Séparation claire : lecture réactive offline-first, écriture immédiate locale |
| Cascade manuelle dans SQLite | SQLite local n'applique pas les FK cascade PostgreSQL |
| Firebase migré vers nouveau projet | Config EAS à jour, `google-services.json` exclu du git |

---

## ✅ Features implémentées (état production)

- **Auth complète** : register, login, logout, refresh token 90j, silent refresh auto
- **CRUD Roadtrips** : titre, dates, cover photo, statut (DRAFT/PLANNED/ONGOING/COMPLETED)
- **CRUD Steps** : type (DEPARTURE/STAGE/STOP/RETURN), localisation GPS, dates, horaires, notes
- **CRUD Accommodations** : par step, types (HOTEL/AIRBNB/CAMPING...), check-in/out, booking ref, prix
- **CRUD Activities** : par step, type, horaires, coût, booking
- **Photos** : upload Cloudinary, photo de couverture, rattachement step/roadtrip/hébergement
- **Collaboration** : partage roadtrip (EDITOR/VIEWER), invitations, gestion membres
- **Sync offline** : PowerSync (owned + shared roadtrips), écriture locale immédiate
- **Push notifications** : Expo push notifications (backend stocke pushToken)
- **Beta feedback** : modal + route backend
- **Géolocalisation** : LocationPicker, NearbySearchPanel (places à proximité), PlaceDetailModal
- **Frontend web** : dashboard Vite/Tailwind déployé sur CT 111

---

## 🚀 Prochaines étapes

- Définir la prochaine feature à implémenter
- Lancer `./save-context.sh` après chaque session de travail
