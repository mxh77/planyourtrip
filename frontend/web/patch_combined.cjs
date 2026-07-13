const fs = require('fs');
const path = 'src/pages/RoadtripPage.jsx';
let src = fs.readFileSync(path, 'utf-8');

const searchButtons = `      {/* Overlay buttons — search + individual toggles */}
      <div className="absolute right-3 z-30 flex flex-col gap-1.5 items-center" style={{ top: '50%', transform: 'translateY(-50%)' }}>
        {/* Chercher tout */}
        <button
          onClick={searchArea}
          disabled={searchingArea}
          className={"w-11 h-11 rounded-xl flex items-center justify-center shadow-lg transition-all " + (searchingArea ? "bg-gray-300" : hasOverlayData ? "bg-blue-500 text-white ring-2 ring-blue-300" : "bg-white/90 text-gray-700 hover:bg-white")}
          title="Rechercher tout dans cette zone"
        >
          {searchingArea ? (
            <span className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          ) : (
            <span className="text-lg">🔍</span>
          )}
        </button>

        <div className="w-8 h-px bg-gray-200/60 my-0.5" />

        {/* Campings */}
        <button onClick={() => toggleOverlay('campings')} className={"w-10 h-10 rounded-xl flex items-center justify-center text-base shadow-lg transition-all " + (activeOverlays.campings ? "bg-emerald-500 text-white ring-2 ring-emerald-300 scale-110" : "bg-white/90 text-gray-600 hover:bg-white")} title="Campings">🏕️</button>
        {/* Randonnées */}
        <button onClick={() => toggleOverlay('trails')} className={"w-10 h-10 rounded-xl flex items-center justify-center text-base shadow-lg transition-all " + (activeOverlays.trails ? "bg-blue-500 text-white ring-2 ring-blue-300 scale-110" : "bg-white/90 text-gray-600 hover:bg-white")} title="Randonnées">🥾</button>
        {/* Park4Night */}
        <button onClick={() => toggleOverlay('park4night')} className={"w-10 h-10 rounded-xl flex items-center justify-center text-base shadow-lg transition-all " + (activeOverlays.park4night ? "bg-violet-500 text-white ring-2 ring-violet-300 scale-110" : "bg-white/90 text-gray-600 hover:bg-white")} title="Park4Night">🅿️</button>
        {/* POI */}
        <button onClick={() => toggleOverlay('pois')} className={"w-10 h-10 rounded-xl flex items-center justify-center text-base shadow-lg transition-all " + (activeOverlays.pois ? "bg-red-500 text-white ring-2 ring-red-300 scale-110" : "bg-white/90 text-gray-600 hover:bg-white")} title="Points d'intérêt">📍</button>

        {/* Clear all */}
        {hasOverlayData && (
          <button onClick={clearOverlays} className="w-10 h-8 rounded-xl flex items-center justify-center bg-white/80 text-gray-500 text-xs shadow hover:bg-white transition-all mt-0.5" title="Tout effacer">
            ✕
          </button>
        )}
      </div>`;

// Find and replace the old section
const oldBlock = src.match(/<div className="absolute right-3 z-30"[\s\S]*?<\/div>\s*<\/div>/);
if (oldBlock) {
  src = src.replace(oldBlock[0], searchButtons);
  fs.writeFileSync(path, src, 'utf-8');
  console.log('OK - search + toggle buttons combined');
} else {
  console.log('Could not find old buttons block');
}
