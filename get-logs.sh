#!/bin/bash

# Script pour télécharger et afficher les logs du serveur backend

BACKEND_URL=${1:-"http://localhost:3111"}

echo "📋 Récupération des logs depuis $BACKEND_URL..."
echo ""

# Télécharger les logs
curl -s "$BACKEND_URL/api/debug/logs" > backend-logs.txt

if [ $? -eq 0 ]; then
  echo "✅ Logs sauvegardés dans: backend-logs.txt"
  echo ""
  echo "--- Aperçu des 50 dernières lignes ---"
  tail -50 backend-logs.txt
else
  echo "❌ Erreur lors de la récupération des logs"
  exit 1
fi
