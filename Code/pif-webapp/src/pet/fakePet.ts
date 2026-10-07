import type { Story } from '../data/types.ts'
import type { CharName, NotifyName, PetLink } from './link.ts'
import { InputEvent, PlaybackState, Transport, type InputEventValue, type PlaybackStateValue } from './protocol.ts'

// A pet that lives in the browser. It decodes the same bytes the real firmware will
// receive and answers with the same notifications, so the app can be built and
// demonstrated with no hardware. Its "dial" is drawn by FakePetPanel.

export interface FakePetDisplay {
  place: string
  title: string
  iconId: number
  state: PlaybackStateValue
  positionS: number
  durationS: number
  lastHaptic: number | null
  log: string[]
  /** Same mood inputs as the firmware: when something last happened, and a short reaction. */
  lastActivityAt: number
  reaction: { mood: string; until: number } | null
}

const decoder = new TextDecoder()

export class FakePet implements PetLink {
  readonly name = 'Fake pet'
  readonly fake = true
  private readonly durations: Map<string, number>
  private readonly notify = new Map<NotifyName, (view: DataView) => void>()
  private readonly listeners = new Set<(d: FakePetDisplay) => void>()
  private disconnectHandlers: (() => void)[] = []
  private timer: ReturnType<typeof setInterval> | null = null
  private display: FakePetDisplay = {
    place: '',
    title: '',
    iconId: 0,
    state: PlaybackState.idle,
    positionS: 0,
    durationS: 0,
    lastHaptic: null,
    log: [],
    lastActivityAt: Date.now(),
    reaction: null,
  }

  constructor(stories: readonly Story[]) {
    // The fake "SD card" holds every bundled story.
    this.durations = new Map(stories.map((s) => [s.id, s.duration_s]))
  }

  async write(char: CharName, bytes: Uint8Array) {
    this.set({ lastActivityAt: Date.now() })
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    if (char === 'play') {
      const offset = view.getUint16(0, true)
      const id = decoder.decode(bytes.subarray(2))
      const duration = this.durations.get(id)
      this.logLine(`play ${id} from ${offset}s`)
      this.stopTimer()
      if (duration === undefined) {
        this.set({ state: PlaybackState.missingFile, positionS: 0, durationS: 0 })
        this.react('Sad', 2500)
      } else {
        this.set({ state: PlaybackState.playing, positionS: offset, durationS: duration })
        this.startTimer()
      }
      this.report()
    } else if (char === 'transport') {
      const [cmd, arg] = bytes
      this.logLine(`transport ${cmd} ${arg}`)
      if (cmd === Transport.pause && this.display.state === PlaybackState.playing) {
        this.stopTimer()
        this.set({ state: PlaybackState.paused })
        this.report()
      } else if (cmd === Transport.resume && this.display.state === PlaybackState.paused) {
        this.set({ state: PlaybackState.playing })
        this.startTimer()
        this.report()
      } else if (cmd === Transport.stop) {
        this.stopTimer()
        this.set({ state: PlaybackState.idle, positionS: 0, place: '', title: '' })
        this.report()
      }
    } else if (char === 'nowShowing') {
      const [place = '', title = ''] = decoder.decode(bytes.subarray(1)).split('\n')
      this.logLine(`now_showing ${place}`)
      this.set({ iconId: bytes[0], place, title })
    } else if (char === 'haptic') {
      this.logLine(`haptic ${bytes[0]}`)
      this.set({ lastHaptic: bytes[0] })
      // No motor yet: like the firmware, the face reacts to the arrival buzz instead.
      this.react('Heart_Eyes', 3000)
    }
  }

  subscribe(char: NotifyName, onValue: (view: DataView) => void) {
    this.notify.set(char, onValue)
  }

  onDisconnect(handler: () => void) {
    this.disconnectHandlers.push(handler)
  }

  disconnect() {
    this.stopTimer()
    const handlers = this.disconnectHandlers
    this.disconnectHandlers = []
    handlers.forEach((h) => h())
  }

  /** Simulate touching the pet. */
  input(event: InputEventValue) {
    this.logLine(`input ${Object.keys(InputEvent).find((k) => InputEvent[k as keyof typeof InputEvent] === event)}`)
    this.notify.get('input')?.(new DataView(Uint8Array.of(event, 0).buffer))
  }

  /** Show a mood for a moment (the firmware's react()). */
  react(mood: string, ms: number) {
    this.set({ reaction: { mood, until: Date.now() + ms }, lastActivityAt: Date.now() })
  }

  watch(listener: (d: FakePetDisplay) => void): () => void {
    this.listeners.add(listener)
    listener(this.display)
    return () => this.listeners.delete(listener)
  }

  private startTimer() {
    this.timer = setInterval(() => {
      const positionS = this.display.positionS + 1
      if (positionS >= this.display.durationS) {
        this.stopTimer()
        this.set({ state: PlaybackState.idle, positionS: this.display.durationS })
      } else {
        this.set({ positionS })
      }
      this.report()
    }, 1000)
  }

  private stopTimer() {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
  }

  private report() {
    const bytes = new Uint8Array(3)
    const view = new DataView(bytes.buffer)
    view.setUint8(0, this.display.state)
    view.setUint16(1, this.display.positionS, true)
    this.notify.get('playback')?.(view)
  }

  private logLine(line: string) {
    this.set({ log: [line, ...this.display.log].slice(0, 6) })
  }

  private set(patch: Partial<FakePetDisplay>) {
    this.display = { ...this.display, ...patch }
    this.listeners.forEach((l) => l(this.display))
  }
}
