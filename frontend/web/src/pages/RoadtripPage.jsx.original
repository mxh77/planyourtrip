import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import api from '../api.js';
import MapView from '../components/MapView.jsx';
import StepModal from '../components/StepModal.jsx';
import CollaboratorsPanel from '../components/CollaboratorsPanel.jsx';
import { computeAllRoutes, reverseGeocode } from '../utils/directions.js';
import PlacesAutocompleteInput from '../components/PlacesAutocompleteInput.jsx';

const STEP_ICONS = { DEPARTURE: '🚀', STAGE: '📍', STOP: '⏸️', RETURN: '🏠' };

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

const OVERLAY_APIS = {
  campings: '/campings/nearby',
  trails: '/trails/nearby',
  pois: '/places/nearby',
  park4night: '/park4night/nearby',
};

export default function RoadtripPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [roadtrip, setRoadtrip] = useState(null);
  const [steps, setSteps] = useState([]);
  const [selectedStepIndex, setSelectedStepIndex] = useState(0);
  const [showStepModal, setShowStepModal] = useState(false);
  const [editingStep, setEditingStep] = useState(null);
  const [showCollaborators, setShowCollaborators] = useState(false);
  const [routes, setRoutes] = useState(null);
  const [zoomKey, setZoomKey] = useState(0);
  const [activeOverlays, setActiveOverlays] = useState({});
  const [overlayData, setOverlayData] = useState(null);
  const [loadingOverlays, setLoadingOverlays] = useState({});
  const [searchValue, setSearchValue] = useState('');
  const [mapMoved, setMapMoved] = useState(false);
  const [searchingArea, setSearchingArea] = useState(false);
  const [areaResults, setAreaResults] = useState(null);
  const [flyToCoord, setFlyToCoord] = useState(null);
  const [showAddStep, setShowAddStep] = useState(null);
  const carouselRef = useRef(null);

  // Load roadtrip (includes steps + accommodations + activities)
  useEffect(() => {
    api.get(`/roadtrips/${id}`).then(r => {
      const data = r.data;
      setRoadtrip(data);
      if (data.steps) {
        const s = data.steps.sort((a, b) => a.order - b.order);
        setSteps(s);
      }
    }).catch(() => navigate('/'));
  }, [id]);

  // Compute all routes between consecutive steps
  useEffect(() => {
    if (steps.length < 2) return;
    computeAllRoutes(steps).then(setRoutes).catch(() => {});
  }, [steps]);

  // Scroll detection for carousel — auto-select center card
  const handleCarouselScroll = useCallback(() => {
    const el = carouselRef.current;
    if (!el) return;
    const cards = el.children;
    if (!cards.length) return;
    const centerX = el.scrollLeft + el.offsetWidth / 2;
    let closestIdx = 0;
    let closestDist = Infinity;
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const dist = Math.abs(cardCenter - centerX);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    }
    if (closestIdx !== selectedStepIndex) {
      setSelectedStepIndex(closestIdx);
      setZoomKey(k => k + 1);
    }
  }, [selectedStepIndex]);

  const handleEditStep = (step) => {
    setEditingStep(step);
    setShowStepModal(true);
  };

  const handleSaveStep = async (data) => {
    if (editingStep) {
      const r = await api.patch(`/steps/${editingStep.id}`, data);
      setSteps(prev => prev.map(s => s.id === editingStep.id ? r.data : s));
    }
    setShowStepModal(false);
    setEditingStep(null);
  };

  const handleSelectStep = (stepId) => {
    const idx = steps.findIndex(s => s.id === stepId);
    if (idx >= 0) setSelectedStepIndex(idx);
  };

  const scrollCarousel = (dir) => {
    if (!carouselRef.current) return;
    carouselRef.current.scrollBy({ left: dir * 260, behavior: 'smooth' });
  };

  // Overlay toggle
  const toggleOverlay = useCallback(async (type) => {
    const newActive = { ...activeOverlays, [type]: !activeOverlays[type] };
    setActiveOverlays(newActive);

    if (newActive[type]) {
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
      setOverlayData(prev => {
        if (!prev) return prev;
        const next = { ...prev };
        delete next[type];
        return Object.keys(next).length ? next : null;
      });
    }
  }, [activeOverlays, steps, selectedStepIndex]);

  // Search area
  const getAreaParams = (bounds) => {
    if (!bounds) return { lat: 47.0, lng: 2.5, radius: 25000 };
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const latCenter = typeof ne.lat === 'function' ? (ne.lat() + sw.lat()) / 2 : (ne.lat + sw.lat) / 2;
    const lngCenter = typeof ne.lng === 'function' ? (ne.lng() + sw.lng()) / 2 : (ne.lng + sw.lng) / 2;
    const center = { lat: latCenter, lng: lngCenter };
    const R = 6371000;
    const dLat = (typeof ne.lat === 'function' ? (ne.lat() - center.lat) : (ne.lat - center.lat)) * Math.PI / 180;
    const dLng = (typeof ne.lng === 'function' ? (ne.lng() - center.lng) : (ne.lng - center.lng)) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(center.lat * Math.PI / 180) * Math.cos(typeof ne.lat === 'function' ? ne.lat() * Math.PI / 180 : ne.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    const radius = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return { lat: center.lat, lng: center.lng, radius: Math.min(Math.round(radius), 60000) };
  };

  const handleSearchArea = async () => {
    const bounds = (typeof window !== 'undefined' && window.__mapGetBounds) ? window.__mapGetBounds() : null;
    setSearchingArea(true);
    setMapMoved(false);
    const { lat, lng, radius } = getAreaParams(bounds);
    const types = ['campings', 'trails', 'pois', 'park4night'];
    const results = {};
    const promises = types.map(async (type) => {
      try {
        const res = await api.get(OVERLAY_APIS[type], { params: { lat, lng, radius } });
        let items = res.data || [];
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
    setAreaResults(results);
    setSearchingArea(false);
  };

  const handleMapMove = () => {
    setMapMoved(true);
  };

  const clearAreaResults = () => {
    setOverlayData(null);
    setActiveOverlays({});
    setAreaResults(null);
    setMapMoved(false);
  };

  // Place autocomplete
  const handlePlaceSelect = (place) => {
    setFlyToCoord({ lat: place.latitude, lng: place.longitude });
    setSelectedStepIndex(-1);
    setSearchValue(place.name);
    setShowAddStep(place);
  };

  const handleAddAsStep = async () => {
    if (!showAddStep) return;
    try {
      const lastIdx = steps.length > 0 ? Math.max(...steps.map(s => s.order || 0)) + 1 : 0;
      await api.post('/steps', {
        roadtripId: id,
        name: showAddStep.name,
        location: showAddStep.address,
        latitude: showAddStep.latitude,
        longitude: showAddStep.longitude,
        order: lastIdx,
        startDate: roadtrip?.startDate || null,
      });
      const rt = await api.get(`/roadtrips/${id}`);
      if (rt.data.steps) {
        const s = rt.data.steps.sort((a, b) => a.order - b.order);
        setSteps(s);
        setSelectedStepIndex(s.length - 1);
        setZoomKey(k => k + 1);
      }
      setSearchValue('');
      setShowAddStep(null);
    } catch (e) {
      console.error('Failed to add step', e);
    }
  };

  const handleSearchClear = () => {
    setSearchValue('');
    setShowAddStep(null);
    setFlyToCoord(null);
  };

  const step = steps[selectedStepIndex];
  const overlayTypes = [
    { key: 'campings', label: 'Campings', icon: '🏕️', activeColor: 'bg-green-500' },
    { key: 'trails', label: 'Rando', icon: '🥾', activeColor: 'bg-blue-500' },
    { key: 'park4night', label: 'P4N', icon: '🅿️', activeColor: 'bg-purple-500' },
    { key: 'pois', label: 'POI', icon: '📍', activeColor: 'bg-red-500' },
  ];

  return (
    <div className="h-screen w-screen overflow-hidden relative bg-black">
      {/* Full-screen map */}
      <div className="absolute inset-0 z-0">
        <MapView
          steps={steps}
          selectedStepId={step?.id}
          onSelectStep={handleSelectStep}
          routes={routes}
          zoomKey={zoomKey}
          overlayData={overlayData}
          flyToCoord={flyToCoord}
          onFlyToDone={() => setFlyToCoord(null)}
          onMapMove={handleMapMove}
          mapMoved={mapMoved}
        />
      </div>

      {/* Top bar — minimal */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-3 pointer-events-none">
        <button onClick={() => navigate('/')} className="pointer-events-auto w-10 h-10 bg-white/90 backdrop-blur rounded-full flex items-center justify-center shadow-lg">
          <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="flex gap-2 pointer-events-auto">
          <button onClick={() => setShowCollaborators(true)} className="w-10 h-10 bg-white/90 backdrop-blur rounded-full flex items-center justify-center shadow-lg text-base">
            👥
          </button>
          <button onClick={() => { setEditingStep(null); setShowStepModal(true); }} className="w-10 h-10 bg-white/90 backdrop-blur rounded-full flex items-center justify-center shadow-lg text-xl font-bold text-gray-700">
            +
          </button>
        </div>
      </div>

      {/* Roadtrip title pill */}
      {roadtrip && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 bg-white/90 backdrop-blur px-4 py-1.5 rounded-full shadow-lg text-sm font-medium text-gray-800 whitespace-nowrap pointer-events-none">
          {roadtrip.title}
        </div>
      )}

      {/* Search bar + add step prompt */}
      <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-2rem)] max-w-md">
        <PlacesAutocompleteInput
          value={searchValue}
          onChange={(v) => { setSearchValue(v); setShowAddStep(null); }}
          onPlaceSelect={handlePlaceSelect}
          placeholder="Rechercher un lieu…"
          lat={steps[selectedStepIndex]?.latitude}
          lng={steps[selectedStepIndex]?.longitude}
          className="w-full bg-white/95 backdrop-blur rounded-xl shadow-xl px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 border-0 focus:ring-2 focus:ring-blue-500 outline-none"
        />
        {showAddStep && (
          <div className="mt-1 bg-white/95 backdrop-blur rounded-xl shadow-xl p-3 flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{showAddStep.name}</p>
              <p className="text-xs text-gray-500 truncate">{showAddStep.address}</p>
            </div>
            <button onClick={handleAddAsStep} className="shrink-0 bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-600 transition">+ Étape</button>
            <button onClick={handleSearchClear} className="shrink-0 text-gray-400 hover:text-gray-600 text-lg">×</button>
          </div>
        )}
      </div>

      {/* Rechercher dans cette zone button */}
      {mapMoved && !searchingArea && (
        <button onClick={handleSearchArea} className="absolute top-[11rem] left-1/2 -translate-x-1/2 z-30 bg-white/95 backdrop-blur border border-gray-200 shadow-lg text-sm font-medium text-gray-800 px-4 py-2 rounded-full flex items-center gap-2 hover:bg-white hover:shadow-xl active:scale-95 transition-all">
          <svg className="w-3.5 h-3.5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
          Rechercher dans cette zone
        </button>
      )}
      {searchingArea && (
        <div className="absolute top-[11rem] left-1/2 -translate-x-1/2 z-30 bg-white/95 backdrop-blur border border-gray-200 shadow-lg text-sm text-gray-500 px-4 py-2 rounded-full flex items-center gap-2">
          <span className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          Recherche en cours…
        </div>
      )}

      {/* Results banner */}
      {areaResults && !mapMoved && !searchingArea && (
        <div className="absolute top-[11rem] left-1/2 -translate-x-1/2 z-30 bg-white/95 backdrop-blur border border-blue-200 shadow-lg text-xs text-gray-600 px-3 py-1.5 rounded-full flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500/70" />
          {(() => {
            const labels = { campings: 'camping', trails: 'rando', pois: 'POI', park4night: 'P4N' };
            const parts = Object.entries(areaResults).map(([t, items]) => {
              const n = Array.isArray(items) ? items.length : 0;
              return n > 0 ? n + ' ' + (labels[t] || t) + (n > 1 ? 's' : '') : null;
            }).filter(Boolean);
            return parts.length > 0 ? parts.join(', ') + ' trouvé' + (parts.length > 1 ? 's' : '') : 'Aucun résultat';
          })()} — déplacez la carte pour actualiser
          <button onClick={clearAreaResults} className="text-gray-400 hover:text-gray-700 ml-1 leading-none text-base">✕</button>
        </div>
      )}

      {/* Overlay toggle buttons — right side vertical bar */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-2">
        {overlayTypes.map(({ key, label, icon, activeColor }) => (
          <button
            key={key}
            onClick={() => toggleOverlay(key)}
            disabled={loadingOverlays[key]}
            className={`w-10 h-10 rounded-full shadow-lg flex items-center justify-center text-sm transition-all ${
              activeOverlays[key]
                ? `${activeColor} text-white scale-110`
                : 'bg-white/90 backdrop-blur text-gray-600 hover:bg-white'
            } ${loadingOverlays[key] ? 'animate-pulse' : ''}`}
            title={label}
          >
            {loadingOverlays[key] ? (
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : icon}
          </button>
        ))}
      </div>

      {/* Horizontal step carousel at bottom */}
      {steps.length > 0 && (
        <div className="absolute bottom-0 left-0 right-0 z-[9999] pb-4 pt-2 px-2" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
          {/* Left arrow */}
          {selectedStepIndex > 0 && (
            <button onClick={() => scrollCarousel(-1)} className="absolute left-3 bottom-[5.5rem] z-[99999] w-8 h-8 bg-white/90 rounded-full shadow flex items-center justify-center">
              <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
          )}
          {/* Right arrow */}
          {selectedStepIndex < steps.length - 1 && (
            <button onClick={() => scrollCarousel(1)} className="absolute right-3 bottom-[5.5rem] z-[99999] w-8 h-8 bg-white/90 rounded-full shadow flex items-center justify-center">
              <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          )}
          {/* Carousel */}
          <div
            ref={carouselRef}
            onScroll={handleCarouselScroll}
            className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory px-4 pb-2"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {steps.map((s, i) => (
              <button
                key={s.id}
                onClick={() => { setSelectedStepIndex(i); setZoomKey(k => k + 1); }}
                className={`snap-start shrink-0 w-56 bg-white/95 backdrop-blur rounded-2xl shadow-xl p-3 text-left transition-all ${
                  i === selectedStepIndex ? 'ring-2 ring-blue-500 scale-[1.02]' : 'opacity-80'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{STEP_ICONS[s.type] || '📍'}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    i === selectedStepIndex ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {i + 1}
                  </span>
                  {s.type && <span className="text-[10px] text-gray-400 uppercase">{s.type}</span>}
                </div>
                <p className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2">{s.name}</p>
                {s.location && <p className="text-xs text-gray-500 mt-0.5 truncate">{s.location}</p>}
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[10px] text-gray-400">
                    {s.startDate ? formatDate(s.startDate) : ''}
                    {s.arrivalTime ? ` · ${s.arrivalTime}` : ''}
                  </span>
                  {i === selectedStepIndex && (
                    <button onClick={(e) => { e.stopPropagation(); handleEditStep(s); }} className="text-[10px] text-blue-500 font-medium">
                      Modifier
                    </button>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {showStepModal && (
        <StepModal
          step={editingStep}
          roadtripId={id}
          onSave={handleSaveStep}
          onClose={() => { setShowStepModal(false); setEditingStep(null); }}
        />
      )}
      {showCollaborators && (
        <CollaboratorsPanel
          roadtripId={id}
          onClose={() => setShowCollaborators(false)}
        />
      )}
    </div>
  );
}
