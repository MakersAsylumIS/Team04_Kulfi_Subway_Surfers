// The lab's USB link to the real pet (Chrome's Web Serial). Two ways to show things:
//   live frames ("PIFL"): the lab's screen mirrored as you work; only changed row pieces go,
//     run-length coded when smaller, each waiting for the pet's "LABOK". Fine for stills.
//   clips ("PIFC", src/lab/clip.ts): an animation and its sound sent once, then played by
//     the pet itself at full speed.
// Plus text commands for settings ("lab fps 12", "lab spi 40000000", "lab baud 2000000" …).
// Pet side: pet_screen.h ("Lab mode") and pet_lab.h.

interface SerialPortLike {
  open(o: { baudRate: number; bufferSize?: number }): Promise<void>
  close(): Promise<void>
  setSignals?(s: { dataTerminalReady?: boolean; requestToSend?: boolean }): Promise<void>
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
}
interface SerialLike {
  requestPort(): Promise<SerialPortLike>
}

export const DEFAULT_BAUD = 921600
export const hasSerial = () => 'serial' in navigator

export interface PetInfo {
  psramFree: number
  baud: number
}

export class PetSerial {
  private port: SerialPortLike | null = null
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private reading: Promise<void> | null = null
  private last: Uint16Array | null = null
  private lastRotation = -1
  private waiters: ((line: string) => boolean)[] = []
  private chain: Promise<unknown> = Promise.resolve() // one write at a time, never interleaved
  baud = DEFAULT_BAUD
  /** What came in since the port opened, to tell "wrong port" from "wrong speed" from "old firmware". */
  bytesIn = 0
  printableIn = 0
  lastText = ''
  info: PetInfo | null = null
  onLine: (line: string) => void = () => {}

  get connected() {
    return !!this.writer
  }

  private async openAt(baud: number) {
    await this.port!.open({ baudRate: baud, bufferSize: 16384 })
    this.baud = baud
    this.bytesIn = 0
    this.printableIn = 0
    this.lastText = ''
    this.writer = this.port!.writable!.getWriter()
    this.reading = this.readLoop()
  }

  private async closeStreams() {
    try {
      await this.reader?.cancel()
    } catch {
      // gone already
    }
    await this.reading?.catch(() => {})
    this.reader?.releaseLock()
    this.writer?.releaseLock()
    this.reader = null
    this.writer = null
    await this.port?.close().catch(() => {})
  }

  /**
   * Must run from a click (Chrome asks which port). Gets the pet answering the lab, trying the
   * gentlest thing first: boards differ in how the USB chip's DTR/RTS lines reach the ESP32's
   * reset and boot pins, so no single restart works on all of them. Throws a message that says
   * what to fix.
   */
  async connect(onStep: (text: string) => void = () => {}) {
    const serial = (navigator as Navigator & { serial: SerialLike }).serial
    this.port = await serial.requestPort()
    try {
      await this.openAt(DEFAULT_BAUD)
    } catch {
      this.port = null
      throw new Error('That port is busy: close the Arduino Serial Monitor (or anything else using it) and try again.')
    }
    const signals = (dataTerminalReady: boolean, requestToSend: boolean) =>
      this.port?.setSignals?.({ dataTerminalReady, requestToSend }).catch(() => {})
    const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

    // 1. It may simply be running already.
    onStep('Asking the pet…')
    if (await this.tryHello(3, 800)) return

    // 2. Restart it the way the Arduino IDE does: RTS pulls EN (reset) low, then both lines off.
    onStep('Restarting the pet…')
    await signals(false, true)
    await pause(150)
    await signals(false, false)
    onStep('Waiting for the pet to start…')
    await this.waitFor((l) => l.startsWith('Ready'), 7000).catch(() => {})
    if (await this.tryHello(3, 1000)) return

    // 3. On some boards both lines need to be on for the chip to run.
    onStep('Trying the other line setting…')
    await signals(true, true)
    await this.waitFor((l) => l.startsWith('Ready'), 5000).catch(() => {})
    if (await this.tryHello(2, 1000)) return

    // 4. Ask for a hand: a press of RST restarts it whatever the lines are doing.
    onStep('Press the RST button on the pet now…')
    await this.waitFor((l) => l.startsWith('Ready'), 15000).catch(() => {})
    if (await this.tryHello(3, 1000)) return

    throw new Error(this.diagnose())
  }

  private async tryHello(times: number, ms: number) {
    for (let i = 0; i < times; i++) {
      try {
        await this.hello(ms)
        this.last = null
        return true
      } catch (e) {
        if ((e as Error).message.includes('OLED')) throw e
      }
    }
    return false
  }

  /** Why the pet didn't answer, judged from what (if anything) came in on the port. */
  private diagnose() {
    const heard = this.lastText ? ` Last thing it said: "${this.lastText.slice(0, 80)}".` : ''
    if (this.bytesIn === 0)
      return "Nothing at all came from that port. Pick the board's USB port in Chrome's list (the same COM port the Arduino IDE uploads to, usually named CH340, CP210x or USB Serial), not a Bluetooth one."
    if (!this.lastText)
      return `Only unreadable bytes came from the pet (${this.bytesIn}): that's its startup chatter, but it never got as far as running. Unplug the pet's USB, plug it back in, and connect again.`
    return `The pet is talking but didn't answer the lab.${heard} If that isn't from pet_story_player, upload it again.`
  }

  /** Asks the pet who it is; also confirms a new baud rate on the pet's side. */
  async hello(ms = 2500): Promise<PetInfo> {
    const reply = this.waitFor((l) => l.startsWith('LABHELLO'), ms)
    await this.text('\nlab hello')
    const line = await reply
    if (line.includes('oled')) throw new Error('This pet is built for the OLED; the lab needs the colour TFT build.')
    this.info = {
      psramFree: Number(line.match(/psram=(\d+)/)?.[1] ?? 0),
      baud: Number(line.match(/baud=(\d+)/)?.[1] ?? this.baud),
    }
    return this.info
  }

  private async readLoop() {
    const port = this.port
    if (!port?.readable) return
    this.reader = port.readable.getReader()
    const dec = new TextDecoder()
    let buf = ''
    try {
      for (;;) {
        const { value, done } = await this.reader.read()
        if (done) break
        this.bytesIn += value.length
        for (const b of value) if (b === 10 || b === 13 || (b >= 32 && b < 127)) this.printableIn++
        buf += dec.decode(value, { stream: true })
        let nl
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).replace(/\r$/, '')
          buf = buf.slice(nl + 1)
          if (/^[\x20-\x7e]{4,}$/.test(line)) this.lastText = line
          this.onLine(line)
          this.waiters = this.waiters.filter((w) => !w(line))
        }
      }
    } catch {
      // port closed or unplugged
    }
  }

  waitFor(match: (line: string) => boolean, ms: number) {
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter)
        reject(new Error('The pet stopped answering'))
      }, ms)
      const waiter = (line: string) => {
        if (!match(line)) return false
        clearTimeout(timer)
        resolve(line)
        return true
      }
      this.waiters.push(waiter)
    })
  }

  private write(bytes: Uint8Array) {
    const job = this.chain.then(async () => {
      if (!this.writer) throw new Error('Not connected')
      await this.writer.write(bytes)
    })
    this.chain = job.catch(() => {})
    return job
  }

  /** A text command, e.g. "lab fps 12". */
  text(line: string) {
    return this.write(new TextEncoder().encode(`${line}\n`))
  }

  /**
   * Moves the link to a faster baud rate. If the pet doesn't answer at the new rate, goes back
   * to the old one (the pet also goes back by itself after 3 s).
   */
  async setBaud(baud: number) {
    const old = this.baud
    if (baud === old) return
    const ack = this.waitFor((l) => l.startsWith('LABBAUD'), 2000)
    await this.text(`lab baud ${baud}`)
    await ack
    await this.closeStreams()
    await this.openAt(baud)
    try {
      await this.hello(2000)
    } catch {
      await this.closeStreams()
      await new Promise((r) => setTimeout(r, 3200)) // the pet goes back to the old rate
      await this.openAt(old)
      await this.hello().catch(() => {})
      throw new Error(`The link couldn't run at ${baud.toLocaleString()} baud; back to ${old.toLocaleString()}.`)
    }
    this.last = null
  }

  /**
   * Sends one screen: `pixels` is RGB565, row by row, at the given panel rotation
   * (2 = portrait, 3 = landscape, as the pet's setRotation()). Resolves when it's drawn.
   */
  async send(pixels: Uint16Array, W: number, H: number, rotation: number) {
    const full = rotation !== this.lastRotation || !this.last || this.last.length !== pixels.length
    const parts: number[] = []
    let spans = 0
    for (let y = 0; y < H; y++) {
      const row = y * W
      let x0 = 0
      let x1 = W - 1
      if (!full) {
        while (x0 < W && pixels[row + x0] === this.last![row + x0]) x0++
        if (x0 === W) continue
        while (x1 > x0 && pixels[row + x1] === this.last![row + x1]) x1--
      }
      const w = x1 - x0 + 1
      const rle: number[] = []
      for (let x = x0; x <= x1; ) {
        const c = pixels[row + x]
        let n = 1
        while (n < 255 && x + n <= x1 && pixels[row + x + n] === c) n++
        rle.push(n, c & 0xff, c >> 8)
        x += n
      }
      const useRle = rle.length < w * 2
      const len = useRle ? rle.length : w * 2
      parts.push(x0 & 0xff, x0 >> 8, y & 0xff, y >> 8, w & 0xff, w >> 8, useRle ? 1 : 0, len & 0xff, len >> 8)
      if (useRle) parts.push(...rle)
      else for (let x = x0; x <= x1; x++) parts.push(pixels[row + x] & 0xff, pixels[row + x] >> 8)
      spans++
    }
    const head = [0x50, 0x49, 0x46, 0x4c, rotation & 3, full ? 1 : 0, spans & 0xff, spans >> 8] // "PIFL"
    const ok = this.waitFor((l) => l === 'LABOK' || l.startsWith('LABERR'), 8000)
    await this.write(new Uint8Array([...head, ...parts]))
    const reply = await ok
    if (reply !== 'LABOK') {
      this.last = null // send everything next time
      throw new Error(`The pet said: ${reply}`)
    }
    this.last = pixels.slice()
    this.lastRotation = rotation
    return parts.length + head.length
  }

  /** Sends a whole clip (clip.ts) in pieces, reporting progress; resolves when the pet plays it. */
  async sendClip(bytes: Uint8Array, onProgress: (sent: number) => void) {
    const seconds = (bytes.length * 10) / this.baud
    const done = this.waitFor((l) => l.startsWith('LABCLIP') || l.startsWith('LABERR'), seconds * 1000 * 2 + 10000)
    done.catch(() => {})
    const CHUNK = 16384
    for (let i = 0; i < bytes.length; i += CHUNK) {
      await this.write(bytes.subarray(i, i + CHUNK))
      onProgress(Math.min(bytes.length, i + CHUNK))
    }
    const reply = await done
    if (!reply.startsWith('LABCLIP')) throw new Error(`The pet said: ${reply}`)
    this.last = null // the clip changed the screen under the live mirror
    this.lastRotation = -1
    return reply
  }

  /** What's in the SD card's /media folder, and the pet's free PSRAM. */
  async listMedia() {
    const files: { name: string; size: number }[] = []
    const end = this.waitFor((l) => {
      const m = l.match(/^MEDIA (\S+) (\d+)$/)
      if (m) files.push({ name: m[1], size: Number(m[2]) })
      return l.startsWith('MEDIAEND')
    }, 6000)
    await this.text('media ls')
    const last = await end
    return { files, psramFree: Number(last.match(/psram=(\d+)/)?.[1] ?? 0) }
  }

  /** Saves a file into the SD card's /media folder ("PIFF"), reporting progress. */
  async sendFile(name: string, bytes: Uint8Array, onProgress: (sent: number) => void) {
    const nameBytes = new TextEncoder().encode(name)
    const head = new Uint8Array(4 + 1 + nameBytes.length + 4)
    head.set([0x50, 0x49, 0x46, 0x46, nameBytes.length]) // "PIFF"
    head.set(nameBytes, 5)
    new DataView(head.buffer).setUint32(5 + nameBytes.length, bytes.length, true)
    const seconds = (bytes.length * 10) / this.baud
    const done = this.waitFor((l) => l.startsWith('MEDIAOK saved') || l.startsWith('MEDIAERR'), seconds * 2000 + 10000)
    done.catch(() => {})
    await this.write(head)
    const CHUNK = 16384
    for (let i = 0; i < bytes.length; i += CHUNK) {
      await this.write(bytes.subarray(i, i + CHUNK))
      onProgress(Math.min(bytes.length, i + CHUNK))
    }
    const reply = await done
    if (reply.startsWith('MEDIAERR')) throw new Error(reply.slice(9))
  }

  async disconnect() {
    try {
      await this.text('lab off')
    } catch {
      // already gone
    }
    await this.closeStreams()
    this.port = null
    this.last = null
    this.lastRotation = -1
    this.info = null
  }
}

/** The screen canvas as RGB565, the way the panel stores it. */
export function toRgb565(ctx: CanvasRenderingContext2D) {
  const { width: W, height: H } = ctx.canvas
  const d = ctx.getImageData(0, 0, W, H).data
  const out = new Uint16Array(W * H)
  for (let i = 0; i < W * H; i++) out[i] = ((d[i * 4] & 0xf8) << 8) | ((d[i * 4 + 1] & 0xfc) << 3) | (d[i * 4 + 2] >> 3)
  return out
}

/**
 * Keeps the pet showing the lab's latest screen: if a frame is still going out when the next
 * one is drawn, only the newest is sent after it (no queue building up behind a slow link).
 * Held while the pet plays a clip, so the mirror doesn't interrupt it.
 */
export class LiveSender {
  readonly pet = new PetSerial()
  private busy = false
  private held = false
  private next: { pixels: Uint16Array; W: number; H: number; rotation: number } | null = null
  private onStatus: (text: string) => void = () => {}

  /** Where the pet's own messages and the link's status go. */
  listen(onLine: (line: string) => void, onStatus: (text: string) => void) {
    this.pet.onLine = onLine
    this.onStatus = onStatus
  }

  hold(on: boolean) {
    this.held = on
  }

  push(ctx: CanvasRenderingContext2D, rotation: number) {
    if (!this.pet.connected || this.held) return
    this.next = { pixels: toRgb565(ctx), W: ctx.canvas.width, H: ctx.canvas.height, rotation }
    if (!this.busy) void this.run()
  }

  /** Keeps lab mode on while nothing changes. */
  keepAlive() {
    if (this.pet.connected) void this.pet.text('lab ping').catch(() => {})
  }

  private async run() {
    this.busy = true
    while (this.next && !this.held) {
      const f = this.next
      this.next = null
      const t0 = performance.now()
      try {
        const bytes = await this.pet.send(f.pixels, f.W, f.H, f.rotation)
        this.onStatus(`Live: last change ${(bytes / 1000).toFixed(1)} KB in ${Math.round(performance.now() - t0)} ms`)
      } catch (e) {
        this.onStatus((e as Error).message)
      }
    }
    this.busy = false
  }
}
