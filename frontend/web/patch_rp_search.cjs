const fs = require('fs');
const path = 'src/pages/RoadtripPage.jsx';
let src = fs.readFileSync(path, 'utf-8');

// 1. Remove old overlay buttons block entirely
// Find everything from "Overlay buttons — search + individual toggles" to the closing div
const oldBlock = src.match(/\/\* Overlay buttons.*?\*\/\s*<div class="absolute right-3 z-30[\s\S]*?<\/div>\s*<\/div>/);
if (oldBlock) {
  src = src.replace(oldBlock[0], '');
  console.log('Removed old overlay buttons block');
} else {
  console.log('Old overlay buttons block not found with regex');
  // Try to find by line count start
}

// 2. Add mapMoved state, searchArea state, areaResults state
src = src.replace(
  "  const [searchingArea, setSearchingArea] = useState(false);",
  "  const [mapMoved, setMapMoved] = useState(false);\n  const [searchingArea, setSearchingArea] = useState(false);\n  const [areaResults, setAreaResults] = useState(null); // { type: count, ... } or null"
);

// 3. Add handleMapMove and getAreaParams and handleSearchArea
const searchFuncs = `
  const getAreaParams = (bounds) => {
    if (!bounds) return { lat: 47.0, lng: 2.5, radius: 25000 };
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const center = { lat: (ne.lat + sw.lat) / 2, lng: (ne.lng + sw.lng) / 2 };
    const R = 6371000;
    const dLat = (ne.lat - center.lat) * Math.PI / 180;
    const dLng = (ne.lng - center.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(center.lat * Math.PI / 180) * Math.cos(ne.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    const radius = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return { lat: center.lat, lng: center.lng, radius: Math.min(Math.round(radius), 60000) };
  };

  const handleMapMove = () => {
    setMapMoved(true);
  };

  const handleSearchArea = async (bounds) => {
    setSearchingArea(true);
    setMapMoved(false);
    const { lat, lng, radius } = getAreaParams(bounds);
    const types = ['campings', 'trails', 'pois', 'park4night'];
    const results = {};
    const promises = types.map(async (type) => {
      try {
        const res = await api.get(OVERLAY_APIS[type], { params: { lat, lng, radius } });
        let items = res.data || [];
        // Filter to visible bounds if available
        if (bounds && Array.isArray(items)) {
          items = items.filter(item => {
            const ilat = parseFloat(item.lat || item.latitude);
            const ilng = parseFloat(item.lng || item.longitude);
            if (isNaN(ilat) || isNaN(ilng)) return false;
            return bounds.contains({ lat: ilat, lng: ilng });
          });
        }
        results[type] = items;
      } catch {
        results[type] = [];
      }
    });
    await Promise.all(promises);
    setOverlayData(results);
    setActiveOverlays(Object.fromEntries(types.map(t => [t, true])));
    // Count total items
    const total = Object.values(results).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
    setAreaResults(total > 0 ? results : null);
    setSearchingArea(false);
  };

  const clearAreaResults = () => {
    setOverlayData(null);
    setActiveOverlays({});
    setAreaResults(null);
    setMapMoved(false);
  };
`;

// Insert before OVERLAY_APIS
src = src.replace(
  "  const OVERLAY_APIS = {",
  searchFuncs + "  const OVERLAY_APIS = {"
);

// 4. Add search area button + results banner after title pill + search bar section
// Find the "Search bar" section and add after it
const searchBanner = `
      {/* Rechercher dans cette zone button */}
      {mapMoved && !searchingArea && (
        <button
          onClick={() => handleSearchArea(mapBounds)}
          className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-white/95 backdrop-blur border border-gray-200 shadow-lg text-sm font-medium text-gray-800 px-4 py-2 rounded-full flex items-center gap-2 hover:bg-white hover:shadow-xl active:scale-95 transition-all"
        >
          <svg className="w-3.5 h-3.5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          Rechercher dans cette zone
        </button>
      )}
      {searchingArea && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-white/95 backdrop-blur border border-gray-200 shadow-lg text-sm text-gray-500 px-4 py-2 rounded-full flex items-center gap-2">
          <span className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          Recherche en cours…
        </div>
      )}
      {/* Results banner */}
      {areaResults && !mapMoved && !searchingArea && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-white/95 backdrop-blur border border-blue-200 shadow-lg text-xs text-gray-600 px-3 py-1.5 rounded-full flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500/70" />
          {(() => {
            const counts = Object.entries(areaResults).map(([type, items]) => {
              const n = Array.isArray(items) ? items.length : 0;
              if (n === 0) return null;
              const labels = { campings: 'camping', trails: 'rando', pois: 'POI', park4night: 'P4N' };
              return n + ' ' + (labels[type] || type) + (n > 1 ? 's' : '');
            }).filter(Boolean);
            return counts.length > 0 ? counts.join(', ') + ' trouvé' + (counts.length > 1 ? 's' : '') : 'Aucun résultat';
          })()} — déplacez la carte pour actualiser
          <button onClick={clearAreaResults} className="text-gray-400 hover:text-gray-700 ml-1 leading-none text-base" title="Fermer">✕</button>
        </div>
      )}`;

// Find the marker after the search bar section
// Look for "Add step prompt" section end
const addStepEnd = `              </div>
            </div>
          </div>
        )}
      </div>`;

// We need to insert AFTER the search bar section. 
// The "Add step prompt" section ends with the last </div> of the search bar,
// then there's a blank line then "Overlay toggle buttons" or "Horizontal step carousel"
// Let me find the exact insertion point
const insertAfter = src.indexOf('      {/* Horizontal step carousel');
if (insertAfter >= 0) {
  // Insert the search banner BEFORE the carousel section
  src = src.slice(0, insertAfter) + searchBanner + '\n\n' + src.slice(insertAfter);
  console.log('Inserted search area button + results banner');
} else {
  console.log('Could not find insertion point');
}

// 5. Pass onMapMove and onSearchArea to MapView
src = src.replace(
  "          flyToCoord={flyToCoord}\n          onFlyToDone={() => setFlyToCoord(null)}",
  "          flyToCoord={flyToCoord}\n          onFlyToDone={() => setFlyToCoord(null)}\n          onMapMove={handleMapMove}\n          onSearchArea={handleSearchArea}\n          mapMoved={mapMoved}"
);

// 6. Add mapBounds ref to store current bounds
src = src.replace(
  "  const [mapMoved, setMapMoved] = useState(false);",
  "  const [mapMoved, setMapMoved] = useState(false);\n  const mapBoundsRef = useRef(null);"
);

// 7. Use mapBoundsRef.current in handleSearchArea
src = src.replace(
  "  const handleSearchArea = async (bounds) => {",
  "  const handleSearchArea = async (bounds_in) => {\n    const bounds = bounds_in || mapBoundsRef.current;"
);

// 8. Remove the toggleOverlay function since we now use the full search
// Actually keep it - it might be useful if user clicks individual buttons later

// 9. Clean up the "searchArea" and "clearOverlays" functions that were from the previous approach
// They should still work but let me verify the searchArea function signature

fs.writeFileSync(path, src, 'utf-8');
console.log('RoadtripPage patched with RP-style search button');
console.log('Has handleMapMove:', src.includes('handleMapMove'));
console.log('Has handleSearchArea:', src.includes('handleSearchArea'));
console.log('Has Rechercher dans cette zone:', src.includes('Rechercher dans cette zone'));
