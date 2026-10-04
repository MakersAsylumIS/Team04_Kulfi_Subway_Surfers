// Real GPS and simulation both implement PositionSource, so the trigger
// logic never knows where a fix came from (AGENTS.md hard rule 4).
export interface Fix {
  lat: number
  lng: number
  /** Accuracy radius in metres, as reported by the source. */
  accuracy: number
  /** Milliseconds since epoch. */
  timestamp: number
}

export interface PositionSource {
  start(onFix: (fix: Fix) => void, onError?: (error: Error) => void): void
  stop(): void
}
