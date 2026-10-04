import { haversineM } from '../trigger/trigger.ts'
import type { Route, RoutePoint } from './routes.ts'
import type { Fix, PositionSource } from './types.ts'

const TICK_MS = 500

export interface SimulateOptions {
  /** Metres per second. Can be changed mid-ride with setSpeed. */
  speed: number
  /** Add GPS-like jitter and the occasional wild fix, to exercise the two-fix rule. */
  noise: boolean
  onProgress?: (progress: SimProgress) => void
  onEnd?: () => void
}

export interface SimProgress {
  /** 0 to 1 along the route. */
  fraction: number
  /** The last named point passed (a station, a junction). */
  lastPoint: string
  nextPoint: string | null
}

/** Moves along a route's points at any pace (walk, bus, train), emitting fixes like a phone's GPS would. */
export class SimulatedSource implements PositionSource {
  private readonly legs: number[]
  private readonly totalM: number
  private travelledM = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly route: Route
  private options: SimulateOptions

  constructor(route: Route, options: SimulateOptions) {
    this.route = route
    this.options = options
    this.legs = route.points.slice(1).map((p, i) => {
      const prev = route.points[i]
      return haversineM(prev.lat, prev.lng, p.lat, p.lng)
    })
    this.totalM = this.legs.reduce((a, b) => a + b, 0)
  }

  setSpeed(speed: number) {
    this.options = { ...this.options, speed }
  }

  setNoise(noise: boolean) {
    this.options = { ...this.options, noise }
  }

  start(onFix: (fix: Fix) => void) {
    this.stop()
    this.travelledM = 0
    const tick = () => {
      onFix(this.fixAt(this.travelledM))
      this.options.onProgress?.(this.progressAt(this.travelledM))
      if (this.travelledM >= this.totalM) {
        this.stop()
        this.options.onEnd?.()
        return
      }
      this.travelledM = Math.min(
        this.totalM,
        this.travelledM + this.options.speed * (TICK_MS / 1000),
      )
    }
    tick()
    this.timer = setInterval(tick, TICK_MS)
  }

  stop() {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
  }

  private locate(m: number): { leg: number; t: number } {
    let remaining = m
    for (let leg = 0; leg < this.legs.length; leg++) {
      if (remaining <= this.legs[leg]) return { leg, t: remaining / this.legs[leg] }
      remaining -= this.legs[leg]
    }
    return { leg: this.legs.length - 1, t: 1 }
  }

  private fixAt(m: number): Fix {
    const { leg, t } = this.locate(m)
    const a = this.route.points[leg]
    const b = this.route.points[leg + 1]
    let lat = a.lat + (b.lat - a.lat) * t
    let lng = a.lng + (b.lng - a.lng) * t
    let accuracy = 5

    if (this.options.noise) {
      // Most fixes wobble by tens of metres; about one in twenty is wildly off
      // and honestly reports a poor accuracy, as phones do near tall buildings.
      const wild = Math.random() < 0.05
      const jitterM = wild ? 600 + Math.random() * 600 : Math.abs(gaussian()) * 30
      accuracy = wild ? 800 : 20 + Math.random() * 40
      ;[lat, lng] = offset(lat, lng, jitterM, Math.random() * 2 * Math.PI)
    }

    return { lat, lng, accuracy, timestamp: Date.now() }
  }

  private progressAt(m: number): SimProgress {
    const { leg, t } = this.locate(m)
    const points: RoutePoint[] = this.route.points
    const atEnd = m >= this.totalM
    return {
      fraction: this.totalM === 0 ? 1 : m / this.totalM,
      lastPoint: atEnd ? points[points.length - 1].name : points[t >= 1 ? leg + 1 : leg].name,
      nextPoint: atEnd ? null : (points[t >= 1 ? leg + 2 : leg + 1]?.name ?? null),
    }
  }
}

function gaussian(): number {
  const u = 1 - Math.random()
  const v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function offset(lat: number, lng: number, metres: number, bearing: number): [number, number] {
  const dLat = (metres * Math.cos(bearing)) / 111_320
  const dLng = (metres * Math.sin(bearing)) / (111_320 * Math.cos((lat * Math.PI) / 180))
  return [lat + dLat, lng + dLng]
}
