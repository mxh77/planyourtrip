# 🔧 Guide Rapide — Utiliser le LogsViewer pour Diagnostiquer

## Quoi faire ?

Vous avez un problème où le bouton **Refresh** 🔄 crée beaucoup de logs ?

Nous avons ajouté un **LogsViewer** 📋 directement dans l'app pour tracer ce qui se passe.

## Comment tester ?

### ✅ Avant de tester
- App ouverte sur Android
- Page avec un road trip affichée (ex: RoadtripDetailScreen)
- Volet des étapes **DOIT être visible** (swipe up pour ouvrir)

### 🔴 Test pas à pas

1. **Ouvrir le volet des étapes**
   - Swipe up depuis le bas de l'écran
   - Vous devez voir 2 boutons en haut à droite: 🔄 et 📋

2. **Ouvrir le LogsViewer**
   - Cliquer sur **📋** (deuxième bouton)
   - Un écran plein noir/blanc avec des logs doit s'afficher

3. **Vider les logs existants**
   - En haut à gauche du LogsViewer, voir le bouton **Vider** (poubelle 🗑️)
   - Cliquer dessus pour repartir de zéro

4. **Mettre en Play (auto-refresh)**
   - Voir le bouton **Play** 
   - S'il n'est pas en bleu, cliquer dessus pour activer auto-refresh

5. **Attendre 2-3 secondes** pour avoir un baseline clean

6. **Fermer le LogsViewer et cliquer REFRESH**
   - Cliquer le X en haut à droite du LogsViewer
   - Cliquer le bouton 🔄 **UNE SEULE FOIS**

7. **Immédiatement rouvrir le LogsViewer**
   - Cliquer 📋 à nouveau

8. **Regarder les logs**
   - Scroller vers le bas pour voir les derniers logs
   - Chercher:
     - ⚠️ **Message d'alerte** qui dit "trop rapides" → BOUCLE DÉTECTÉE !
     - **Même log qui se répète 100 fois** → BOUCLE INFINIE !
     - Les logs normalement:
       ```
       [REFRESH] 🔄 Bouton refresh cliqué
       [REFRESH] État refreshingRoutes: true
       [REFRESH] 🔄 >>> REFRESH DÉCLENCHÉ <<<
       [DIRECTIONS] useEffect déclenché: ...
       [DIRECTIONS] Routes à recalculer: ...
       ```

## 📤 Que faire si vous trouvez une boucle ?

1. **Exporter les logs**
   - Chercher le bouton **Export** (ou long-press pour copier)
   - Copier tous les logs

2. **M'envoyer les logs**
   - Envoyer le texte copié
   - Dire combien de fois vous avez cliqué refresh (1 fois? 10 fois?)

3. **Indiquer le contexte**
   - Quel road trip ? Combien d'étapes ?
   - À quel moment cela se passe-t-il ?

## 🟢 Test réussi ?

Si vous voyez:
- Les logs s'affichent en temps réel ✓
- Les logs disparaissent quand vous cliquez "Vider" ✓
- Après un clic refresh, vous voyez un petit nombre de logs (10-50 max) ✓
- PAS de message ⚠️ "trop rapides" ✓

Alors c'est **OK** ! Le refresh fonctionne bien.

## 🔴 Problème détecté ?

Si vous voyez:
- Après 1 clic refresh, les logs affichent 1000+ entrées
- Message d'alerte ⚠️ "Logs trop rapides"
- Même log qui se répète: `[REFRESH] État refreshingRoutes: true` 100 fois

Alors il y a une **BOUCLE INFINIE**. Dans ce cas:
1. **Exporter les logs** (voir comment ci-dessus)
2. **M'envoyer** avec le contexte (quel road trip, combien d'étapes)
3. Je vais analyser et corriger

---

## 💡 Note pour les développeurs

Les logs ajoutés ne devraient **PAS** créer de surcharge :
- Simples appels `log('CATEGORY', 'message')`
- Pas de JSON.stringify lourd
- Async et non-bloquant

Si vous voyez une boucle, c'est un bug dans la logique React (dépendance useEffect, state update circulaire), pas une surcharge du logging.
