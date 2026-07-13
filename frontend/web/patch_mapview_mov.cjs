const fs = require('fs');
const path = 'src/components/MapView.jsx';
let src = fs.readFileSync(path, 'utf-8');

// 1. Add onMapMove, onSearchArea, mapMoved props
src = src.replace(
  "export default function MapView({ steps, selectedStepId, onSelectStep, routes, focusRoute, onStepDragged, zoomKey, overlayData, flyToCoord, onFlyToDone }) {",
  "export default function MapView({ steps, selectedStepId, onSelectStep, routes, focusRoute, onStepDragged, zoomKey, overlayData, flyToCoord, onFlyToDone, onMapMove, onSearchArea, mapMoved }) {"
);

// 2. Add bounds_changed + dragend listeners after map init
const mapInitEnd = "        mapRef.current = map;\n        setMapReady(true);";

const moveListeners = `
        // Detect map movement for "Rechercher dans cette zone" button
        let moveTimeout;
        map.addListener('bounds_changed', () => {
          clearTimeout(moveTimeout);
          moveTimeout = setTimeout(() => {
            if (onMapMove && mapRef.current) {
              onMapMove();
            }
          }, 300);
        });
        map.addListener('dragend', () => {
          if (onMapMove) onMapMove();
        });`;

src = src.replace(mapInitEnd, mapInitEnd + moveListeners);

// 3. Expose map bounds via a ref that RoadtripPage can use
// Add a mapBoundsRef and expose getBounds
const handleSearchAreaRef = `
  // Expose bounds for the search area button
  const getBoundsStr = useCallback(() => {
    if (!mapRef.current) return null;
    return mapRef.current.getBounds();
  }, []);

  // Store bounds in a ref so RoadtripPage can access them
  // (Avoids circular ref issues)
  if (onSearchArea && typeof window !== 'undefined') {
    window.__mapGetBounds = getBoundsStr;
  }
`;

// Add after the overlay markers effect
src = src.replace(
  "  }, [mapReady, overlayData]);\n",
  "  }, [mapReady, overlayData]);\n" + handleSearchAreaRef + "\n"
);

fs.writeFileSync(path, src, 'utf-8');
console.log('MapView.jsx patched with map move detection');
