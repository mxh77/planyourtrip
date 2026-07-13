const fs = require('fs');
const path = '/opt/planyourride/frontend/web/src/pages/RoadtripPage.jsx';
let src = fs.readFileSync(path, 'utf-8');

// 1. Add overlay state after zoomKey
src = src.replace(
  "  const [zoomKey, setZoomKey] = useState(0);\n  const carouselRef = useRef(null);",
  "  const [zoomKey, setZoomKey] = useState(0);\n  const [activeOverlays, setActiveOverlays] = useState({});\n  const [overlayData, setOverlayData] = useState(null);\n  const [loadingOverlays, setLoadingOverlays] = useState({});\n  const carouselRef = useRef(null);"
);

// 2. Add overlay fetch function after handleSaveStep
const fetchOverlayFunction = `
  const OVERLAY_APIS = {
    campings: '/campings/nearby',
    trails: '/trails/nearby',
    pois: '/places/nearby',
    park4night: '/park4night/nearby',
  };

  const toggleOverlay = useCallback(async (type) => {
    const newActive = { ...activeOverlays, [type]: !activeOverlays[type] };
    setActiveOverlays(newActive);

    if (newActive[type]) {
      // Activating: fetch data
      setLoadingOverlays(l => ({ ...l, [type]: true }));
      try {
        const res = await api.get(OVERLAY_APIS[type], {
          params: { lat: steps[selectedStepIndex]?.latitude || 47.0, lng: steps[selectedStepIndex]?.longitude || 2.5, radius: 50000 }
        });
        setOverlayData(prev => ({ ...(prev || {}), [type]: res.data }));
      } catch (e) {
        console.error('Failed to fetch ' + type, e);
        setActiveOverlays(a => ({ ...a, [type]: false }));
      } finally {
        setLoadingOverlays(l => ({ ...l, [type]: false }));
      }
    } else {
      // Deactivating: remove data
      setOverlayData(prev => {
        if (!prev) return prev;
        const next = { ...prev };
        delete next[type];
        return Object.keys(next).length ? next : null;
      });
    }
  }, [activeOverlays, steps, selectedStepIndex]);
`;

src = src.replace(
  "  const handleSaveStep = async (data) => {",
  fetchOverlayFunction + "\n  const handleSaveStep = async (data) => {"
);

// 3. Pass overlayData to MapView
src = src.replace(
  "          zoomKey={zoomKey}\n        />",
  "          zoomKey={zoomKey}\n          overlayData={overlayData}\n        />"
);

// 4. Add overlay buttons panel after the title pill
const overlayButtons = `
      {/* Overlay toggle buttons */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-2">
        <button
          onClick={() => toggleOverlay('campings')}
          className={\`w-10 h-10 rounded-xl flex items-center justify-center text-base shadow-lg transition-all \${
            activeOverlays.campings ? 'bg-emerald-500 text-white ring-2 ring-emerald-300 scale-110' : 'bg-white/90 text-gray-600 hover:bg-white'
          }\`}
          title="Campings"
        >
          🏕️
        </button>
        <button
          onClick={() => toggleOverlay('trails')}
          className={\`w-10 h-10 rounded-xl flex items-center justify-center text-base shadow-lg transition-all \${
            activeOverlays.trails ? 'bg-blue-500 text-white ring-2 ring-blue-300 scale-110' : 'bg-white/90 text-gray-600 hover:bg-white'
          }\`}
          title="Randonnées"
        >
          🥾
        </button>
        <button
          onClick={() => toggleOverlay('park4night')}
          className={\`w-10 h-10 rounded-xl flex items-center justify-center text-base shadow-lg transition-all \${
            activeOverlays.park4night ? 'bg-violet-500 text-white ring-2 ring-violet-300 scale-110' : 'bg-white/90 text-gray-600 hover:bg-white'
          }\`}
          title="Park4Night"
        >
          🅿️
        </button>
        <button
          onClick={() => toggleOverlay('pois')}
          className={\`w-10 h-10 rounded-xl flex items-center justify-center text-base shadow-lg transition-all \${
            activeOverlays.pois ? 'bg-red-500 text-white ring-2 ring-red-300 scale-110' : 'bg-white/90 text-gray-600 hover:bg-white'
          }\`}
          title="Points d'intérêt"
        >
          📍
        </button>
      </div>`;

src = src.replace(
  "      {/* Horizontal step carousel at bottom */}",
  overlayButtons + "\n\n      {/* Horizontal step carousel at bottom */}"
);

fs.writeFileSync(path, src, 'utf-8');
console.log('RoadtripPage.jsx patched with overlay buttons');
console.log('Has toggleOverlay:', src.includes('toggleOverlay'));
console.log('Has overlayButtons:', src.includes('🏕️'));
console.log('Has overlayData:', src.includes('overlayData'));
