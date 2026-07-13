const fs = require('fs');
const path = 'src/pages/RoadtripPage.jsx';
let src = fs.readFileSync(path, 'utf-8');

// 1. Replace the 4 individual overlay buttons with a single search button
const oldButtons = `      {/* Overlay toggle buttons */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-2">
        <button onClick={() => toggleOverlay('campings')} className={"w-10 h-10 rounded-xl flex items-center justify-center text-base shadow-lg transition-all " + (activeOverlays.campings ? "bg-emerald-500 text-white ring-2 ring-emerald-300 scale-110" : "bg-white/90 text-gray-600 hover:bg-white")} title="Campings">🏕️</button>
        <button onClick={() => toggleOverlay('trails')} className={"w-10 h-10 rounded-xl flex items-center justify-center text-base shadow-lg transition-all " + (activeOverlays.trails ? "bg-blue-500 text-white ring-2 ring-blue-300 scale-110" : "bg-white/90 text-gray-600 hover:bg-white")} title="Randonnées">🥾</button>
        <button onClick={() => toggleOverlay('park4night')} className={"w-10 h-10 rounded-xl flex items-center justify-center text-base shadow-lg transition-all " + (activeOverlays.park4night ? "bg-violet-500 text-white ring-2 ring-violet-300 scale-110" : "bg-white/90 text-gray-600 hover:bg-white")} title="Park4Night">🅿️</button>
        <button onClick={() => toggleOverlay('pois')} className={"w-10 h-10 rounded-xl flex items-center justify-center text-base shadow-lg transition-all " + (activeOverlays.pois ? "bg-red-500 text-white ring-2 ring-red-300 scale-110" : "bg-white/90 text-gray-600 hover:bg-white")} title="Points d'intérêt">📍</button>
      </div>`;

const newButtons = `      {/* Search area button — triggers all overlays at once */}
      <div className="absolute right-3 z-30" style={{ top: '50%', transform: 'translateY(-50%)' }}>
        <button
          onClick={searchArea}
          disabled={searchingArea}
          className={"w-12 h-12 rounded-2xl flex flex-col items-center justify-center shadow-xl transition-all text-xs font-semibold " + (hasOverlayData ? "bg-blue-500 text-white ring-2 ring-blue-300" : "bg-white/90 text-gray-700 hover:bg-white hover:shadow-2xl")}
          title="Rechercher campings, randos, P4N, POI dans cette zone"
        >
          {searchingArea ? (
            <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <span className="text-base leading-none mb-0.5">🔍</span>
              <span className="text-[9px]">Chercher</span>
            </>
          )}
        </button>
        {hasOverlayData && (
          <button
            onClick={clearOverlays}
            className="w-12 h-7 mt-1.5 rounded-xl flex items-center justify-center bg-white/80 text-gray-500 text-xs shadow hover:bg-white transition-all"
            title="Effacer les résultats"
          >
            ✕
          </button>
        )}
      </div>`;

src = src.replace(oldButtons, newButtons);

// 2. Add searchAllOverlays function and related state
src = src.replace(
  "  const [searchValue, setSearchValue] = useState('');",
  "  const [searchValue, setSearchValue] = useState('');\n  const [searchingArea, setSearchingArea] = useState(false);"
);

// 3. Add searchArea and clearOverlays functions
const searchFuncs = `
  const hasOverlayData = overlayData && Object.keys(overlayData).length > 0;

  const searchArea = useCallback(async () => {
    if (searchingArea) return;
    setSearchingArea(true);
    const types = ['campings', 'trails', 'pois', 'park4night'];
    const center = steps[selectedStepIndex];
    const lat = center?.latitude || 47.0;
    const lng = center?.longitude || 2.5;
    const results = {};
    try {
      const promises = types.map(async (type) => {
        try {
          const res = await api.get(OVERLAY_APIS[type], {
            params: { lat, lng, radius: 50000 }
          });
          results[type] = res.data || [];
        } catch {
          results[type] = [];
        }
      });
      await Promise.all(promises);
      setOverlayData(results);
      setActiveOverlays(Object.fromEntries(types.map(t => [t, true])));
    } catch (e) {
      console.error('Search area failed', e);
    } finally {
      setSearchingArea(false);
    }
  }, [searchingArea, steps, selectedStepIndex]);

  const clearOverlays = () => {
    setOverlayData(null);
    setActiveOverlays({});
    setSearchingArea(false);
  };
`;

src = src.replace(
  "  const OVERLAY_APIS = {",
  searchFuncs + "\n  const OVERLAY_APIS = {"
);

fs.writeFileSync(path, src, 'utf-8');
console.log('RoadtripPage.jsx - replaced toggles with search button');
console.log('Has searchArea:', src.includes('searchArea'));
console.log('Has clearOverlays:', src.includes('clearOverlays'));
