// Keeps the screen on during a journey. Without it the phone sleeps, location
// updates stop, and the app silently does nothing for the rest of the trip.
// The browser drops the lock whenever the tab is hidden, so take it again on return.

export function holdScreenAwake(): () => void {
  if (!('wakeLock' in navigator)) return () => {}
  let sentinel: WakeLockSentinel | null = null
  let released = false

  const acquire = async () => {
    if (released || document.visibilityState !== 'visible') return
    try {
      sentinel = await navigator.wakeLock.request('screen')
    } catch {
      // Low battery mode or a denied permission: the journey still runs while the screen is on.
    }
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') void acquire()
  }

  void acquire()
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    released = true
    document.removeEventListener('visibilitychange', onVisible)
    void sentinel?.release().catch(() => {})
    sentinel = null
  }
}
