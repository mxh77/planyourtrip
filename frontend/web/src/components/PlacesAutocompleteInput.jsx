import React, { useState, useEffect, useRef } from 'react';

const API_KEY = import.meta.env.VITE_GOOGLE_PLACES_API_KEY;
const SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.location';

async function searchPlaces(query, lat, lng) {
  if (!query.trim() || !API_KEY) return [];
  const body = {
    textQuery: query,
    languageCode: 'fr',
    maxResultCount: 6,
    ...(lat != null && lng != null && {
      locationBias: {
        circle: { center: { latitude: lat, longitude: lng }, radius: 50000 },
      },
    }),
  };
  const resp = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!resp.ok) return [];
  return data.places ?? [];
}

/**
 * Champ texte avec autocomplétion Google Places.
 *
 * Props:
 *   value         {string}   valeur du champ texte
 *   onChange      {fn}       appelé avec (newValue: string) à chaque frappe
 *   onPlaceSelect {fn}       appelé avec { name, address, latitude, longitude } à la sélection
 *   placeholder   {string}
 *   lat           {number}   coords du contexte (pour biais de proximité)
 *   lng           {number}
 *   className     {string}   classes Tailwind à appliquer à l'<input>
 *   required      {bool}
 */
export default function PlacesAutocompleteInput({
  value,
  onChange,
  onPlaceSelect,
  placeholder = 'Rechercher un lieu…',
  lat,
  lng,
  className = '',
  required = false,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timerRef = useRef(null);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleChange(e) {
    const v = e.target.value;
    onChange(v);
    clearTimeout(timerRef.current);
    if (v.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await searchPlaces(v, lat, lng);
        setSuggestions(results);
        setOpen(results.length > 0);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }

  function selectPlace(place) {
    setOpen(false);
    setSuggestions([]);
    onPlaceSelect?.({
      name: place.displayName?.text ?? '',
      address: place.formattedAddress ?? '',
      latitude: place.location?.latitude ?? null,
      longitude: place.location?.longitude ?? null,
    });
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        required={required}
        className={className}
        autoComplete="off"
      />
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin pointer-events-none" />
      )}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {suggestions.map(place => (
            <li
              key={place.id}
              onMouseDown={() => selectPlace(place)}
              className="px-3 py-2 cursor-pointer hover:bg-orange-50 text-sm"
            >
              <div className="font-medium text-gray-800 truncate">{place.displayName?.text}</div>
              <div className="text-xs text-gray-500 truncate">{place.formattedAddress}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
