# Guide de Diagnostic — Boucle Infinie au Refresh

## 🎯 Problème rapporté
> "Je viens de cliquer sur Actualiser la liste des étapes et ça a généré un nombre incalculable de logs (en boucle j'ai l'impression)"

## 📝 Nouveau Système de Diagnostic

Nous avons ajouté un système de logging détaillé pour tracer exactement ce qui se passe lors du clic sur le bouton 🔄 (Refresh).

### Où voir les logs ?

1. **Depuis l'app mobile** (NOUVEAU ✨)
   - Ouvrir le volet des étapes (swipe up)
   - Cliquer sur le bouton 📋 (Logs)
   - Les logs s'affichent en temps réel avec code couleur

2. **Depuis le backend** (logs serveur)
   ```bash
   # PowerShell
   .\get-logs.ps1
   
   # Bash
   ./get-logs.sh
   ```

### 🔍 Comment diagnostiquer la boucle

#### Étape 1: Préparation
1. Ouvrir l'app sur le téléphone
2. Naviguer jusqu'à une page avec un road trip (ex: RoadtripDetailScreen)
3. Ouvrir le volet des étapes (swipe up)
4. Cliquer sur 📋 pour ouvrir le LogsViewer

#### Étape 2: Vider et tester
1. Dans le LogsViewer, cliquer **Vider** pour repartir de zéro
2. Cliquer sur **Play** pour activer l'auto-refresh
3. Attendre 2-3 secondes pour un baseline clean

#### Étape 3: Cliquer Refresh
1. Fermer le LogsViewer (cliquer X)
2. Cliquer le bouton 🔄 **UNE SEULE FOIS**
3. Immédiatement rouvrir le LogsViewer (cliquer 📋)

#### Étape 4: Analyser les logs
Regarder la séquence de logs. Une boucle saine devrait ressembler à:

```
[REFRESH] État refreshingRoutes: true          ← 1 fois
[REFRESH] 🔄 >>> REFRESH DÉCLENCHÉ <<<        ← 1 fois
[DIRECTIONS] useEffect déclenché: ...          ← 1-2 fois
[DIRECTIONS] Routes à recalculer: 5 index: ... ← 1 fois
```

Si les mêmes logs se répètent **100+ fois**, c'est une boucle !

### 🚨 Signaux d'alerte

Le système loggera une **alerte automatique** :
```
⚠️ Logs REFRESH trop rapides (15ms apart) - POSSIBLE BOUCLE!
```

Si vous voyez cette alerte, c'est qu'il y a une boucle.

### 📊 Exemples de logs

#### ✅ Comportement normal (pas de boucle)
```
[REFRESH] État refreshingRoutes: true
[REFRESH] 🔄 >>> REFRESH DÉCLENCHÉ <<<
[DIRECTIONS] useEffect déclenché: stepsLength=12, refreshCounter=1, shouldRefresh=true
[DIRECTIONS] loadRoutes: needsRefresh=true
[DIRECTIONS] Routes à recalculer: 5 index: 1, 3, 5, 7, 9
```

#### ❌ Boucle infinie (problème)
```
[REFRESH] État refreshingRoutes: true
[REFRESH] État refreshingRoutes: true
[REFRESH] État refreshingRoutes: true
[REFRESH] État refreshingRoutes: true
⚠️ Logs REFRESH trop rapides (5ms apart) - POSSIBLE BOUCLE!
```

### 🔧 Points d'observation clés

| Catégorie | Signification | Normal |
|-----------|---------------|--------|
| `[REFRESH]` | État du bouton 🔄 | 1-2 fois |
| `[DIRECTIONS]` | Calcul des itinéraires | 1-2 fois |
| `[ROUTES]` | Appels à l'API Google | Une fois par route manquante |
| `⚠️ trop rapides` | Alerte de boucle | JAMAIS |

### 📋 Checklist de diagnostic

- [ ] App ouverte sur une page avec road trip
- [ ] Volet des étapes ouvert (swipe up)
- [ ] LogsViewer ouvert et sur "Play"
- [ ] Logs vidés (cliquer "Vider")
- [ ] Refresh cliqué UNE SEULE FOIS
- [ ] Logs observés et notés (copier/coller dans un email)

### 📤 Comment me donner les logs

1. Dans le LogsViewer, scroller tout en bas
2. Cliquer le bouton **Export** (ou long-press pour copier)
3. M'envoyer le texte

Exemple de log à m'envoyer:
```
[2026-07-14T18:45:32.123Z] [REFRESH] État refreshingRoutes: true
[2026-07-14T18:45:32.145Z] [REFRESH] 🔄 >>> REFRESH DÉCLENCHÉ <<<
[2026-07-14T18:45:32.178Z] [DIRECTIONS] useEffect déclenché: stepsLength=12, refreshCounter=1, shouldRefresh=true
...
```

---

## 🛠️ Détails techniques (pour développeurs)

### Fichiers modifiés
- `frontend/src/services/logger.js` : Détection de boucle (< 100ms entre logs)
- `frontend/src/components/LogsViewer.js` : Modal pour visualiser les logs
- `frontend/src/screens/RoadtripDetailScreen.js` : Instrumentation avec `log()` et `warn()`

### Dépendances des useEffects

Le code repose sur une cascade de state updates :

1. `setRefreshingRoutes(true)` (bouton 🔄)
2. useEffect sur `[refreshingRoutes]` → `setRefreshCounter(c => c + 1)`
3. useEffect sur `[refreshCounter]` → Recalcule les routes

**Problème possible** : Si une dépendance manque, le useEffect se déclenche en boucle.

### Logs ajoutés

```javascript
log('REFRESH', `État refreshingRoutes: ${refreshingRoutes}`);
log('DIRECTIONS', `Routes à recalculer: ${routesNeedingRecalc.length}`);
```

Ces logs ne créent aucune surcharge — ils sont simples et asynchrones.

### Comment les logs sont stockés

- **Frontend** : Array en mémoire, max 5000 entrées
- **Backend** : Fichier texte `backend/logs/app.log` (accessible via GET /api/debug/logs)

---

## 📞 Comment me signaler un problème

1. **Ouvrir le LogsViewer** en cliquant 📋
2. **Vider les logs** (cliquer Vider)
3. **Reproduire le problème** (cliquer Refresh)
4. **Exporter les logs** et me les envoyer
5. **Noter le nombre de fois** que vous avez cliqué (1 fois? 10 fois?)

Avec cette information, je peux corriger le problème rapidement !
