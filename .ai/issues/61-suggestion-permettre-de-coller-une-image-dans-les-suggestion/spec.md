# Résumé
Permettre aux utilisateurs de coller (Ctrl+V) une image directement dans le champ de suggestion en complément du bouton d’ajout existant. L’image collée doit être validée, affichée sous forme de miniature immédiatement dans la zone de saisie, puis envoyée avec le formulaire. Cette fonctionnalité s’applique à toute zone de saisie de suggestion (création et édition).

# Objectif métier
- Réduire la friction lors de l’ajout d’illustrations : les utilisateurs n’ont plus besoin de télécharger puis cliquer sur un bouton.
- Accélérer le processus de soumission de feedback visuel (captures d’écran, photos, schémas).
- Offrir une expérience moderne et intuitive (comportement attendu par les utilisateurs d’applications web modernes).
- Augmenter le taux de complétion des suggestions contenant des images.

# Périmètre inclus
1. Collage depuis le presse-papier (Ctrl+V / Cmd+V) dans la zone de texte principale de création d’une suggestion.
2. Collage également dans la zone de texte lors de l’édition d’une suggestion existante.
3. Validation du type MIME de l’image (PNG, JPEG, GIF, WebP, SVG) et de la taille (limite configurable, par défaut 5 Mo).
4. Affichage d’une miniature carrée ou proportionnelle (ex. 150x150 px) après collage, avec un bouton de suppression (croix) et indication du nom de fichier (ex. `collé.png`).
5. Comportement identique au clic sur le bouton « Ajouter » : l’image collée est ajoutée à la même collection d’images, peut être multiple (si plusieurs collages successifs).
6. Prise en charge du format d’image depuis le `DataTransfer` (clipboardData.items).
7. Gestion des erreurs (formats non supportés, taille excessive) avec notification utilisateur (toast/alerte).

# Hors périmètre
- Collage d’images dans les commentaires ou autres champs (sauf évolution future).
- Redimensionnement ou édition de l’image avant envoi (recadrage, filtres).
- Drag & drop d’images (sujet d’une autre issue séparée).
- Support du collage depuis des fichiers système (images non présentes dans le presse-papier).
- Mise en cache côté client ou stockage local des images collées non soumises.
- Gestion du collage depuis des sources non-images (fichiers, texte, etc.).

# Impacts techniques
- **Frontend** : Ajout d’un écouteur `paste` sur la zone de texte. Récupération via `clipboardData.items`. Parcours pour trouver les items de type `image/*`. Lecture via `FileReader` ou `URL.createObjectURL` pour générer un objet File. Intégration avec le composant existant de prévisualisation des images (actuellement dédié au bouton upload). Ajout d’un champ caché ou ajout à la liste `files` déjà présente.
- **Backend** : Aucun changement attendu car l’image collée sera traitée comme un fichier uploadé classique (multipart/form-data). Vérifier que le backend accepte bien les fichiers provenant du champ input généré dynamiquement ou directement via FormData.
- **Base de données** : Aucune modification de schéma.
- **Tests** : La fonctionnalité repose sur l’API Clipboard (clipboardData). À tester selon les navigateurs (Chrome, Firefox, Safari, Edge). Safari nécessite attention car support partiel du clipboard API pour images (test supplémentaire).

# Proposition d’implémentation

## Etape 1 – Écouteur `paste` sur la textarea
```javascript
const textarea = document.getElementById('suggestion-textarea');
textarea.addEventListener('paste', (event) => {
  const items = event.clipboardData.items;
  let imageFound = false;
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.startsWith('image/')) {
      event.preventDefault(); // empêche collage texte
      const file = items[i].getAsFile();
      if (file) {
        // validation taille et type
        if (validateImage(file)) {
          addImagePreview(file);
          // ajouter à la liste des fichiers à envoyer
          uploadQueue.push(file);
        }
      }
      imageFound = true;
    }
  }
  // si non-image, laisser le comportement normal (collage texte)
  if (!imageFound) {
    // ne pas empêcher
  }
});
```

## Etape 2 – Validation et prévisualisation
- Fonction `validateImage(file)` : vérifie `file.type` dans une liste autorisée, `file.size <= MAX_SIZE`.
- Fonction `addImagePreview(file)` : crée une miniature (blob URL ou FileReader). Ajoute un `div` dans le conteneur de prévisualisation existant, avec une croix de suppression. Au clic suppression, retirer de `uploadQueue` et révoquer l’URL.
- Réutiliser le composant `ImagePreview` existant (si présent) en lui passant le fichier.

## Etape 3 – Soumission du formulaire
- Lors de l’envoi, construire un `FormData` incluant le texte et tous les fichiers de la queue (y compris les images collées). Les fichiers collés sont des objets `File` natifs, ils peuvent être directement ajoutés au FormData.
- Si le backend utilise déjà un champ multiple `files[]`, l’envoyer ainsi.

## Etape 4 – Gestion des erreurs
- `file.size > MAX_SIZE` : afficher toast “Image trop volumineuse (max 5 Mo)”.
- `file.type` non supporté : toast “Format d’image non accepté”.
- Aucune image lue : ignorer silencieusement.

## Etape 5 – Tests cross-browser
- Safari : utiliser `onpaste` et vérifier `clipboardData.files` en fallback si `items` n’est pas disponible.

# Risques
| Risque | Probabilité | Impact | Atténuation |
|--------|-------------|--------|-------------|
| Collage échoue sur Safari (API Clipboard partielle) | Moyenne | Élevé | Fallback vers `event.clipboardData.files` (déprécié mais fonctionne). |
| Utilisateur colle une image dans une zone qui ne doit pas recevoir d’image (ex. titre) | Faible | Faible | Limiter l’écouteur au champ texte principal uniquement. |
| Collage d’image génère un double upload si l’utilisateur clique aussi sur “Ajouter” | Faible | Moyen | Empiler dans la même liste, déduplication par hash non nécessaire pour la v1. |
| Taille d’image > limite côté serveur | Faible | Moyen | Vérifier côté client avant upload. |
| Comportement différent si plusieurs images collées d’un coup | Faible | Faible | Boucler sur items, traiter chaque image indépendamment. |

# Tests à prévoir
1. **Test unitaire** : Validation des fonctions `validateImage`, `addImagePreview` (mock DOM).
2. **Test intégration** : Simulation de l’événement `paste` avec un Blob image. Vérifier que le fichier est bien ajouté à la queue et que la miniature apparaît.
3. **Test de soumission** : Envoyer un formulaire avec une image collée, vérifier que le backend reçoit le fichier et qu’il est stocké correctement.
4. **Test multi-collage** : Coller plusieurs images successives, vérifier la liste.
5. **Test suppression** : Cliquer sur la croix d’une miniature collée, vérifier que la file est mise à jour.
6. **Test limites** : Coller une image trop grande ( > 5 Mo ) → message d’erreur, pas d’ajout. Coller un fichier non image (PDF) → pas d’effet (collage texte normal).
7. **Test navigateurs** : Chrome, Firefox, Safari, Edge – vérifier le comportement `paste`, notamment Safari où l’API diffère.
8. **Test régression** : Vérifier que le bouton “Ajouter” existant fonctionne toujours correctement (upload classique).

# Checklist de validation
- [ ] L’utilisateur peut coller une image (Ctrl+V) dans la zone de suggestion.
- [ ] Une miniature de l’image collée apparaît immédiatement, avec une option de suppression.
- [ ] Le collage n’interfère pas avec le texte saisi (sauf si l’image est collée seule).
- [ ] Les formats acceptés (PNG, JPEG, GIF, WebP, SVG) sont validés.
- [ ] La taille maximale (5 Mo) est vérifiée côté client.
- [ ] Les images collées sont envoyées avec le formulaire lors de la soumission.
- [ ] En cas d’erreur (format/taille), un message explicite est affiché.
- [ ] Fonctionne sur Chrome, Firefox, Safari (dernières versions) et Edge.
- [ ] Le comportement du bouton “Ajouter” existant reste inchangé.
- [ ] Aucun crash ni plantage lors de collage rapide multiple.
- [ ] Documentation mise à jour (aide en ligne, tooltip éventuel “Vous pouvez également coller une image depuis votre presse-papier”).
