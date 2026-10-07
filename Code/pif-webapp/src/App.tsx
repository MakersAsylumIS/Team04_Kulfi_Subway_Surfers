import { useEffect, useMemo, useState } from 'react'
import type { PlaybackPosition } from './audio/player'
import { stories as bundledStories } from './data/stories'
import type { Story } from './data/types'
import { isMarked } from './data/places'
import { usePlaces } from './data/usePlaces'
import { useJourney, type NowPlaying, type SourceKind } from './journey/useJourney'
import { MapView } from './map/MapView'
import { FakePet } from './pet/fakePet'
import { FakePetPanel } from './pet/FakePetPanel'
import { PetTestPanel } from './pet/PetTestPanel'
import { hasWebBluetooth } from './pet/link'
import { usePet } from './pet/usePet'
import { routes, type Route } from './position/routes'
import { ShowcaseSetup } from './ShowcaseSetup'

const MUMBAI: [number, number] = [19.076, 72.8777]
// Paces in metres per second. Stories are about places, so any pace works.
const PACES = [
  { label: 'Walk', mps: 1.4 },
  { label: 'Bus', mps: 7 },
  { label: 'Train', mps: 11 },
  { label: 'Fast', mps: 60 },
]

export type PetControls = ReturnType<typeof usePet>
type PlaceControls = ReturnType<typeof usePlaces>

function App() {
  const places = usePlaces(bundledStories)
  const stories = places.stories
  const pet = usePet(stories)
  const journey = useJourney(stories, pet.pet)
  return journey.status === 'idle' ? (
    <StartScreen journey={journey} pet={pet} places={places} />
  ) : (
    <JourneyScreen journey={journey} pet={pet} stories={stories} />
  )
}

/** A simulated walk through the places marked on the spot, to rehearse the showcase indoors. */
function showcaseRoute(stories: readonly Story[], places: PlaceControls): Route | null {
  const marked = stories.filter((s) => isMarked(places.overrides[s.id]))
  if (marked.length < 2) return null
  return {
    id: 'showcase-walk',
    name: 'Walk: through the showcase places',
    points: marked.map((s) => ({ name: s.place, lat: s.lat, lng: s.lng })),
  }
}

export function PetCard({ pet, allowFake }: { pet: PetControls; allowFake: boolean }) {
  // Web Bluetooth doesn't exist on iOS: there the pairing UI is hidden entirely.
  if (!pet.pet && !hasWebBluetooth && !allowFake) return null
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4" aria-label="Pet">
      {pet.pet ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-base">
            <span className="block text-sm text-stone-500">Pet connected</span>
            {pet.pet.name}
          </p>
          <button
            type="button"
            onClick={pet.disconnect}
            className="rounded-xl border border-stone-300 px-4 py-3 text-base font-medium active:bg-stone-100"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {hasWebBluetooth && (
            <button
              type="button"
              onClick={pet.pair}
              disabled={pet.connecting}
              className="w-full rounded-xl border border-stone-900 py-3 text-base font-semibold active:bg-stone-100 disabled:opacity-50"
            >
              {pet.connecting ? 'Connecting…' : 'Pair a pet'}
            </button>
          )}
          {allowFake && (
            <button
              type="button"
              onClick={pet.connectFake}
              className="w-full rounded-xl border border-stone-300 py-3 text-base text-stone-600 active:bg-stone-100"
            >
              Use a fake pet (for testing)
            </button>
          )}
          {pet.error && <p className="text-sm text-red-700">{pet.error}</p>}
        </div>
      )}
    </section>
  )
}

function StartScreen({
  journey,
  pet,
  places,
}: {
  journey: ReturnType<typeof useJourney>
  pet: PetControls
  places: PlaceControls
}) {
  const stories = places.stories
  const onStart = journey.start
  const lastHeard = journey.heard
  // Remember the last choice; with showcase places marked, start on real GPS.
  const [source, setSourceState] = useState<SourceKind>(() => {
    try {
      const saved = localStorage.getItem('pif.source')
      if (saved === 'gps' || saved === 'simulate') return saved
    } catch {
      // no storage: fall through
    }
    return Object.values(places.overrides).some(isMarked) ? 'gps' : 'simulate'
  })
  const setSource = (s: SourceKind) => {
    setSourceState(s)
    try {
      localStorage.setItem('pif.source', s)
    } catch {
      // ignore
    }
  }
  const showcase = showcaseRoute(stories, places)
  const allRoutes = showcase ? [showcase, ...routes] : routes
  const [routeId, setRouteId] = useState(allRoutes[0].id)
  const [speed, setSpeed] = useState(PACES[3].mps)
  const [noise, setNoise] = useState(false)
  const route = allRoutes.find((r) => r.id === routeId) ?? allRoutes[0]

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-10 pb-8">
      <header>
        <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight">
          Play it Forward
          <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">Debug</span>
        </h1>
        <p className="mt-3 text-lg leading-snug text-stone-600">
          We cross paths with thousands of people and hundreds of places every day, and know
          almost nothing about any of them.
        </p>
      </header>

      <section className="mt-8 space-y-4" aria-label="Journey settings">
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-stone-200 p-1">
          {(['simulate', 'gps'] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={source === kind}
              onClick={() => setSource(kind)}
              className={`rounded-xl py-3 text-base font-medium ${
                source === kind ? 'bg-white shadow-sm' : 'text-stone-600'
              }`}
            >
              {kind === 'simulate' ? 'Simulate a ride' : 'Real GPS'}
            </button>
          ))}
        </div>

        {source === 'simulate' ? (
          <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-4">
            <label className="block">
              <span className="text-sm text-stone-500">Route</span>
              <select
                value={routeId}
                onChange={(e) => setRouteId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-3 text-base"
              >
                {allRoutes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <SpeedPicker speed={speed} onChange={setSpeed} />
            <NoiseToggle noise={noise} onChange={setNoise} />
          </div>
        ) : (
          <p className="rounded-2xl border border-stone-200 bg-white p-4 text-base text-stone-600">
            Uses your phone's location. It only works while this page is open and the screen is
            on, like a music player you switch on while you are out.
          </p>
        )}
      </section>

      <div className="mt-4">
        <ShowcaseSetup
          stories={stories}
          overrides={places.overrides}
          measuring={places.measuring}
          error={places.error}
          onMark={places.mark}
          onRadius={places.setRadius}
          onReset={places.reset}
          all={places.all}
          onOff={places.setOff}
        />
      </div>

      <div className="mt-4">
        <PetCard pet={pet} allowFake={source === 'simulate'} />
        {pet.pet && <PetTestPanel stories={stories} test={journey.test} events={journey.petEvents} link={pet.pet} />}
        {pet.pet instanceof FakePet && (
          <div className="mt-3">
            <FakePetPanel pet={pet.pet} />
          </div>
        )}
      </div>

      <section className="mt-8 flex-1" aria-labelledby="stories-heading">
        <h2 id="stories-heading" className="text-sm font-medium tracking-wide text-stone-500 uppercase">
          Places with stories ({stories.length})
        </h2>
        <ul className="mt-3 divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white">
          {stories.map((story) => (
            <li key={story.id} className="px-4 py-4">
              <p className="text-sm text-stone-500">
                {story.place}
                {lastHeard.some((h) => h.id === story.id) && ' · heard last journey'}
              </p>
              <p className="text-lg font-medium">{story.title}</p>
              {!story.approved && (
                <p className="mt-1 text-xs font-medium text-amber-700">Draft, not approved</p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <footer className="mt-8 space-y-3">
        <button
          type="button"
          onClick={() => onStart({ source, route, speed, noise })}
          className="w-full rounded-2xl bg-stone-900 py-5 text-lg font-semibold text-white active:bg-stone-700"
        >
          Start journey
        </button>
      </footer>
    </main>
  )
}

export function JourneyScreen({
  journey,
  pet,
  stories,
}: {
  journey: ReturnType<typeof useJourney>
  pet: PetControls
  stories: readonly Story[]
}) {
  const { settings, fix, progress, nowPlaying, queued, heard, next, here, error, routeEnded, revealed, path } = journey
  const heardIds = useMemo(() => new Set(heard.map((s) => s.id)), [heard])
  const simulated = settings?.source === 'simulate'
  // The Start button sits at the bottom of a long page; open the journey at the map.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-6 pb-8">
      <header className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-stone-500">
          {journey.status === 'playing' ? 'Playing' : 'Listening for places'}
        </p>
        {simulated && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
            Simulated
          </span>
        )}
      </header>

      <section className="mt-3" aria-label="Map">
        <MapView
          fix={fix}
          path={path}
          stories={stories}
          revealed={revealed}
          heardIds={heardIds}
          playingId={nowPlaying?.story.id ?? null}
          close={stories.some((s) => s.radius_m <= 50)}
          fallbackCenter={
            settings?.source === 'simulate'
              ? [settings.route.points[0].lat, settings.route.points[0].lng]
              : MUMBAI
          }
        >
          <div className="inline-block rounded-xl bg-white/95 px-4 py-2 shadow-md" aria-live="polite">
            <p className="text-sm text-stone-500">
              {here?.inside ? 'You are at' : here ? 'You are near' : 'You are'}
            </p>
            <p className="text-2xl leading-tight font-semibold tracking-tight">
              {here?.name ?? (fix ? 'between places' : 'finding your position…')}
            </p>
          </div>
        </MapView>
      </section>

      {simulated && settings && (
        <section className="mt-4" aria-label="Route progress">
          <div className="h-1.5 overflow-hidden rounded-full bg-stone-200">
            <div
              className="h-full bg-stone-800 transition-[width] duration-500"
              style={{ width: `${(progress?.fraction ?? 0) * 100}%` }}
            />
          </div>
        </section>
      )}

      <section className="mt-6 flex-1" aria-live="polite">
        {nowPlaying ? (
          <NowPlayingCard np={nowPlaying} position={journey.position} />
        ) : (
          <div className="rounded-2xl border border-dashed border-stone-300 p-6 text-center">
            <p className="text-lg text-stone-600">
              {routeEnded ? 'You have reached the end of the route.' : 'No story here yet.'}
            </p>
            {next && !routeEnded && (
              <p className="mt-2 text-base text-stone-500">
                Next story: {next.story.place}, {formatDistance(next.distance)} away
              </p>
            )}
          </div>
        )}

        {pet.pet instanceof FakePet && (
          <div className="mt-4">
            <FakePetPanel pet={pet.pet} />
          </div>
        )}

        {queued && (
          <p className="mt-3 text-sm text-stone-500">Up next if you're still nearby: {queued.place}</p>
        )}

        {nowPlaying && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={journey.togglePause}
              className="rounded-2xl bg-stone-900 py-4 text-lg font-semibold text-white active:bg-stone-700"
            >
              {journey.paused ? 'Resume' : 'Pause'}
            </button>
            <button
              type="button"
              onClick={journey.skip}
              className="rounded-2xl border border-stone-300 bg-white py-4 text-lg font-medium active:bg-stone-100"
            >
              Skip
            </button>
          </div>
        )}

        {heard.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-medium tracking-wide text-stone-500 uppercase">Heard this journey</h2>
            <ul className="mt-2 space-y-1">
              {heard.map((s) => (
                <li key={s.id} className="text-base text-stone-700">
                  {s.place}: {s.title}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <footer className="mt-6 space-y-4">
        {simulated && settings && (
          <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
            <SpeedPicker speed={settings.speed} onChange={(speed) => journey.updateSim({ speed })} />
            <NoiseToggle noise={settings.noise} onChange={(noise) => journey.updateSim({ noise })} />
          </div>
        )}
        <p className="text-center text-sm text-stone-500">
          {error
            ? error
            : fix
              ? `Position accurate to about ${Math.round(fix.accuracy)} m`
              : 'Waiting for a position…'}
        </p>
        <button
          type="button"
          onClick={journey.stop}
          className="w-full rounded-2xl bg-stone-900 py-5 text-lg font-semibold text-white active:bg-stone-700"
        >
          Stop journey
        </button>
      </footer>
    </main>
  )
}

function NowPlayingCard({ np, position }: { np: NowPlaying; position: () => PlaybackPosition | null }) {
  const [pos, setPos] = useState<PlaybackPosition | null>(() => position())
  useEffect(() => {
    const t = setInterval(() => setPos(position()), 250)
    return () => clearInterval(t)
  }, [position])
  const total = pos?.durationS || np.story.duration_s
  const elapsed = Math.min(total, pos?.currentS ?? 0)

  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-5">
      <p className="text-sm text-stone-500">{np.story.place}</p>
      <h2 className="mt-1 text-2xl font-semibold leading-tight">{np.story.title}</h2>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-stone-200">
        <div className="h-full bg-stone-800" style={{ width: `${(elapsed / total) * 100}%` }} />
      </div>
      <p className="mt-1 text-right text-xs text-stone-500 tabular-nums">
        {pos?.onPet && 'Playing on your pet · '}
        {pos && !pos.hasAudio && 'No audio file, text only · '}
        {Math.floor(elapsed)}s / {Math.round(total)}s
      </p>
      <p className="mt-3 text-lg leading-relaxed text-stone-800">{np.story.text}</p>
      <a
        href={np.story.source}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-block text-sm text-stone-500 underline"
      >
        Source
      </a>
    </article>
  )
}

function SpeedPicker({ speed, onChange }: { speed: number; onChange: (s: number) => void }) {
  return (
    <div>
      <span className="text-sm text-stone-500">Pace</span>
      <div className="mt-1 grid grid-cols-4 gap-2">
        {PACES.map((p) => (
          <button
            key={p.label}
            type="button"
            aria-pressed={speed === p.mps}
            onClick={() => onChange(p.mps)}
            className={`rounded-xl border py-3 text-base font-medium ${
              speed === p.mps ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 bg-white'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function NoiseToggle({ noise, onChange }: { noise: boolean; onChange: (n: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1">
      <span className="text-base">
        Noisy GPS
        <span className="block text-sm text-stone-500">Jittery fixes, sometimes a wild one</span>
      </span>
      <input
        type="checkbox"
        checked={noise}
        onChange={(e) => onChange(e.target.checked)}
        className="h-6 w-6 accent-stone-900"
      />
    </label>
  )
}

function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`
}

export default App
