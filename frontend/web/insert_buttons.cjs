const fs = require('fs');
const path = 'src/pages/RoadtripPage.jsx';
let src = fs.readFileSync(path, 'utf-8');

const marker = '      {/* Horizontal step carousel at bottom';
if (!src.includes(marker)) {
  console.log('MARKER NOT FOUND');
  process.exit(1);
}

const buttons = `
      {/* Overlay toggle buttons */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-2">
        <button onClick={() => toggleOverlay('campings')} className={"w-10 h-10 rounded-xl flex items-center justify-center text-base shadow-lg transition-all " + (activeOverlays.campings ? "bg-emerald-500 text-white ring-2 ring-emerald-300 scale-110" : "bg-white/90 text-gray-600 hover:bg-white")} title="Campings">🏕️</button>
        <button onClick={() => toggleOverlay('trails')} className={"w-10 h-10 rounded-xl flex items-center justify-center text-base shadow-lg transition-all " + (activeOverlays.trails ? "bg-blue-500 text-white ring-2 ring-blue-300 scale-110" : "bg-white/90 text-gray-600 hover:bg-white")} title="Randonnées">🥾</button>
        <button onClick={() => toggleOverlay('park4night')} className={"w-10 h-10 rounded-xl flex items-center justify-center text-base shadow-lg transition-all " + (activeOverlays.park4night ? "bg-violet-500 text-white ring-2 ring-violet-300 scale-110" : "bg-white/90 text-gray-600 hover:bg-white")} title="Park4Night">🅿️</button>
        <button onClick={() => toggleOverlay('pois')} className={"w-10 h-10 rounded-xl flex items-center justify-center text-base shadow-lg transition-all " + (activeOverlays.pois ? "bg-red-500 text-white ring-2 ring-red-300 scale-110" : "bg-white/90 text-gray-600 hover:bg-white")} title="Points d'intérêt">📍</button>
      </div>
`;

src = src.replace(marker, buttons + marker);
fs.writeFileSync(path, src, 'utf-8');
console.log('OK - overlay buttons inserted');
