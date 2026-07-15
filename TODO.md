# PlanYourTrip — TODO

> Liste des fonctionnalités, améliorations et corrections à venir.
> Proposées par Maxime, validées et ajoutées par l'agent Hermes.

## 🔧 Diagnostics & Bugs en cours

- [x] **System de diagnostic pour boucle refresh** — Session 2026-07-15
  - [x] Créé `LogsViewer.js` component pour visualiser logs en temps réel
  - [x] Amélioré `logger.js` avec détection auto de boucles (< 100ms)
  - [x] Instrumenté `RoadtripDetailScreen.js` avec logs aux points critiques
  - [x] Documentation complète: `DIAGNOSTIC_GUIDE.md`, `TEST_LOGSVIEWER.md`
  - [x] Bouton 📋 ajouté dans toolbar
  - ⏳ En attente: User teste le system et envoie les logs de la boucle
  - ⏳ À faire: Analyser logs et corriger la cause (dépendance useEffect manquante?)

## Fonctionnalités

- [ ] **Ajouter des activités aux étapes** — Permettre d'ajouter une ou plusieurs activités (randonnée, restaurant, visite, etc.) à une étape, avec nom, description, statut (À planifier / Prét).

