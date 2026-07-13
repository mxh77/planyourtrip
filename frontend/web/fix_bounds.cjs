const fs = require('fs');
let s = fs.readFileSync('src/pages/RoadtripPage.jsx', 'utf-8');

// 1. Make handleSearchArea use window.__mapGetBounds
s = s.replace(
  "            const bounds = window.__mapGetBounds ? window.__mapGetBounds() : null;\n            handleSearchArea(bounds);",
  "            handleSearchArea();"
);

// 2. Fix handleSearchArea to get bounds from window
s = s.replace(
  "  const handleSearchArea = async (bounds_in) => {\n    const bounds = bounds_in || mapBoundsRef.current;",
  "  const handleSearchArea = async () => {\n    const bounds = (typeof window !== 'undefined' && window.__mapGetBounds) ? window.__mapGetBounds() : null;"
);

// 3. Add getAreaParams function
s = s.replace(
  "  const getAreaParams = (bounds) => {",
  "  const getAreaParams2 = (bounds) => {"
);
// Note: the function was already inserted by the earlier patch, just rename to avoid conflict

// Actually let me check what's there
if (s.includes('const getAreaParams = (bounds)')) {
  console.log('getAreaParams already exists');
} else {
  console.log('getAreaParams not found - needs insertion');
  // Insert it before OVERLAY_APIS
  s = s.replace(
    "  const OVERLAY_APIS = {",
    `  const getAreaParams = (bounds) => {
    if (!bounds) return { lat: 47.0, lng: 2.5, radius: 25000 };
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const center = { lat: (ne.lat() + sw.lat()) / 2, lng: (ne.lng() + sw.lng()) / 2 };
    const R = 6371000;
    const dLat = (ne.lat() - center.lat) * Math.PI / 180;
    const dLng = (ne.lng() - center.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(center.lat * Math.PI / 180) * Math.cos(ne.lat() * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    const radius = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return { lat: center.lat, lng: center.lng, radius: Math.min(Math.round(radius), 60000) };
  };

  const OVERLAY_APIS = {`
  );
}

fs.writeFileSync('src/pages/RoadtripPage.jsx', s);
console.log('Fixed handleSearchArea and getAreaParams');
