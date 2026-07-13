#!/bin/bash
# reset-data.sh — Supprime toutes les données dans Supabase et vide le SQLite local
# Usage : ./reset-data.sh [dev|prod]
#   dev  (défaut) : vide l'app de dev (com.mxh7777.monpetitroadtrip.dev)
#   prod           : vide l'app de prod (com.mxh7777.monpetitroadtrip)

VARIANT=${1:-dev}

if [ "$VARIANT" = "prod" ]; then
  PACKAGE="com.mxh7777.monpetitroadtrip"
else
  PACKAGE="com.mxh7777.monpetitroadtrip.dev"
fi

echo "=== Reset données ($VARIANT) ==="
echo ""

# 1. Vider Supabase via Prisma
echo "1/2 — Supabase..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/backend" && node scripts/reset-data.js
if [ $? -ne 0 ]; then
  echo "❌ Échec reset Supabase. Abandon."
  exit 1
fi

echo ""

# 2. Vider le SQLite local sur le téléphone
echo "2/2 — SQLite local ($PACKAGE)..."
if command -v adb &> /dev/null; then
  adb shell pm clear "$PACKAGE"
  if [ $? -eq 0 ]; then
    echo "✅ SQLite local vidé."
  else
    echo "⚠️  adb pm clear a échoué. L'app est peut-être fermée ou non connectée."
  fi
else
  echo "⚠️  adb non trouvé. Vide manuellement l'app sur le téléphone."
fi

echo ""
echo "✅ Reset terminé. Relance l'app pour resync."
