import React, { useState, useEffect } from 'react';
import api from '../api.js';
import { validateActivityDates } from '../utils/dateValidation.js';
import PlacesAutocompleteInput from './PlacesAutocompleteInput.jsx';

const API_KEY = import.meta.env.VITE_GOOGLE_PLACES_API_KEY;
const NEARBY_URL = 'https://places.googleapis.com/v1/places:searchNearby';
const SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK = 'places.id,places.displayName,places.rating,places.photos,places.formattedAddress,places.location';
const DEF_RADIUS = 5000;
const ACTIVITY_NEARBY_TYPES = ['restaurant', 'cafe', 'museum', 'park', 'cultural_center', 'supermarket', 'grocery_store', 'hiking_area', 'transit_station'];

const ACTIVITY_TYPES = [
  { value: 'ACTIVITY', label: '🎯 Activité' },
  { value: 'RESTAURANT', label: '🍽️ Restaurant' },
  { value: 'TRANSPORT', label: '🚗 Transport' },
  { value: 'SUPERMARKET', label: '🛒 Supermarché' },
  { value: 'HIKING', label: '🥾 Randonnée' },
  { value: 'OTHER', label: '📌 Autre' },
];

const STATUS_OPTIONS = [
  { value: 'PLANNED', label: '🗓️ Planifié' },
  { value: 'BOOKED', label: '✅ Réservé' },
  { value: 'DONE', label: '🏁 Fait' },
  { value: 'CANCELLED', label: '❌ Annulé' },
];

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF'];

function calcDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

async function fetchNearbyActivities(lat, lng, radius) {
  if (!API_KEY) return [];
  const resp = await fetch(NEARBY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': API_KEY, 'X-Goog-FieldMask': FIELD_MASK },
    body: JSON.stringify({ includedTypes: ACTIVITY_NEARBY_TYPES, maxResultCount: 10, locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius } }, languageCode: 'fr' }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message ?? `HTTP ${resp.status}`);
  return data.places ?? [];
}

async function searchActivitiesByText(query, lat, lng, radius) {
  if (!query.trim() || !API_KEY) return [];
  const body = { textQuery: query, languageCode: 'fr', maxResultCount: 20 };
  if (lat != null && lng != null) body.locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius: radius ?? 50000 } };
  const resp = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': API_KEY, 'X-Goog-FieldMask': FIELD_MASK },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message ?? `HTTP ${resp.status}`);
  const places = data.places ?? [];
  if (lat != null && lng != null) {
    const maxKm = (radius ?? 50000) / 1000;
    return places.filter(p => p.location?.latitude == null || calcDistance(lat, lng, p.location.latitude, p.location.longitude) <= maxKm);
  }
  return places;
}

function PlaceCard({ place, lat, lng, onSelect, defaultEmoji = '📍' }) {
  const pName = place.photos?.[0]?.name;
  const pUri = pName ? `https://places.googleapis.com/v1/${pName}/media?maxWidthPx=120&key=${API_KEY}` : null;
  const dist = lat != null && lng != null && place.location?.latitude != null
    ? calcDistance(lat, lng, place.location.latitude, place.location.longitude)
    : null;
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-brand hover:bg-brand/5 cursor-pointer transition"
      onClick={() => onSelect(place)}
    >
      {pUri ? (
        <img src={pUri} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
      ) : (
        <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 text-2xl">{defaultEmoji}</div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{place.displayName?.text ?? '—'}</p>
        {place.formattedAddress && <p className="text-xs text-gray-500 truncate mt-0.5">{place.formattedAddress}</p>}
        <div className="flex items-center gap-2 mt-1">
          {place.rating != null && <span className="text-xs text-gray-400">⭐ {place.rating}</span>}
          {dist != null && <span className="text-xs text-gray-400">📍 {fmtDistance(dist)}</span>}
        </div>
      </div>
      <a
        href={`https://www.google.com/maps/search/?api=1&query_place_id=${place.id}&query=${encodeURIComponent(place.displayName?.text ?? '')}`}
        target="_blank"
        rel="noreferrer"
        onClick={e => e.stopPropagation()}
        className="text-gray-400 hover:text-brand shrink-0 p-1 text-base"
        title="Voir sur Google Maps"
      >↗2</a>
    </div>
  );
}

function toDatePart(str) {
  if (!str) return '';
  return str.slice(0, 10);
}

function toTimePart(str) {
  if (!str) return '';
  const tIdx = str.indexOf('T');
  if (tIdx === -1) return '';
  return str.slice(tIdx + 1, tIdx + 6);
}

function combineDateTime(date, time) {
  if (!date) return null;
  if (!time) return date;
  return `${date}T${time}`;
}

export default function ActivityModal({ stepId, activity, latitude, longitude, onClose, onSaved, stepStartDate, stepEndDate }) {
  const isEdit = !!activity;
  const hasCoords = !isEdit && latitude != null && longitude != null;

  const [tab, setTab] = useState('manual');
  const [nearbyPlaces, setNearbyPlaces] = useState([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const [form, setForm] = useState({
    type: 'ACTIVITY',
    name: '',
    location: '',
    latitude: null,
    longitude: null,
    startDate: '',
    startHour: '',
    endDate: '',
    endHour: '',
    bookingRef: '',
    bookingUrl: '',
    cost: '',
    currency: 'EUR',
    notes: '',
    status: 'PLANNED',
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isEdit && activity) {
      setForm({
        type: activity.type || 'ACTIVITY',
        name: activity.name || '',
        location: activity.location || '',
        latitude: activity.latitude ?? null,
        longitude: activity.longitude ?? null,
        startDate: toDatePart(activity.startTime),
        startHour: toTimePart(activity.startTime),
        endDate: toDatePart(activity.endTime),
        endHour: toTimePart(activity.endTime),
        bookingRef: activity.bookingRef || '',
        bookingUrl: activity.bookingUrl || '',
        cost: activity.cost != null ? String(activity.cost) : '',
        currency: activity.currency || 'EUR',
        notes: activity.notes || '',
        status: activity.status || 'PLANNED',
      });
    }
  }, [isEdit, activity]);

  useEffect(() => {
    if (tab !== 'nearby' || !hasCoords) return;
    setNearbyLoading(true); setNearbyError(null);
    fetchNearbyActivities(latitude, longitude, DEF_RADIUS)
      .then(r => setNearbyPlaces(r))
      .catch(e => setNearbyError(e.message ?? 'Erreur réseau'))
      .finally(() => setNearbyLoading(false));
  }, [tab, latitude, longitude]);

  useEffect(() => {
    if (tab !== 'search') return;
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(() => {
      setSearchLoading(true); setSearchError(null);
      searchActivitiesByText(searchQuery, latitude, longitude, DEF_RADIUS)
        .then(r => setSearchResults(r))
        .catch(e => setSearchError(e.message ?? 'Erreur réseau'))
        .finally(() => setSearchLoading(false));
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, tab, latitude, longitude]);

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  function fillFromPlace(place) {
    setForm(f => ({
      ...f,
      name: place.displayName?.text ?? '',
      location: place.formattedAddress ?? '',
      latitude: place.location?.latitude ?? null,
      longitude: place.location?.longitude ?? null,
    }));
    setTab('manual');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const startTime = combineDateTime(form.startDate, form.startHour);
    const endTime = combineDateTime(form.endDate, form.endHour);
    const dateErrors = validateActivityDates({
      startTime: startTime || undefined,
      endTime: endTime || undefined,
      stepStart: stepStartDate,
      stepEnd: stepEndDate,
    });
    if (dateErrors.length > 0) {
      setError(dateErrors.join(' '));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        stepId,
        type: form.type,
        name: form.name,
        location: form.location || null,
        latitude: form.latitude,
        longitude: form.longitude,
        startTime: startTime || null,
        endTime: endTime || null,
        bookingRef: form.bookingRef || null,
        bookingUrl: form.bookingUrl || null,
        cost: form.cost !== '' ? parseFloat(form.cost) : null,
        currency: form.currency,
        notes: form.notes || null,
        status: form.status,
      };
      if (isEdit) {
        await api.patch(`/activities/${activity.id}`, payload);
      } else {
        await api.post('/activities', payload);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Une erreur est survenue');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Supprimer l'activité "${activity.name}" ?`)) return;
    setDeleting(true);
    try {
      await api.delete(`/activities/${activity.id}`);
      onSaved();
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur lors de la suppression');
      setDeleting(false);
    }
  }

  const sortedNearby = [...nearbyPlaces].sort((a, b) => {
    if (latitude == null) return 0;
    const da = a.location?.latitude != null ? calcDistance(latitude, longitude, a.location.latitude, a.location.longitude) : Infinity;
    const db = b.location?.latitude != null ? calcDistance(latitude, longitude, b.location.latitude, b.location.longitude) : Infinity;
    return da - db;
  });
  const sortedSearch = [...searchResults].sort((a, b) => {
    if (latitude == null) return 0;
    const da = a.location?.latitude != null ? calcDistance(latitude, longitude, a.location.latitude, a.location.longitude) : Infinity;
    const db = b.location?.latitude != null ? calcDistance(latitude, longitude, b.location.latitude, b.location.longitude) : Infinity;
    return da - db;
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
          <h2 className="font-semibold text-gray-900">{isEdit ? 'Modifier l\'activité' : 'Nouvelle activité'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        {hasCoords && (
          <div className="flex border-b border-gray-100 shrink-0">
            {[['manual', '✏️ Manuel'], ['nearby', '📍 Proximité'], ['search', '🔍 Chercher']].map(([t, label]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2.5 text-sm font-medium transition border-b-2 ${tab === t ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="overflow-y-auto flex-1">
          {tab === 'nearby' && hasCoords ? (
            <div className="p-4 space-y-2">
              {nearbyLoading ? (
                <p className="text-center text-gray-400 py-10">Recherche en cours…</p>
              ) : nearbyError ? (
                <p className="text-center text-red-500 py-10">{nearbyError}</p>
              ) : sortedNearby.length === 0 ? (
                <p className="text-center text-gray-400 py-10">Aucune activité trouvée à proximité.</p>
              ) : (
                sortedNearby.map(place => (
                  <PlaceCard key={place.id} place={place} lat={latitude} lng={longitude} onSelect={fillFromPlace} defaultEmoji="🎯" />
                ))
              )}
            </div>
          ) : tab === 'search' && hasCoords ? (
            <div className="p-4">
              <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 mb-3 focus-within:ring-2 focus-within:ring-brand">
                <span className="text-gray-400 text-sm">🔍</span>
                <input
                  autoFocus
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Musée, restaurant, randonnée…"
                  className="flex-1 text-sm outline-none bg-transparent"
                />
                {searchQuery && (
                  <button onClick={() => { setSearchQuery(''); setSearchResults([]); }} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
                )}
              </div>
              <div className="space-y-2">
                {searchLoading ? (
                  <p className="text-center text-gray-400 py-10">Recherche en cours…</p>
                ) : searchError ? (
                  <p className="text-center text-red-500 py-10">{searchError}</p>
                ) : !searchQuery.trim() ? (
                  <p className="text-center text-gray-400 py-10">Saisissez un nom pour rechercher.</p>
                ) : sortedSearch.length === 0 ? (
                  <p className="text-center text-gray-400 py-10">Aucun résultat pour « {searchQuery} ».</p>
                ) : (
                  sortedSearch.map(place => (
                    <PlaceCard key={place.id} place={place} lat={latitude} lng={longitude} onSelect={fillFromPlace} defaultEmoji="🎯" />
                  ))
                )}
              </div>
            </div>
          ) : (
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={form.type}
              onChange={set('type')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand"
            >
              {ACTIVITY_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
            <PlacesAutocompleteInput
              value={form.name}
              onChange={v => setForm(f => ({ ...f, name: v, latitude: null, longitude: null }))}
              onPlaceSelect={({ name, address, latitude, longitude }) =>
                setForm(f => ({ ...f, name, location: f.location || address, latitude, longitude }))
              }
              placeholder="Ex: Visite du Louvre"
              required
              lat={latitude}
              lng={longitude}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lieu</label>
            <input
              type="text"
              value={form.location}
              onChange={set('location')}
              placeholder="Ex: 75001 Paris"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Début</label>
              <input
                type="date"
                value={form.startDate}
                onChange={set('startDate')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand mb-1"
              />
              <input
                type="time"
                value={form.startHour}
                onChange={set('startHour')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fin</label>
              <input
                type="date"
                value={form.endDate}
                onChange={set('endDate')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand mb-1"
              />
              <input
                type="time"
                value={form.endHour}
                onChange={set('endHour')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Réf. résa</label>
              <input
                type="text"
                value={form.bookingRef}
                onChange={set('bookingRef')}
                placeholder="Ex: ABCD1234"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lien résa</label>
              <input
                type="url"
                value={form.bookingUrl}
                onChange={set('bookingUrl')}
                placeholder="https://…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Coût</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.cost}
                onChange={set('cost')}
                placeholder="0.00"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Devise</label>
              <select
                value={form.currency}
                onChange={set('currency')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand"
              >
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
            <select
              value={form.status}
              onChange={set('status')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand"
            >
              {STATUS_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={set('notes')}
              rows={3}
              placeholder="Informations complémentaires…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center gap-3 pt-2">
            {isEdit && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="text-sm text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
              >
                {deleting ? 'Suppression…' : '🗑️ Supprimer'}
              </button>
            )}
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold bg-brand text-white rounded-lg hover:opacity-90 transition disabled:opacity-50"
            >
              {saving ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Ajouter'}
            </button>
          </div>
        </form>
          )}
        </div>
      </div>
    </div>
  );
}
