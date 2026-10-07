import type { Story } from './types'

// Showcase places: a story's position can be set on the spot ("Mark here") instead of
// coming from stories.json, so three corners of an office can become three places.
// Saved on this device only. Pure functions; the React side is usePlaces.ts.

export interface PlaceOverride {
  lat?: number
  lng?: number
  radius_m?: number
  /** Left out of this showcase (e.g. the venue only has room for two places). */
  off?: boolean
  /** Accuracy of the fixes the mark was taken from, in metres. */
  accuracy?: number
  markedAt?: number
}

export type PlaceOverrides = Record<string, PlaceOverride>

const KEY = 'pif.placeOverrides.v1'

export function loadOverrides(): PlaceOverrides {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as PlaceOverrides) : {}
  } catch {
    return {}
  }
}

export function saveOverrides(overrides: PlaceOverrides) {
  try {
    localStorage.setItem(KEY, JSON.stringify(overrides))
  } catch {
    // Private mode or storage full: marks last until the page reloads.
  }
}

/** True when this story has been marked on the spot (has its own position). */
export function isMarked(o: PlaceOverride | undefined): o is PlaceOverride & { lat: number; lng: number; radius_m: number; accuracy: number } {
  return !!o && o.lat !== undefined && o.lng !== undefined && o.radius_m !== undefined
}

export function applyOverrides(stories: readonly Story[], overrides: PlaceOverrides): Story[] {
  return stories
    .filter((s) => !overrides[s.id]?.off)
    .map((s) => {
      const o = overrides[s.id]
      return isMarked(o) ? { ...s, lat: o.lat, lng: o.lng, radius_m: o.radius_m } : s
    })
}

/**
 * Turns a few seconds of fixes into one position: the most accurate half, averaged with
 * weights of 1/accuracy², so one good fix counts for more than several poor ones.
 */
export function averageFixes(fixes: { lat: number; lng: number; accuracy: number }[]) {
  if (fixes.length === 0) return null
  const best = [...fixes].sort((a, b) => a.accuracy - b.accuracy).slice(0, Math.max(1, Math.ceil(fixes.length / 2)))
  let w = 0
  let lat = 0
  let lng = 0
  for (const f of best) {
    const wi = 1 / Math.max(1, f.accuracy) ** 2
    w += wi
    lat += f.lat * wi
    lng += f.lng * wi
  }
  return { lat: lat / w, lng: lng / w, accuracy: best[0].accuracy }
}
