import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Story } from '../data/types'
import type { Fix } from '../position/types'

// Plain Leaflet driven from effects: one map instance, layers updated in place.

const INK = '#1c1917'
const PLAYING = '#b45309'
const QUIET = '#78716c'
const ZOOM = 15

interface Props {
  fix: Fix | null
  path: [number, number][]
  stories: readonly Story[]
  revealed: ReadonlySet<string>
  heardIds: ReadonlySet<string>
  playingId: string | null
  /** Where to look before the first fix arrives. */
  fallbackCenter: [number, number]
  children?: ReactNode
}

export function MapView({ fix, path, stories, revealed, heardIds, playingId, fallbackCenter, children }: Props) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layersRef = useRef<{
    path: L.Polyline
    accuracy: L.Circle
    me: L.CircleMarker
    stories: L.LayerGroup
  } | null>(null)
  const [following, setFollowing] = useState(true)
  const followingRef = useRef(true)
  const fallbackRef = useRef(fallbackCenter)

  useEffect(() => {
    if (!elRef.current) return
    const map = L.map(elRef.current, { zoomControl: false, attributionControl: true }).setView(
      fallbackRef.current,
      ZOOM,
    )
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)
    layersRef.current = {
      path: L.polyline([], { color: INK, weight: 4, opacity: 0.55 }).addTo(map),
      stories: L.layerGroup().addTo(map),
      accuracy: L.circle([0, 0], { radius: 0, stroke: false, fillColor: '#2563eb', fillOpacity: 0.12 }),
      me: L.circleMarker([0, 0], {
        radius: 8,
        color: '#ffffff',
        weight: 3,
        fillColor: '#2563eb',
        fillOpacity: 1,
      }),
    }
    // Panning by hand stops the map following you until you tap Recenter.
    map.on('dragstart', () => {
      followingRef.current = false
      setFollowing(false)
    })
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      layersRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layers = layersRef.current
    if (!map || !layers || !fix) return
    const ll: L.LatLngTuple = [fix.lat, fix.lng]
    layers.me.setLatLng(ll).addTo(map)
    layers.accuracy.setLatLng(ll).setRadius(fix.accuracy).addTo(map)
    if (followingRef.current) map.panTo(ll, { animate: true })
  }, [fix])

  useEffect(() => {
    layersRef.current?.path.setLatLngs(path)
  }, [path])

  useEffect(() => {
    const group = layersRef.current?.stories
    if (!group) return
    group.clearLayers()
    for (const story of stories) {
      if (!revealed.has(story.id)) continue
      const playing = story.id === playingId
      const heard = heardIds.has(story.id)
      const color = playing ? PLAYING : heard ? INK : QUIET
      L.circle([story.lat, story.lng], {
        radius: story.radius_m,
        color,
        weight: 1.5,
        dashArray: heard || playing ? undefined : '4 4',
        fillColor: color,
        fillOpacity: playing ? 0.2 : heard ? 0.12 : 0.05,
      })
        .bindTooltip(story.place, { permanent: true, direction: 'center', className: 'pif-story-label' })
        .addTo(group)
    }
  }, [stories, revealed, heardIds, playingId])

  const recenter = () => {
    followingRef.current = true
    setFollowing(true)
    if (fix) mapRef.current?.setView([fix.lat, fix.lng], ZOOM)
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-stone-200">
      <div ref={elRef} className="h-[46dvh] min-h-64 w-full bg-stone-200" aria-label="Map" />
      {/* Overlay sits above Leaflet's panes (z-index up to 1000). */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] p-3">{children}</div>
      {!following && (
        <button
          type="button"
          onClick={recenter}
          className="absolute right-3 bottom-8 z-[1000] rounded-full bg-white px-4 py-3 text-base font-medium shadow-md active:bg-stone-100"
        >
          Recenter
        </button>
      )}
    </div>
  )
}
