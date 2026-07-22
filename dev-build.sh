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

  # ─── Kill résidus de builds précédents (verrous) ───────────────────────
  echo -e "${YELLOW}🔪 Nettoyage des processus résiduels...${RESET}"
  cmd //c "taskkill /F /IM java.exe 2>nul; exit 0" 2>/dev/null || true
  cmd //c "taskkill /F /IM javaw.exe 2>nul; exit 0" 2>/dev/null || true
  cmd //c "taskkill /F /IM gradle.exe 2>nul; exit 0" 2>/dev/null || true
  sleep 2
  echo -e "${GREEN}✓ Processus tués${RESET}"

  # ─── Vérification projet natif ──────────────────────────────────────────
  if [ ! -d "$FRONTEND_DIR/android" ]; then
    echo -e "${RED}✗ Projet natif android/ introuvable. Lance d'abord :${RESET}"
    echo -e "  cd frontend && npx expo prebuild --platform android --no-install"
    exit 1
  fi
  echo -e "${GREEN}✓ Projet natif android/ présent${RESET}"

  # ─── Patch build.gradle : applicationIdSuffix ".dev" + app_name ────────
  BUILD_GRADLE="$FRONTEND_DIR/android/app/build.gradle"
  NEED_PATCH=false

  if ! grep -q 'applicationIdSuffix ".dev"' "$BUILD_GRADLE" 2>/dev/null; then
    echo -e "${YELLOW}⚙ Ajout applicationIdSuffix \".dev\" dans build.gradle...${RESET}"
    sed -i '/^    buildTypes {/,/^    }/{
      s/^        debug {$/        debug {\n            applicationIdSuffix ".dev"/
    }' "$BUILD_GRADLE"
    NEED_PATCH=true
  fi

  if ! grep -q 'PlanYourTrip_Debug' "$BUILD_GRADLE" 2>/dev/null; then
    echo -e "${YELLOW}⚙ Ajout resValue app_name dans build.gradle...${RESET}"
    sed -i '/applicationIdSuffix ".dev"/a\            resValue "string", "app_name", "PlanYourTrip_Debug"' "$BUILD_GRADLE"
    NEED_PATCH=true
  fi

  if [ "$NEED_PATCH" = true ]; then
    echo -e "${GREEN}✓ build.gradle patché${RESET}"
  else
    echo -e "${GREEN}✓ build.gradle déjà configuré${RESET}"
  fi

  # ─── Patch AndroidManifest : scheme planyourtrip-dev ───────────────────
  MANIFEST="$FRONTEND_DIR/android/app/src/main/AndroidManifest.xml"
  if ! grep -q 'planyourtrip-dev' "$MANIFEST" 2>/dev/null; then
    echo -e "${YELLOW}⚙ Ajout scheme planyourtrip-dev dans AndroidManifest...${RESET}"
    sed -i '/<data android:scheme="planyourtrip"\/>/a\        <data android:scheme="planyourtrip-dev"\/>' "$MANIFEST"
    echo -e "${GREEN}✓ AndroidManifest patché${RESET}"
  else
    echo -e "${GREEN}✓ Scheme planyourtrip-dev déjà présent${RESET}"
  fi

  # ─── Vérification clé Google Maps ──────────────────────────────────────
  if grep -q "com.google.android.geo.API_KEY" "$MANIFEST" 2>/dev/null; then
    echo -e "${GREEN}✓ Clé Google Maps présente dans le manifest${RESET}"
  else
    echo -e "${RED}✗ Clé Google Maps absente du manifest — vérifie frontend/.env${RESET}"
    exit 1
  fi

  # ─── JDK dans gradle.properties ────────────────────────────────────────
  GRADLE_PROPS="$FRONTEND_DIR/android/gradle.properties"
  if ! grep -q "org.gradle.java.home" "$GRADLE_PROPS"; then
    echo "org.gradle.java.home=C:\\\\PROGRA~1\\\\Java\\\\jdk-20" >> "$GRADLE_PROPS"
  fi

  # ─── Nettoyage des caches (dont .cxx pour éviter le bug CMake) ────────
  echo -e "${YELLOW}🧹 Nettoyage des caches...${RESET}"
  rm -rf "$FRONTEND_DIR/.expo" "$FRONTEND_DIR/node_modules/.cache" \
         "$FRONTEND_DIR/android/build" "$FRONTEND_DIR/android/.gradle" \
         "$FRONTEND_DIR/android/app/.cxx"
  cd "$FRONTEND_DIR/android"
  ./gradlew clean 2>/dev/null || true
  sleep 1

  # ─── Build avec auto-réparation ──────────────────────────────────────────
  BUILD_LOG="$FRONTEND_DIR/.build-log.txt"
  APK_RAW="$FRONTEND_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
  APK_DEST="$(dirname "$FRONTEND_DIR")/planyourtrip.debug.apk"
  MAX_RETRIES=1

  do_build() {
    echo -e "\n${YELLOW}[1/2]${RESET} Gradle assembleDebug...\n"
    cd "$FRONTEND_DIR/android"
    ./gradlew assembleDebug 2>&1 | tee "$BUILD_LOG"
    local exit_code=${PIPESTATUS[0]}
    cd "$FRONTEND_DIR"
    return $exit_code
  }

  auto_fix() {
    local log="$1"

    # ── Cache CMake corrompu (configureCMakeDebug FAILED + GLOB mismatch) ──
    if grep -q "configureCMakeDebug.*FAILED" "$log" 2>/dev/null && \
       grep -q "GLOB mismatch\|file was modified during checks" "$log" 2>/dev/null; then
      echo -e "${YELLOW}🔧 Cache CMake corrompu → nettoyage .cxx${RESET}"
      rm -rf "$FRONTEND_DIR/android/app/.cxx" \
             "$FRONTEND_DIR/node_modules/@journeyapps/react-native-quick-sqlite/android/.cxx" \
             "$FRONTEND_DIR/node_modules/react-native-screens/android/.cxx" \
             "$FRONTEND_DIR/node_modules/expo-modules-core/android/.cxx"
      return 0
    fi

    # ── Verrous sur dossier (impossible de clean / delete) ────────────────
    if grep -q "Device or resource busy\|cannot access file\|is in use" "$log" 2>/dev/null; then
      echo -e "${YELLOW}🔧 Fichiers verrouillés → kill processus + nettoyage${RESET}"
      cmd //c "taskkill /F /IM java.exe 2>nul; exit 0" 2>/dev/null || true
      cmd //c "taskkill /F /IM javaw.exe 2>nul; exit 0" 2>/dev/null || true
      cmd //c "taskkill /F /IM gradle.exe 2>nul; exit 0" 2>/dev/null || true
      sleep 2
      rm -rf "$FRONTEND_DIR/android/build" "$FRONTEND_DIR/android/.gradle" "$FRONTEND_DIR/android/app/.cxx"
      return 0
    fi

    # ═══════════════════════════════════════════════════════════════════════
    # ➕ Ajoute ici de nouveaux patterns au fur et à mesure des erreurs
    # ═══════════════════════════════════════════════════════════════════════
    # Exemple :
    #   if grep -q "SomeNewError" "$log" 2>/dev/null; then
    #     echo -e "${YELLOW}🔧 Description du fix...${RESET}"
    #     # commandes de réparation
    #     return 0
    #   fi

    return 1  # Aucun fix connu
  }

  # ── Boucle build + retry si échec réparable ──────────────────────────────
  RETRY_COUNT=0
  BUILD_OK=false

  while [ "$BUILD_OK" = false ] && [ $RETRY_COUNT -le $MAX_RETRIES ]; do
    if do_build; then
      BUILD_OK=true
    else
      RETRY_COUNT=$((RETRY_COUNT + 1))
      if [ $RETRY_COUNT -le $MAX_RETRIES ]; then
        echo -e "\n${YELLOW}⚠ Build échoué — tentative de réparation #${RETRY_COUNT}...${RESET}"
        if auto_fix "$BUILD_LOG"; then
          echo -e "${GREEN}✓ Réparation appliquée, nouvelle tentative...${RESET}"
          cd "$FRONTEND_DIR/android" && ./gradlew clean 2>/dev/null || true
          cd "$FRONTEND_DIR"
        else
          echo -e "\n${RED}✗ Erreur inconnue — consulte le log :${RESET}"
          echo -e "  cat $BUILD_LOG"
          echo -e "\n${YELLOW}💡 Ajoute un nouveau pattern dans auto_fix() dans dev-build.sh${RESET}"
          exit 1
        fi
      fi
    fi
  done

  if [ "$BUILD_OK" = false ] || [ ! -f "$APK_RAW" ]; then
    echo -e "\n${RED}✗ Build échoué après $((MAX_RETRIES + 1)) tentative(s).${RESET}"
    exit 1
  fi

  cp "$APK_RAW" "$APK_DEST"
  echo -e "${GREEN}✓ planyourtrip.debug.apk${RESET}"

  echo -e "\n${YELLOW}[2/2]${RESET} Installation sur l'appareil...\n"
  DEVICES=$(adb devices 2>/dev/null | grep -v "List of devices" | grep "device$" | wc -l)
  if [ "$DEVICES" -eq 0 ]; then
    echo -e "${YELLOW}⚠ Build OK — mais aucun appareil connecté. Pour installer manuellement :${RESET}"
    echo -e "  adb install -r planyourtrip.debug.apk"
    exit 0
  fi

  adb install -r "$(dirname "$FRONTEND_DIR")/planyourtrip.debug.apk"
  echo -e "\n${GREEN}✓ APK installé !${RESET}"

fi

