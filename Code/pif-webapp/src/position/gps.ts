import type { Fix, PositionSource } from './types.ts'

/** The phone's own location. Only runs while the page is open and the screen is on. */
export class GpsSource implements PositionSource {
  private watchId: number | null = null

  start(onFix: (fix: Fix) => void, onError?: (error: Error) => void) {
    this.stop()
    if (!('geolocation' in navigator)) {
      onError?.(new Error('This browser cannot read your location.'))
      return
    }
    this.watchId = navigator.geolocation.watchPosition(
      (pos) =>
        onFix({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        }),
      (err) =>
        onError?.(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? 'Location is blocked. Allow it for this site in the browser settings.'
              : err.message || 'Location is unavailable.',
          ),
        ),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
    )
  }

  stop() {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId)
    this.watchId = null
  }
}
