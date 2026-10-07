// Sound for lab clips: decoded by the browser from any audio or video file it can play,
// trimmed, mixed down to mono and resampled to the rate the pet will play, as 16-bit PCM.
// The preview plays exactly those samples, so what you hear here is what the pet gets.

export interface Sound {
  name: string
  buffer: AudioBuffer // as decoded, full length
}

let ctx: AudioContext | null = null
export function audioContext() {
  ctx ??= new AudioContext()
  return ctx
}

export async function decodeSound(name: string, data: ArrayBuffer): Promise<Sound> {
  try {
    return { name, buffer: await audioContext().decodeAudioData(data) }
  } catch {
    throw new Error(`No sound found in ${name}`)
  }
}

/** Trimmed [fromS, toS), mono, at `rate`, as 16-bit samples (what the pet stores). */
export async function prepareSound(sound: Sound, fromS: number, toS: number, rate: number): Promise<Int16Array> {
  const src = sound.buffer
  const from = Math.max(0, Math.min(fromS, src.duration))
  const to = Math.max(from, Math.min(toS, src.duration))
  const frames = Math.max(1, Math.round((to - from) * rate))
  const off = new OfflineAudioContext(1, frames, rate)
  const node = off.createBufferSource()
  node.buffer = src
  node.connect(off.destination) // the mixdown to one channel happens here
  node.start(0, from, to - from)
  const rendered = await off.startRendering()
  const f = rendered.getChannelData(0)
  const out = new Int16Array(f.length)
  for (let i = 0; i < f.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(f[i] * 32767)))
  return out
}

/** The prepared samples as something the browser can play (for the preview). */
export function toBuffer(pcm: Int16Array, rate: number) {
  const b = audioContext().createBuffer(1, Math.max(1, pcm.length), rate)
  const ch = b.getChannelData(0)
  for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768
  return b
}
