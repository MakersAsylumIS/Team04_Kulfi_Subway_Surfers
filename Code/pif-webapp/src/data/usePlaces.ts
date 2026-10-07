import { useCallback, useMemo, useRef, useState } from 'react'
import { GpsSource } from '../position/gps'
import type { Fix } from '../position/types'
import { applyOverrides, averageFixes, loadOverrides, saveOverrides, type PlaceOverrides } from './places'
import type { Story } from './types'

const MARK_SECONDS = 8
export const RADII = [10, 15, 25, 40]
export const DEFAULT_RADIUS = 25

export interface Measuring {
  storyId: string
  secondsLeft: number
  bestAccuracy: number | null
}

/** The story list with any on-the-spot marks applied, plus the controls to mark places. */
export function usePlaces(bundled: readonly Story[]) {
  const [overrides, setOverrides] = useState<PlaceOverrides>(loadOverrides)
  const [measuring, setMeasuring] = useState<Measuring | null>(null)
  const [error, setError] = useState<string | null>(null)
  const gpsRef = useRef<GpsSource | null>(null)

  const stories = useMemo(() => applyOverrides(bundled, overrides), [bundled, overrides])

  const update = useCallback((next: (o: PlaceOverrides) => PlaceOverrides) => {
    setOverrides((o) => {
      const n = next(o)
      saveOverrides(n)
      return n
    })
  }, [])

  /** Listens to GPS for a few seconds where the user stands, then saves that as the place. */
  const mark = useCallback(
    (storyId: string) => {
      gpsRef.current?.stop()
      setError(null)
      const fixes: Fix[] = []
      const started = Date.now()
      setMeasuring({ storyId, secondsLeft: MARK_SECONDS, bestAccuracy: null })
      const gps = new GpsSource()
      gpsRef.current = gps
      const tick = setInterval(() => {
        const left = MARK_SECONDS - Math.floor((Date.now() - started) / 1000)
        setMeasuring((m) => (m ? { ...m, secondsLeft: Math.max(0, left) } : m))
        if (left > 0) return
        clearInterval(tick)
        gps.stop()
        setMeasuring(null)
        const avg = averageFixes(fixes)
        if (!avg) {
          setError('No location came in. Allow location for this site, and try near a window.')
          return
        }
        update((o) => ({
          ...o,
          [storyId]: {
            ...o[storyId],
            lat: avg.lat,
            lng: avg.lng,
            accuracy: avg.accuracy,
            radius_m: o[storyId]?.radius_m ?? DEFAULT_RADIUS,
            markedAt: Date.now(),
          },
        }))
      }, 250)
      gps.start(
        (f) => {
          fixes.push(f)
          setMeasuring((m) =>
            m ? { ...m, bestAccuracy: Math.min(m.bestAccuracy ?? Infinity, f.accuracy) } : m,
          )
        },
        (e) => {
          clearInterval(tick)
          gps.stop()
          setMeasuring(null)
          setError(e.message)
        },
      )
    },
    [update],
  )

  const setRadius = useCallback(
    (storyId: string, radius: number) =>
      update((o) => (o[storyId] ? { ...o, [storyId]: { ...o[storyId], radius_m: radius } } : o)),
    [update],
  )

  /** Leave a story out of the showcase on this device, or bring it back. */
  const setOff = useCallback(
    (storyId: string, off: boolean) => update((o) => ({ ...o, [storyId]: { ...o[storyId], off } })),
    [update],
  )

  const reset = useCallback(
    (storyId: string) =>
      update((o) => {
        const n = { ...o }
        delete n[storyId]
        return n
      }),
    [update],
  )

  const all = bundled
  return { stories, all, overrides, measuring, error, mark, setRadius, setOff, reset }
}
