# Résumé

Passer l'affichage des roadtrips sur la page d'accueil Web d'une grille à 2 colonnes vers une grille à 3 colonnes, afin d'améliorer la densité d'information sur les écrans larges et de proposer une présentation plus aérée.

# Objectif métier

- **Augmenter la visibilité** : afficher plus de roadtrips dès la page d'accueil sans augmenter la hauteur de la page.
- **Améliorer l'exploration** : permettre à l'utilisateur de parcourir davantage d'options en un coup d'œil.
- **Moderniser l'interface** : aligner l'affichage sur les standards de design actuels (grille multi-colonnes).

# Périmètre inclus

- Modifications **uniquement sur la page d'accueil Web** (composant de liste de roadtrips).
- Adaptation du système de grille CSS (passage de 2 à 3 colonnes pour les breakpoints desktop).
- Ajustements des tailles des cards (largeur, espacements) pour s'adapter à la nouvelle colonne.
- Mise à jour des éventuelles règles de responsive existantes (breakpoints pour tablette/mobile).

# Hors périmètre

- Autres pages affichant une liste de roadtrips (recherche, favoris, profil).
- Refonte des cards individuelles (contenu, hauteur, image). Seulement l'adaptation de la largeur.
- Introduction de nouvelles fonctionnalités (filtres, pagination, tri).
- Modification des comportements de chargement ou de rendu côté serveur (si SSR).

# Impacts techniques

- **UI/Frontend** : modification ponctuelle du fichier CSS/Less/SCSS du composant de grille.
  - Passage de `grid-template-columns: repeat(2, 1fr)` à `repeat(3, 1fr)` pour les écrans ≥ ~1024px.
  - Ajustement des marges/gaps si nécessaire (`gap: 16px` ou `20px` selon le design).
  - Ajout d'un **breakpoint pour tablettes** (≥768px) : 2 colonnes.
  - Conservation de 1 colonne pour mobile (<768px).
- **Responsive** : vérifier que les cards ne deviennent pas trop étroites sur des écrans 1024-1200px (largeur ~300-350px). Si oui, ajouter une taille minimale (`minmax(280px, 1fr)`).
- **Images** : s'assurer que les images des cards supportent des largeurs plus petites sans déformation (utilisation de `object-fit: cover` et sources responsives `srcset` si applicable).
- **Accessibilité** : aucun changement structurel (ordre tab, labels), uniquement visuel.

# Proposition d'implémentation

1. **Modifier le fichier CSS du composant `RoadtripGrid`** (ou équivalent) :
   ```css
   .roadtrip-grid {
     display: grid;
     grid-template-columns: 1fr; /* mobile par défaut */
     gap: 16px;
   }

   @media (min-width: 768px) {
     .roadtrip-grid {
       grid-template-columns: repeat(2, 1fr);
     }
   }

   @media (min-width: 1024px) {
     .roadtrip-grid {
       grid-template-columns: repeat(3, 1fr);
     }
   }
   ```
   *Adapter les breakpoints à la charte existante (préférer `$breakpoint-md`, `$breakpoint-lg` si variables).*

2. **Ajuster la largeur des cards** : retirer toute largeur fixe sur les cards individuelles (elles doivent s'étendre librement dans leur colonne).

3. **Vérifier les marges/paddings** : si les cards avaient une marge auto pour centrer sur 2 colonnes, la supprimer.

4. **Tester sur les résolutions cibles** (1024, 1280, 1440, 1920) pour valider que 3 colonnes restent lisibles.

# Risques

- **Encombrement visuel** : si les cards contiennent beaucoup de texte (description longue), 3 colonnes peuvent devenir trop denses. Solution : tronquer la description (max 2 lignes) via CSS.
- **Dégradation mobile** : bien gérer les breakpoints pour éviter un affichage 3 colonnes sur écran trop petit (mobile paysage à 600px). Utiliser `min-width: 1024px` pour la 3e colonne.
- **Performance** : aucun impact mesurable (pas de JS modifié, juste CSS).

# Tests à prévoir

- Tests **responsives** manuels (mobile 375px, tablette 768px, desktop 1024px, grand écran 1440px).
- Vérifier que les cards ne se chevauchent pas et que le `gap` est homogène.
- Tester avec un nombre d'éléments inférieur à 3 (ex: 1 seul roadtrip – centrage ? À définir).
- Tester avec un nombre d'éléments non multiple de 3 (ex: 5 éléments – les 2 dernières colonnes doivent rester alignées à gauche).
- **Tests visuels** : comparer les captures avant/après (sur desktop) pour valider l'aspect esthétique.
- **Tests d'accessibilité** : pas de régression sur l'ordre de tabulation (vérifier avec `Tab`).

# Checklist de validation

- [ ] Le composant de grid utilise `repeat(3, 1fr)` sur les écrans ≥1024px.
- [ ] Les breakpoints `768px` et `1024px` sont correctement implémentés.
- [ ] Aucune card n'a de largeur fixe.
- [ ] Les images s'adaptent sans distorsion.
- [ ] La page d'accueil s'affiche correctement avec 1, 2, 3, 4, 5... roadtrips.
- [ ] Aucune régression sur les autres pages (recherche, favoris,…) – hors périmètre.
- [ ] La modification est uniquement CSS (aucun changement JS/HTML).
- [ ] Revue de design validée par l'équipe produit (si besoin).
