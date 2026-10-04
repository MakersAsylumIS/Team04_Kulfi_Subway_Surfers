// The pet's Bluetooth LE contract, as bytes. Pure functions, no browser APIs, so the
// firmware, this web app and any native app can share one definition.
// Human-readable version: docs/PET-PROTOCOL.md. Change both together.

const uuid = (n: number) => `f404${n.toString(16).padStart(4, '0')}-a91e-4923-a44e-340a15cd58e5`

export const PET_SERVICE = uuid(0x0001)
export const PET_CHAR = {
  play: uuid(0x0002),
  transport: uuid(0x0003),
  nowShowing: uuid(0x0004),
  playback: uuid(0x0005),
  haptic: uuid(0x0006),
  input: uuid(0x0007),
  peerSeen: uuid(0x0008),
} as const

/** The pet plays /stories/<id>.wav, so ids must fit a FAT long file name. */
export const MAX_ID_BYTES = 32
export const MAX_NOW_SHOWING_BYTES = 80

export const Transport = { resume: 0, pause: 1, stop: 2, volume: 3, output: 4 } as const
export type TransportCommand = (typeof Transport)[keyof typeof Transport]
export const Output = { jack: 0, speaker: 1 } as const

export const PlaybackState = { idle: 0, playing: 1, paused: 2, missingFile: 3 } as const
export type PlaybackStateValue = (typeof PlaybackState)[keyof typeof PlaybackState]

export const InputEvent = { pat: 1, doublePat: 2, shake: 3, holdStart: 4, holdEnd: 5 } as const
export type InputEventValue = (typeof InputEvent)[keyof typeof InputEvent]

export const Haptic = { short: 0, double: 1, long: 2 } as const

const utf8 = new TextEncoder()

/** play: u16 LE start offset in seconds, then the story id as UTF-8 (1 to 32 bytes). */
export function encodePlay(storyId: string, offsetS = 0): Uint8Array {
  const id = utf8.encode(storyId)
  if (id.length === 0 || id.length > MAX_ID_BYTES) {
    throw new Error(`Story id must be 1 to ${MAX_ID_BYTES} bytes for the pet: ${storyId}`)
  }
  const out = new Uint8Array(2 + id.length)
  new DataView(out.buffer).setUint16(0, Math.max(0, Math.min(0xffff, Math.round(offsetS))), true)
  out.set(id, 2)
  return out
}

/** transport: command byte, argument byte (volume 0 to 100, or an Output). */
export function encodeTransport(command: TransportCommand, arg = 0): Uint8Array {
  return Uint8Array.of(command, arg & 0xff)
}

/** now_showing: u8 icon_id, then "place\ntitle" as UTF-8, cut to 80 bytes total on a character boundary. */
export function encodeNowShowing(iconId: number, place: string, title: string): Uint8Array {
  const text = utf8.encode(`${place}\n${title}`)
  let len = Math.min(text.length, MAX_NOW_SHOWING_BYTES - 1)
  // Don't split a multi-byte character: back off past UTF-8 continuation bytes.
  while (len < text.length && len > 0 && (text[len] & 0xc0) === 0x80) len--
  const out = new Uint8Array(1 + len)
  out[0] = iconId & 0xff
  out.set(text.subarray(0, len), 1)
  return out
}

export function encodeHaptic(pattern: number): Uint8Array {
  return Uint8Array.of(pattern & 0xff)
}

export interface PlaybackReport {
  state: PlaybackStateValue
  positionS: number
}

/** playback notify: u8 state, u16 LE position in seconds. */
export function decodePlayback(view: DataView): PlaybackReport | null {
  if (view.byteLength < 3) return null
  const state = view.getUint8(0)
  if (state > 3) return null
  return { state: state as PlaybackStateValue, positionS: view.getUint16(1, true) }
}

/** input notify: u8 event, u8 reserved. */
export function decodeInput(view: DataView): InputEventValue | null {
  if (view.byteLength < 1) return null
  const event = view.getUint8(0)
  return event >= 1 && event <= 5 ? (event as InputEventValue) : null
}
