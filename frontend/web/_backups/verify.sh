#!/bin/bash
# Post-build verification — checks source files for critical patterns

SRC="/opt/planyourtrip/frontend/web/src"
ERRORS=0

check_src() {
  local file="$1"
  local pattern="$2"
  local label="$3"
  local f="$SRC/$file"
  if [ ! -f "$f" ]; then
    echo "   [FAIL] $label — FILE $file NOT FOUND"
    ERRORS=$((ERRORS + 1))
    return
  fi
  if grep -q "$pattern" "$f"; then
    echo "   [OK]   $label"
  else
    echo "   [FAIL] $label — pattern not found in $file"
    ERRORS=$((ERRORS + 1))
  fi
}

echo "=== Verification post-build PlanYourTrip ==="

check_src "pages/RoadtripPage.jsx" "carouselRef" "Carrousel d etapes"
check_src "pages/RoadtripPage.jsx" "overlayTypes" "Boutons overlay (campings rando P4N POI)"
check_src "pages/RoadtripPage.jsx" "toggleOverlay" "Fonction toggle overlay"
check_src "pages/RoadtripPage.jsx" "handleSearchArea" "Bouton recherche zone"
check_src "pages/RoadtripPage.jsx" "PlacesAutocompleteInput" "Barre recherche lieu"
check_src "pages/RoadtripPage.jsx" "handleAddAsStep" "Ajout etape depuis recherche"

check_src "components/MapView.jsx" "overlayData" "Support overlay data"
check_src "components/MapView.jsx" "flyToCoord" "Support flyTo coord"
check_src "components/MapView.jsx" "useCallback" "Import useCallback"

BUILD_DIR="/opt/planyourtrip/frontend/web/dist"
BUNDLE=$(ls $BUILD_DIR/assets/index-*.js 2>/dev/null | head -1)
CSS=$(ls $BUILD_DIR/assets/index-*.css 2>/dev/null | head -1)

if [ -z "$BUNDLE" ]; then
  echo "[FAIL] BUILD FAILED: no bundle found"
  ERRORS=$((ERRORS + 1))
else
  echo "Bundle: $(basename $BUNDLE) ($(du -h "$BUNDLE" | cut -f1))"
  echo "CSS:    $(basename $CSS) ($(du -h "$CSS" | cut -f1))"
fi

echo "=== Result ==="
if [ $ERRORS -eq 0 ]; then
  echo "[OK] Build OK — all components present"
else
  echo "[FAIL] $ERRORS error(s) — fix before deploying"
fi
exit $ERRORS
