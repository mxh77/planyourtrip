#!/bin/bash

# Génère deploy.sh et .github/prompts/deployment.prompt.md dans le projet courant.
# Usage : bash setup-deploy.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RESET='\033[0m'

# ─── deploy.sh ───────────────────────────────────────────────────────────────
cat > deploy.sh << 'EOF'
#!/bin/bash

# Usage: ./deploy.sh "message de commit"

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
RESET='\033[0m'

if [ -z "$1" ]; then
  echo -e "${RED}✗ Message de commit manquant.${RESET}"
  echo -e "  Usage : ${YELLOW}./deploy.sh \"message\"${RESET}"
  exit 1
fi

MSG="$1"
BRANCH=$(git rev-parse --abbrev-ref HEAD)

echo -e "\n${YELLOW}→ Branche :${RESET} $BRANCH"
echo -e "${YELLOW}→ Message :${RESET}\n$MSG\n"

echo -e "${YELLOW}[1/3]${RESET} Staging des fichiers..."
git add .

if git diff --cached --quiet; then
  echo -e "${YELLOW}⚠ Aucun changement à committer.${RESET}"
  exit 0
fi

echo -e "${YELLOW}[2/3]${RESET} Commit..."
git commit -m "$MSG"

echo -e "${YELLOW}[3/3]${RESET} Push vers origin/$BRANCH..."
git push origin "$BRANCH"

echo -e "\n${GREEN}✓ Déployé avec succès sur origin/$BRANCH${RESET}\n"
EOF

chmod +x deploy.sh
echo -e "${GREEN}✓${RESET} deploy.sh créé"

# ─── .github/prompts/deployment.prompt.md ────────────────────────────────────
mkdir -p .github/prompts

cat > .github/prompts/deployment.prompt.md << 'EOF'
---
name: deployment
description: Analyse les changements, génère un message de commit en français et exécute deploy.sh.
---

Analyse les fichiers modifiés en exécutant `git diff --staged`, `git status` et `git diff HEAD` dans le terminal, depuis la racine du projet.

Sur la base des modifications détectées, génère un message de commit **multi-lignes, détaillé et entièrement en français** :

```
type: titre résumant l'intention globale

- changement significatif 1
- changement significatif 2
…
```

Règles :
- Préfixe : `feat:`, `fix:`, `refactor:`, `style:`, `chore:`, `docs:`
- Titre court en minuscules (sauf noms propres/techniques)
- Ligne vide entre titre et liste
- Chaque puce décrit un fichier modifié ou un comportement ajouté/corrigé
- Tout en français

Puis exécute dans le terminal depuis la racine du projet :

```bash
./deploy.sh "feat: titre résumant l'intention globale

- changement 1
- changement 2"
```

Les sauts de ligne sont réels, pas de `\n` ni de syntaxe spéciale.
Confirme le succès en indiquant la branche et le message utilisés.
EOF

echo -e "${GREEN}✓${RESET} .github/prompts/deployment.prompt.md créé"
echo -e "\n${GREEN}✓ Prêt. Lance ./deploy.sh \"message\" pour déployer.${RESET}\n"
