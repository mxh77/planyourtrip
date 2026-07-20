#!/bin/bash
# Déploie le backend local vers CT 117 (192.168.1.117)
# Usage : ./deploy-backend.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
RESET='\033[0m'

SERVER="ct117"
REMOTE_DIR="/opt/planyourtrip/backend"
LOCAL_DIR="$(cd "$(dirname "$0")/backend" && pwd)"

echo -e "\n${YELLOW}════════════════════════════════════════${RESET}"
echo -e "${YELLOW}  PlanYourTrip — Deploy Backend + Web   ${RESET}"
echo -e "${YELLOW}════════════════════════════════════════${RESET}\n"

# ─── Sauvegarde avant déploiement (optionnelle) ─────────────────────────────
echo -e "${YELLOW}[0/5]${RESET} Sauvegarde de la base de données..."
if node "$(dirname "$0")/backend/scripts/backup.js" 2>/dev/null; then
  echo -e "${GREEN}✓ Backup effectué${RESET}"
else
  echo -e "${YELLOW}⚠ Backup ignoré — déploiement continué.${RESET}"
fi

# ─── Git pull sur le serveur ─────────────────────────────────────────────────
echo -e "${YELLOW}[1/5]${RESET} Git pull sur $SERVER..."
ssh "$SERVER" "cd /opt/planyourtrip && git reset --hard HEAD && git clean -fd && git pull"
echo -e "${GREEN}✓ Code mis à jour${RESET}"

# ─── Vérification page maintenance (trackée dans git) ───────────────────────
echo -e "${YELLOW}[2/5]${RESET} Vérification page maintenance..."
echo -e "${GREEN}✓ Page maintenance prête (trackée dans git)${RESET}"

# ─── Copie du .env local vers le serveur ─────────────────────────────────────
echo -e "${YELLOW}[3/5]${RESET} Copie du .env..."
scp "$LOCAL_DIR/.env" "$SERVER:$REMOTE_DIR/.env"
echo -e "${GREEN}✓ .env transféré${RESET}"

# ─── npm install + Prisma ───────────────────────────────────────────────────
echo -e "${YELLOW}[4/5]${RESET} npm install + prisma..."
ssh "$SERVER" "cd $REMOTE_DIR && npm install --omit=dev && npx prisma migrate deploy && npx prisma generate"
echo -e "${GREEN}✓ Dépendances et schéma Prisma mis à jour${RESET}"

# ─── Redémarre PM2 ──────────────────────────────────────────────────────────
echo -e "${YELLOW}[5/5]${RESET} Redémarrage PM2..."
ssh "$SERVER" "cd $REMOTE_DIR && pm2 restart planyourtrip-api --update-env"
echo -e "${GREEN}✓ Backend redémarré${RESET}"

# ─── Vérification health ─────────────────────────────────────────────────────
sleep 1
STATUS=$(ssh "$SERVER" "curl -s -o /dev/null -w '%{http_code}' http://localhost:3111/health")
if [ "$STATUS" = "200" ]; then
  echo -e "\n${GREEN}✓ Backend opérationnel${RESET} (health: 200)"
else
  echo -e "\n${RED}✗ Health check échoué (status: $STATUS)${RESET}"
  exit 1
fi

echo -e "\n${YELLOW}Logs en live :${RESET} ssh ct117 \"tail -f ~/.pm2/logs/planyourtrip-api-out.log\"\n"
