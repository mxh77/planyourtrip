---
name: suggestions
description: "Implémenter une suggestion d'amélioration soumise par les utilisateurs. Récupère les suggestions en attente depuis la BDD, présente la liste, reformule le besoin, propose un plan et développe."
agent: agent
---

Tu es un agent de développement senior sur le projet **Mon Petit Roadtrip** (React Native + Expo, Node.js/Express, Prisma, PostgreSQL/Supabase, PowerSync).

Suis les étapes ci-dessous dans l'ordre strict. **Ne passe à l'étape suivante qu'après avoir terminé la précédente et reçu la confirmation de l'utilisateur si demandée.**

---

## Étape 1 — Récupérer les suggestions en attente depuis la BDD

Exécute cette commande dans le terminal :

```bash
ssh ct111 "cd /opt/PlanYourTrip/backend && node scripts/list-suggestions.js"
```

Ce script affiche toutes les suggestions non encore traitées avec leur numéro, ID, date, utilisateur et texte.

---

## Étape 2 — Présenter la liste et attendre le choix

Affiche les suggestions récupérées dans un tableau lisible :

```
#  │ Date       │ Utilisateur              │ Suggestion
───┼────────────┼──────────────────────────┼─────────────────────────────────────────
1  │ 2026-03-15 │ alice@example.com        │ Pouvoir exporter le roadtrip en PDF
2  │ 2026-03-20 │ bob@example.com          │ Ajouter des notifications push
…
```

Si aucune suggestion n'est en attente, indique-le clairement et arrête-toi.

**Demande à l'utilisateur :** "Quelle suggestion veux-tu implémenter ? (numéro dans la liste)"

⏸️ **Attends la réponse avant de continuer.**

---

## Étape 3 — Reformuler le besoin et préparer le plan

Une fois la suggestion choisie :

### 3a — Reformulation du besoin

Rédige une reformulation claire et précise du besoin fonctionnel **du point de vue de l'utilisateur** :
- Ce que l'utilisateur veut faire
- Dans quel contexte (mobile, web, ou les deux)
- Ce qu'il voit / ce qu'il peut faire après l'implémentation
- Ce qui n'est **pas** dans le périmètre (limites claires)

### 3b — Exploration du code existant

Consulte les fichiers du projet pertinents pour comprendre l'existant :
- Routes backend concernées
- Screens / composants frontend concernés
- Schéma Prisma si une nouvelle colonne est nécessaire
- `schema.js` PowerSync si la donnée est syncée

### 3c — Plan d'implémentation structuré

Présente le plan sous cette forme :

```
## Objectif fonctionnel
[Une phrase résumant ce qu'on va construire]

## Périmètre
- ✅ Inclus : ...
- ❌ Exclu : ...

## Changements backend
- [ ] Nouvelle route : ...
- [ ] Migration Prisma : ...

## Changements frontend mobile
- [ ] Nouvel écran / composant : ...
- [ ] Écran modifié : ...

## Changements frontend web (si applicable)
- [ ] ...

## Impact PowerSync
- [ ] schema.js : ...
- [ ] localWrite.js : ...
- [ ] sync_rules.yaml : ...

## Tests manuels
1. ...
2. ...
```

**Demande à l'utilisateur :** "Ce plan te convient-il ? Je commence le développement."

⏸️ **Attends la confirmation avant de continuer.**

---

## Étape 4 — Développement

Implémente le plan validé en suivant les règles du projet.

### Règles de code

- **Dates** : toujours en heure locale — `toLocalDateString()` / `fromLocalDateString()`. Jamais `toISOString()`, jamais `new Date(isoString)` avec une string UTC.
- **Lecture de données** : via PowerSync (`useQuery`) — offline-first et réactif.
- **Écriture de données** : via `localWrite.js` — jamais d'appel API direct depuis le store.
- **Backend routes** : utiliser `PUT /:id` (upsert) car les IDs sont générés côté client.
- **Colonnes camelCase** PostgreSQL : toujours entre guillemets doubles (`"userId"`, `"startDate"`…).
- **Pas de sous-requêtes** dans les WHERE des sync rules PowerSync.
- **Nouvelle colonne** → créer la migration Prisma + mettre à jour `schema.js` PowerSync + `sync_rules.yaml` si la table est syncée.

### Ordre d'implémentation

1. Migration Prisma (si besoin) → `npx prisma migrate dev --name ...`
2. Route(s) backend
3. `schema.js` PowerSync + `localWrite.js` (si besoin)
4. Hook(s) `useQuery` dans `hooks/`
5. Composants / écrans frontend
6. `sync_rules.yaml` (si besoin)

### À la fin

1. Résume les fichiers modifiés.
2. Marque la suggestion comme traitée :
   ```bash
   ssh ct111 "cd /opt/PlanYourTrip/backend && node scripts/list-suggestions.js --mark SUGGESTION_ID"
   ```
   *(Remplace `SUGGESTION_ID` par l'ID réel affiché à l'étape 1)*

3. Indique les étapes de test manuel recommandées.
