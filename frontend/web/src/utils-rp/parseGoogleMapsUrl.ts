export interface ParsedWaypoint {
  name: string
  lat?: number
  lng?: number
}

/**
 * Parse a Google Maps directions URL and return an ordered list of waypoints.
 *
 * URL structure:
 *   https://www.google.com/maps/dir/WAYPOINT1/WAYPOINT2/.../WAYPOINTn/@center/data=...
 *
 * Coordinates are embedded in the data parameter as repeated blocks:
 *   !1m5!1m1!1s<placeId>!2m2!1d<lng>!2d<lat>
 */
export function parseGoogleMapsUrl(url: string): ParsedWaypoint[] {
  // ── 1. Extract waypoint names from path ──────────────────────────────────────
  const dirMatch = url.match(/\/maps\/dir\/([^?&#]+)/)
  if (!dirMatch) return []

  const rawPath = dirMatch[1]
  const segments = rawPath
    .split('/')
    .map(s => decodeURIComponent(s.replace(/\+/g, ' ')).trim())
    .filter(s => s.length > 0 && !s.startsWith('@'))

  if (segments.length === 0) return []

  // ── 2. Extract coordinate pairs from the data section ────────────────────────
  // Pattern:  !1m5!1m1!1s<hex>!2m2!1d<lng>!2d<lat>
  const coordPairs: Array<{ lat: number; lng: number }> = []

  const dataMatch = url.match(/[?&]data=([^&#]+)/)
  if (dataMatch) {
    const data = decodeURIComponent(dataMatch[1])
    const re = /!1m5!1m1!1s[^!]+!2m2!1d(-?[\d.]+)!2d(-?[\d.]+)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(data)) !== null) {
      coordPairs.push({ lng: parseFloat(m[1]), lat: parseFloat(m[2]) })
    }
  }

  // ── 3. Merge names and coordinates ───────────────────────────────────────────
  return segments.map((name, i) => ({
    name,
    ...(coordPairs[i] ? { lat: coordPairs[i].lat, lng: coordPairs[i].lng } : {}),
  }))
}

/** Returns true if the string looks like a Google Maps directions URL */
export function isGoogleMapsDirectionsUrl(url: string): boolean {
  return /google\.[a-z.]+\/maps\/dir\//.test(url)
}
