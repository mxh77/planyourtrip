#!/bin/bash

# Build release Android (APK signé)
# Prérequis :
#   - frontend/keystore.properties rempli avec le mot de passe keystore
#   - planyourtrip.keystore présent à la racine du projet

set -e

# ─── Java Home ────────────────────────────────────────────────────────────────
if [ -z "$JAVA_HOME" ]; then
  export JAVA_HOME="C:\\PROGRA~1\\Java\\jdk-20"
  export PATH="$JAVA_HOME/bin:$PATH"
fi

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
RESET='\033[0m'

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"

echo -e "\n${YELLOW}════════════════════════════════════════${RESET}"
echo -e "${YELLOW}     PlanYourTrip — Android Release     ${RESET}"
echo -e "${YELLOW}════════════════════════════════════════${RESET}\n"

# ─── Android SDK ─────────────────────────────────────────────────────────────
if [ -z "$ANDROID_HOME" ]; then
  DETECTED="$LOCALAPPDATA/Android/Sdk"
  if [ -d "$DETECTED" ]; then
    export ANDROID_HOME="$DETECTED"
    export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
  else
    echo -e "${RED}✗ ANDROID_HOME non défini.${RESET}"
    exit 1
  fi
fi

# ─── Vérification keystore.properties ────────────────────────────────────────
KEYSTORE_PROPS="$FRONTEND_DIR/keystore.properties"
if [ ! -f "$KEYSTORE_PROPS" ]; then
  echo -e "${RED}✗ frontend/keystore.properties introuvable.${RESET}"
  exit 1
fi

STORE_PASSWORD=$(grep "storePassword" "$KEYSTORE_PROPS" | cut -d'=' -f2)
KEY_ALIAS=$(grep "keyAlias" "$KEYSTORE_PROPS" | cut -d'=' -f2)
KEY_PASSWORD=$(grep "keyPassword" "$KEYSTORE_PROPS" | cut -d'=' -f2)

# ─── Prebuild (skippé si le projet natif release est déjà présent) ──────────
echo -e "${YELLOW}[1/4]${RESET} Prebuild Expo (production)..."
unset APP_VARIANT
cd "$FRONTEND_DIR"

# Charger .env.production (ou .env) dans le shell pour que Metro
# substitue correctement les variables EXPO_PUBLIC_* pendant assembleRelease
ENV_FILE="$FRONTEND_DIR/.env.production"
[ -f "$ENV_FILE" ] || ENV_FILE="$FRONTEND_DIR/.env"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

# Skipper le prebuild si le projet natif est déjà en mode release (com.mxh7777.planyourtrip)
MANIFEST="$FRONTEND_DIR/android/app/src/main/AndroidManifest.xml"
if grep -q 'package="com.mxh7777.planyourtrip"' "$MANIFEST" 2>/dev/null && \
   ! grep -q 'com.mxh7777.planyourtrip.dev' "$MANIFEST" 2>/dev/null; then
  echo -e "${GREEN}✓ Projet natif release déjà présent — prebuild skippé${RESET}"
else
  if [ -d "android" ]; then
    echo -e "  → Kill ADB (principal verrou sur android/)..."
    adb kill-server 2>/dev/null || true
    cmd //c "taskkill /F /IM adb.exe 2>nul; exit 0" 2>/dev/null || true
    sleep 2
    echo -e "  → Arrêt gradle daemon..."
    (cd android && ./gradlew --stop 2>/dev/null || true)
    echo -e "  → Kill processus Java/Gradle..."
    cmd //c "taskkill /F /IM java.exe 2>nul; exit 0" 2>/dev/null || true
    cmd //c "taskkill /F /IM gradle.exe 2>nul; exit 0" 2>/dev/null || true
    cmd //c "taskkill /F /IM javaw.exe 2>nul; exit 0" 2>/dev/null || true
    sleep 3
    # Tentative 1 : rmdir natif
    cmd //c "rmdir /s /q android 2>nul; exit 0" 2>/dev/null || true
    sleep 2
    # Tentative 2 : PowerShell Remove-Item avec retry
    WIN_ANDROID=$(cygpath -w "$PWD/android" 2>/dev/null || echo "")
    if [ -d "android" ] && [ -n "$WIN_ANDROID" ]; then
      powershell -Command "
        \$path = '$WIN_ANDROID'
        for (\$i = 0; \$i -lt 5; \$i++) {
          try {
            Remove-Item -Recurse -Force -Path \$path -ErrorAction Stop
            break
          } catch {
            Start-Sleep -Seconds 2
          }
        }
      " 2>/dev/null || true
    fi
    # Tentative 3 : rm -rf final
    rm -rf android 2>/dev/null || true
    # Si le dossier existe encore, on abandonne
    if [ -d "android" ]; then
      echo -e "${RED}✗ Impossible de supprimer le dossier android (verrouillé).${RESET}"
      echo -e "  Ferme Android Studio, les terminaux Gradle, puis relance le script."
      exit 1
    fi
  fi
  cd "$FRONTEND_DIR"
  npx expo prebuild --platform android --no-install
  cd "$ROOT_DIR"
  echo -e "${GREEN}✓ Prebuild terminé${RESET}"
fi

# ─── Patch AndroidManifest : autoriser le trafic HTTP (cleartext) ──────────
MANIFEST="$FRONTEND_DIR/android/app/src/main/AndroidManifest.xml"
if ! grep -q 'usesCleartextTraffic' "$MANIFEST" 2>/dev/null; then
  echo -e "\n${YELLOW}[Patch]${RESET} Activation du trafic HTTP (cleartext)..."
  sed -i 's|<application |<application android:usesCleartextTraffic="true" |' "$MANIFEST"
  echo -e "${GREEN}✓ usesCleartextTraffic ajouté${RESET}"
else
  echo -e "${GREEN}✓ usesCleartextTraffic déjà présent${RESET}"
fi

# ─── Copie keystore + config Gradle ──────────────────────────────────────────
echo -e "\n${YELLOW}[2/4]${RESET} Configuration signing..."
cp "$ROOT_DIR/planyourtrip.keystore" "$FRONTEND_DIR/android/app/"

# gradle.properties — JDK + signing
GRADLE_PROPS="$FRONTEND_DIR/android/gradle.properties"
cat >> "$GRADLE_PROPS" << EOF

org.gradle.java.home=C:\\\\PROGRA~1\\\\Java\\\\jdk-20
MYAPP_STORE_FILE=planyourtrip.keystore
MYAPP_STORE_PASSWORD=$STORE_PASSWORD
MYAPP_KEY_ALIAS=$KEY_ALIAS
MYAPP_KEY_PASSWORD=$KEY_PASSWORD
EOF

# Patch build.gradle — injecte signingConfigs + signingConfig release
BUILD_GRADLE="$FRONTEND_DIR/android/app/build.gradle"

# Écrit le bloc signingConfigs dans un fichier temporaire
SIGNING_BLOCK="    signingConfigs {\n        release {\n            storeFile file(MYAPP_STORE_FILE)\n            storePassword MYAPP_STORE_PASSWORD\n            keyAlias MYAPP_KEY_ALIAS\n            keyPassword MYAPP_KEY_PASSWORD\n        }\n    }\n"

# Insère signingConfigs avant buildTypes
sed -i "s/    buildTypes {/$SIGNING_BLOCK    buildTypes {/" "$BUILD_GRADLE"

# Ajoute signingConfig dans release (après minifyEnabled, unique au bloc buildTypes > release)
sed -i "/minifyEnabled/a\\            signingConfig signingConfigs.release" "$BUILD_GRADLE"

echo -e "${GREEN}✓ Signing configuré${RESET}"

# ─── Build release ───────────────────────────────────────────────────────────
echo -e "\n${YELLOW}[3/4]${RESET} Build APK release...\n"
cd "$FRONTEND_DIR/android"
# --build-cache : réutilise les artefacts Gradle entre builds
# reactNativeArchitectures=arm64-v8a : une seule ABI pour le téléphone de test (~2× plus rapide)
# Réduire le chemin .cxx pour éviter les limites de path length
mkdir -p .gradle-cache .build-cache 2>/dev/null || true
./gradlew assembleRelease \
  --build-cache \
  -PreactNativeArchitectures=arm64-v8a \
  -Dorg.gradle.projectcachedir=.gradle-cache \
  -Dandroid.ndkVersion=26.1.10909125

# ─── Install ─────────────────────────────────────────────────────────────────
APK_RAW="$FRONTEND_DIR/android/app/build/outputs/apk/release/app-release.apk"
APK_PATH="$ROOT_DIR/planyourtrip.apk"

if [ -f "$APK_RAW" ]; then
  cp "$APK_RAW" "$APK_PATH"
  echo -e "\n${GREEN}✓ APK : planyourtrip.apk${RESET}"
  echo -e "\n${YELLOW}[4/5]${RESET} Installation sur le téléphone..."
  DEVICES=$(adb devices 2>/dev/null | grep -v "List of devices" | grep "device$" | wc -l)
  if [ "$DEVICES" -gt 0 ]; then
    adb install -r "$APK_PATH" && echo -e "${GREEN}✓ Installé !${RESET}"
  else
    echo -e "${YELLOW}⚠ Pas de téléphone connecté — installe manuellement l'APK.${RESET}"
  fi

  echo -e "\n${YELLOW}[5/5]${RESET} Upload APK vers CT111..."
  if ssh -o ConnectTimeout=5 ct111 "echo ok" &>/dev/null; then
    scp "$APK_PATH" ct111:/opt/PlanYourTrip/downloads/planyourtrip.apk
    echo -e "${GREEN}✓ APK uploadé sur CT111${RESET}"
  else
    echo -e "${YELLOW}⚠ CT111 inaccessible — upload ignoré.${RESET}"
  fi
else
  echo -e "${RED}✗ APK introuvable.${RESET}"
  exit 1
fi

echo -e "\n${GREEN}══ Release terminée ══${RESET}\n"
