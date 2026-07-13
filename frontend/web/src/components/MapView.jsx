import React, { useEffect, useRef, useState, useCallback } from 'react';

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_PLACES_API_KEY;
const MAP_ID = import.meta.env.VITE_GOOGLE_MAP_ID || 'DEMO_MAP_ID';

let _mapsPromise = null;

function loadGoogleMaps() {
  if (window.google?.maps?.marker?.AdvancedMarkerElement) return Promise.resolve();
  if (_mapsPromise) return _mapsPromise;
  _mapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    // NE PAS utiliser loading=async : incompatible avec l'approche onload classique
    script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_API_KEY}&libraries=marker,geometry`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = (e) => { _mapsPromise = null; reject(e); };
    document.head.appendChild(script);
  });
  return _mapsPromise;
}

const ACCOM_ICONS = { HOTEL: '🏨', CAMPING: '🏕️', AIRBNB: '🏠', PARKING: '🅿️' };
const ACTIVITY_ICONS = { RESTAURANT: '🍽️', MUSEUM: '🏛️', BEACH: '🏖️', HIKING: '🥾', SHOPPING: '🛍️', SUPERMARKET: '🛒', ENTERTAINMENT: '🎭' };

function makePoiMarkerEl(emoji, color) {
  const el = document.createElement('div');
  el.style.cssText = `width:28px;height:28px;background:${color};border:2.5px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 2px 6px rgba(0,0,0,.35);cursor:default`;
  el.textContent = emoji;
  return el;
}

function makeMarkerEl(number, isSelected) {
  const size = isSelected ? 36 : 28;
  const bg = isSelected ? '#E8A435' : '#4338ca';
  const fs = isSelected ? 13 : 11;
  const el = document.createElement('div');
  el.style.cssText = `width:${size}px;height:${size}px;background:${bg};border:2.5px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:${fs}px;font-weight:bold;font-family:Arial,sans-serif;box-shadow:0 2px 6px rgba(0,0,0,.35);cursor:pointer`;
  el.textContent = String(number);
  return el;
}

export default function MapView({ steps, selectedStepId, onSelectStep, routes, focusRoute, onStepDragged, zoomKey, overlayData, flyToCoord, onFlyToDone, onMapMove, onSearchArea, mapMoved }) {
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const detailMarkersRef = useRef([]);
  const infoWindowRef = useRef(null);
  const polylineRef = useRef(null);
  const focusPolylineRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState(null);

  // Init Google Maps une seule fois
  useEffect(() => {
    const div = mapDivRef.current;
    if (!div) return;
    loadGoogleMaps()
      .then(() => {
        // mapId obligatoire pour AdvancedMarkerElement — DEMO_MAP_ID est fourni par Google
        const map = new window.google.maps.Map(div, {
          zoom: 6,
          center: { lat: 47.0, lng: 2.5 },
          mapId: MAP_ID,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true,
          gestureHandling: "greedy",
        });
        mapRef.current = map;
        setMapReady(true);
        // Detect map movement for "Rechercher dans cette zone" button
        let moveTimeout;
        map.addListener('bounds_changed', () => {
          clearTimeout(moveTimeout);
          moveTimeout = setTimeout(() => {
            if (onMapMove && mapRef.current) {
              onMapMove();
            }
          }, 300);
        });
        map.addListener('dragend', () => {
          if (onMapMove) onMapMove();
        });
      })
      .catch(() => setError('Impossible de charger Google Maps.\nVérifiez que "Maps JavaScript API" est activée dans Google Cloud Console.'));
  }, []);

  // Rebuild marqueurs & polyline
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    markersRef.current.forEach(m => { m.map = null; });
    markersRef.current = [];
    detailMarkersRef.current.forEach(m => { m.map = null; });
    detailMarkersRef.current = [];
    if (polylineRef.current) { polylineRef.current.setMap(null); polylineRef.current = null; }

    const geoSteps = steps.filter(
      s => s.latitude != null && s.longitude != null &&
        !isNaN(parseFloat(s.latitude)) && !isNaN(parseFloat(s.longitude))
    );
    if (!geoSteps.length) return;

    const { AdvancedMarkerElement } = window.google.maps.marker;
    const bounds = new window.google.maps.LatLngBounds();
    const path = [];

    geoSteps.forEach((step) => {
      const lat = parseFloat(step.latitude);
      const lng = parseFloat(step.longitude);
      const pos = { lat, lng };
      bounds.extend(pos);
      path.push(pos);

      const stepIndex = steps.indexOf(step);
      const isSelected = step.id === selectedStepId;

      const marker = new AdvancedMarkerElement({
        position: pos,
        map: mapRef.current,
        title: step.name,
        content: makeMarkerEl(stepIndex + 1, isSelected),
        zIndex: isSelected ? 100 : stepIndex + 1,
        gmpDraggable: !!onStepDragged,
      });
      marker.addListener('gmp-click', () => onSelectStep(step.id));

      if (onStepDragged) {
        marker.addListener('dragend', () => {
          const newLat = marker.position.lat;
          const newLng = marker.position.lng;
          onStepDragged(step.id, newLat, newLng);
        });
      }

      markersRef.current.push(marker);
    });

    // Dessiner la polyline : utiliser les routes calculées si disponibles, sinon ligne droite
    let routePath = path; // fallback ligne droite

    if (routes && window.google.maps.geometry?.encoding && geoSteps.length > 1) {
      // Construire le chemin à partir des encoded polylines des routes
      const decodedPath = [];
      for (let i = 0; i < geoSteps.length - 1; i++) {
        const from = geoSteps[i];
        const to = geoSteps[i + 1];
        const key = `${from.id}→${to.id}`;
        const route = routes[key];
        if (route?.encodedPolyline) {
          try {
            const segment = window.google.maps.geometry.encoding.decodePath(route.encodedPolyline);
            decodedPath.push(...segment);
          } catch {
            // fallback : ajouter juste les deux points
            decodedPath.push({ lat: parseFloat(from.latitude), lng: parseFloat(from.longitude) });
            decodedPath.push({ lat: parseFloat(to.latitude), lng: parseFloat(to.longitude) });
          }
        } else {
          decodedPath.push({ lat: parseFloat(from.latitude), lng: parseFloat(from.longitude) });
          if (i === geoSteps.length - 2) {
            decodedPath.push({ lat: parseFloat(to.latitude), lng: parseFloat(to.longitude) });
          }
        }
      }
      if (decodedPath.length > 0) routePath = decodedPath;
    }

    polylineRef.current = new window.google.maps.Polyline({
      path: routePath,
      geodesic: true,
      strokeColor: '#4338ca',
      strokeOpacity: 0,
      icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.5, scale: 3 }, offset: '0', repeat: '16px' }],
      strokeWeight: 2,
      map: mapRef.current,
    });

    if (geoSteps.length === 1) {
      mapRef.current.setCenter({ lat: parseFloat(geoSteps[0].latitude), lng: parseFloat(geoSteps[0].longitude) });
      mapRef.current.setZoom(12);
    } else {
      mapRef.current.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, steps, routes]);

  // Zoom to selected step — forced by zoomKey for reliable Polarsteps-like behavior
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    if (!selectedStepId) return;
    if (focusRoute) return;

    // Close info windows
    if (infoWindowRef.current) { infoWindowRef.current.close(); }
    detailMarkersRef.current.forEach(m => { m.map = null; });
    detailMarkersRef.current = [];

    const step = steps.find(s => s.id === selectedStepId);
    if (!step) return;

    const { AdvancedMarkerElement } = window.google.maps.marker;
    const bounds = new window.google.maps.LatLngBounds();
    let hasPoi = false;

    // Étape elle-même
    if (step.latitude != null && step.longitude != null) {
      bounds.extend({ lat: parseFloat(step.latitude), lng: parseFloat(step.longitude) });
    }

    // Hébergements
    (step.accommodations ?? []).forEach(a => {
      if (a.latitude == null || a.longitude == null) return;
      const lat = parseFloat(a.latitude);
      const lng = parseFloat(a.longitude);
      if (isNaN(lat) || isNaN(lng)) return;
      bounds.extend({ lat, lng });
      hasPoi = true;
      const emoji = ACCOM_ICONS[a.type] || '🏨';
      const label = a.name || 'Hébergement';
      const m = new AdvancedMarkerElement({
        position: { lat, lng },
        map: mapRef.current,
        title: label,
        content: makePoiMarkerEl(emoji, '#059669'),
        zIndex: 50,
      });
      m.addListener('gmp-click', () => {
        if (!infoWindowRef.current) infoWindowRef.current = new window.google.maps.InfoWindow();
        infoWindowRef.current.setContent(`<div style="font-size:13px;font-weight:600;padding:2px 4px">${label}</div>`);
        infoWindowRef.current.open({ anchor: m, map: mapRef.current });
      });
      detailMarkersRef.current.push(m);
    });

    // Activités
    (step.activities ?? []).forEach(act => {
      if (act.latitude == null || act.longitude == null) return;
      const lat = parseFloat(act.latitude);
      const lng = parseFloat(act.longitude);
      if (isNaN(lat) || isNaN(lng)) return;
      bounds.extend({ lat, lng });
      hasPoi = true;
      const emoji = ACTIVITY_ICONS[act.type] || '📌';
      const label = act.name || 'Activité';
      const m = new AdvancedMarkerElement({
        position: { lat, lng },
        map: mapRef.current,
        title: label,
        content: makePoiMarkerEl(emoji, '#DC2626'),
        zIndex: 50,
      });
      m.addListener('gmp-click', () => {
        if (!infoWindowRef.current) infoWindowRef.current = new window.google.maps.InfoWindow();
        infoWindowRef.current.setContent(`<div style="font-size:13px;font-weight:600;padding:2px 4px">${label}</div>`);
        infoWindowRef.current.open({ anchor: m, map: mapRef.current });
      });
      detailMarkersRef.current.push(m);
    });

    // Zoom — uses setTimeout to ensure map is ready after fitBounds from marker build
    setTimeout(() => {
      if (hasPoi && !bounds.isEmpty()) {
        mapRef.current.fitBounds(bounds, { top: 80, right: 80, bottom: 80, left: 80 });
      } else if (step.latitude != null && step.longitude != null) {
        mapRef.current.panTo({ lat: parseFloat(step.latitude), lng: parseFloat(step.longitude) });
        mapRef.current.setZoom(13);
      }
    }, 50);
  }, [mapReady, selectedStepId, steps, focusRoute, zoomKey]);

  // Overlay markers (campings, trails, POIs, P4N)
  const overlayMarkersRef = useRef([]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !overlayData) return;

    // Clear old overlay markers
    overlayMarkersRef.current.forEach(m => { m.map = null; });
    overlayMarkersRef.current = [];

    const { AdvancedMarkerElement } = window.google.maps.marker;

    const addOverlayMarkers = (items, icon, color) => {
      if (!items || !items.length) return;
      items.forEach(item => {
        const lat = parseFloat(item.lat || item.latitude);
        const lng = parseFloat(item.lng || item.longitude);
        if (isNaN(lat) || isNaN(lng)) return;
        const el = document.createElement('div');
        el.style.cssText = `width:30px;height:30px;background:${color};border:2px solid white;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 2px 6px rgba(0,0,0,.35);cursor:pointer`;
        el.textContent = icon;
        const m = new AdvancedMarkerElement({
          position: { lat, lng },
          map: mapRef.current,
          title: item.name || '',
          content: el,
          zIndex: 40,
        });
        if (item.name || item.address) {
          m.addListener('gmp-click', () => {
            if (!infoWindowRef.current) infoWindowRef.current = new window.google.maps.InfoWindow();
            infoWindowRef.current.setContent(`<div style="font-size:13px;font-weight:600;padding:2px 6px"><span style="font-size:16px;margin-right:4px">${icon}</span>${item.name || ''}${item.address ? '<br/><span style="font-size:11px;color:#666">' + item.address + '</span>' : ''}</div>`);
            infoWindowRef.current.open({ anchor: m, map: mapRef.current });
          });
        }
        overlayMarkersRef.current.push(m);
      });
    };

    addOverlayMarkers(overlayData.campings, '🏕️', '#059669');
    addOverlayMarkers(overlayData.trails, '🥾', '#2563eb');
    addOverlayMarkers(overlayData.pois, '📍', '#dc2626');
    addOverlayMarkers(overlayData.park4night, '🅿️', '#7c3aed');
  }, [mapReady, overlayData]);

  // Expose bounds for the search area button
  const getBoundsStr = useCallback(() => {
    if (!mapRef.current) return null;
    return mapRef.current.getBounds();
  }, []);

  // Store bounds in a ref so RoadtripPage can access them
  // (Avoids circular ref issues)
  if (onSearchArea && typeof window !== 'undefined') {
    window.__mapGetBounds = getBoundsStr;
  }

  // Fly to coordinate when search is used
  useEffect(() => {
    if (!mapReady || !mapRef.current || !flyToCoord) return;
    mapRef.current.panTo({ lat: parseFloat(flyToCoord.lat), lng: parseFloat(flyToCoord.lng) });
    mapRef.current.setZoom(14);
    if (onFlyToDone) setTimeout(() => onFlyToDone(), 500);
  }, [mapReady, flyToCoord]);

    // Zoom sur un segment d'itinéraire (focusRoute)
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    // Nettoyer l'ancienne polyline de focus
    if (focusPolylineRef.current) {
      focusPolylineRef.current.setMap(null);
      focusPolylineRef.current = null;
    }
    if (!focusRoute?.fromStep || !focusRoute?.toStep) return;
    const { fromStep, toStep } = focusRoute;
    if (fromStep.latitude == null || toStep.latitude == null) return;

    const bounds = new window.google.maps.LatLngBounds();
    bounds.extend({ lat: parseFloat(fromStep.latitude), lng: parseFloat(fromStep.longitude) });
    bounds.extend({ lat: parseFloat(toStep.latitude), lng: parseFloat(toStep.longitude) });

    // Dessiner une polyline highlight sur ce segment
    const key = `${fromStep.id}→${toStep.id}`;
    const route = routes?.[key];
    let segmentPath = [
      { lat: parseFloat(fromStep.latitude), lng: parseFloat(fromStep.longitude) },
      { lat: parseFloat(toStep.latitude), lng: parseFloat(toStep.longitude) },
    ];
    if (route?.encodedPolyline && window.google.maps.geometry?.encoding) {
      try {
        segmentPath = window.google.maps.geometry.encoding.decodePath(route.encodedPolyline);
        segmentPath.forEach(p => bounds.extend(p));
      } catch { /* fallback droite */ }
    }

    focusPolylineRef.current = new window.google.maps.Polyline({
      path: segmentPath,
      geodesic: true,
      strokeColor: '#F59E0B',
      strokeOpacity: 0.85,
      strokeWeight: 5,
      map: mapRef.current,
      zIndex: 10,
    });

    mapRef.current.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 });
  }, [mapReady, focusRoute, routes]);

  return (
    <div className="w-full h-full relative">
      {/* Cette div appartient UNIQUEMENT à Google Maps — aucun enfant React ne doit y être injecté */}
      <div ref={mapDivRef} className="w-full h-full" />
      {!mapReady && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-gray-400 text-sm pointer-events-none">
          Chargement de la carte…
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-gray-500 text-sm text-center px-6 whitespace-pre-line">
          {error}
        </div>
      )}
    </div>
  );
}

