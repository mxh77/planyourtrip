#!/bin/bash

# Installe l'APK debug (dev) sur le téléphone connecté en USB.
# Prérequis : avoir déjà buildé avec build-dev.sh au moins une fois.
# Usage     : ./dev-install.sh

set -e

if [ -z "$ANDROID_HOME" ]; then
  export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"
fi
export PATH="$ANDROID_HOME/platform-tools:$PATH"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
RESET='\033[0m'

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"

APK_PATHS=(
  "$FRONTEND_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
  "$ROOT_DIR/monpetitroadtrip.debug.apk"
)

APK=""
for p in "${APK_PATHS[@]}"; do
  if [ -f "$p" ]; then
    APK="$p"
    break
  fi
done

if [ -z "$APK" ]; then
  echo -e "${RED}✗ Aucun APK debug trouvé. Lance d'abord ./build-dev.sh${RESET}"
  exit 1
fi

echo -e "\n${YELLOW}════════════════════════════════════════${RESET}"
echo -e "${YELLOW}  Mon Petit Roadtrip — Install Dev APK  ${RESET}"
echo -e "${YELLOW}════════════════════════════════════════${RESET}\n"

echo -e "APK : ${APK/$ROOT_DIR\//}"

DEVICES=$(adb devices 2>/dev/null | grep -v "List of devices" | grep "device$" | wc -l)
if [ "$DEVICES" -eq 0 ]; then
  echo -e "${RED}✗ Aucun appareil détecté. Branche le téléphone et active le débogage USB.${RESET}"
  exit 1
fi
echo -e "${GREEN}✓ $DEVICES appareil(s) connecté(s)${RESET}\n"

adb install -r "$APK"

echo -e "\n${GREEN}✓ MPR_Debug installé !${RESET}\n"
