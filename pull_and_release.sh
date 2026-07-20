#!/bin/bash

# ─── pull_and_release.sh ─────────────────────────────────────────────────────
# Récupère les dernières modifs depuis GitHub, réinstalle les dépendances,
# et lance le build Android release.
#
# Utilisation :
#   ./pull_and_release.sh
#   ./pull_and_release.sh "message de commit"   # optionnel : commit + push local avant pull
# ────────────────────────────────────────────────────────────────────────────

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
RESET='\033[0m'

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"

echo -e "\n${YELLOW}════════════════════════════════════════${RESET}"
echo -e "${YELLOW}   PlanYourTrip — Pull + Release        ${RESET}"
echo -e "${YELLOW}════════════════════════════════════════${RESET}\n"

# ─── 1. Commit local si un message est passé en argument ────────────────────
if [ -n "$1" ]; then
  echo -e "${YELLOW}[1/5]${RESET} Commit des modifications locales..."
  cd "$ROOT_DIR"
  git add -A
  if git diff --cached --quiet; then
    echo -e "${GREEN}  → Aucune modification locale à commiter${RESET}"
  else
    git commit -m "$1"
    echo -e "${GREEN}  ✓ Commit local : $1${RESET}"
  fi
else
  echo -e "${YELLOW}[1/5]${RESET} Commit local ignoré (pas de message fourni)"
fi

# ─── 2. Pull depuis GitHub ──────────────────────────────────────────────────
echo -e "\n${YELLOW}[2/5]${RESET} Pull depuis GitHub..."
cd "$ROOT_DIR"
git pull origin main
echo -e "${GREEN}  ✓ Pull terminé${RESET}"

# ─── 3. Réinstallation des dépendances ─────────────────────────────────────
echo -e "\n${YELLOW}[3/5]${RESET} Réinstallation des dépendances (npm ci)..."
cd "$FRONTEND_DIR"
npm ci
echo -e "${GREEN}  ✓ Dépendances à jour${RESET}"

# ─── 4. Build ───────────────────────────────────────────────────────────────
echo -e "\n${YELLOW}[4/5]${RESET} Lancement du build Android..."
cd "$ROOT_DIR"
./release-build.sh
echo -e "${GREEN}  ✓ Build terminé${RESET}"

# ─── 5. Résumé ──────────────────────────────────────────────────────────────
echo -e "\n${GREEN}════════════════════════════════════════${RESET}"
echo -e "${GREEN}   Pull + Release terminé !            ${RESET}"
echo -e "${GREEN}════════════════════════════════════════${RESET}"
echo -e ""
echo -e "  APK disponible sur :"
echo -e "  http://192.168.1.117/downloads/planyourtrip.apk"
echo -e ""
