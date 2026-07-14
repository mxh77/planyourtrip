const fs = require('fs');
const path = '/opt/planyourtrip/frontend/web/src/components/MapView.jsx';
let src = fs.readFileSync(path, 'utf-8');

// 1. Add overlayData prop to destructuring
src = src.replace(
  "export default function MapView({ steps, selectedStepId, onSelectStep, routes, focusRoute, onStepDragged, zoomKey }) {",
  "export default function MapView({ steps, selectedStepId, onSelectStep, routes, focusRoute, onStepDragged, zoomKey, overlayData }) {"
);

// 2. Add overlay markers rendering after the zoom effect (before focusRoute effect)
const focusRouteEffect = `  // Zoom sur un segment d'itinéraire (focusRoute)
  useEffect(() => {`;

// Add overlay marker rendering code before it
const overlayCode = `  // Overlay markers (campings, trails, POIs, P4N)
  const overlayMarkersRef = useRef([]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !overlayData) return;

    // Clear old overlay markers
    overlayMarkersRef.current.forEach(m => { m.map = null; });
    overlayMarkersRef.current = [];

    const { AdvancedMarkerElement } = window.google.maps.marker;

    const addOverlayMarkers = (items, icon, color) => {
      if (!items || !items.length) return;
      items.forEach(item => {
        const lat = parseFloat(item.lat || item.latitude);
        const lng = parseFloat(item.lng || item.longitude);
        if (isNaN(lat) || isNaN(lng)) return;
        const el = document.createElement('div');
        el.style.cssText = \`width:30px;height:30px;background:\${color};border:2px solid white;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 2px 6px rgba(0,0,0,.35);cursor:pointer\`;
        el.textContent = icon;
        const m = new AdvancedMarkerElement({
          position: { lat, lng },
          map: mapRef.current,
          title: item.name || '',
          content: el,
          zIndex: 40,
        });
        if (item.name || item.address) {
          m.addListener('gmp-click', () => {
            if (!infoWindowRef.current) infoWindowRef.current = new window.google.maps.InfoWindow();
            infoWindowRef.current.setContent(\`<div style="font-size:13px;font-weight:600;padding:2px 6px"><span style="font-size:16px;margin-right:4px">\${icon}</span>\${item.name || ''}\${item.address ? '<br/><span style="font-size:11px;color:#666">' + item.address + '</span>' : ''}</div>\`);
            infoWindowRef.current.open({ anchor: m, map: mapRef.current });
          });
        }
        overlayMarkersRef.current.push(m);
      });
    };

    addOverlayMarkers(overlayData.campings, '🏕️', '#059669');
    addOverlayMarkers(overlayData.trails, '🥾', '#2563eb');
    addOverlayMarkers(overlayData.pois, '📍', '#dc2626');
    addOverlayMarkers(overlayData.park4night, '🅿️', '#7c3aed');
  }, [mapReady, overlayData]);`;

src = src.replace(focusRouteEffect, overlayCode + '\n\n  ' + focusRouteEffect);

fs.writeFileSync(path, src, 'utf-8');
console.log('MapView.jsx patched with overlay support');
