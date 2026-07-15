# 📋 Guide de Logging

Ce projet inclut un système de logging fichier pour tracer les problèmes en détail.

## 📂 Où sont stockés les logs?

- **Backend**: `backend/logs/app.log`
- Les logs sont créés automatiquement au démarrage du backend

## 🚀 Récupérer les logs

### Option 1 : Script PowerShell (Windows)

```powershell
.\get-logs.ps1
# Ou avec une URL custom:
.\get-logs.ps1 -BackendUrl "http://192.168.1.38:3111"
```

**Résultat**: Crée un fichier `backend-logs.txt` avec tous les logs

### Option 2 : Script Bash (Linux/Mac)

```bash
chmod +x get-logs.sh
./get-logs.sh
# Ou avec une URL custom:
./get-logs.sh "http://192.168.1.38:3111"
```

### Option 3 : cURL direct

```bash
# Télécharger les logs
curl -s http://localhost:3111/api/debug/logs > backend-logs.txt

# Voir les 100 dernières lignes
curl -s http://localhost:3111/api/debug/logs | tail -100
```

### Option 4 : Vider les logs

```bash
curl -X DELETE http://localhost:3111/api/debug/logs
```

## 📊 Quoi est loggé?

### Routes API (Directions)
- ✅ Chaque requête POST `/api/routes/compute`
- ✅ Les coordonnées origin/destination
- ✅ Les réponses (distance, durée)
- ❌ Les erreurs Google API

### Places API
- ✅ Chaque recherche nearby/text
- ✅ Le nombre de résultats trouvés
- ✅ Les erreurs

### Format des logs

```
[ISO-TIMESTAMP] [CATEGORY] Message
  {JSON data}
```

Exemple:
```
[2026-07-15T14:30:45.123Z] [ROUTES] 🔹 Requête POST /api/routes/compute de l'utilisateur abc123
  {
    "origin": {
      "lat": 48.543237,
      "lng": 1.38867
    },
    "destination": {
      "lat": 47.0162101,
      "lng": 5.4814909
    },
    "alternatives": false
  }
[2026-07-15T14:30:46.456Z] [ROUTES] ✅ Réponse pour route 48.543237,1.38867 → 47.0162101,5.4814909
  {
    "distanceMeters": 450000,
    "duration": "4h 30m"
  }
```

## 🔧 Ajouter des logs custom

Dans n'importe quel fichier du backend:

```javascript
const { log, error } = require('../services/logger');

// Log simple
log('MON_CATEGORIE', 'Mon message');

// Log avec data
log('MON_CATEGORIE', 'Détail important', { id: 123, status: 'ok' });

// Log d'erreur
error('MON_CATEGORIE', 'Quelque chose s\'est mal passé', err);
```

## 🎯 Démarche pour diagnostiquer un problème

1. **Vider les logs**
   ```bash
   curl -X DELETE http://localhost:3111/api/debug/logs
   ```

2. **Reproduire le problème** dans l'app

3. **Récupérer les logs**
   ```bash
   .\get-logs.ps1
   ```

4. **Analyser le fichier** `backend-logs.txt`
   - Cherchez les timestamps autour du moment du problème
   - Vérifiez les réponses d'erreur (❌ ERROR)
   - Comparez les requêtes vs réponses

## 📝 Exemple complet: Diagnostiquer un problème de distance incorrecte

1. Vider les logs et redémarrer le backend
2. Créer un roadtrip avec 2 étapes
3. Cliquer sur le bouton de refresh
4. Récupérer les logs:
   ```bash
   .\get-logs.ps1
   ```
5. Vous verrez:
   - Les coordonnées envoyées au backend
   - La réponse de Google (distance exacte)
   - Les erreurs de parsing (si des)

Partagez ce fichier `backend-logs.txt` pour un meilleur diagnostic!

## ⚙️ Configuration

Les logs sont stockés dans le répertoire `backend/logs/app.log` qui est créé automatiquement.

Pour désactiver les logs fichier temporairement, modifiez `backend/src/services/logger.js` et commentez la ligne `fs.appendFileSync()`.
