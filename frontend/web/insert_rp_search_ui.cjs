const fs = require('fs');
let s = fs.readFileSync('src/pages/RoadtripPage.jsx', 'utf-8');

// Insert the search area button + results banner AFTER the search bar closing div
const insertPoint = `        )}
      </div>


      {/* Modals */}`;

const searchAreaUI = `        )}
      </div>

      {/* Rechercher dans cette zone button — like RP */}
      {mapMoved && !searchingArea && (
        <button
          onClick={() => {
            const bounds = window.__mapGetBounds ? window.__mapGetBounds() : null;
            handleSearchArea(bounds);
          }}
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
      {/* Results banner — like RP */}
      {areaResults && !mapMoved && !searchingArea && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-white/95 backdrop-blur border border-blue-200 shadow-lg text-xs text-gray-600 px-3 py-1.5 rounded-full flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500/70" />
          {(() => {
            const labels = { campings: 'camping', trails: 'rando', pois: 'POI', park4night: 'P4N' };
            const parts = Object.entries(areaResults).map(([t, items]) => {
              const n = Array.isArray(items) ? items.length : 0;
              return n > 0 ? n + ' ' + (labels[t] || t) + (n > 1 ? 's' : '') : null;
            }).filter(Boolean);
            return parts.length > 0 ? parts.join(', ') + ' trouvé' + (parts.length > 1 ? 's' : '') : 'Aucun résultat';
          })()} — déplacez la carte pour actualiser
          <button onClick={clearAreaResults} className="text-gray-400 hover:text-gray-700 ml-1 leading-none text-base" title="Fermer">✕</button>
        </div>
      )}

      {/* Modals */}`;

if (s.includes(insertPoint)) {
  s = s.replace(insertPoint, searchAreaUI);
  fs.writeFileSync('src/pages/RoadtripPage.jsx', s);
  console.log('OK - inserted search area button + results banner');
} else {
  console.log('Could not find insertion point');
  // Show what's actually there
  const idx = s.indexOf('{/* Modals */}');
  if (idx >= 0) {
    console.log('Context around Modals:', s.substring(idx - 100, idx));
  }
}
