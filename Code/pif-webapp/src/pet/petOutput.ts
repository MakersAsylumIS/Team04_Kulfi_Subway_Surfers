import type { PlaybackPosition, StoryOutput } from '../audio/player.ts'
import type { Story } from '../data/types.ts'
import type { PetLink } from './link.ts'
import {
  decodeInput,
  decodePlayback,
  encodeHaptic,
  encodeNowShowing,
  encodePlay,
  encodeTransport,
  Haptic,
  PlaybackState,
  Transport,
  type InputEventValue,
  type PlaybackStateValue,
} from './protocol.ts'

/**
 * Plays stories on the pet: sends the id, never the audio. The phone stays silent
 * unless the pet is missing the file, a write fails, or the pet disconnects
 * mid-story; then the phone picks the story up from where the pet was.
 */
export class PetOutput implements StoryOutput {
  private readonly link: PetLink
  private readonly phone: StoryOutput
  private mode: 'idle' | 'pet' | 'phone' = 'idle'
  private story: Story | null = null
  private onEnd: (() => void) | null = null
  private state: PlaybackStateValue = PlaybackState.idle
  private positionS = 0
  private connected = true
  /** The pet has reported this story playing; until then, stale idle reports are ignored. */
  private confirmed = false
  /** Set by the journey: what a pat or double-pat on the pet should do. */
  onInput: ((event: InputEventValue) => void) | null = null

  constructor(link: PetLink, phone: StoryOutput) {
    this.link = link
    this.phone = phone
    link.subscribe('playback', (view) => {
      const report = decodePlayback(view)
      if (report) this.handlePlayback(report.state, report.positionS)
    })
    link.subscribe('input', (view) => {
      const event = decodeInput(view)
      if (event !== null) this.onInput?.(event)
    })
    link.onDisconnect(() => {
      this.connected = false
      if (this.mode === 'pet' && this.state !== PlaybackState.idle) this.fallBackToPhone(this.positionS)
    })
  }

  play(story: Story, onEnd: () => void) {
    // A new play replaces whatever the pet is playing; no separate stop needed.
    if (this.mode === 'phone') this.phone.stop()
    this.confirmed = false
    this.story = story
    this.onEnd = onEnd
    this.state = PlaybackState.playing
    this.positionS = 0
    if (!this.connected) return this.fallBackToPhone(0)
    this.mode = 'pet'
    const send = async () => {
      await this.link.write('nowShowing', encodeNowShowing(story.icon_id, story.place, story.title))
      await this.link.write('haptic', encodeHaptic(Haptic.short))
      await this.link.write('play', encodePlay(story.id))
    }
    send().catch(() => {
      if (this.story === story && this.mode === 'pet') this.fallBackToPhone(0)
    })
  }

  pause() {
    if (this.mode === 'phone') return this.phone.pause()
    if (this.mode === 'pet') {
      this.state = PlaybackState.paused
      void this.link.write('transport', encodeTransport(Transport.pause)).catch(() => {})
    }
  }

  resume() {
    if (this.mode === 'phone') return this.phone.resume()
    if (this.mode === 'pet') {
      this.state = PlaybackState.playing
      void this.link.write('transport', encodeTransport(Transport.resume)).catch(() => {})
    }
  }

  stop() {
    if (this.mode === 'phone') this.phone.stop()
    if (this.mode === 'pet' && this.connected) {
      void this.link.write('transport', encodeTransport(Transport.stop)).catch(() => {})
    }
    this.mode = 'idle'
    this.story = null
    this.onEnd = null
  }

  position(): PlaybackPosition {
    if (this.mode === 'phone') return this.phone.position()
    return {
      currentS: this.positionS,
      durationS: this.story?.duration_s ?? 0,
      paused: this.state === PlaybackState.paused,
      hasAudio: true,
      onPet: true,
    }
  }

  private handlePlayback(state: PlaybackStateValue, positionS: number) {
    if (this.mode !== 'pet') return
    if (state === PlaybackState.missingFile) return this.fallBackToPhone(0)
    if (state === PlaybackState.idle && !this.confirmed) return
    if (state !== PlaybackState.idle) this.confirmed = true
    this.state = state
    this.positionS = positionS
    if (state === PlaybackState.idle) this.finish()
  }

  private fallBackToPhone(offsetS: number) {
    const story = this.story
    if (!story || !this.onEnd) return
    this.mode = 'phone'
    this.phone.play(story, () => this.finish(), offsetS)
  }

  private finish() {
    const done = this.onEnd
    this.mode = 'idle'
    this.story = null
    this.onEnd = null
    this.state = PlaybackState.idle
    done?.()
  }
}
