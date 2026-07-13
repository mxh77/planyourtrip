---
name: deployment
description: Utiliser ce prompt pour pusher les dernières modifications sur GitHub. Analyse les changements, génère un message de commit et appelle le script deploy.sh.
---

Analyse les fichiers modifiés depuis le dernier commit en exécutant `git diff --staged`, `git status` et `git diff HEAD` dans le terminal, depuis la racine du projet `c:\MonPetitRoadtrip`.

Sur la base des modifications détectées, génère un message de commit **multi-lignes, détaillé et entièrement en français**, au format suivant :

```
type: titre résumant l'intention globale

- changement significatif 1 (fichier ou comportement)
- changement significatif 2
- changement significatif 3
…
```

Règles :
- Préfixe de la première ligne : `feat:` (nouveauté), `fix:` (bug), `refactor:` (restructuration), `style:` (UI), `chore:` (config/dépendances), `docs:` (documentation)
- Titre court et clair en minuscules (sauf noms propres/techniques)
- Ligne vide entre le titre et la liste à puces
- Chaque puce décrit un fichier modifié ou un comportement ajouté/corrigé
- Tout en français
- Si plusieurs types sont concernés, utilise le préfixe dominant

Puis exécute dans le terminal depuis `c:\MonPetitRoadtrip`. En bash, une chaîne entre guillemets peut s'étaler sur plusieurs lignes — utilise simplement :

```bash
./deploy.sh "feat: titre résumant l'intention globale

- changement 1
- changement 2
- changement 3"
```

Remplace le contenu par le message généré. Les sauts de ligne sont réels, pas de `\n` ni de syntaxe spéciale.

Après le push, confirme le succès en indiquant la branche et le message utilisés.