#!/bin/bash
# Déploie le frontend web (Vite build) vers CT111
# Usage : ./web-deploy.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
RESET='\033[0m'

SERVER="ct111"
REMOTE_WEB="/opt/PlanYourTrip/frontend/web"
LOCAL_WEB="$(cd "$(dirname "$0")/frontend/web" && pwd)"

echo -e "\n${YELLOW}════════════════════════════════════════${RESET}"
echo -e "${YELLOW}  Mon Petit Roadtrip — Deploy Web       ${RESET}"
echo -e "${YELLOW}════════════════════════════════════════${RESET}\n"

# Vérifie que le serveur est joignable
if ! ssh -o ConnectTimeout=5 "$SERVER" "echo ok" &>/dev/null; then
  echo -e "${RED}✗ CT111 inaccessible.${RESET}"
  exit 1
fi

# ─── Build Vite ──────────────────────────────────────────────────────────────
echo -e "${YELLOW}[1/3]${RESET} Build Vite..."
cd "$LOCAL_WEB"
npm run build
echo -e "${GREEN}✓ Build terminé${RESET}"

# ─── Sync dist/ ──────────────────────────────────────────────────────────────
echo -e "${YELLOW}[2/3]${RESET} Sync dist/ vers CT111..."
ssh "$SERVER" "mkdir -p $REMOTE_WEB/dist"
scp -r "$LOCAL_WEB/dist/." "$SERVER:$REMOTE_WEB/dist/"
echo -e "${GREEN}✓ dist/ synchronisé${RESET}"

# ─── Config Nginx ────────────────────────────────────────────────────────────
echo -e "${YELLOW}[3/3]${RESET} Configuration Nginx..."

NGINX_CONF=$(cat <<'EOF'
server {
    listen 80;
    server_name _;

    root /opt/PlanYourTrip/frontend/web/dist;
    index index.html;

    # Frontend React (SPA — toutes les routes → index.html)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # APK Android (fichier statique)
    location /downloads/ {
        alias /opt/PlanYourTrip/downloads/;
    }

    # API backend (proxy vers Express port 3111)
    location /api/ {
        proxy_pass http://localhost:3111/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF
)

CURRENT=$(ssh "$SERVER" "cat /etc/nginx/sites-enabled/default 2>/dev/null || cat /etc/nginx/sites-available/default 2>/dev/null || echo ''")

if [ "$CURRENT" != "$NGINX_CONF" ]; then
  echo "$NGINX_CONF" | ssh "$SERVER" "cat > /tmp/nginx-mpr.conf && \
    cp /tmp/nginx-mpr.conf /etc/nginx/sites-available/default && \
    ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default && \
    nginx -t && systemctl reload nginx"
  echo -e "${GREEN}✓ Nginx reconfiguré et rechargé${RESET}"
else
  echo -e "${GREEN}✓ Nginx déjà à jour${RESET}"
fi

echo -e "\n${GREEN}✓ Frontend web déployé sur http://$(ssh "$SERVER" "hostname -I | awk '{print \$1}'")/\n${RESET}"
