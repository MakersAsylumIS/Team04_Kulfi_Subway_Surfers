import { isMarked, type PlaceOverrides } from './data/places'
import type { Story } from './data/types'
import { RADII, type Measuring } from './data/usePlaces'
import { haversineM } from './trigger/trigger'

interface Props {
  /** The stories in this showcase (left-out ones removed, marks applied). */
  stories: readonly Story[]
  /** Every bundled story, so left-out ones can be brought back. */
  all: readonly Story[]
  overrides: PlaceOverrides
  measuring: Measuring | null
  error: string | null
  onMark: (id: string) => void
  onRadius: (id: string, r: number) => void
  onReset: (id: string) => void
  onOff: (id: string, off: boolean) => void
}

/**
 * Turn real spots (three corners of an office) into the story places: stand at a spot,
 * tap "Mark here", and that story now plays when someone walks there.
 */
export function ShowcaseSetup({ stories, all, overrides, measuring, error, onMark, onRadius, onReset, onOff }: Props) {
  const marked = stories.filter((s) => isMarked(overrides[s.id]))
  const leftOut = all.filter((s) => overrides[s.id]?.off)
  const overlaps: string[] = []
  for (let i = 0; i < marked.length; i++) {
    for (let j = i + 1; j < marked.length; j++) {
      const a = marked[i]
      const b = marked[j]
      const d = haversineM(a.lat, a.lng, b.lat, b.lng)
      if (d < a.radius_m + b.radius_m) {
        overlaps.push(`${a.place} and ${b.place} are ${Math.round(d)} m apart, so their circles overlap.`)
      }
    }
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4" aria-label="Showcase places">
      <h2 className="text-sm font-medium tracking-wide text-stone-500 uppercase">Showcase places</h2>
      <p className="mt-1 text-sm text-stone-500">
        Stand where a story should play and tap Mark here. Saved on this device.
      </p>
      <ul className="mt-2 divide-y divide-stone-100">
        {stories.map((s) => {
          const o = isMarked(overrides[s.id]) ? overrides[s.id] : undefined
          const busy = measuring?.storyId === s.id
          return (
            <li key={s.id} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-base">{s.place}</span>
                  <span className="block text-xs text-stone-500">
                    {busy
                      ? `Measuring… ${measuring.secondsLeft}s${measuring.bestAccuracy != null ? `, best ±${Math.round(measuring.bestAccuracy)} m` : ''}`
                      : o
                        ? `Marked here (±${Math.round(o.accuracy ?? 0)} m), plays within ${o.radius_m} m`
                        : 'Not marked: uses its map position'}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={!!measuring}
                  onClick={() => onMark(s.id)}
                  className="shrink-0 rounded-xl border border-stone-900 px-4 py-2 text-base font-medium active:bg-stone-100 disabled:opacity-40"
                >
                  {o ? 'Mark again' : 'Mark here'}
                </button>
              </div>
              {o && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-stone-500">Radius</span>
                  {RADII.map((r) => (
                    <button
                      key={r}
                      type="button"
                      aria-pressed={o.radius_m === r}
                      onClick={() => onRadius(s.id, r)}
                      className={`whitespace-nowrap rounded-lg border px-2.5 py-1 text-sm ${
                        o.radius_m === r ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300'
                      }`}
                    >
                      {r} m
                    </button>
                  ))}
                  <button type="button" onClick={() => onReset(s.id)} className="ml-auto text-sm text-stone-500 underline">
                    Reset
                  </button>
                </div>
              )}
              <button type="button" onClick={() => onOff(s.id, true)} className="mt-1 text-sm text-stone-500 underline">
                Leave out of this showcase
              </button>
              {o && (o.accuracy ?? 0) > (o.radius_m ?? 0) && (
                <p className="mt-1 text-xs text-amber-700">
                  The mark was only accurate to ±{Math.round(o.accuracy ?? 0)} m. Try again near a window, or use a
                  bigger radius.
                </p>
              )}
            </li>
          )
        })}
      </ul>
      {leftOut.map((s) => (
        <p key={s.id} className="mt-2 flex items-center justify-between text-sm text-stone-500">
          <span>{s.place}: left out</span>
          <button type="button" onClick={() => onOff(s.id, false)} className="underline">
            Bring back
          </button>
        </p>
      ))}
      {overlaps.map((w) => (
        <p key={w} className="mt-1 text-xs text-amber-700">
          {w} Move them apart or pick a smaller radius.
        </p>
      ))}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  )
}
