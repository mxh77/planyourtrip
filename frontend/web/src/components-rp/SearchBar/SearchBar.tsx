import { useRef, useState, useCallback, useEffect } from 'react'
import { Search, X, Loader2 } from 'lucide-react'
import type { Place } from '../../types'

interface Props {
  onSelect: (place: Place) => void
  placeholder?: string
  className?: string
  defaultValue?: string
}

const PLACE_FIELDS = ['displayName', 'formattedAddress', 'location', 'types', 'rating', 'id']

// Suggestion de la nouvelle API Places
type Suggestion = google.maps.places.AutocompleteSuggestion

export default function SearchBar({
  onSelect,
  placeholder = 'Rechercher un lieu…',
  className = '',
  defaultValue = '',
}: Props) {
  const [value, setValue] = useState(defaultValue)
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null)

  // Fermer dropdown si clic en dehors
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const getSessionToken = useCallback(() => {
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken()
    }
    return sessionTokenRef.current
  }, [])

  const fetchSuggestions = useCallback(async (input: string) => {
    if (!input.trim()) { setSuggestions([]); setOpen(false); return }
    try {
      const { suggestions: results } =
        await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input,
          sessionToken: getSessionToken(),
        })
      setSuggestions(results ?? [])
      setOpen((results?.length ?? 0) > 0)
    } catch {
      setSuggestions([])
      setOpen(false)
    }
  }, [getSessionToken])

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setValue(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 300)
  }, [fetchSuggestions])

  const handleSelect = useCallback(async (suggestion: Suggestion) => {
    setOpen(false)
    setLoading(true)
    // Réinitialiser le session token après sélection (fin de session)
    sessionTokenRef.current = null
    try {
      const place = suggestion.placePrediction?.toPlace()
      if (!place) return
      await place.fetchFields({ fields: PLACE_FIELDS })
      const lat = place.location?.lat?.() ?? 0
      const lng = place.location?.lng?.() ?? 0
      if (!lat || !lng) return
      const result: Place = {
        placeId: place.id ?? '',
        name: place.displayName ?? suggestion.placePrediction?.mainText?.toString() ?? '',
        address: place.formattedAddress ?? suggestion.placePrediction?.text?.toString() ?? '',
        lat,
        lng,
        types: place.types ?? [],
        rating: place.rating ?? undefined,
      }
      setValue(result.name)
      onSelect(result)
    } finally {
      setLoading(false)
    }
  }, [onSelect])

  const clear = useCallback(() => {
    setValue('')
    setSuggestions([])
    setOpen(false)
  }, [])

  return (
    <div ref={containerRef} className={`relative flex flex-col ${className}`}>
      <div className="relative flex items-center">
        <Search className="absolute left-3 w-4 h-4 text-muted pointer-events-none" />
        <input
          value={value}
          onChange={handleInput}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="input pl-9 pr-8"
          autoComplete="off"
        />
        {loading && <Loader2 className="absolute right-3 w-4 h-4 text-muted animate-spin" />}
        {!loading && value && (
          <button onClick={clear} className="absolute right-2 p-1 text-muted hover:text-slate-300">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <ul className="absolute top-full left-0 right-0 mt-1 z-50
                       bg-surface-800 border border-border/40 rounded-lg shadow-xl
                       max-h-60 overflow-y-auto">
          {suggestions.map((s, i) => {
            const pred = s.placePrediction
            return (
              <li
                key={pred?.placeId ?? i}
                onMouseDown={() => handleSelect(s)}
                className="px-3 py-2 cursor-pointer hover:bg-surface-700 transition-colors"
              >
                <p className="text-sm text-slate-200 truncate">
                  {pred?.mainText?.toString() ?? pred?.text?.toString() ?? ''}
                </p>
                <p className="text-xs text-muted truncate">
                  {pred?.secondaryText?.toString() ?? ''}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
