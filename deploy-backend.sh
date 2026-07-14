#!/bin/bash
# Déploie le backend local vers CT 111 (192.168.1.111)
# Usage : ./deploy-backend.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RESET='\033[0m'

SERVER="ct111"
REMOTE_DIR="/opt/PlanYourTrip/backend"
LOCAL_DIR="$(cd "$(dirname "$0")/backend" && pwd)"

echo -e "\n${YELLOW}════════════════════════════════════════${RESET}"
echo -e "${YELLOW}  Mon Petit Roadtrip — Deploy Backend   ${RESET}"
echo -e "${YELLOW}════════════════════════════════════════${RESET}\n"

# ─── Sauvegarde avant déploiement ────────────────────────────────────────────
echo -e "${YELLOW}[0/3]${RESET} Sauvegarde de la base de données..."
if node "$(dirname "$0")/backend/scripts/backup.js" 2>/dev/null; then
  echo -e "${GREEN}✓ Backup effectué${RESET}"
else
  echo -e "${YELLOW}⚠ Backup échoué (connexion indisponible ?) — déploiement annulé.${RESET}"
  exit 1
fi

# ─── Git pull sur le serveur ─────────────────────────────────────────────────
echo -e "${YELLOW}[1/3]${RESET} Git pull sur $SERVER..."
ssh "$SERVER" "cd /opt/PlanYourTrip && git reset --hard HEAD && git clean -fd && git pull"
echo -e "${GREEN}✓ Code mis à jour${RESET}"

# ─── npm install si package.json a changé ────────────────────────────────────
echo -e "${YELLOW}[2/3]${RESET} npm install + prisma..."
ssh "$SERVER" "cd $REMOTE_DIR && npm install --omit=dev && npx prisma migrate deploy && npx prisma generate"
echo -e "${GREEN}✓ Dépendances et schéma Prisma mis à jour${RESET}"

# ─── Redémarre PM2 ───────────────────────────────────────────────────────────
echo -e "${YELLOW}[3/3]${RESET} Redémarrage PM2..."
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

echo -e "\n${YELLOW}Logs en live :${RESET} ssh ct111 \"tail -f ~/.pm2/logs/planyourtrip-api-out.log\"\n"
