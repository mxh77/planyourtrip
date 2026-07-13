# Résumé
Passer le nombre de colonnes d'affichage des roadtrips sur la page d'accueil Web de 3 à 2, afin d’améliorer la lisibilité et la présentation des cartes, les utilisateurs trouvant les 3 colonnes trop serrées sur desktop.

# Objectif métier
- Améliorer l’expérience utilisateur sur la page d’accueil en offrant plus d’espace à chaque roadtrip (texte, image, bouton).
- Répondre au retour de Maxime, représentatif d’une attente de confort visuel.
- Augmenter le taux de clics sur les roadtrips en rendant chaque carte plus aérée et lisible.

# Périmètre inclus
- **Page concernée** : page d’accueil Web (uniquement la version desktop / grand écran).
- **Composant concerné** : la grille/liste des roadtrips (section principale).
- **Nombre de colonnes** : passer de `3` à `2` sur les écrans ≥ 992 px (ou breakpoint défini par le projet).

# Hors périmètre
- Pages autres que l’accueil (ex : pages de catégorie, favorites, profil).
- Version mobile / tablette (le responsive actuel gère déjà 1 colonne en mobile, 2 en tablette – reste inchangé).
- Contenu des cartes lui-même (images, textes, boutons) – seul le layout de grille change.
- Changement du nombre d’éléments chargés (pagination) ou du tri.

# Impacts techniques
- **CSS** : modification de la règle `grid-template-columns` (ou `flex-basis`) pour la classe de la grille des roadtrips.
- **Templates** : si la largeur des cartes était calculée dynamiquement par un `col-4`, passer en `col-6` (ou `col-md-6`).
- **Responsive** : vérifier les breakpoints existants (mobile 1 colonne, tablette 2 colonnes, desktop 3 colonnes → passer desktop à 2 colonnes). Il faudra peut-être ajuster la répartition des breakpoints (2 colonnes plus tôt).
- **Images** : les images des cartes étant déjà responsives (max-width: 100%), leur taille s’adaptera automatiquement à la nouvelle largeur de colonne.
- **Accessibilité / SEO** : aucun impact direct.

# Proposition d’implémentation
1. **Identifier le fichier** : selon l’architecture du projet (React, Vue, Jinja, etc.), localiser le composant / template qui génère la grille des roadtrips sur la page d’accueil.
2. **Modifier la classe CSS** :
   - Avant : `grid-template-columns: repeat(3, 1fr);` (ou `.col-4`)
   - Après : `grid-template-columns: repeat(2, 1fr);` (ou `.col-6`)
3. **Ajuster les breakpoints** (exemple CSS) :
   ```css
   .roadtrip-grid {
     display: grid;
     grid-template-columns: repeat(2, 1fr); /* desktop : 2 colonnes */
     gap: 1.5rem;
   }
   @media (max-width: 768px) {
     .roadtrip-grid {
       grid-template-columns: 1fr; /* mobile : 1 colonne */
     }
   }
   ```
   Si le projet utilise Bootstrap ou Tailwind, adapter les classes correspondantes.
4. **Vérifier la cohérence** : aucun autre composant ne partage la même classe.
5. **Mettre à jour les tests visuels** (captures d’écran) si un outil de snapshot est utilisé.

# Risques
- **Rupture responsive** : si le breakpoint desktop n’est pas assez haut (>1200px), une largeur de 2 colonnes peut paraître trop étirée sur des écrans très larges. Solution : limiter la largeur max du conteneur ou passer à `repeat(auto-fill, minmax(350px, 1fr))` pour un comportement adaptatif.
- **Débordement de texte** : les cartes étant plus larges, le texte plus long pourrait déformer le design. Vérifier que les titres/description ont un `max-height` ou `text-overflow: ellipsis` fonctionnel.
- **Impact sur la pagination** : le passage de 3 à 2 colonnes réduit le nombre de cartes visibles par ligne, donc la hauteur de la page augmente. Vérifier qu’aucune mise en page en dessous (footer, etc.) n’est affectée.
- **Régressions** : s’assurer que les autres pages utilisant le même composant (si partagé) ne sont pas impactées – mais le périmètre exclut les autres pages.

# Tests à prévoir
1. **Tests visuels / manuels** :
   - Navigateur desktop (1920×1080, 1366×768) : les roadtrips doivent s’afficher sur 2 colonnes, bien espacés.
   - Tablette (768-992px) : 2 colonnes si le breakpoint le permet, ou 1 colonne si déjà défini autrement.
   - Mobile (320-480px) : 1 colonne.
2. **Test de contenu long** : ajouter un roadtrip avec titre long + description longue → vérifier qu’il ne déborde pas.
3. **Test de défilement** : s’assurer que le scroll vertical fonctionne et que le footer n’est pas masqué.
4. **Test de régression** : naviguer sur les pages non concernées (catégories, favoris) pour confirmer qu’aucune n’a changé de layout.

# Checklist de validation
- [ ] Le code a été modifié dans le composant / template de la page d’accueil uniquement.
- [ ] La grille affiche bien 2 colonnes sur desktop (≥ breakpoint choisi).
- [ ] Les breakpoints responsive (mobile, tablette) restent inchangés et fonctionnent.
- [ ] Les images des cartes s’adaptent sans distorsion.
- [ ] Le texte des cartes n’est pas coupé ou débordant.
- [ ] Aucun composant partagé n’a été impacté.
- [ ] Les tests visuels (captures d’écran) sont mis à jour si nécessaire.
- [ ] Revue de code effectuée par un pair.
- [ ] Validation UX/Design avant mise en production (si applicable).
