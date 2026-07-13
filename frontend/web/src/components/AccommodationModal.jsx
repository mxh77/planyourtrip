import React, { useState, useEffect } from 'react';
import api from '../api.js';
import { validateAccommodationDates } from '../utils/dateValidation.js';
import PlacesAutocompleteInput from './PlacesAutocompleteInput.jsx';

const API_KEY = import.meta.env.VITE_GOOGLE_PLACES_API_KEY;
const NEARBY_URL = 'https://places.googleapis.com/v1/places:searchNearby';
const SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK = 'places.id,places.displayName,places.rating,places.photos,places.formattedAddress,places.location';
const DEF_RADIUS = 5000;
const LODGING_NEARBY = ['hotel', 'motel', 'campground', 'bed_and_breakfast', 'hostel', 'parking'];

const ACCOMMODATION_TYPES = [
  { value: 'HOTEL', label: '🏨 Hôtel' },
  { value: 'CAMPING', label: '🏕️ Camping' },
  { value: 'PARKING', label: '🅿️ Parking' },
  { value: 'OTHER', label: '🏪 Autre' },
];

const STATUS_OPTIONS = [
  { value: 'PLANNED', label: '🗓️ Planifié' },
  { value: 'BOOKED', label: '✅ Réservé' },
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

async function fetchNearbyLodging(lat, lng, radius) {
  if (!API_KEY) return [];
  const resp = await fetch(NEARBY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': API_KEY, 'X-Goog-FieldMask': FIELD_MASK },
    body: JSON.stringify({ includedTypes: LODGING_NEARBY, maxResultCount: 10, locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius } }, languageCode: 'fr' }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message ?? `HTTP ${resp.status}`);
  return data.places ?? [];
}

async function searchLodgingByText(query, lat, lng, radius) {
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

export default function AccommodationModal({ stepId, accommodation, latitude, longitude, onClose, onSaved, stepStartDate, stepEndDate }) {
  const isEdit = !!accommodation;
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
    type: 'HOTEL',
    name: '',
    address: '',
    latitude: null,
    longitude: null,
    checkInDate: '',
    checkInTime: '',
    checkOutDate: '',
    checkOutTime: '',
    bookingRef: '',
    bookingUrl: '',
    pricePerNight: '',
    currency: 'EUR',
    notes: '',
    status: 'PLANNED',
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isEdit && accommodation) {
      setForm({
        type: accommodation.type || 'HOTEL',
        name: accommodation.name || '',
        address: accommodation.address || '',
        latitude: accommodation.latitude ?? null,
        longitude: accommodation.longitude ?? null,
        checkInDate: toDatePart(accommodation.checkIn),
        checkInTime: toTimePart(accommodation.checkIn),
        checkOutDate: toDatePart(accommodation.checkOut),
        checkOutTime: toTimePart(accommodation.checkOut),
        bookingRef: accommodation.bookingRef || '',
        bookingUrl: accommodation.bookingUrl || '',
        pricePerNight: accommodation.pricePerNight != null ? String(accommodation.pricePerNight) : '',
        currency: accommodation.currency || 'EUR',
        notes: accommodation.notes || '',
        status: accommodation.status || 'PLANNED',
      });
    }
  }, [isEdit, accommodation]);

  useEffect(() => {
    if (tab !== 'nearby' || !hasCoords) return;
    setNearbyLoading(true); setNearbyError(null);
    fetchNearbyLodging(latitude, longitude, DEF_RADIUS)
      .then(r => setNearbyPlaces(r))
      .catch(e => setNearbyError(e.message ?? 'Erreur réseau'))
      .finally(() => setNearbyLoading(false));
  }, [tab, latitude, longitude]);

  useEffect(() => {
    if (tab !== 'search') return;
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(() => {
      setSearchLoading(true); setSearchError(null);
      searchLodgingByText(searchQuery, latitude, longitude, DEF_RADIUS)
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
      address: place.formattedAddress ?? '',
      latitude: place.location?.latitude ?? null,
      longitude: place.location?.longitude ?? null,
    }));
    setTab('manual');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const checkIn = combineDateTime(form.checkInDate, form.checkInTime);
    const checkOut = combineDateTime(form.checkOutDate, form.checkOutTime);
    const dateErrors = validateAccommodationDates({
      checkIn: checkIn || undefined,
      checkOut: checkOut || undefined,
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
        address: form.address || null,
        latitude: form.latitude,
        longitude: form.longitude,
        checkIn: checkIn || null,
        checkOut: checkOut || null,
        bookingRef: form.bookingRef || null,
        bookingUrl: form.bookingUrl || null,
        pricePerNight: form.pricePerNight !== '' ? parseFloat(form.pricePerNight) : null,
        currency: form.currency,
        notes: form.notes || null,
        status: form.status,
      };
      if (isEdit) {
        await api.patch(`/accommodations/${accommodation.id}`, payload);
      } else {
        await api.post('/accommodations', payload);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Une erreur est survenue');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Supprimer l'hébergement "${accommodation.name}" ?`)) return;
    setDeleting(true);
    try {
      await api.delete(`/accommodations/${accommodation.id}`);
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
          <h2 className="font-semibold text-gray-900">{isEdit ? 'Modifier l\'hébergement' : 'Nouvel hébergement'}</h2>
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
                <p className="text-center text-gray-400 py-10">Aucun hébergement trouvé à proximité.</p>
              ) : (
                sortedNearby.map(place => (
                  <PlaceCard key={place.id} place={place} lat={latitude} lng={longitude} onSelect={fillFromPlace} defaultEmoji="🏨" />
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
                  placeholder="Hôtel, camping, parking…"
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
                    <PlaceCard key={place.id} place={place} lat={latitude} lng={longitude} onSelect={fillFromPlace} defaultEmoji="🏨" />
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
              {ACCOMMODATION_TYPES.map(t => (
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
                setForm(f => ({ ...f, name, address, latitude, longitude }))
              }
              placeholder="Ex: Hôtel des Alpes"
              required
              lat={latitude}
              lng={longitude}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
            <input
              type="text"
              value={form.address}
              onChange={set('address')}
              placeholder="12 rue de la Paix, Paris"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Check-in</label>
              <input type="date" value={form.checkInDate} onChange={set('checkInDate')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand mb-1" />
              <input type="time" value={form.checkInTime} onChange={set('checkInTime')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Check-out</label>
              <input type="date" value={form.checkOutDate} onChange={set('checkOutDate')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand mb-1" />
              <input type="time" value={form.checkOutTime} onChange={set('checkOutTime')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Référence de réservation</label>
            <input
              type="text"
              value={form.bookingRef}
              onChange={set('bookingRef')}
              placeholder="Ex: CONF-123456"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL de réservation</label>
            <input
              type="url"
              value={form.bookingUrl}
              onChange={set('bookingUrl')}
              placeholder="https://booking.com/..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prix par nuit</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.pricePerNight}
                onChange={set('pricePerNight')}
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
                {CURRENCIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={set('notes')}
              placeholder="Infos complémentaires…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
            />
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

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <div className="flex items-center justify-between pt-1">
            {isEdit ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="text-red-600 text-sm font-semibold hover:underline disabled:opacity-50"
              >
                {deleting ? 'Suppression…' : 'Supprimer'}
              </button>
            ) : <div />}
            <div className="flex gap-2">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition">
                Annuler
              </button>
              <button type="submit" disabled={saving}
                className="px-4 py-2 text-sm bg-brand text-white font-semibold rounded-lg hover:opacity-90 transition disabled:opacity-50">
                {saving ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer'}
              </button>
            </div>
          </div>
        </form>
          )}
        </div>
      </div>
    </div>
  );
}
