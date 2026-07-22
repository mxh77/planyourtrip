#!/bin/bash

# Connexion ADB WiFi au téléphone Pixel 8 Pro
# Usage : ./connect_tel.sh

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
RESET='\033[0m'

PHONE_IPS=("192.168.1.68" "192.168.1.20")
PHONE_PORT="5555"

echo -e "\n${YELLOW}═══════════════════════════════${RESET}"
echo -e "${YELLOW}  Connexion ADB WiFi          ${RESET}"
echo -e "${YELLOW}═══════════════════════════════${RESET}\n"

# ─── Démarrage du serveur ADB ────────────────────────────────────────────────
echo -e "📡 Démarrage du serveur ADB..."
adb start-server 2>&1
echo -e "${GREEN}✓ Serveur ADB prêt${RESET}"

# ─── Vider les connexions périmées ───────────────────────────────────────────
echo -e "\n🧹 Nettoyage des anciennes connexions..."
adb disconnect 192.168.1.20:5555 2>/dev/null || true
adb disconnect 192.168.1.68:5555 2>/dev/null || true
echo -e "${GREEN}✓ Anciennes connexions nettoyées${RESET}"

# ─── Connexion au téléphone (essai des 2 IP) ────────────────────────────────
CONNECTED=false
for IP in "${PHONE_IPS[@]}"; do
  echo -e "\n📱 Essai $IP:$PHONE_PORT..."
  RESULT=$(adb connect $IP:$PHONE_PORT 2>&1)

  if echo "$RESULT" | grep -q "connected"; then
    echo -e "${GREEN}✓ Connecté sur $IP !${RESET}"
    CONNECTED=true
    break
  elif echo "$RESULT" | grep -q "already connected"; then
    echo -e "${GREEN}✓ Déjà connecté sur $IP${RESET}"
    CONNECTED=true
    break
  else
    echo -e "  ${YELLOW}➜ $IP injoignable${RESET}"
  fi
done

if [ "$CONNECTED" = false ]; then
  echo -e "\n${RED}✗ Aucune IP trouvée.${RESET}"
  echo -e "\n${YELLOW}Vérifie que :${RESET}"
  echo -e "  • Le téléphone est allumé"
  echo -e "  • Le débogage USB est activé (Paramètres → Options développeurs)"
  echo -e "  • Le téléphone est sur le réseau WiFi (192.168.1.x)"
  echo -e "  • L'IP du téléphone est 192.168.1.20 ou 192.168.1.68"
  exit 1
fi

# ─── Vérification ────────────────────────────────────────────────────────────
echo -e "\n📋 État des appareils connectés :"
adb devices | grep -v "List of devices"

echo -e "\n${GREEN}✅ Prêt à builder !${RESET}"
