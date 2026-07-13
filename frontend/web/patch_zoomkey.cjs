const fs = require('fs');
const path = '/opt/planyourride/frontend/web/src/components/MapView.jsx';
let src = fs.readFileSync(path, 'utf-8');

// 1. Add zoomKey prop
src = src.replace(
  "export default function MapView({ steps, selectedStepId, onSelectStep, routes, focusRoute, onStepDragged }) {",
  "export default function MapView({ steps, selectedStepId, onSelectStep, routes, focusRoute, onStepDragged, zoomKey }) {"
);

// 2. Replace the Polarsteps zoom effect with one that includes zoomKey
const oldZoomEffect = `  // Zoom to selected step — smooth like Polarsteps, always on change
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    if (!selectedStepId) return;
    if (focusRoute) return;

    // Close info windows
    if (infoWindowRef.current) { infoWindowRef.current.close(); }
    detailMarkersRef.current.forEach(m => { m.map = null; });
    detailMarkersRef.current = [];

    const step = steps.find(s => s.id === selectedStepId);
    if (!step) return;

    const { AdvancedMarkerElement } = window.google.maps.marker;
    const bounds = new window.google.maps.LatLngBounds();
    let hasPoi = false;

    // Étape elle-même
    if (step.latitude != null && step.longitude != null) {
      bounds.extend({ lat: parseFloat(step.latitude), lng: parseFloat(step.longitude) });
    }

    // Hébergements
    (step.accommodations ?? []).forEach(a => {
      if (a.latitude == null || a.longitude == null) return;
      const lat = parseFloat(a.latitude);
      const lng = parseFloat(a.longitude);
      if (isNaN(lat) || isNaN(lng)) return;
      bounds.extend({ lat, lng });
      hasPoi = true;
      const emoji = ACCOM_ICONS[a.type] || '🏨';
      const label = a.name || 'Hébergement';
      const m = new AdvancedMarkerElement({
        position: { lat, lng },
        map: mapRef.current,
        title: label,
        content: makePoiMarkerEl(emoji, '#059669'),
        zIndex: 50,
      });
      m.addListener('gmp-click', () => {
        if (!infoWindowRef.current) infoWindowRef.current = new window.google.maps.InfoWindow();
        infoWindowRef.current.setContent(\`<div style="font-size:13px;font-weight:600;padding:2px 4px">\${label}</div>\`);
        infoWindowRef.current.open({ anchor: m, map: mapRef.current });
      });
      detailMarkersRef.current.push(m);
    });

    // Activités
    (step.activities ?? []).forEach(act => {
      if (act.latitude == null || act.longitude == null) return;
      const lat = parseFloat(act.latitude);
      const lng = parseFloat(act.longitude);
      if (isNaN(lat) || isNaN(lng)) return;
      bounds.extend({ lat, lng });
      hasPoi = true;
      const emoji = ACTIVITY_ICONS[act.type] || '📌';
      const label = act.name || 'Activité';
      const m = new AdvancedMarkerElement({
        position: { lat, lng },
        map: mapRef.current,
        title: label,
        content: makePoiMarkerEl(emoji, '#DC2626'),
        zIndex: 50,
      });
      m.addListener('gmp-click', () => {
        if (!infoWindowRef.current) infoWindowRef.current = new window.google.maps.InfoWindow();
        infoWindowRef.current.setContent(\`<div style="font-size:13px;font-weight:600;padding:2px 4px">\${label}</div>\`);
        infoWindowRef.current.open({ anchor: m, map: mapRef.current });
      });
      detailMarkersRef.current.push(m);
    });

    // Zoom
    if (hasPoi && !bounds.isEmpty()) {
      mapRef.current.fitBounds(bounds, { top: 80, right: 80, bottom: 80, left: 80 });
    } else if (step.latitude != null && step.longitude != null) {
      mapRef.current.panTo({ lat: parseFloat(step.latitude), lng: parseFloat(step.longitude) });
      mapRef.current.setZoom(13);
    }
  }, [mapReady, selectedStepId, steps, focusRoute]);`;

const newZoomEffect = `  // Zoom to selected step — forced by zoomKey for reliable Polarsteps-like behavior
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    if (!selectedStepId) return;
    if (focusRoute) return;

    // Close info windows
    if (infoWindowRef.current) { infoWindowRef.current.close(); }
    detailMarkersRef.current.forEach(m => { m.map = null; });
    detailMarkersRef.current = [];

    const step = steps.find(s => s.id === selectedStepId);
    if (!step) return;

    const { AdvancedMarkerElement } = window.google.maps.marker;
    const bounds = new window.google.maps.LatLngBounds();
    let hasPoi = false;

    // Étape elle-même
    if (step.latitude != null && step.longitude != null) {
      bounds.extend({ lat: parseFloat(step.latitude), lng: parseFloat(step.longitude) });
    }

    // Hébergements
    (step.accommodations ?? []).forEach(a => {
      if (a.latitude == null || a.longitude == null) return;
      const lat = parseFloat(a.latitude);
      const lng = parseFloat(a.longitude);
      if (isNaN(lat) || isNaN(lng)) return;
      bounds.extend({ lat, lng });
      hasPoi = true;
      const emoji = ACCOM_ICONS[a.type] || '🏨';
      const label = a.name || 'Hébergement';
      const m = new AdvancedMarkerElement({
        position: { lat, lng },
        map: mapRef.current,
        title: label,
        content: makePoiMarkerEl(emoji, '#059669'),
        zIndex: 50,
      });
      m.addListener('gmp-click', () => {
        if (!infoWindowRef.current) infoWindowRef.current = new window.google.maps.InfoWindow();
        infoWindowRef.current.setContent(\`<div style="font-size:13px;font-weight:600;padding:2px 4px">\${label}</div>\`);
        infoWindowRef.current.open({ anchor: m, map: mapRef.current });
      });
      detailMarkersRef.current.push(m);
    });

    // Activités
    (step.activities ?? []).forEach(act => {
      if (act.latitude == null || act.longitude == null) return;
      const lat = parseFloat(act.latitude);
      const lng = parseFloat(act.longitude);
      if (isNaN(lat) || isNaN(lng)) return;
      bounds.extend({ lat, lng });
      hasPoi = true;
      const emoji = ACTIVITY_ICONS[act.type] || '📌';
      const label = act.name || 'Activité';
      const m = new AdvancedMarkerElement({
        position: { lat, lng },
        map: mapRef.current,
        title: label,
        content: makePoiMarkerEl(emoji, '#DC2626'),
        zIndex: 50,
      });
      m.addListener('gmp-click', () => {
        if (!infoWindowRef.current) infoWindowRef.current = new window.google.maps.InfoWindow();
        infoWindowRef.current.setContent(\`<div style="font-size:13px;font-weight:600;padding:2px 4px">\${label}</div>\`);
        infoWindowRef.current.open({ anchor: m, map: mapRef.current });
      });
      detailMarkersRef.current.push(m);
    });

    // Zoom — uses setTimeout to ensure map is ready after fitBounds from marker build
    setTimeout(() => {
      if (hasPoi && !bounds.isEmpty()) {
        mapRef.current.fitBounds(bounds, { top: 80, right: 80, bottom: 80, left: 80 });
      } else if (step.latitude != null && step.longitude != null) {
        mapRef.current.panTo({ lat: parseFloat(step.latitude), lng: parseFloat(step.longitude) });
        mapRef.current.setZoom(13);
      }
    }, 50);
  }, [mapReady, selectedStepId, steps, focusRoute, zoomKey]);`;

src = src.replace(oldZoomEffect, newZoomEffect);

fs.writeFileSync(path, src, 'utf-8');
console.log('MapView.jsx patched with zoomKey');
console.log('Has zoomKey in deps:', src.includes('zoomKey'));
console.log('Has zoomKey prop:', src.includes('zoomKey,'));
