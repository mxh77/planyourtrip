# Spécification fonctionnelle – Coller une image dans les suggestions

## Résumé
Permettre aux utilisateurs de coller une image directement depuis le presse-papiers (Ctrl+V) dans le champ de texte des suggestions. L'image sera automatiquement téléversée sur un stockage dédié et insérée en Markdown (`![alt](url)`).

## Objectif métier
- Fluidifier l'ajout d'illustrations dans les suggestions (captures d'écran, prototypes, maquettes)
- Réduire la friction : supprimer l'étape "enregistrer → glisser-déposer" ou "héberger → copier URL"
- Améliorer la complétude des suggestions (visuel → meilleure compréhension)

## Périmètre inclus
- Champ d'édition des suggestions (textarea ou éditeur Markdown riche)
- Collage via navigator.clipboard.read() (images seul) – prise en charge des formats PNG, JPEG, GIF, WebP
- Télèversement automatique côté frontend → endpoint API dédié `/api/uploads`
- Stockage des fichiers : bucket S3 (ou équivalent Cloudinary / serveur local) avec URL signée
- Insertion du Markdown image dans le champ de texte après upload réussi
- Gestion des erreurs : fichier trop volumineux **(limite 20 Mo)**, format non supporté, échec réseau
- Nettoyage des images orphelines (non associées à une suggestion finalisée) – job background

## Hors périmètre
- Collage depuis le système de fichiers (glisser-déposer déjà existant – à vérifier)
- Prise en charge de vidéos, PDF ou autres types MIME
- Édition/cadrage/redimensionnement de l'image dans l'interface
- Support du presse-papiers hérité (e.g. IE11 / navigateurs non‑modernes) – dégradation silencieuse
- Upload depuis mobile (caméra) – pourra être ajouté ultérieurement

## Impacts techniques

| Composant        | Impact                                                                                                                                     |
|------------------|--------------------------------------------------------------------------------------------------------------------------------------------|
| Frontend (React) | - Écouter `paste` sur le champ éditeur<br>- Lire image via `clipboard.items`<br>- Convertir en Blob → FormData <br>- Appel POST `/api/uploads`<br>- Attendre réponse → insérer `![alt](url)` dans le contenu |
| Backend (API)    | - Nouvel endpoint POST `/api/uploads` (multipart/form-data)<br>- Validation : taille max **20 Mo**, types autorisés (image/png, image/jpeg, image/gif, image/webp)<br>- Sauvegarde fichier sur S3 (clé UUID + extension)<br>- Retourner `{ "url": "..." }`                     |
| Stockage         | - Ajout d’un bucket S3 (ou répertoire local) avec CORS autorisé depuis le frontend<br>- Politique de durée de vie : 30 jours pour les fichiers orphelins (liés à aucune suggestion) |
| Base de données  | - Optionnel : table `uploads` (id, url, user_id, status, created_at) pour traçabilité et nettoyage                                          |
| CI/CD            | - Ajout variables d’environnement `S3_BUCKET`, `S3_REGION`, `UPLOAD_MAX_SIZE=20` (en Mo)                                                              |

## Proposition d'implémentation

### 1. Frontend (exemple avec React)

```javascript
const MAX_UPLOAD_SIZE = 20 * 1024 * 1024; // 20 Mo

const handlePaste = async (e) => {
  const items = e.clipboardData.items;
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      e.preventDefault();
      const file = item.getAsFile();
      // Valider taille (max 20 Mo)
      if (file.size > MAX_UPLOAD_SIZE) {
        notifyError("L'image ne doit pas dépasser 20 Mo");
        return;
      }
      // Upload
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();
      // Insérer en Markdown dans le champ (textarea)
      const markdown = `![image](${url})`;
      insertAtCursor(markdown);
    }
  }
};
```

### 2. Backend – Endpoint POST `/api/uploads`

- Vérifier authentification (JWT / session)
- Lire `req.file` (multer ou busboy)
- Valider `mimetype` (image/png, image/jpeg, image/gif, image/webp)
- Vérifier taille ≤ 20 Mo via `limits.fileSize = 20 * 1024 * 1024`
- Générer UUID + extension → upload vers S3 (clé: `uploads/{uuid}.{ext}`)
- Enregistrer en DB (optionnel)
- Retourner `{ "url": "https://cdn.exemple.com/uploads/{uuid}.{ext}" }`

### 3. Nettoyage des orphelins

- Job cron (quotidien) : supprimer les fichiers uploadés il y a >30 jours sans association à une suggestion (si table `uploads` avec `suggestion_id` nullable)
- Ou utiliser les URL signées S3 avec expiration.

## Risques

| Risque                                          | Probabilité | Impact | Mitigation                                                                 |
|-------------------------------------------------|-------------|--------|----------------------------------------------------------------------------|
| Upload de fichiers malveillants (scripts JS)    | Faible      | Élevé  | - Valider MIME strict et extension<br>- Scanner antivirus (ClamAV) optionnel |
| Dépassement de quota / explosion coûts stockage | Moyen       | Moyen  | - Limiter taille fichier (20 Mo)<br>- Limiter uploads par heure (rate‑limit)<br>- Nettoyage automatique |
| Collage non supporté sur navigateurs obsolètes  | Moyen       | Faible  | - Dégradation silencieuse (aucun collage)<br>- Aucun blocage fonctionnel    |
| Fuite de données sensibles via URL d'image      | Faible      | Élevé  | - URL signées temporaires<br>- Contrôle d'accès sur les images privées      |
| Double collage rapide (race condition)          | Faible      | Faible  | - Désactiver le bouton d'envoi pendant upload<br>- File unique par collage |

## Tests à prévoir

### Tests unitaires (Backend)
- Validation des types MIME (accepte png/jpeg/gif/webp, rejette svg/pdf)
- Validation de la taille (limite 20 Mo) – fichier de 19.9 Mo accepté, 20.1 Mo rejeté
- Échec en absence d'authentification
- Réponse correcte (statut 200 + URL valide)
- Erreur 413 si fichier trop gros

### Tests d'intégration (Frontend + Backend)
- Collage depuis le presse-papiers d’un PNG généré par screenshot (< 20 Mo)
- Collage depuis une image copiée depuis un site web (< 20 Mo)
- Collage d’un fichier non‑image (texte, HTML) → aucune action
- Collage d’une image > 20 Mo → message d’erreur + pas d’insertion
- Collage multiple (plusieurs images en une fois) → seul le premier est uploadé (ou tous ? nécessite clarification)
- Vérification insertion Markdown correcte dans le champ

### Tests de non‑régression
- Le collage de texte normal (non image) continue de fonctionner
- Le glisser‑déposer existant n’est pas cassé
- L’éditeur Markdown existant (sans image) reste inchangé

### Tests de performance / sécurité
- Upload de 100 images simultanées (rate‑limit)
- Vérification que les images uploadées ne sont pas accessibles publiquement sans authentification

## Checklist de validation

- [ ] L’événement `paste` est intercepté uniquement pour les images
- [ ] L’upload est asynchrone et n’empêche pas la saisie utilisateur
- [ ] Un indicateur de chargement (spinner) est affiché pendant l’upload
- [ ] En cas d’échec, l’utilisateur est informé sans perte de son texte saisi
- [ ] L’URL générée est valide et accessible (authentification requise si privée)
- [ ] Les fichiers orphelins sont nettoyés automatiquement (cron ou TTL)
- [ ] La documentation développeur est mise à jour (nouvel endpoint, variables d’environnement)
- [ ] Les tests unitaires et d’intégration passent en CI
- [ ] Le feature flag permet d’activer/désactiver la fonctionnalité sans déploiement

**Remarque :** La limite de taille a été volontairement fixée à **20 Mo** pour trouver un équilibre entre qualité des illustrations et contrainte de stockage.