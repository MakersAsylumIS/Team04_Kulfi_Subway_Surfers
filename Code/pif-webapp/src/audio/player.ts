// One HTMLAudioElement for the whole session. Browsers block audio until the user
// has interacted, so unlock() must run inside the Start journey tap (AGENTS.md).
// If a story's file is missing or won't play, the same controls drive a silent
// timer of duration_s instead, so the journey never stalls.

import type { Story } from '../data/types.ts'

/** Where a story's sound comes out: the phone (StoryPlayer) or the pet (PetOutput). */
export interface StoryOutput {
  play(story: Story, onEnd: () => void, offsetS?: number): void
  pause(): void
  resume(): void
  stop(): void
  position(): PlaybackPosition
}

export interface PlaybackPosition {
  currentS: number
  durationS: number
  paused: boolean
  /** False when the file was missing and the story is showing as text only. */
  hasAudio: boolean
  /** True while the pet is playing the story from its own SD card. */
  onPet: boolean
}

export class StoryPlayer implements StoryOutput {
  private readonly audio = new Audio()
  private mode: 'idle' | 'audio' | 'timer' = 'idle'
  private onEnd: (() => void) | null = null
  private fallbackS = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private timerStartedAt = 0
  private timerElapsedMs = 0
  private timerPaused = false
  /** Bumped on every play/stop so late events from an old story are ignored. */
  private generation = 0

  constructor() {
    this.audio.preload = 'auto'
    this.audio.addEventListener('ended', () => {
      if (this.mode === 'audio') this.finish()
    })
  }

  /** Call synchronously inside a user gesture. Plays a moment of silence to prime the element. */
  unlock() {
    const gen = this.generation
    this.audio.src = SILENT_WAV
    this.audio.play().then(
      // A story may already have started (e.g. starting inside a story's radius).
      () => {
        if (gen === this.generation) this.audio.pause()
      },
      () => {},
    )
  }

  play(story: Story, onEnd: () => void, offsetS = 0) {
    this.stop()
    const gen = ++this.generation
    this.onEnd = onEnd
    this.fallbackS = story.duration_s
    this.mode = 'audio'
    setMediaSession(story)

    const fallBack = () => {
      if (gen === this.generation && this.mode === 'audio') this.startTimer(offsetS)
    }
    this.audio.onerror = fallBack
    this.audio.src = `${import.meta.env.BASE_URL}audio/${story.audio}`
    if (offsetS > 0) {
      const seek = () => {
        if (gen === this.generation) this.audio.currentTime = offsetS
      }
      this.audio.addEventListener('loadedmetadata', seek, { once: true })
    }
    this.audio.play().catch(fallBack)
  }

  pause() {
    if (this.mode === 'audio') this.audio.pause()
    if (this.mode === 'timer' && !this.timerPaused) {
      this.timerElapsedMs += Date.now() - this.timerStartedAt
      this.timerPaused = true
      this.clearTimer()
    }
  }

  resume() {
    if (this.mode === 'audio') void this.audio.play().catch(() => {})
    if (this.mode === 'timer' && this.timerPaused) {
      this.timerPaused = false
      this.armTimer()
    }
  }

  stop() {
    this.generation++
    this.clearTimer()
    this.audio.onerror = null
    this.audio.pause()
    this.audio.removeAttribute('src')
    this.audio.load()
    this.mode = 'idle'
    this.onEnd = null
  }

  position(): PlaybackPosition {
    if (this.mode === 'timer') {
      const ms = this.timerElapsedMs + (this.timerPaused ? 0 : Date.now() - this.timerStartedAt)
      return {
        currentS: Math.min(this.fallbackS, ms / 1000),
        durationS: this.fallbackS,
        paused: this.timerPaused,
        hasAudio: false,
        onPet: false,
      }
    }
    const d = this.audio.duration
    return {
      currentS: this.audio.currentTime,
      durationS: Number.isFinite(d) && d > 0 ? d : this.fallbackS,
      paused: this.audio.paused,
      hasAudio: true,
      onPet: false,
    }
  }

  private startTimer(offsetS = 0) {
    this.audio.onerror = null
    this.mode = 'timer'
    this.timerElapsedMs = offsetS * 1000
    this.timerPaused = false
    this.armTimer()
  }

  private armTimer() {
    this.timerStartedAt = Date.now()
    const remaining = Math.max(0, this.fallbackS * 1000 - this.timerElapsedMs)
    this.timer = setTimeout(() => this.finish(), remaining)
  }

  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
  }

  private finish() {
    const done = this.onEnd
    this.clearTimer()
    this.mode = 'idle'
    this.onEnd = null
    done?.()
  }
}

function setMediaSession(meta: Pick<Story, 'title' | 'place'>) {
  if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return
  navigator.mediaSession.metadata = new MediaMetadata({
    title: meta.title,
    artist: meta.place,
    album: 'Jam',
  })
}

/** 0.1 s of 8 kHz mono 8-bit silence. */
const SILENT_WAV = (() => {
  const samples = 800
  const bytes = new Uint8Array(44 + samples)
  const view = new DataView(bytes.buffer)
  const text = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples, true)
  text(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, 8000, true)
  view.setUint32(28, 8000, true)
  view.setUint16(32, 1, true)
  view.setUint16(34, 8, true)
  text(36, 'data')
  view.setUint32(40, samples, true)
  bytes.fill(128, 44) // 8-bit silence is the midpoint
  return 'data:audio/wav;base64,' + btoa(String.fromCharCode(...bytes))
})()
