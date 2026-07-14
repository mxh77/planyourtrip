const fs = require('fs');
const path = '/opt/planyourtrip/frontend/web/src/components/MapView.jsx';
let src = fs.readFileSync(path, 'utf-8');

// Patch 1: Remove selectedStepId from the second useEffect deps
src = src.replace(
  "  }, [mapReady, steps, selectedStepId, routes]);\n\n  // Marqueurs détail",
  "  // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [mapReady, steps, routes]);\n\n  // Marqueurs détail"
);

// Patch 2: Replace the zoom effect to remove prevSelectedRef guard and always zoom on change
src = src.replace(
  "  // Marqueurs détail (hébergements + activités) + zoom sur l'étape sélectionnée\n  useEffect(() => {\n    if (!mapReady || !mapRef.current) return;\n    // Nettoyer les anciens marqueurs détail\n    if (infoWindowRef.current) { infoWindowRef.current.close(); }\n    detailMarkersRef.current.forEach(m => { m.map = null; });\n    detailMarkersRef.current = [];\n\n    // Si focusRoute vient d'être annulé, réinitialiser pour forcer le re-zoom\n    if (!focusRoute) prevSelectedRef.current = null;\n    if (selectedStepId === prevSelectedRef.current) return;\n    prevSelectedRef.current = selectedStepId;\n    if (focusRoute) return;\n    if (!selectedStepId) return;",
  "  // Zoom to selected step — smooth like Polarsteps, always on change\n  useEffect(() => {\n    if (!mapReady || !mapRef.current) return;\n    if (!selectedStepId) return;\n    if (focusRoute) return;\n\n    // Close info windows\n    if (infoWindowRef.current) { infoWindowRef.current.close(); }\n    detailMarkersRef.current.forEach(m => { m.map = null; });\n    detailMarkersRef.current = [];"
);

// Patch 3: Remove unused prevSelectedRef and prevFocusRouteRef declarations
src = src.replace(
  "  const prevSelectedRef = useRef(null);\n  const prevFocusRouteRef = useRef(null);",
  "  const prevFocusRouteRef = useRef(null);"
);

// Also remove prevFocusRouteRef since it's also unused
src = src.replace(
  "  const prevFocusRouteRef = useRef(null);\n  const [mapReady, setMapReady]",
  "  const [mapReady, setMapReady]"
);

fs.writeFileSync(path, src, 'utf-8');
console.log('MapView.jsx patched successfully');

// Verify by checking for key strings
const content = fs.readFileSync(path, 'utf-8');
console.log('Has prevSelectedRef:', content.includes('prevSelectedRef'));
console.log('Has "selectedStepId, routes]);":', content.includes('selectedStepId, routes]);'));
console.log('Has "routes]);":', content.includes('routes]);'));
