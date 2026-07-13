const fs = require('fs');
const path = 'src/pages/RoadtripPage.jsx';
let src = fs.readFileSync(path, 'utf-8');

// 1. Import PlacesAutocompleteInput
src = src.replace(
  "import { computeAllRoutes, reverseGeocode } from '../utils/directions.js';",
  "import { computeAllRoutes, reverseGeocode } from '../utils/directions.js';\nimport PlacesAutocompleteInput from '../components/PlacesAutocompleteInput.jsx';"
);

// 2. Add search state after overlayData
src = src.replace(
  "  const [loadingOverlays, setLoadingOverlays] = useState({});",
  "  const [loadingOverlays, setLoadingOverlays] = useState({});\n  const [searchValue, setSearchValue] = useState('');\n  const [flyToCoord, setFlyToCoord] = useState(null);\n  const [showAddStep, setShowAddStep] = useState(null);"
);

// 3. Add handlePlaceSelect after toggleOverlay
src = src.replace(
  "  const handleSaveStep = async (data) => {",
  `  const handlePlaceSelect = (place) => {
    // Fly to the selected place
    setFlyToCoord({ lat: place.latitude, lng: place.longitude });
    setSelectedStepIndex(-1); // deselect step to show flyTo works
    setSearchValue(place.name);
    // Show "add as step" prompt
    setShowAddStep(place);
  };

  const handleAddAsStep = async () => {
    if (!showAddStep) return;
    try {
      const lastIdx = steps.length > 0 ? Math.max(...steps.map(s => s.order || 0)) + 1 : 0;
      const res = await api.post('/steps', {
        roadtripId: id,
        name: showAddStep.name,
        location: showAddStep.address,
        latitude: showAddStep.latitude,
        longitude: showAddStep.longitude,
        order: lastIdx,
        startDate: roadtrip?.startDate || null,
      });
      // Refresh steps from roadtrip
      const rt = await api.get(\`/roadtrips/\${id}\`);
      if (rt.data.steps) {
        setSteps(rt.data.steps.sort((a, b) => a.order - b.order));
      }
      setSearchValue('');
      setShowAddStep(null);
      // Select the new step and zoom
      const newSteps = rt.data.steps.sort((a, b) => a.order - b.order);
      setSelectedStepIndex(newSteps.length - 1);
      setZoomKey(k => k + 1);
    } catch (e) {
      console.error('Failed to add step', e);
    }
  };

  const handleSearchClear = () => {
    setSearchValue('');
    setShowAddStep(null);
    setFlyToCoord(null);
  };

  const handleSaveStep = async (data) => {`
);

// 4. Pass flyToCoord to MapView
src = src.replace(
  "          overlayData={overlayData}",
  "          overlayData={overlayData}\n          flyToCoord={flyToCoord}\n          onFlyToDone={() => setFlyToCoord(null)}"
);

// 5. Add search bar + add step prompt after title pill
const searchBarAndAdd = `
      {/* Search bar */}
      <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-2rem)] max-w-md" style={{ top: 'calc(3.5rem + env(safe-area-inset-top, 0px))' }}>
        <div className="relative">
          <PlacesAutocompleteInput
            value={searchValue}
            onChange={(v) => { setSearchValue(v); setShowAddStep(null); }}
            onPlaceSelect={handlePlaceSelect}
            placeholder="Rechercher un lieu…"
            lat={steps[selectedStepIndex]?.latitude}
            lng={steps[selectedStepIndex]?.longitude}
            className="w-full bg-white/95 backdrop-blur rounded-xl shadow-xl px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 border-0 focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        {/* Add step prompt */}
        {showAddStep && (
          <div className="mt-2 bg-white/95 backdrop-blur rounded-xl shadow-xl p-3 flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{showAddStep.name}</p>
              <p className="text-xs text-gray-500 truncate">{showAddStep.address}</p>
            </div>
            <button
              onClick={handleAddAsStep}
              className="shrink-0 bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-600 transition"
            >
              + Étape
            </button>
            <button
              onClick={handleSearchClear}
              className="shrink-0 text-gray-400 hover:text-gray-600 text-lg"
            >
              ×
            </button>
          </div>
        )}
      </div>`;

// Find the marker for "Roadtrip title pill" section
const titlePillEnd = `      {roadtrip && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 bg-white/90 backdrop-blur px-4 py-1.5 rounded-full shadow-lg text-sm font-medium text-gray-800 whitespace-nowrap pointer-events-none">
          {roadtrip.title}
        </div>
      )}`;

src = src.replace(titlePillEnd, titlePillEnd + searchBarAndAdd);

fs.writeFileSync(path, src, 'utf-8');
console.log('RoadtripPage.jsx patched with search bar');
console.log('Has PlacesAutocompleteInput:', src.includes('PlacesAutocompleteInput'));
console.log('Has handlePlaceSelect:', src.includes('handlePlaceSelect'));
console.log('Has flyToCoord:', src.includes('flyToCoord'));
