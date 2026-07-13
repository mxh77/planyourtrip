const fs = require('fs');
const path = '/opt/planyourride/frontend/web/src/pages/RoadtripPage.jsx';
let src = fs.readFileSync(path, 'utf-8');

// 1. Add zoomKey state after const [routes, setRoutes] = useState(null);
src = src.replace(
  "  const [routes, setRoutes] = useState(null);\n  const carouselRef = useRef(null);",
  "  const [routes, setRoutes] = useState(null);\n  const [zoomKey, setZoomKey] = useState(0);\n  const carouselRef = useRef(null);"
);

// 2. Pass zoomKey to MapView
src = src.replace(
  "          routes={routes}\n        />",
  "          routes={routes}\n          zoomKey={zoomKey}\n        />"
);

// 3. Increment zoomKey in carousel onClick
src = src.replace(
  "                onClick={() => { setSelectedStepIndex(i); handleSelectStep(s.id); }}",
  "                onClick={() => { setSelectedStepIndex(i); handleSelectStep(s.id); setZoomKey(k => k + 1); }}"
);

fs.writeFileSync(path, src, 'utf-8');
console.log('RoadtripPage.jsx patched with zoomKey');
console.log('Has zoomKey:', src.includes('zoomKey'));
