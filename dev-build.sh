#!/bin/bash

# Build debug + lance Metro — tout en un
# Usage : ./dev.sh
# Option : ./dev.sh --skip-build  (Metro seulement, si APK déjà installé)

set -e
export APP_VARIANT=development

# ─── Java Home ───────────────────────────────────────────────────────────────
if [ -z "$JAVA_HOME" ]; then
  export JAVA_HOME="C:\\PROGRA~1\\Java\\jdk-20"
  export PATH="$JAVA_HOME/bin:$PATH"
fi

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
RESET='\033[0m'

FRONTEND_DIR="$(cd "$(dirname "$0")/frontend" && pwd)"

# ─── Chargement du .env frontend (nécessaire pour expo prebuild) ──────────────
if [ -f "$FRONTEND_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$FRONTEND_DIR/.env"
  set +a
fi

# ─── Android SDK ─────────────────────────────────────────────────────────────
if [ -z "$ANDROID_HOME" ]; then
  export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"
fi
export PATH="$ANDROID_HOME/platform-tools:$PATH"

echo -e "\n${YELLOW}══════════════════════════════════════${RESET}"
echo -e "${YELLOW}  Mon Petit Roadtrip — Dev (debug)    ${RESET}"
echo -e "${YELLOW}══════════════════════════════════════${RESET}\n"

# ─── Build (sauf si --skip-build) ────────────────────────────────────────────
if [ "$1" != "--skip-build" ]; then

  # Appareil connecté ?
  DEVICES=$(adb devices 2>/dev/null | grep -v "List of devices" | grep "device$" | wc -l)
  if [ "$DEVICES" -eq 0 ]; then
    echo -e "${RED}✗ Aucun appareil détecté. Branche le téléphone et active le débogage USB.${RESET}"
    exit 1
  fi
  echo -e "${GREEN}✓ $DEVICES appareil(s) connecté(s)${RESET}"

  # Prebuild si le projet natif n'existe pas encore
  MANIFEST="$FRONTEND_DIR/android/app/src/main/AndroidManifest.xml"
  NEED_PREBUILD=false
  if ! grep -q "com.mxh7777.monpetitroadtrip.dev" "$MANIFEST" 2>/dev/null; then
    NEED_PREBUILD=true
  fi
  if [ "$NEED_PREBUILD" = true ]; then
    echo -e "\n${YELLOW}⚙ Génération du projet natif (APP_VARIANT=development)...${RESET}"
    # Tuer tous les daemons Gradle/Java qui verrouillent les fichiers (nécessaire sous Windows)
    [ -f "$FRONTEND_DIR/android/gradlew" ] && (cd "$FRONTEND_DIR/android" && ./gradlew --stop 2>/dev/null || true)
    taskkill //F //IM java.exe 2>/dev/null || true
    sleep 2
    rm -rf "$FRONTEND_DIR/android"
    cd "$FRONTEND_DIR"
    APP_VARIANT=development npx expo prebuild --platform android --no-install
  fi

  # Vérification clé Google Maps
  MANIFEST="$FRONTEND_DIR/android/app/src/main/AndroidManifest.xml"
  if grep -q "com.google.android.geo.API_KEY" "$MANIFEST" 2>/dev/null; then
    echo -e "${GREEN}✓ Clé Google Maps présente dans le manifest${RESET}"
  else
    echo -e "${RED}✗ Clé Google Maps absente du manifest — vérifie frontend/.env${RESET}"
    exit 1
  fi

  # JDK dans gradle.properties
  GRADLE_PROPS="$FRONTEND_DIR/android/gradle.properties"
  if ! grep -q "org.gradle.java.home" "$GRADLE_PROPS"; then
    echo "org.gradle.java.home=C:\\\\PROGRA~1\\\\Java\\\\jdk-20" >> "$GRADLE_PROPS"
  fi

  echo -e "\n${YELLOW}[1/2]${RESET} Gradle assembleDebug...\n"
  cd "$FRONTEND_DIR/android"
  ./gradlew assembleDebug --build-cache
  BUILD_EXIT=$?
  cd "$FRONTEND_DIR"

  APK_RAW="android/app/build/outputs/apk/debug/app-debug.apk"
  if [ $BUILD_EXIT -ne 0 ] || [ ! -f "$APK_RAW" ]; then
    echo -e "\n${RED}✗ Build échoué.${RESET}"
    exit $BUILD_EXIT
  fi

  cp "$APK_RAW" "$(dirname "$FRONTEND_DIR")/monpetitroadtrip.debug.apk"
  echo -e "${GREEN}✓ monpetitroadtrip.debug.apk${RESET}"

  echo -e "\n${YELLOW}[2/2]${RESET} Installation sur l'appareil...\n"
  DEVICES=$(adb devices 2>/dev/null | grep -v "List of devices" | grep "device$" | wc -l)
  if [ "$DEVICES" -eq 0 ]; then
    echo -e "${YELLOW}⚠ Build OK — mais aucun appareil connecté. Pour installer manuellement :${RESET}"
    echo -e "  adb install -r monpetitroadtrip.debug.apk"
    exit 0
  fi

  adb install -r "$(dirname "$FRONTEND_DIR")/monpetitroadtrip.debug.apk"
  echo -e "\n${GREEN}✓ APK installé !${RESET}"

fi

