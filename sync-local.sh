#!/bin/bash

# Synchronise l'environnement local après un déploiement fait via DevHub sur CT111
# Usage : ./sync-local.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
RESET='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "\n${CYAN}══════════════════════════════════════════${RESET}"
echo -e "${CYAN}     Sync local ← CT111 (DevHub)          ${RESET}"
echo -e "${CYAN}══════════════════════════════════════════${RESET}\n"

# ─── 1. Vérifier les changements locaux non commités ─────────────────────────
echo -e "${YELLOW}[1/4]${RESET} Vérification des changements locaux..."
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo -e "${RED}✗ Des changements locaux non commités sont présents.${RESET}"
  echo -e "  Committez ou stashez-les avant de synchroniser :"
  echo -e "    ${YELLOW}git stash${RESET}  ou  ${YELLOW}git add . && git commit -m \"WIP\"${RESET}"
  exit 1
fi
echo -e "${GREEN}✓ Aucun changement local en attente${RESET}"

# ─── 2. git pull ─────────────────────────────────────────────────────────────
echo -e "${YELLOW}[2/4]${RESET} Récupération des derniers commits..."
BEFORE=$(git rev-parse HEAD)
git pull
AFTER=$(git rev-parse HEAD)

if [ "$BEFORE" = "$AFTER" ]; then
  echo -e "${GREEN}✓ Déjà à jour (aucun nouveau commit)${RESET}"
  echo -e "\n${CYAN}══ Synchronisation terminée (rien à faire) ═══${RESET}\n"
  exit 0
fi

echo -e "${GREEN}✓ Pull effectué${RESET}"
echo -e "\n${CYAN}Nouveaux commits :${RESET}"
git log --oneline "$BEFORE".."$AFTER"
echo ""

# ─── 3. Détecter si des migrations Prisma ont été ajoutées ───────────────────
echo -e "${YELLOW}[3/4]${RESET} Vérification des migrations Prisma..."
NEW_MIGRATIONS=$(git diff --name-only "$BEFORE" "$AFTER" | grep "^backend/prisma/migrations/" || true)

if [ -n "$NEW_MIGRATIONS" ]; then
  echo -e "${YELLOW}⚠ Nouvelles migrations détectées :${RESET}"
  echo "$NEW_MIGRATIONS" | sed 's/^/    /'
  echo ""
  echo -e "  Application des migrations..."
  cd "$SCRIPT_DIR/backend"
  npx prisma migrate deploy
  npx prisma generate
  cd "$SCRIPT_DIR"
  echo -e "${GREEN}✓ Migrations appliquées et client Prisma régénéré${RESET}"
else
  # Vérifier si schema.prisma a changé (pour régénérer le client même sans migration)
  SCHEMA_CHANGED=$(git diff --name-only "$BEFORE" "$AFTER" | grep "^backend/prisma/schema.prisma" || true)
  if [ -n "$SCHEMA_CHANGED" ]; then
    echo -e "${YELLOW}⚠ schema.prisma modifié — régénération du client Prisma...${RESET}"
    cd "$SCRIPT_DIR/backend"
    npx prisma generate
    cd "$SCRIPT_DIR"
    echo -e "${GREEN}✓ Client Prisma régénéré${RESET}"
  else
    echo -e "${GREEN}✓ Aucune migration à appliquer${RESET}"
  fi
fi

# ─── 4. Détecter si des dépendances npm ont changé ───────────────────────────
echo -e "${YELLOW}[4/4]${RESET} Vérification des dépendances npm..."
PACKAGE_CHANGED=$(git diff --name-only "$BEFORE" "$AFTER" | grep "package.json" || true)

if [ -n "$PACKAGE_CHANGED" ]; then
  echo -e "${YELLOW}⚠ package.json modifié — mise à jour des dépendances...${RESET}"
  echo "$PACKAGE_CHANGED" | sed 's/^/    /'

  if echo "$PACKAGE_CHANGED" | grep -q "^backend/"; then
    echo -e "  → backend..."
    cd "$SCRIPT_DIR/backend" && npm install && cd "$SCRIPT_DIR"
  fi

  if echo "$PACKAGE_CHANGED" | grep -q "^frontend/web/"; then
    echo -e "  → frontend/web..."
    cd "$SCRIPT_DIR/frontend/web" && npm install && cd "$SCRIPT_DIR"
  fi

  echo -e "${GREEN}✓ Dépendances mises à jour${RESET}"
else
  echo -e "${GREEN}✓ Aucune dépendance à mettre à jour${RESET}"
fi

# ─── Résumé ──────────────────────────────────────────────────────────────────
echo -e "\n${GREEN}══ Synchronisation terminée avec succès ══${RESET}"
echo -e "  Redémarrez le backend local si nécessaire : ${YELLOW}./run-backend.sh${RESET}\n"
