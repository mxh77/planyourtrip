#!/bin/bash
# save-context.sh — Sauvegarde automatique du contexte de conversation Copilot
# Génère le contenu depuis git (commits, fichiers modifiés) sans questions interactives.
#
# Usage : ./save-context.sh "nom-feature" ["notes libres optionnelles"]
#   ex : ./save-context.sh "auth-google"
#   ex : ./save-context.sh "chatbot-v2" "Prochaine étape : intégrer l'historique"
#
# Si aucun argument, le nom de la branche git est utilisé comme feature name.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTRUCTIONS_FILE="$SCRIPT_DIR/.github/copilot-instructions.md"
CONTEXTS_DIR="$SCRIPT_DIR/docs/contexts"
INJECT_SCRIPT="$SCRIPT_DIR/scripts/inject-context.js"
MAX_LINES=1000

# ─── Couleurs ────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
RESET='\033[0m'

mkdir -p "$CONTEXTS_DIR"

echo -e "\n${CYAN}════════════════════════════════════════════${RESET}"
echo -e "${CYAN}  Mon Petit Roadtrip — Sauvegarde contexte  ${RESET}"
echo -e "${CYAN}════════════════════════════════════════════${RESET}\n"

# ─── Infos Git ───────────────────────────────────────────────────────────────
DATE_FULL=$(date '+%Y-%m-%d %H:%M')
DATE_FILE=$(date '+%Y-%m-%d')
TIME_FILE=$(date '+%H%M%S')
BRANCH=$(git -C "$SCRIPT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "inconnu")
COMMIT_HASH=$(git -C "$SCRIPT_DIR" log -1 --pretty=format:"%h" 2>/dev/null || echo "?")
COMMIT_MSG=$(git  -C "$SCRIPT_DIR" log -1 --pretty=format:"%s"  2>/dev/null || echo "?")

# ─── Nom de la feature ───────────────────────────────────────────────────────
# Arg 1 → nom libre ; sinon on utilise le nom de la branche
# On ne garde que la première ligne (cas d'un message de commit multi-lignes)
if [ -n "$1" ]; then
  FEATURE_NAME=$(echo "$1" | head -1)
else
  FEATURE_NAME="$BRANCH"
fi
NOTES="${2:-}"  # Notes optionnelles (arg 2)

# Slug pour le nom de fichier : première ligne, max 50 caractères
FEATURE_SLUG=$(echo "$FEATURE_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//' | cut -c1-50 | sed 's/-$//')

# L'horodatage garantit l'unicité même pour plusieurs déploiements dans la même journée
CTX_FILE="$CONTEXTS_DIR/${DATE_FILE}_${TIME_FILE}_${FEATURE_SLUG}.md"

echo -e "  Feature : ${YELLOW}$FEATURE_NAME${RESET}"
echo -e "  Branche : ${YELLOW}$BRANCH${RESET}"
echo -e "  Commit  : ${YELLOW}$COMMIT_HASH — $COMMIT_MSG${RESET}"
echo -e "  Fichier : ${CYAN}docs/contexts/$(basename "$CTX_FILE")${RESET}\n"

# ─── Commits depuis le dernier fichier de contexte ───────────────────────────
# Cherche le commit de base en lisant le hash dans le fichier de contexte précédent
# (plus fiable que d'utiliser la date de création du fichier dans git)
LAST_CTX=$(ls -t "$CONTEXTS_DIR"/*.md 2>/dev/null | grep -v INDEX.md | head -1 || echo "")
BASE_COMMIT=""

if [ -n "$LAST_CTX" ]; then
  # Extraire le hash du commit depuis la ligne "**Commit :** `HASH — ...`"
  PREV_HASH=$(grep -oP '(?<=\*\*Commit :\*\* `)([a-f0-9]{7,40})' "$LAST_CTX" 2>/dev/null | head -1 || echo "")
  if [ -n "$PREV_HASH" ] && git -C "$SCRIPT_DIR" cat-file -e "${PREV_HASH}^{commit}" 2>/dev/null; then
    # Vérifier que le hash précédent n'est pas le même que HEAD (même session)
    HEAD_HASH=$(git -C "$SCRIPT_DIR" rev-parse --short HEAD)
    if [ "$PREV_HASH" != "$HEAD_HASH" ]; then
      BASE_COMMIT="$PREV_HASH"
    fi
  fi
fi

# Fallback si pas de base trouvée : remonter 10 commits
if [ -z "$BASE_COMMIT" ]; then
  COMMIT_COUNT=$(git -C "$SCRIPT_DIR" rev-list --count HEAD 2>/dev/null || echo "1")
  DEPTH=$(( COMMIT_COUNT < 10 ? COMMIT_COUNT - 1 : 10 ))
  if [ "$DEPTH" -gt 0 ]; then
    BASE_COMMIT=$(git -C "$SCRIPT_DIR" rev-parse "HEAD~${DEPTH}" 2>/dev/null || echo "")
  fi
fi

if [ -n "$BASE_COMMIT" ]; then
  RECENT_COMMITS=$(git -C "$SCRIPT_DIR" log --pretty=format:"- \`%h\` %s" "${BASE_COMMIT}..HEAD" 2>/dev/null | head -20 || echo "")
else
  RECENT_COMMITS=$(git -C "$SCRIPT_DIR" log --pretty=format:"- \`%h\` %s" -10 2>/dev/null || echo "")
fi

if [ -z "$RECENT_COMMITS" ]; then
  RECENT_COMMITS="- Aucun commit récent trouvé"
fi

# ─── Fichiers modifiés depuis le dernier contexte ────────────────────────────
CHANGED_RAW=""
if [ -n "$BASE_COMMIT" ]; then
  CHANGED_RAW=$(git -C "$SCRIPT_DIR" diff --name-only "${BASE_COMMIT}..HEAD" 2>/dev/null || echo "")
fi

# ─── Routes API ajoutées/modifiées ───────────────────────────────────────────
API_ROUTES=""
if [ -n "$CHANGED_RAW" ]; then
  CHANGED_ROUTES=$(echo "$CHANGED_RAW" | grep -E "^backend/src/routes" || true)
  if [ -n "$CHANGED_ROUTES" ]; then
    while IFS= read -r route_file; do
      ROUTE_PATH="$SCRIPT_DIR/$route_file"
      if [ -f "$ROUTE_PATH" ]; then
        ENDPOINTS=$(grep -E "router\.(get|post|put|patch|delete)\(" "$ROUTE_PATH" 2>/dev/null \
          | sed "s/router\.\([a-z]*\)('\([^']*\)'.*/  - \U\1\E \2/" | head -10 || true)
        if [ -n "$ENDPOINTS" ]; then
          API_ROUTES+="**$(basename "$route_file" .js)**:"$'\n'"$ENDPOINTS"$'\n'
        fi
      fi
    done <<< "$CHANGED_ROUTES"
  fi
fi

# ─── Nouveaux écrans mobiles ──────────────────────────────────────────────────
NEW_SCREENS=""
if [ -n "$BASE_COMMIT" ]; then
  NEW_SCREENS=$(git -C "$SCRIPT_DIR" diff --name-only --diff-filter=A "${BASE_COMMIT}..HEAD" 2>/dev/null \
    | grep "^frontend/src/screens/" | sed 's/^/  - /' || true)
fi

# ─── Nouvelles variables d'environnement ─────────────────────────────────────
NEW_ENV=""
if [ -n "$BASE_COMMIT" ]; then
  NEW_ENV=$(git -C "$SCRIPT_DIR" diff "${BASE_COMMIT}..HEAD" -- backend/.env.example backend/src/index.js 2>/dev/null \
    | grep "^+[A-Z_]*=" | grep -v "^+++" | sed 's/^+/  /' | head -10 || true)
fi
filter_files() {
  local raw="$1" pattern="$2" invert="$3"
  local result=""
  if [ -n "$raw" ]; then
    if [ "$invert" = "1" ]; then
      result=$(echo "$raw" | grep -vE "$pattern" 2>/dev/null || echo "")
    else
      result=$(echo "$raw" | grep -E "$pattern" 2>/dev/null || echo "")
    fi
    if [ -n "$result" ]; then
      echo "$result" | sed 's/^/  - /'
      return 0
    fi
  fi
  return 0
}

FRONTEND_FILES=$(filter_files "$CHANGED_RAW" "^frontend/src" "0")
BACKEND_FILES=$(filter_files  "$CHANGED_RAW" "^backend/src"  "0")
PRISMA_FILES=$(filter_files   "$CHANGED_RAW" "^backend/prisma" "0")
OTHER_FILES=$(filter_files    "$CHANGED_RAW" "^(frontend/src|backend/src|backend/prisma)" "1")

FILES_SECTION=""
if [ -n "$FRONTEND_FILES" ]; then FILES_SECTION+="**Frontend**"$'\n'"$FRONTEND_FILES"$'\n'; fi
if [ -n "$BACKEND_FILES"  ]; then FILES_SECTION+="**Backend**"$'\n'"$BACKEND_FILES"$'\n'; fi
if [ -n "$PRISMA_FILES"   ]; then FILES_SECTION+="**Prisma/DB**"$'\n'"$PRISMA_FILES"$'\n'; fi
if [ -n "$OTHER_FILES"    ]; then FILES_SECTION+="**Autres**"$'\n'"$OTHER_FILES"$'\n'; fi
if [ -z "$FILES_SECTION"  ]; then FILES_SECTION="Aucun fichier modifié détecté"; fi

# ─── Écriture du fichier de contexte ─────────────────────────────────────────
# ─── Écriture du fichier de contexte ─────────────────────────────────────────

# Sections optionnelles uniquement si non vides
API_ROUTES_SECTION=""
if [ -n "$API_ROUTES" ]; then
  API_ROUTES_SECTION=$'\n## 🌐 Routes API ajoutées / modifiées\n'"$API_ROUTES"
fi

NEW_SCREENS_SECTION=""
if [ -n "$NEW_SCREENS" ]; then
  NEW_SCREENS_SECTION=$'\n## 📱 Nouveaux écrans mobiles\n'"$NEW_SCREENS"
fi

NEW_ENV_SECTION=""
if [ -n "$NEW_ENV" ]; then
  NEW_ENV_SECTION=$'\n## 🔑 Nouvelles variables d\'environnement (backend/.env)\n'"$NEW_ENV"
fi

# Git log détaillé (diff --stat résumé pour les fichiers importants)
DIFF_STAT=""
if [ -n "$BASE_COMMIT" ]; then
  DIFF_STAT=$(git -C "$SCRIPT_DIR" diff --stat "${BASE_COMMIT}..HEAD" 2>/dev/null \
    | grep -E "\.(js|jsx|ts|tsx|prisma|sh|json).*\|" | head -20 || true)
fi
DIFF_STAT_SECTION=""
if [ -n "$DIFF_STAT" ]; then
  DIFF_STAT_SECTION=$'\n## 📊 Résumé des changements (lignes)\n```\n'"$DIFF_STAT"$'\n```'
fi

cat > "$CTX_FILE" << CTXEOF
# Contexte — $FEATURE_NAME

**Date :** $DATE_FULL | **Branche :** \`$BRANCH\` | **Commit :** \`$COMMIT_HASH — $COMMIT_MSG\`

## 🎯 Objectif de la session
$FEATURE_NAME

## ✅ Commits réalisés
$RECENT_COMMITS

## 🔧 Fichiers modifiés
$FILES_SECTION$API_ROUTES_SECTION$NEW_SCREENS_SECTION$NEW_ENV_SECTION$DIFF_STAT_SECTION

## 📌 État actuel du projet
- **Branche :** \`$BRANCH\`
- **Dernier commit :** \`$COMMIT_HASH\` — $COMMIT_MSG
- **Backend :** Node.js/Express + Prisma, déployé sur CT 111 (port 3111)
- **Frontend mobile :** Expo React Native, build Android via \`./build-android.sh\`
- **Frontend web :** React/Vite, déployé sur CT 111 (nginx)

## 🚀 Prochaines étapes
${NOTES:-À définir lors de la prochaine session.}

## ⚠️ Points d'attention pour la prochaine session
- Relire les fichiers modifiés listés ci-dessus avant de commencer
- Vérifier que le backend est bien redémarré si des routes ont changé
- Si des colonnes Prisma ont été ajoutées, s'assurer que les sync rules PowerSync sont à jour
CTXEOF

# ─── Validation taille (max 1000 lignes) ─────────────────────────────────────
LINE_COUNT=$(wc -l < "$CTX_FILE")
if [ "$LINE_COUNT" -gt "$MAX_LINES" ]; then
  echo -e "${RED}⚠ Attention : le fichier de contexte dépasse $MAX_LINES lignes ($LINE_COUNT lignes).${RESET}"
  echo -e "${YELLOW}→ Résume les sections pour rester sous la limite.${RESET}\n"
fi

# ─── Injection dans copilot-instructions.md ───────────────────────────────────
node "$INJECT_SCRIPT" "$CTX_FILE" "$INSTRUCTIONS_FILE" "$CONTEXTS_DIR"

echo -e "${GREEN}✓ docs/contexts/$(basename "$CTX_FILE") créé ($LINE_COUNT lignes)${RESET}"
echo -e "${GREEN}✓ copilot-instructions.md mis à jour${RESET}"
echo -e "${GREEN}✓ docs/contexts/INDEX.md mis à jour${RESET}"
echo -e "\n${CYAN}→ La prochaine conversation Copilot démarrera avec ce contexte.${RESET}\n"
