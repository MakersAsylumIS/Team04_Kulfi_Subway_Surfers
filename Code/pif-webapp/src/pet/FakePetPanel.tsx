import { useEffect, useState } from 'react'
import type { FakePet, FakePetDisplay } from './fakePet'
import { InputEvent, PlaybackState } from './protocol'

const RING_R = 54
const RING_C = 2 * Math.PI * RING_R

/** What the pet's round display would draw, plus buttons standing in for touching it. */
export function FakePetPanel({ pet }: { pet: FakePet }) {
  const [d, setD] = useState<FakePetDisplay | null>(null)
  useEffect(() => pet.watch(setD), [pet])
  if (!d) return null

  const active = d.state === PlaybackState.playing || d.state === PlaybackState.paused
  const fraction = d.durationS > 0 ? d.positionS / d.durationS : 0

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4" aria-label="Fake pet">
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 128 128" className="h-32 w-32 shrink-0" role="img" aria-label="Pet display">
          <circle cx="64" cy="64" r="62" fill="#1c1917" />
          <circle cx="64" cy="64" r={RING_R} fill="none" stroke="#44403c" strokeWidth="5" />
          {active && (
            <circle
              cx="64"
              cy="64"
              r={RING_R}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - fraction)}
              transform="rotate(-90 64 64)"
            />
          )}
          {active ? (
            <>
              <text x="64" y="58" textAnchor="middle" fill="#fafaf9" fontSize="13" fontWeight="600">
                {d.place.slice(0, 14)}
              </text>
              <text x="64" y="76" textAnchor="middle" fill="#a8a29e" fontSize="9">
                {d.state === PlaybackState.paused ? 'paused' : `${d.positionS}s / ${d.durationS}s`}
              </text>
            </>
          ) : (
            // IDLE: the face.
            <g fill="#fafaf9">
              <ellipse cx="48" cy="60" rx="6" ry="9" />
              <ellipse cx="80" cy="60" rx="6" ry="9" />
              <path d="M50 82 Q64 92 78 82" stroke="#fafaf9" strokeWidth="4" fill="none" strokeLinecap="round" />
            </g>
          )}
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-stone-500">Fake pet</p>
          <p className="truncate text-base">{active ? d.title : 'Idle'}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => pet.input(InputEvent.pat)}
              className="rounded-xl border border-stone-300 py-2 text-sm font-medium active:bg-stone-100"
            >
              Pat
            </button>
            <button
              type="button"
              onClick={() => pet.input(InputEvent.doublePat)}
              className="rounded-xl border border-stone-300 py-2 text-sm font-medium active:bg-stone-100"
            >
              Double-pat
            </button>
          </div>
        </div>
      </div>
      {d.log.length > 0 && (
        <ul className="mt-3 space-y-0.5 font-mono text-xs text-stone-500">
          {d.log.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
