import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import api from '../api.js';
import MapView from '../components/MapView.jsx';
import StepModal from '../components/StepModal.jsx';
import CollaboratorsPanel from '../components/CollaboratorsPanel.jsx';
import { computeAllRoutes, reverseGeocode } from '../utils/directions.js';
import PlacesAutocompleteInput from '../components/PlacesAutocompleteInput.jsx';

const STEP_ICONS = { DEPARTURE: '🚀', STAGE: '📍', STOP: '⏸️', RETURN: '🏠' };
const STEP_LABELS = { DEPARTURE: 'DÉPART', STAGE: 'ÉTAPE', STOP: 'ARRÊT', RETURN: 'RETOUR' };

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatLongDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
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
  const [viewMode, setViewMode] = useState('timeline');
  const [showMenu, setShowMenu] = useState(false);
  const carouselRef = useRef(null);
  const timelineRef = useRef(null);

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

  const handleViewOnMap = (stepId) => {
    const idx = steps.findIndex(s => s.id === stepId);
    if (idx >= 0) {
      setSelectedStepIndex(idx);
      setZoomKey(k => k + 1);
    }
    setViewMode('carte');
  };

  const step = steps[selectedStepIndex];
  const overlayTypes = [
    { key: 'campings', label: 'Campings', icon: '🏕️', activeColor: 'bg-green-500' },
    { key: 'trails', label: 'Rando', icon: '🥾', activeColor: 'bg-blue-500' },
    { key: 'park4night', label: 'P4N', icon: '🅿️', activeColor: 'bg-purple-500' },
    { key: 'pois', label: 'POI', icon: '📍', activeColor: 'bg-red-500' },
  ];

  const totalAccommodations = steps.reduce((sum, s) => sum + (s.accommodations?.length || 0), 0);
  const totalActivities = steps.reduce((sum, s) => sum + (s.activities?.length || 0), 0);

  return (
    <div className="h-screen w-screen overflow-hidden relative bg-gray-50 flex flex-col">
      {/* ── Header ── */}
      <header className="shrink-0 bg-white border-b border-gray-200 px-4 pt-2 pb-1.5 z-30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={() => navigate('/')} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition shrink-0">
              <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div className="min-w-0">
              <h1 className="font-bold text-gray-900 text-base leading-tight truncate">{roadtrip?.title || 'Roadtrip'}</h1>
              {roadtrip?.startDate && (
                <p className="text-[11px] text-gray-500 truncate">
                  {formatLongDate(roadtrip.startDate)} — {roadtrip.endDate ? formatLongDate(roadtrip.endDate) : ''}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="bg-gray-100 text-gray-600 text-[10px] font-semibold px-2 py-1 rounded-full whitespace-nowrap">{steps.length} étapes</span>
            <div className="relative">
              <button onClick={() => setShowMenu(v => !v)} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition">
                <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-10 z-50 bg-white rounded-xl shadow-xl border border-gray-100 py-1 w-44">
                    <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">💰 Budget</button>
                    <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">👥 Équipe</button>
                    <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">📱 APK</button>
                    <hr className="my-1 border-gray-100" />
                    <button onClick={() => setShowCollaborators(true)} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">👥 Membres</button>
                    {roadtrip && (roadtrip.userId === roadtrip.currentUserId) && (
                      <Link to={`/roadtrips/${id}/edit`} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">✏️ Éditer</Link>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Toggle floating (📋 liste / 🗺️ carte) ── */}
      <div className="fixed right-4 z-50 flex flex-col gap-1.5 shadow-xl rounded-2xl overflow-hidden" style={{ bottom: '8rem' }}>
        <button
          onClick={() => setViewMode('timeline')}
          className={`w-12 h-12 flex items-center justify-center text-xl transition-all ${
            viewMode === 'timeline' ? 'bg-blue-500 text-white' : 'bg-white/95 text-gray-400 hover:text-gray-600'
          }`}
          title="Vue liste"
        >
          📋
        </button>
        <button
          onClick={() => setViewMode('carte')}
          className={`w-12 h-12 flex items-center justify-center text-xl transition-all ${
            viewMode === 'carte' ? 'bg-blue-500 text-white' : 'bg-white/95 text-gray-400 hover:text-gray-600'
          }`}
          title="Vue carte"
        >
          🗺️
        </button>
      </div>

      {/* ── Timeline View ── */}
      {viewMode === 'timeline' && (
        <div className="flex-1 overflow-y-auto bg-gray-50" ref={timelineRef}>
          {/* Stats summary */}
          <div className="px-4 pt-3 pb-1 flex gap-2 overflow-x-auto">
            <div className="bg-white rounded-xl px-3 py-1.5 shadow-sm border border-gray-100 shrink-0">
              <span className="text-xs text-gray-500">🏕️ {totalAccommodations} héberg.</span>
            </div>
            <div className="bg-white rounded-xl px-3 py-1.5 shadow-sm border border-gray-100 shrink-0">
              <span className="text-xs text-gray-500">🥾 {totalActivities} activités</span>
            </div>
            <div className="bg-white rounded-xl px-3 py-1.5 shadow-sm border border-gray-100 shrink-0">
              <span className="text-xs text-gray-500">📍 {steps.length} étapes</span>
            </div>
          </div>

          {/* Step cards */}
          <div className="px-4 pt-3 pb-6 relative">
            {/* Vertical timeline line */}
            <div className="absolute left-[2.1rem] top-0 bottom-0 w-0.5 bg-gray-200" style={{ marginTop: '0.75rem', marginBottom: '1.5rem' }} />

            {steps.map((s, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === steps.length - 1;
              const stepType = s.type || 'STAGE';
              const hasAccommodations = s.accommodations && s.accommodations.length > 0;
              const hasActivities = s.activities && s.activities.length > 0;

              return (
                <div key={s.id} className="relative pl-12 pb-4">
                  {/* Timeline dot */}
                  <div className={`absolute left-[1.55rem] top-1 w-3.5 h-3.5 rounded-full border-2 border-white shadow ${
                    isFirst ? 'bg-blue-500' : isLast ? 'bg-green-500' : 'bg-pink-400'
                  }`} />

                  {/* Card */}
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-3">
                      {/* Header */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold">
                          {idx + 1}
                        </span>
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                          {STEP_LABELS[stepType] || 'ÉTAPE'}
                        </span>
                      </div>

                      {/* Name + location */}
                      <h3 className="font-bold text-gray-900 text-sm leading-tight">{s.name}</h3>
                      {s.location && <p className="text-xs text-gray-500 mt-0.5">{s.location}</p>}

                      {/* Date */}
                      {s.startDate && (
                        <p className="text-[11px] text-gray-400 mt-1">
                          {formatDate(s.startDate)}
                          {s.arrivalTime ? ` · ${s.arrivalTime}` : ''}
                          {s.endDate ? ` → ${formatDate(s.endDate)}` : ''}
                        </p>
                      )}

                      {/* Accommodation tags */}
                      {hasAccommodations && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {s.accommodations.map(acc => (
                            <span key={acc.id} className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-[10px] font-medium px-2 py-0.5 rounded-full border border-amber-200">
                              🏕️ {acc.name}
                              {acc.pricePerNight ? ` · ${acc.pricePerNight}${acc.currency || '€'}/nuit` : ''}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Activity tags */}
                      {hasActivities && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {s.activities.map(act => (
                            <span key={act.id} className="inline-flex items-center gap-1 bg-pink-50 text-pink-600 text-[10px] font-medium px-2 py-0.5 rounded-full border border-pink-200">
                              🥾 {act.name}
                            </span>
                          ))}
                          <span className="inline-flex items-center gap-1 text-[10px] text-gray-400 px-1">
                            {s.activities.length} activité{s.activities.length > 1 ? 's' : ''}
                          </span>
                        </div>
                      )}

                      {/* Notes */}
                      {s.notes && (
                        <p className="mt-1.5 text-[11px] text-gray-400 italic line-clamp-2">{s.notes}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex border-t border-gray-50 divide-x divide-gray-50">
                      <button
                        onClick={() => handleViewOnMap(s.id)}
                        className="flex-1 py-2 text-[11px] font-medium text-blue-500 hover:bg-blue-50 transition flex items-center justify-center gap-1"
                      >
                        📍 Voir sur la carte
                      </button>
                      <button
                        onClick={() => handleEditStep(s)}
                        className="flex-1 py-2 text-[11px] font-medium text-gray-500 hover:bg-gray-50 transition flex items-center justify-center gap-1"
                      >
                        📝 Détails
                      </button>
                      <button
                        onClick={() => handleEditStep(s)}
                        className="flex-1 py-2 text-[11px] font-medium text-gray-500 hover:bg-gray-50 transition flex items-center justify-center gap-1"
                      >
                        ✏️ Modifier
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Add step button */}
            <div className="pl-12 pt-1">
              <button onClick={() => { setEditingStep(null); setShowStepModal(true); }} className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-300 text-gray-400 text-sm font-medium hover:border-blue-400 hover:text-blue-500 transition flex items-center justify-center gap-2">
                + Ajouter une étape
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Map View — always mounted ── */}
      <div className={viewMode === 'carte' ? 'absolute inset-0 z-0' : 'hidden'}>
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
            {selectedStepIndex > 0 && (
              <button onClick={() => scrollCarousel(-1)} className="absolute left-3 bottom-[5.5rem] z-[99999] w-8 h-8 bg-white/90 rounded-full shadow flex items-center justify-center">
                <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
            )}
            {selectedStepIndex < steps.length - 1 && (
              <button onClick={() => scrollCarousel(1)} className="absolute right-3 bottom-[5.5rem] z-[99999] w-8 h-8 bg-white/90 rounded-full shadow flex items-center justify-center">
                <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            )}
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
      </div>

      {/* ── Modals ── */}
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
