import { useEffect, useRef, useState } from 'react'
import type { FakePet, FakePetDisplay } from './fakePet'
import faces from './faces.json'
import { InputEvent, PlaybackState } from './protocol'

// A pixel-for-pixel stand-in for the pet's 320x240 screen, so faces, arrivals and story
// screens can be checked in the browser before flashing. Mirrors firmware/pet_story_player
// (pet_screen.h for the layout, the mood rules in pet_story_player.ino). Change both together.

const W = 320
const H = 240
const FACE_X = Math.floor((W - faces.width) / 2)
const FACE_Y = 4
const TRACK = '#202020' // the firmware's 0x2104
// The firmware uses Adafruit's FreeSans fonts; Arial is close in a browser.
const FONT = {
  label: 'bold 13px Arial, Helvetica, sans-serif', // FreeSansBold9pt
  place: 'bold 25px Arial, Helvetica, sans-serif', // FreeSansBold18pt
  title: '17px Arial, Helvetica, sans-serif', // FreeSans12pt
  caption: 'bold 17px Arial, Helvetica, sans-serif', // FreeSansBold12pt
  small: '13px Arial, Helvetica, sans-serif', // FreeSans9pt
}
const CYAN = '#00f0d8' // the firmware's 0x079B
const DIM = '#848284' // 0x8410
const BORED_AFTER_MS = 120_000
const SLEEPY_AFTER_MS = 240_000
const SCREEN_OFF_MS = 360_000
const FRAME_MS = 140

type Mood = keyof typeof faces.moods
const MOODS = Object.keys(faces.moods) as Mood[]

function moodNow(d: FakePetDisplay, now: number): Mood | 'off' {
  if (d.reaction && d.reaction.until > now) return d.reaction.mood as Mood
  const playing = d.state === PlaybackState.playing || d.state === PlaybackState.paused
  if (playing) return 'Normal'
  const idle = now - d.lastActivityAt
  if (idle > SCREEN_OFF_MS) return 'off'
  if (idle > SLEEPY_AFTER_MS) return 'Sleepy'
  if (idle > BORED_AFTER_MS) return 'Bored'
  return 'Normal'
}

function drawFace(ctx: CanvasRenderingContext2D, frame: number[]) {
  let i = 0
  ctx.fillStyle = CYAN
  for (let y = 0; y < faces.height; y++) {
    let x = 0
    let lit = false
    while (x < faces.width) {
      const len = frame[i++]
      if (lit && len) ctx.fillRect(FACE_X + x, FACE_Y + y, len, 1)
      x += len
      lit = !lit
    }
  }
}

function fitLine(ctx: CanvasRenderingContext2D, t: string, maxW: number) {
  if (ctx.measureText(t).width <= maxW) return t
  while (t.length > 1 && ctx.measureText(t + '...').width > maxW) t = t.slice(0, -1)
  return t + '...'
}

function centred(ctx: CanvasRenderingContext2D, font: string, t: string, baseline: number, color: string) {
  ctx.font = font
  ctx.fillStyle = color
  ctx.textBaseline = 'alphabetic'
  const line = fitLine(ctx, t, 300)
  ctx.fillText(line, (W - ctx.measureText(line).width) / 2, baseline)
}

// Same word-wrap as the firmware's wrapped(): at most maxLines, the last one cut with "...".
function wrapped(
  ctx: CanvasRenderingContext2D,
  font: string,
  text: string,
  x: number,
  baseline: number,
  maxW: number,
  lineH: number,
  maxLines: number,
  color: string,
) {
  ctx.font = font
  ctx.fillStyle = color
  ctx.textBaseline = 'alphabetic'
  const words = text.split(' ')
  let lines = 0
  while (words.length && lines < maxLines) {
    let line = words.shift()!
    while (words.length && ctx.measureText(line + ' ' + words[0]).width <= maxW) line += ' ' + words.shift()
    if (lines === maxLines - 1 && words.length) line = line + ' ' + words.join(' ')
    ctx.fillText(fitLine(ctx, line, maxW), x, baseline)
    baseline += lineH
    lines++
  }
  return baseline
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export function FakePetPanel({ pet }: { pet: FakePet }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const displayRef = useRef<FakePetDisplay | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [mood, setMood] = useState<string>('Normal')

  useEffect(
    () =>
      pet.watch((d) => {
        displayRef.current = d
        setLog(d.log)
      }),
    [pet],
  )

  // Animation loop: same timing as the firmware (Normal blinks every few seconds, other
  // moods loop their frames, long idle turns the screen off).
  useEffect(() => {
    let raf = 0
    let shownMood: string | null = null
    let frame = 0
    let frameAt = 0
    let blinking = false
    let nextBlink = performance.now() + 2500
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick)
      const d = displayRef.current
      const ctx = canvasRef.current?.getContext('2d')
      if (!d || !ctx) return
      const m = moodNow(d, Date.now())
      if (m !== shownMood) {
        shownMood = m
        frame = 0
        frameAt = t
        blinking = false
        nextBlink = t + 2500
        setMood(m)
      }
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, W, H)
      if (m === 'off') return
      const frames = faces.moods[m]
      if (m === 'Normal') {
        if (!blinking && t >= nextBlink) {
          blinking = true
          frame = 0
          frameAt = t
        }
        if (blinking && t - frameAt >= FRAME_MS) {
          frameAt = t
          if (++frame >= frames.length) {
            frame = 0
            blinking = false
            nextBlink = t + 3000 + Math.random() * 3000
          }
        }
      } else if (t - frameAt >= FRAME_MS * 2) {
        frameAt = t
        frame = (frame + 1) % frames.length
      }
      // status dot: connected (the fake pet always is)
      ctx.fillStyle = CYAN
      ctx.beginPath()
      ctx.arc(308, 10, 4, 0, Math.PI * 2)
      ctx.fill()

      const story = d.state === PlaybackState.playing || d.state === PlaybackState.paused
      if (story) {
        // Story screen: no face.
        const paused = d.state === PlaybackState.paused
        ctx.font = FONT.label
        ctx.fillStyle = paused ? DIM : CYAN
        ctx.fillText(paused ? 'PAUSED' : 'NOW PLAYING', 20, 22)
        const next = wrapped(ctx, FONT.place, d.place, 20, 66, 280, 34, 2, '#fff')
        wrapped(ctx, FONT.title, d.title, 20, next + 4, 280, 24, 3, DIM)
        const w = d.durationS ? Math.min(280, (280 * d.positionS) / d.durationS) : 0
        ctx.fillStyle = TRACK
        ctx.fillRect(20, 196, 280, 6)
        ctx.fillStyle = paused ? DIM : CYAN
        ctx.fillRect(20, 196, w, 6)
        ctx.font = FONT.small
        ctx.fillStyle = DIM
        ctx.fillText(clock(d.positionS), 20, 226)
        const total = clock(d.durationS)
        ctx.fillText(total, 300 - ctx.measureText(total).width, 226)
      } else {
        // Pet screen: the face and a caption.
        drawFace(ctx, frames[frame])
        if (!d.place) centred(ctx, FONT.title, 'Connected', 196, DIM)
        else {
          centred(ctx, FONT.caption, d.place, 190, '#fff')
          const line2 = d.state === PlaybackState.missingFile ? 'Not on the SD card: the phone plays it' : d.title
          if (line2) centred(ctx, FONT.small, line2, 216, DIM)
        }
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4" aria-label="Fake pet">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-stone-500">Pet screen (simulated, 320×240)</p>
        <p className="text-xs text-stone-500">{mood === 'off' ? 'screen off' : mood}</p>
      </div>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="mt-2 w-full rounded-lg bg-black"
        style={{ imageRendering: 'pixelated', aspectRatio: `${W} / ${H}` }}
        aria-label="Simulated pet display"
      />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            pet.react('Heart_Eyes', 2000)
            pet.input(InputEvent.pat)
          }}
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
      <div className="mt-2 flex flex-wrap gap-1.5">
        {MOODS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => pet.react(m, 5000)}
            className="rounded-lg border border-stone-300 px-2 py-1 text-xs text-stone-600 active:bg-stone-100"
          >
            {m.replace('_', ' ')}
          </button>
        ))}
      </div>
      {log.length > 0 && (
        <ul className="mt-3 space-y-0.5 font-mono text-xs text-stone-500">
          {log.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
