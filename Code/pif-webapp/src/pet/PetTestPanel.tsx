import { useEffect, useRef, useState } from 'react'
import type { PlaybackPosition } from '../audio/player'
import type { Story } from '../data/types'
import { GpsSource } from '../position/gps'
import { placeAt } from '../trigger/trigger'
import type { PetLink } from './link'
import { encodeNowShowing } from './protocol'

interface TestControls {
  story: Story | null
  paused: boolean
  play: (story: Story) => void
  togglePause: () => void
  stop: () => void
  position: () => PlaybackPosition | null
}

/** Play any story on the connected pet without a journey, to check the hardware end to end. */
export function PetTestPanel({
  stories,
  test,
  events,
  link,
}: {
  stories: readonly Story[]
  test: TestControls
  events: string[]
  link: PetLink
}) {
  const location = useLocationOnPet(link, stories)
  const [pos, setPos] = useState<PlaybackPosition | null>(null)
  useEffect(() => {
    const t = setInterval(() => setPos(test.position()), 250)
    return () => clearInterval(t)
  }, [test])

  return (
    <section className="mt-3 rounded-2xl border border-stone-200 bg-white p-4" aria-label="Test the pet">
      <h2 className="text-sm font-medium tracking-wide text-stone-500 uppercase">Test the pet</h2>
      <ul className="mt-2 divide-y divide-stone-100">
        {stories.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0">
              <span className="block truncate text-base">{s.place}</span>
              <span className="block truncate font-mono text-xs text-stone-500">{s.id}</span>
            </span>
            <button
              type="button"
              onClick={() => test.play(s)}
              className="shrink-0 rounded-xl border border-stone-900 px-4 py-2 text-base font-medium active:bg-stone-100"
            >
              Play
            </button>
          </li>
        ))}
      </ul>

      {test.story && (
        <div className="mt-3 rounded-xl bg-stone-100 p-3">
          <p className="text-base">
            {test.story.place}
            <span className="text-stone-500">
              {' · '}
              {pos ? `${Math.floor(pos.currentS)}s / ${Math.round(pos.durationS)}s` : '…'}
              {pos && (pos.onPet ? ' on the pet' : pos.hasAudio ? ' on this phone' : ' (no audio file)')}
            </span>
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={test.togglePause}
              className="rounded-xl bg-stone-900 py-2 text-base font-semibold text-white active:bg-stone-700"
            >
              {test.paused ? 'Resume' : 'Pause'}
            </button>
            <button
              type="button"
              onClick={test.stop}
              className="rounded-xl border border-stone-300 bg-white py-2 text-base font-medium active:bg-stone-100"
            >
              Stop
            </button>
          </div>
        </div>
      )}

      <p className="mt-3 text-sm text-stone-500">
        Touches from the pet: {events.length ? events.join(', ') : 'none yet'}
      </p>

      <label className="mt-3 flex items-center justify-between gap-3 border-t border-stone-100 pt-3">
        <span className="text-base">
          Show my location on the pet
          <span className="block text-sm text-stone-500">
            {location.error ?? location.last ?? 'Sends your GPS coordinates to its screen, for testing'}
          </span>
        </span>
        <input
          type="checkbox"
          checked={location.on}
          onChange={(e) => location.setOn(e.target.checked)}
          className="h-6 w-6 shrink-0 accent-stone-900"
        />
      </label>
    </section>
  )
}

/**
 * Test only: sends the phone's coordinates to the pet's display via now_showing.
 * In the product the pet is told place names, never positions (AGENTS.md).
 */
function useLocationOnPet(link: PetLink, stories: readonly Story[]) {
  const [on, setOn] = useState(false)
  const [last, setLast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const lastSent = useRef(0)

  useEffect(() => {
    if (!on) return
    const gps = new GpsSource()
    gps.start(
      (fix) => {
        const now = Date.now()
        if (now - lastSent.current < 1000) return // at most one update a second
        lastSent.current = now
        const coords = `${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)}`
        const here = placeAt(fix, stories)
        const detail = `±${Math.round(fix.accuracy)} m${here ? ` · ${here.inside ? 'at' : 'near'} ${here.name}` : ''}`
        setLast(`${coords} (${detail})`)
        void link.write('nowShowing', encodeNowShowing(0, coords, detail)).catch(() => setError('Could not reach the pet.'))
      },
      (e) => setError(e.message),
    )
    return () => gps.stop()
  }, [on, link, stories])

  const toggle = (value: boolean) => {
    setError(null)
    setOn(value)
  }

  return { on, setOn: toggle, last, error }
}
