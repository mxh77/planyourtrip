const fs = require('fs');
const path = 'src/components/MapView.jsx';
let src = fs.readFileSync(path, 'utf-8');

// 1. Add flyToCoord and onFlyToDone props
src = src.replace(
  "export default function MapView({ steps, selectedStepId, onSelectStep, routes, focusRoute, onStepDragged, zoomKey, overlayData }) {",
  "export default function MapView({ steps, selectedStepId, onSelectStep, routes, focusRoute, onStepDragged, zoomKey, overlayData, flyToCoord, onFlyToDone }) {"
);

// 2. Add flyTo effect after overlay markers effect
const overlayEnd = "  }, [mapReady, overlayData]);";

const flyToEffect = `
  // Fly to coordinate when search is used
  useEffect(() => {
    if (!mapReady || !mapRef.current || !flyToCoord) return;
    mapRef.current.panTo({ lat: parseFloat(flyToCoord.lat), lng: parseFloat(flyToCoord.lng) });
    mapRef.current.setZoom(14);
    if (onFlyToDone) setTimeout(() => onFlyToDone(), 500);
  }, [mapReady, flyToCoord]);`;

src = src.replace(overlayEnd, overlayEnd + flyToEffect);

fs.writeFileSync(path, src, 'utf-8');
console.log('MapView.jsx patched with flyToCoord');
